import type { PrismaClient, User, WalletLink } from "@prisma/client";
import type { IChainRegistry } from "../bal/chain.registry.js";
import type { IEmailService } from "./email.service.js";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { PtfError, PtfErrorCode } from "../types/errors.js";

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface JwtPayload {
  userId:       string;
  ptfAddress:   string;
  githubLinked: boolean;
  walletLinked: boolean;
  deviceId:     string;
}

export interface DeviceInfo {
  id:         string;
  deviceName: string | null;
  userAgent:  string | null;
  lastSeenAt: string;
  createdAt:  string;
  isCurrent?: boolean;
}

export interface LoginResult {
  /** Set when the device is already trusted — login is complete. */
  token?:        string;
  encryptedKey?: string;
  user?:         User;
  /** Set when the device is new and must be verified by OTP email. */
  pendingSessionId?: string;
  requiresVerification?: true;
}

export interface IAuthService {
  // ── Registration ──────────────────────────────────────────────────────────
  /**
   * Create a new account. The server generates a secp256k1 keypair, derives ptfAddress,
   * encrypts the private key with the password, and returns encryptedKey to the client.
   * The client must store encryptedKey locally — the server never keeps the plaintext key.
   */
  register(input: {
    email:      string;
    password:   string;
    deviceName: string;
    userAgent?: string;
  }): Promise<{ token: string; user: User; encryptedKey: string }>;

  // ── Login ─────────────────────────────────────────────────────────────────
  /**
   * Authenticate with email + password.
   *
   * Known device (deviceToken matches a TrustedDevice):
   *   → returns { token, encryptedKey, user } immediately.
   *
   * New / unrecognised device:
   *   → sends a 6-digit OTP to the user's email
   *   → returns { pendingSessionId, requiresVerification: true }
   *   → caller must call verifyNewDevice() to complete login.
   */
  login(input: {
    email:       string;
    password:    string;
    deviceName:  string;
    userAgent?:  string;
    deviceToken?: string; // opaque token stored by client after first verification
  }): Promise<LoginResult>;

  // ── New-device OTP verification ───────────────────────────────────────────
  /**
   * Verify the 6-digit OTP sent to the user's email after a login from a new device.
   * On success: creates TrustedDevice + DeviceSession, returns JWT + deviceToken.
   * The client must persist deviceToken locally — it is used to skip OTP on future logins.
   */
  verifyNewDevice(input: {
    pendingSessionId: string;
    otp:              string;
  }): Promise<{ token: string; encryptedKey: string; user: User; deviceToken: string }>;

  // ── GitHub OAuth (post-login, 2-step CSRF-safe) ───────────────────────────
  /** Step 1: generate a CSRF state nonce for the GitHub OAuth redirect URL. */
  requestGithubOAuthState(userId: string): Promise<{ state: string }>;
  /** Step 2: exchange code + verify state, then link the GitHub account. */
  linkGithub(userId: string, code: string, state: string, deviceId: string): Promise<{ token: string; user: User }>;

  // ── Wallet link (challenge-response) ──────────────────────────────────────
  requestWalletChallenge(userId: string, chain: string, address: string): Promise<{ challengeId: string; nonce: string }>;
  confirmLinkWallet(userId: string, challengeId: string, signature: string, deviceId: string): Promise<{ token: string; walletLink: WalletLink }>;

  // ── Device management ─────────────────────────────────────────────────────
  listDevices(userId: string, currentDeviceId: string): Promise<DeviceInfo[]>;
  revokeDevice(userId: string, deviceId: string): Promise<void>;
  revokeAllOtherDevices(userId: string, currentDeviceId: string): Promise<void>;

