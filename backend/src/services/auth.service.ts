/**
 * AuthService — authentification par challenge-response cryptographique.
 *
 * L'identité d'un utilisateur PTF = son adresse PTF (dérivée de son keypair secp256k1).
 * Le serveur ne stocke jamais de clé privée ni de mot de passe.
 *
 * Flow de connexion :
 *  1. Client → requestChallenge(ptfAddress)  → serveur génère et stocke un nonce
 *  2. Client signe le nonce localement avec sa clé privée
 *  3. Client → verifyChallenge(ptfAddress, nonce, signature)
 *     → serveur vérifie : ecrecover(nonce, sig) == ptfAddress
 *     → si ok : crée une DeviceSession, retourne un JWT
 *
 * La clé privée ne quitte jamais la machine du client.
 * Le service tier ne connaît que l'adresse PTF publique.
 */

import type { PrismaClient, User, WalletLink } from "@prisma/client";
import type { IChainRegistry } from "../bal/chain.registry.js";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { createHash, randomBytes } from "crypto";
import { PtfError, PtfErrorCode } from "../types/errors.js";

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface JwtPayload {
  userId:       string;
  ptfAddress:   string;
  githubLinked: boolean;
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

export interface IAuthService {
  // ── Challenge-response (auth primaire) ────────────────────────────────────
  /**
   * Génère un nonce à usage unique pour l'adresse PTF donnée.
   * Le nonce expire en 5 minutes.
   * Si l'adresse n'existe pas en DB, un compte est créé automatiquement au premier login.
   */
  requestChallenge(ptfAddress: string): Promise<{ nonce: string; expiresAt: string }>;

  /**
   * Vérifie que la signature du nonce correspond bien à ptfAddress.
   * ecrecover(nonce, signature) doit donner ptfAddress.
   * Si ok : crée/renouvelle la DeviceSession, retourne un JWT.
   */
  verifyChallenge(input: {
    ptfAddress: string;
    nonce:      string;
    signature:  string;
    deviceName: string;
    userAgent?: string;
  }): Promise<{ token: string; user: User }>;

  // ── GitHub OAuth (optionnel, post-login) ──────────────────────────────────
  requestGithubOAuthState(userId: string): Promise<{ state: string }>;
  linkGithub(userId: string, code: string, state: string, deviceId: string): Promise<{ token: string; user: User }>;

  // ── Device management ─────────────────────────────────────────────────────
  listDevices(userId: string, currentDeviceId: string): Promise<DeviceInfo[]>;
  revokeDevice(userId: string, deviceId: string): Promise<void>;
  revokeAllOtherDevices(userId: string, currentDeviceId: string): Promise<void>;

  // ── Session / helpers ─────────────────────────────────────────────────────
  verifyJwt(token: string): Promise<JwtPayload>;
  getUserByAddress(address: string): Promise<User | null>;
  banUser(address: string, reason: string): Promise<void>;
  isBanned(address: string): Promise<boolean>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHALLENGE_TTL   = 5  * 60 * 1000;  // 5 min
const SESSION_TTL     = 30 * 86400000;   // 30 jours
const OAUTH_STATE_TTL = 10 * 60 * 1000;  // 10 min

// Préfixe du message signé — empêche la réutilisation de la signature pour d'autres protocoles
const SIGN_PREFIX = "PTF Authentication Challenge:\n";

// ── Service ───────────────────────────────────────────────────────────────────

export class AuthService implements IAuthService {
  private readonly jwtSecret: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly chainRegistry: IChainRegistry,
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

  // ── Challenge-response ────────────────────────────────────────────────────

  async requestChallenge(ptfAddress: string): Promise<{ nonce: string; expiresAt: string }> {
    const normalised = ptfAddress.toLowerCase();

    if (!ethers.isAddress(normalised)) {
      throw new PtfError(PtfErrorCode.INVALID_ADDRESS, `Adresse PTF invalide : ${ptfAddress}`);
    }

    // Invalider les anciens challenges non utilisés pour cette adresse
    await this.prisma.authChallenge.updateMany({
      where: {
        used: false,
        expiresAt: { gt: new Date() },
        // On filtre via userId → d'abord trouver l'userId si l'user existe
      },
    });

    // Trouver ou créer l'utilisateur (le compte est créé au premier login)
    let user = await this.prisma.user.findUnique({ where: { ptfAddress: normalised } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          ptfAddress:  normalised,
          ptfPublicKey: null, // sera mis à jour si fourni par le client
        },
      });
    }

    if (user.isBanned) {
      throw new PtfError(PtfErrorCode.WALLET_BANNED, "Ce compte a été suspendu. Contactez le support PTF.");
    }

    // Invalider les anciens challenges de cet utilisateur
    await this.prisma.authChallenge.updateMany({
      where: { userId: user.id, used: false },
      data:  { used: true },
    });

    // Générer un nonce : timestamp + random → keccak256
    const nonce = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "bytes32", "uint256"],
        [normalised, ethers.randomBytes(32), BigInt(Date.now())]
      )
    );

    const expiresAt = new Date(Date.now() + CHALLENGE_TTL);

    await this.prisma.authChallenge.create({
      data: { userId: user.id, nonce, expiresAt },
    });

    return { nonce, expiresAt: expiresAt.toISOString() };
  }

  async verifyChallenge(input: {
    ptfAddress: string;
    nonce:      string;
    signature:  string;
    deviceName: string;
    userAgent?: string;
  }): Promise<{ token: string; user: User }> {
    const normalised = input.ptfAddress.toLowerCase();

    // 1. Vérifier le challenge en DB
    const user = await this.prisma.user.findUnique({ where: { ptfAddress: normalised } });
    if (!user) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Adresse PTF inconnue ou challenge expiré.");
    }

    const challenge = await this.prisma.authChallenge.findUnique({ where: { nonce: input.nonce } });
    if (
      !challenge ||
      challenge.used ||
      challenge.expiresAt < new Date() ||
      challenge.userId !== user.id
    ) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Challenge invalide, expiré ou déjà utilisé.");
    }

    // 2. Vérifier la signature : ecrecover(message, signature) == ptfAddress
    //    Le message signé côté client : signMessage(nonce) utilise le préfixe Ethereum personal_sign
    const messageToVerify = SIGN_PREFIX + input.nonce;
    let recovered: string;
    try {
      recovered = ethers.verifyMessage(messageToVerify, input.signature);
    } catch {
      throw new PtfError(PtfErrorCode.OWNERSHIP_NOT_PROVEN, "Signature invalide.");
    }

    if (recovered.toLowerCase() !== normalised) {
      throw new PtfError(
        PtfErrorCode.OWNERSHIP_NOT_PROVEN,
        "La signature ne correspond pas à l'adresse PTF déclarée."
      );
    }

    // 3. Consommer le challenge (atomique)
    const consumed = await this.prisma.authChallenge.updateMany({
      where: { nonce: input.nonce, used: false },
      data:  { used: true },
    });
    if (consumed.count === 0) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Challenge déjà utilisé — relancez la connexion.");
    }

    // 4. Créer la session
    const { token } = await this.createDeviceSession(
      user,
      input.deviceName,
      input.userAgent,
      !!user.githubId
    );

    return { token, user };
  }

  // ── GitHub OAuth (optionnel) ──────────────────────────────────────────────

  async requestGithubOAuthState(userId: string): Promise<{ state: string }> {
    const state = ethers.keccak256(
      ethers.solidityPacked(["string", "bytes32", "uint256"], [userId, ethers.randomBytes(32), BigInt(Date.now())])
    );
    await this.prisma.authChallenge.create({
      data: { userId, nonce: state, expiresAt: new Date(Date.now() + OAUTH_STATE_TTL) },
    });
    return { state };
  }

  async linkGithub(userId: string, code: string, state: string, deviceId: string): Promise<{ token: string; user: User }> {
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

    const token = await this.rotateDeviceToken(userId, deviceId, user.ptfAddress!, true);
    return { token, user };
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

  async getUserByAddress(address: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { ptfAddress: address.toLowerCase() } });
  }

  async banUser(address: string, reason: string): Promise<void> {
    const user = await this.getUserByAddress(address);
    if (!user) return;
    await this.prisma.user.update({ where: { id: user.id }, data: { isBanned: true, banReason: reason } });
    await this.prisma.deviceSession.deleteMany({ where: { userId: user.id } });
  }

  async isBanned(address: string): Promise<boolean> {
    const user = await this.getUserByAddress(address);
    return user?.isBanned ?? false;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async createDeviceSession(
    user:         User,
    deviceName:   string,
    userAgent:    string | undefined,
    githubLinked: boolean,
  ): Promise<{ token: string }> {
    const expiresAt = new Date(Date.now() + SESSION_TTL);
    const deviceId  = createHash("sha256")
      .update(user.id + deviceName + Date.now().toString())
      .digest("hex")
      .slice(0, 24);

    const token = this.signJwt({ userId: user.id, ptfAddress: user.ptfAddress!, githubLinked, deviceId });

    await this.prisma.deviceSession.create({
      data: { id: deviceId, userId: user.id, token, deviceName, userAgent: userAgent ?? null, expiresAt },
    });

    return { token };
  }

  private async rotateDeviceToken(
    userId:       string,
    deviceId:     string,
    ptfAddress:   string,
    githubLinked: boolean,
  ): Promise<string> {
    const expiresAt = new Date(Date.now() + SESSION_TTL);
    const token     = this.signJwt({ userId, ptfAddress, githubLinked, deviceId });

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
    const timeout    = setTimeout(() => controller.abort(), 10_000);
    try {
      const res  = await fetch("https://github.com/login/oauth/access_token", {
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
    const timeout    = setTimeout(() => controller.abort(), 10_000);
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