  // ── Session / helpers ─────────────────────────────────────────────────────
  verifyJwt(token: string): Promise<JwtPayload>;
  getUserByAddress(address: string): Promise<User | null>;
  banUser(address: string, reason: string): Promise<void>;
  isBanned(address: string): Promise<boolean>;
  isFullyLinked(userId: string): Promise<boolean>;
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

const SCRYPT_N         = 32768;
const SCRYPT_R         = 8;
const SCRYPT_P         = 1;
const SCRYPT_KEYLEN    = 64;
const CHALLENGE_TTL    = 5  * 60 * 1000; // 5 min — wallet challenge
const OTP_TTL          = 10 * 60 * 1000; // 10 min
const TRUSTED_DEV_TTL  = 365 * 86400000; // 1 year
const OAUTH_STATE_TTL  = 10 * 60 * 1000; // 10 min — GitHub OAuth state (CSRF)

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `${salt}:${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, storedHash] = stored.split(":");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  try {
    return timingSafeEqual(Buffer.from(storedHash, "hex"), hash);
  } catch {
    return false;
  }
}

/**
 * Encrypt a secp256k1 private key with the user's password.
 * Uses PBKDF2(password, keySalt, 100000, 32, sha256) → AES-256-GCM.
 * Format: "v1:<keySalt_hex>:<iv_hex>:<ciphertext_hex>:<authTag_hex>"
 */
function encryptPrivateKey(privateKeyHex: string, password: string): string {
  const { createCipheriv, pbkdf2Sync } = await_sync_crypto();
  const keySalt    = randomBytes(32);
  const iv         = randomBytes(12);
  const aesKey     = pbkdf2Sync(password, keySalt, 100_000, 32, "sha256");
  const cipher     = createCipheriv("aes-256-gcm", aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(privateKeyHex, "hex")), cipher.final()]);
  const authTag    = cipher.getAuthTag();
  return `v1:${keySalt.toString("hex")}:${iv.toString("hex")}:${ciphertext.toString("hex")}:${authTag.toString("hex")}`;
}

// Node crypto is sync — helper to avoid top-level await
function await_sync_crypto() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCipheriv, pbkdf2Sync } = require("crypto") as typeof import("crypto");
  return { createCipheriv, pbkdf2Sync };
}

/** Generate a cryptographically random 6-digit numeric OTP. */
function generateOtp(): string {
  // Use 3 random bytes → 24-bit integer → modulo 1 000 000 → zero-padded to 6 digits
  const buf = randomBytes(3);
  return String(((buf[0] << 16) | (buf[1] << 8) | buf[2]) % 1_000_000).padStart(6, "0");
}

function derivePtfAddress(publicKey: string): string {
  const pub = ethers.getBytes(publicKey);
  const keyWithoutPrefix = pub.length === 65 ? pub.slice(1) : pub;
  return ethers.getAddress("0x" + ethers.keccak256(keyWithoutPrefix).slice(-40));
}

function buildWalletLinkDomain(chain: string): Record<string, unknown> {
  return {
    name:    "PTFWalletLink",
    version: "1",
    salt:    ethers.keccak256(ethers.toUtf8Bytes(chain)),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AuthService implements IAuthService {
  private readonly jwtSecret: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly chainRegistry: IChainRegistry,
    private readonly emailService: IEmailService,
    jwtSecret?: string
  ) {
    const secret = jwtSecret ?? process.env["JWT_SECRET"];
    if (!secret) {
      throw new Error(
        "[PTF] JWT_SECRET env var is required. " +
        "Set it to a cryptographically random string (≥32 chars) before starting the server."
      );
    }
    this.jwtSecret = secret;
  }

  // ── Registration ──────────────────────────────────────────────────────────

  async register(input: {
    email:      string;
    password:   string;
    deviceName: string;
    userAgent?: string;
  }): Promise<{ token: string; user: User; encryptedKey: string }> {
    if (!input.email.includes("@")) {
      throw new PtfError(PtfErrorCode.INVALID_INPUT, "Adresse email invalide");
    }
    if (input.password.length < 12) {
      throw new PtfError(PtfErrorCode.INVALID_INPUT, "Le mot de passe doit contenir au moins 12 caractères");
    }

    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new PtfError(PtfErrorCode.EMAIL_ALREADY_USED, "Un compte existe déjà avec cet email");
    }

    // Generate secp256k1 keypair server-side
    const wallet     = ethers.Wallet.createRandom();
    const ptfAddress = wallet.address;
    const encKey     = encryptPrivateKey(wallet.privateKey.slice(2), input.password);

    const user = await this.prisma.user.create({
      data: {
        email:        input.email,
        passwordHash: hashPassword(input.password),
        ptfPublicKey: wallet.publicKey,
        ptfAddress,
        encryptedKey: encKey,
      },
    });

    const { token, deviceSession } = await this.createDeviceSession(user, input.deviceName, input.userAgent, false, false);

    return { token, user, encryptedKey: encKey };
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(input: {
    email:        string;
    password:     string;
    deviceName:   string;
    userAgent?:   string;
    deviceToken?: string;
  }): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    // Always run verifyPassword to prevent user-existence timing leak
    const passwordHash = user?.passwordHash ?? "00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    const passwordOk   = verifyPassword(input.password, passwordHash);

    if (!user || !passwordOk) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Email ou mot de passe incorrect");
    }
    if (user.isBanned) {
      throw new PtfError(PtfErrorCode.WALLET_BANNED, `Compte banni : ${user.banReason ?? "violation des conditions d'utilisation"}`);
    }

    // Check if the device is already trusted
    if (input.deviceToken) {
      const trusted = await this.prisma.trustedDevice.findUnique({
        where: { deviceToken: input.deviceToken },
      });
      if (trusted && trusted.userId === user.id && trusted.expiresAt > new Date()) {
        // Renew the trusted device TTL
        await this.prisma.trustedDevice.update({
          where: { id: trusted.id },
          data:  { expiresAt: new Date(Date.now() + TRUSTED_DEV_TTL), deviceName: input.deviceName, userAgent: input.userAgent ?? null },
        });

        const linkedState = await this.resolveLinkedState(user.id);
        const { token } = await this.createDeviceSession(user, input.deviceName, input.userAgent, linkedState.githubLinked, linkedState.walletLinked);
        return { token, encryptedKey: user.encryptedKey!, user };
      }
    }

    // Unknown device — emit OTP and hold the session pending
    const otp     = generateOtp();
    const otpHash = hashPassword(otp); // reuse scrypt for OTP storage

    const pending = await this.prisma.pendingDeviceSession.create({
      data: {
        userId:     user.id,
        deviceName: input.deviceName ?? null,
        userAgent:  input.userAgent  ?? null,
        otpHash,
        expiresAt:  new Date(Date.now() + OTP_TTL),
      },
    });

    // Fire-and-forget — never block the response on email delivery
    this.emailService
      .sendNewDeviceOtp(user.email!, otp, input.deviceName, input.userAgent)
      .catch((err) => console.error("[AuthService] Email OTP send failed:", err));

    return { pendingSessionId: pending.id, requiresVerification: true };
  }

  // ── New-device OTP verification ───────────────────────────────────────────

  async verifyNewDevice(input: {
    pendingSessionId: string;
    otp:              string;
  }): Promise<{ token: string; encryptedKey: string; user: User; deviceToken: string }> {
    const pending = await this.prisma.pendingDeviceSession.findUnique({
      where: { id: input.pendingSessionId },
    });

    if (!pending || pending.used || pending.expiresAt < new Date()) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Code invalide ou expiré. Recommencez la connexion.");
    }

    if (!verifyPassword(input.otp, pending.otpHash)) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Code de vérification incorrect");
    }

    // Consume — prevents replay
    await this.prisma.pendingDeviceSession.update({
      where: { id: pending.id },
      data:  { used: true },
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: pending.userId } });

    // Register device as trusted for future logins
    const deviceToken = randomBytes(32).toString("hex");
    await this.prisma.trustedDevice.create({
      data: {
        userId:      user.id,
        deviceToken,
        deviceName:  pending.deviceName,
        userAgent:   pending.userAgent,
        expiresAt:   new Date(Date.now() + TRUSTED_DEV_TTL),
      },
    });

    const linkedState = await this.resolveLinkedState(user.id);
    const { token } = await this.createDeviceSession(user, pending.deviceName ?? "Appareil inconnu", pending.userAgent ?? undefined, linkedState.githubLinked, linkedState.walletLinked);

    return { token, encryptedKey: user.encryptedKey!, user, deviceToken };
  }

  // ── GitHub OAuth ──────────────────────────────────────────────────────────

  async requestGithubOAuthState(userId: string): Promise<{ state: string }> {
    const state = ethers.keccak256(
      ethers.solidityPacked(["string", "bytes32", "uint256"], [userId, ethers.randomBytes(32), BigInt(Date.now())])
    );
    // Reuse AuthChallenge to store the CSRF state nonce (same pattern as wallet challenge).
    await this.prisma.authChallenge.create({
      data: { userId, nonce: state, expiresAt: new Date(Date.now() + OAUTH_STATE_TTL) },
    });
    return { state };
  }

  async linkGithub(userId: string, code: string, state: string, deviceId: string): Promise<{ token: string; user: User }> {
    // Verify the CSRF state nonce before touching GitHub APIs.
    const challenge = await this.prisma.authChallenge.findUnique({ where: { nonce: state } });
    if (!challenge || challenge.used || challenge.expiresAt < new Date() || challenge.userId !== userId) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "État OAuth invalide ou expiré — relancez la liaison GitHub");
    }
    await this.prisma.authChallenge.update({ where: { id: challenge.id }, data: { used: true } });
    const githubToken = await this.exchangeGithubCode(code);
    const githubUser  = await this.fetchGithubUser(githubToken);

    const existing = await this.prisma.user.findUnique({ where: { githubId: String(githubUser.id) } });
    if (existing && existing.id !== userId) {
      throw new PtfError(PtfErrorCode.GITHUB_ALREADY_LINKED, "Ce compte GitHub est déjà lié à un autre compte PTF");
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data:  { githubId: String(githubUser.id), githubHandle: githubUser.login as string },
    });

    const linkedState = await this.resolveLinkedState(user.id);
    const token = await this.rotateDeviceToken(userId, deviceId, user.ptfAddress!, linkedState.githubLinked, linkedState.walletLinked);

    return { token, user };
  }

  // ── Wallet link ───────────────────────────────────────────────────────────

  async requestWalletChallenge(userId: string, chain: string, address: string): Promise<{ challengeId: string; nonce: string }> {
    const adapter = this.chainRegistry.get(chain);
    if (!adapter.isValidAddress(address)) {
      throw new PtfError(PtfErrorCode.INVALID_ADDRESS, `Adresse invalide : ${address}`);
    }

    const nonce = ethers.keccak256(
      ethers.solidityPacked(
        ["string", "string", "address", "uint256"],
        [userId, chain, address.toLowerCase(), BigInt(Date.now())]
      )
    );

    const challenge = await this.prisma.walletLinkChallenge.create({
      data: { userId, chain, address: address.toLowerCase(), nonce, expiresAt: new Date(Date.now() + CHALLENGE_TTL) },
    });

    return { challengeId: challenge.id, nonce };
  }

  async confirmLinkWallet(userId: string, challengeId: string, signature: string, deviceId: string): Promise<{ token: string; walletLink: WalletLink }> {
    const challenge = await this.prisma.walletLinkChallenge.findUnique({ where: { id: challengeId } });

    if (!challenge || challenge.used || challenge.expiresAt < new Date()) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Challenge de liaison wallet invalide ou expiré");
    }
    if (challenge.userId !== userId) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Challenge appartient à un autre utilisateur");
    }

    const adapter   = this.chainRegistry.get(challenge.chain);
    const recovered = await adapter.verifyEIP712Signature(
      buildWalletLinkDomain(challenge.chain),
      { WalletLink: [{ name: "nonce", type: "string" }, { name: "userId", type: "string" }] },
      { nonce: challenge.nonce, userId },
      signature
    );

    if (recovered.toLowerCase() !== challenge.address.toLowerCase()) {
      throw new PtfError(PtfErrorCode.OWNERSHIP_NOT_PROVEN, "La signature ne correspond pas à l'adresse déclarée");
    }

    await this.prisma.walletLinkChallenge.update({ where: { id: challengeId }, data: { used: true } });

    const walletLink = await this.prisma.walletLink.upsert({
      where:  { chain_address: { chain: challenge.chain, address: challenge.address } },
      create: { userId, chain: challenge.chain, address: challenge.address, isPrimary: false },
      update: { userId },
    });

    const user        = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const linkedState = await this.resolveLinkedState(userId);
    const token       = await this.rotateDeviceToken(userId, deviceId, user.ptfAddress!, linkedState.githubLinked, linkedState.walletLinked);

    return { token, walletLink };
  }

  // ── Device management ─────────────────────────────────────────────────────

  async listDevices(userId: string, currentDeviceId: string): Promise<DeviceInfo[]> {
    const sessions = await this.prisma.deviceSession.findMany({
      where:   { userId, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
    });
    return sessions.map((s) => ({
      id:         s.id,
      deviceName: s.deviceName,
      userAgent:  s.userAgent,
      lastSeenAt: s.lastSeenAt.toISOString(),
      createdAt:  s.createdAt.toISOString(),
      isCurrent:  s.id === currentDeviceId,
    }));
  }

  async revokeDevice(userId: string, deviceId: string): Promise<void> {
    const session = await this.prisma.deviceSession.findUnique({ where: { id: deviceId } });
    if (!session || session.userId !== userId) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Appareil introuvable ou appartenant à un autre compte");
    }
    await this.prisma.deviceSession.delete({ where: { id: deviceId } });
  }

  async revokeAllOtherDevices(userId: string, currentDeviceId: string): Promise<void> {
    await this.prisma.deviceSession.deleteMany({
      where: { userId, id: { not: currentDeviceId } },
    });
  }

  // ── JWT / session ─────────────────────────────────────────────────────────

  async verifyJwt(token: string): Promise<JwtPayload> {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as JwtPayload;

      const session = await this.prisma.deviceSession.findFirst({
        where: { token, expiresAt: { gt: new Date() } },
      });

      if (!session) {
        throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Session expirée ou révoquée");
      }

      // Touch lastSeenAt without blocking the request
      this.prisma.deviceSession.update({
        where: { id: session.id },
        data:  { lastSeenAt: new Date() },
      }).catch(() => {});

      return payload;
    } catch (err) {
      if (err instanceof PtfError) throw err;
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Token JWT invalide");
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async isFullyLinked(userId: string): Promise<boolean> {
    const s = await this.resolveLinkedState(userId);
    return s.githubLinked && s.walletLinked;
  }

  async getUserByAddress(address: string): Promise<User | null> {
    const wallet = await this.prisma.walletLink.findFirst({
      where: { address: address.toLowerCase() }, include: { user: true },
    });
    return wallet?.user ?? null;
  }

  async banUser(address: string, reason: string): Promise<void> {
    const user = await this.getUserByAddress(address);
    if (!user) return;
    await this.prisma.user.update({ where: { id: user.id }, data: { isBanned: true, banReason: reason } });
    // Revoke all sessions immediately
    await this.prisma.deviceSession.deleteMany({ where: { userId: user.id } });
  }

  async isBanned(address: string): Promise<boolean> {
    const user = await this.getUserByAddress(address);
    return user?.isBanned ?? false;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async resolveLinkedState(userId: string): Promise<{ githubLinked: boolean; walletLinked: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }, include: { wallets: { take: 1 } },
    });
    return { githubLinked: !!user?.githubId, walletLinked: (user?.wallets.length ?? 0) > 0 };
  }

  private async createDeviceSession(
    user:         User,
    deviceName:   string,
    userAgent:    string | undefined,
    githubLinked: boolean,
    walletLinked: boolean,
  ): Promise<{ token: string; deviceSession: { id: string } }> {
    const expiresAt = new Date(Date.now() + 30 * 86400000); // 30 days

    // Pre-generate a placeholder ID so we can embed it in the JWT
    const deviceId = createHash("sha256")
      .update(user.id + deviceName + Date.now().toString())
      .digest("hex")
      .slice(0, 24);

    const token = this.signJwt({
      userId:       user.id,
      ptfAddress:   user.ptfAddress!,
      githubLinked,
      walletLinked,
      deviceId,
    });

    const deviceSession = await this.prisma.deviceSession.create({
      data: {
        id:         deviceId,
        userId:     user.id,
        token,
        deviceName,
        userAgent:  userAgent ?? null,
        expiresAt,
      },
    });

    return { token, deviceSession };
  }

  private async rotateDeviceToken(
    userId:       string,
    deviceId:     string,
    ptfAddress:   string,
    githubLinked: boolean,
    walletLinked: boolean,
  ): Promise<string> {
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    const token = this.signJwt({ userId, ptfAddress, githubLinked, walletLinked, deviceId });

    await this.prisma.deviceSession.update({
      where: { id: deviceId },
      data:  { token, expiresAt },
    });

    return token;
  }

  private signJwt(payload: JwtPayload): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: "30d" });
  }

  private async exchangeGithubCode(code: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch("https://github.com/login/oauth/access_token", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body:    JSON.stringify({
          client_id:     process.env["GITHUB_CLIENT_ID"],
          client_secret: process.env["GITHUB_CLIENT_SECRET"],
          code,
        }),
        signal: controller.signal,
      });
      const data = (await res.json()) as { access_token?: string };
      if (!data.access_token) {
        throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Échange GitHub OAuth échoué — code invalide ou expiré");
      }
      return data.access_token;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchGithubUser(token: string): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}` },
        signal:  controller.signal,
      });
      return res.json() as Promise<Record<string, unknown>>;
    } finally {
      clearTimeout(timeout);
    }
  }
}
