/**
 * AuthService — authentification stateless par challenge-response cryptographique.
 *
 * L'identité d'un utilisateur PTF = son adresse PTF (dérivée de son keypair secp256k1).
 * Le serveur ne stocke jamais de clé privée, ni de mot de passe, ni aucune donnée utilisateur.
 *
 * Flow de connexion :
 *  1. Client → requestChallenge(ptfAddress)  → serveur génère un nonce en mémoire (TTL 5 min)
 *  2. Client signe le nonce localement avec sa clé privée
 *  3. Client → verifyChallenge(ptfAddress, nonce, signature)
 *     → serveur vérifie : ecrecover(nonce, sig) == ptfAddress
 *     → si ok : retourne un JWT signé (contient seulement ptfAddress + exp)
 *
 * Aucune donnée utilisateur n'est écrite en DB.
 */

import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { PtfError, PtfErrorCode } from "../types/errors.js";

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface JwtPayload {
  ptfAddress: string;
  iat: number;
  exp: number;
}

// Minimal Redis interface required by AuthService for distributed nonce storage.
// Compatible with ioredis Redis and Cluster instances.
export interface INonceRedis {
  set(key: string, value: string, expiryMode: "EX", time: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string, ...otherKeys: string[]): Promise<unknown>;
}

export interface IAuthService {
  requestChallenge(ptfAddress: string): Promise<{ nonce: string; expiresAt: string }>;
  verifyChallenge(input: {
    ptfAddress: string;
    nonce:      string;
    signature:  string;
    deviceName: string;
    userAgent?: string;
  }): Promise<{ token: string }>;
  verifyJwt(token: string): Promise<JwtPayload>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHALLENGE_TTL = 5 * 60 * 1000;  // 5 min in ms
const SESSION_TTL   = "30d";

// ── In-memory nonce store (fallback for single-process dev) ──────────────────
// WARNING: never use this in production cluster mode — each worker has its own
// Map, so requestChallenge and verifyChallenge hitting different workers will
// always fail. Pass a Redis instance to AuthService in production.

interface NonceEntry {
  address:   string;
  expiresAt: number;
}

const nonceStoreFallback = new Map<string, NonceEntry>();

// Periodic cleanup of expired nonces (runs every minute, fallback only)
setInterval(() => {
  const now = Date.now();
  for (const [nonce, entry] of nonceStoreFallback) {
    if (entry.expiresAt < now) nonceStoreFallback.delete(nonce);
  }
}, 60_000);

// ── Service ───────────────────────────────────────────────────────────────────

export class AuthService implements IAuthService {
  private readonly jwtSecret: string;
  // Redis is required in production cluster mode — nonces must survive across workers.
  private readonly redis: INonceRedis | null;

  constructor(jwtSecret?: string, redis?: INonceRedis) {
    const secret = jwtSecret ?? process.env["JWT_SECRET"];
    if (!secret) {
      throw new Error(
        "[PTF] JWT_SECRET env var is required. " +
        "Set it to a cryptographically random string (≥32 chars) before starting the server."
      );
    }
    this.jwtSecret = secret;
    this.redis = redis ?? null;

    if (!this.redis && process.env["NODE_ENV"] === "production") {
      throw new Error(
        "[PTF] AuthService requires a Redis instance in production — " +
        "in-memory nonce store does not survive across cluster workers."
      );
    }
  }

  async requestChallenge(ptfAddress: string): Promise<{ nonce: string; expiresAt: string }> {
    const normalised = ptfAddress.toLowerCase();

    if (!ethers.isAddress(normalised)) {
      throw new PtfError(PtfErrorCode.INVALID_ADDRESS, `Adresse PTF invalide : ${ptfAddress}`);
    }

    // Génère un nonce : keccak256(adresse + random + timestamp)
    const nonce = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "bytes32", "uint256"],
        [normalised, ethers.randomBytes(32), BigInt(Date.now())]
      )
    );

    const expiresAt = Date.now() + CHALLENGE_TTL;
    const ttlSec = Math.ceil(CHALLENGE_TTL / 1000);

    if (this.redis) {
      // Distributed store: invalidate any previous nonce for this address, then store the new one.
      // nonce:val:<nonce>    → address (TTL = CHALLENGE_TTL)
      // nonce:addr:<address> → nonce   (TTL = CHALLENGE_TTL, used only for invalidation)
      const addrKey = `nonce:addr:${normalised}`;
      const prevNonce = await this.redis.get(addrKey);
      if (prevNonce) await this.redis.del(`nonce:val:${prevNonce}`);
      await this.redis.set(`nonce:val:${nonce}`, normalised, "EX", ttlSec);
      await this.redis.set(addrKey, nonce, "EX", ttlSec);
    } else {
      // Fallback: in-memory (dev, single-process only)
      for (const [existingNonce, entry] of nonceStoreFallback) {
        if (entry.address === normalised) nonceStoreFallback.delete(existingNonce);
      }
      nonceStoreFallback.set(nonce, { address: normalised, expiresAt });
    }

    return { nonce, expiresAt: new Date(expiresAt).toISOString() };
  }

  async verifyChallenge(input: {
    ptfAddress: string;
    nonce:      string;
    signature:  string;
    deviceName: string;
    userAgent?: string;
  }): Promise<{ token: string }> {
    const normalised = input.ptfAddress.toLowerCase();

    // 1. Vérifier et consommer le nonce
    if (this.redis) {
      const storedAddress = await this.redis.get(`nonce:val:${input.nonce}`);
      if (!storedAddress || storedAddress !== normalised) {
        throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Challenge invalide, expiré ou déjà utilisé.");
      }
      // Consume atomically — DEL both keys (addr key is best-effort cleanup)
      await this.redis.del(`nonce:val:${input.nonce}`, `nonce:addr:${normalised}`);
    } else {
      const entry = nonceStoreFallback.get(input.nonce);
      if (!entry || entry.address !== normalised || entry.expiresAt < Date.now()) {
        throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Challenge invalide, expiré ou déjà utilisé.");
      }
      nonceStoreFallback.delete(input.nonce);
    }

    // 2. Vérifier la signature : ecrecover(nonce, signature) == ptfAddress
    let recovered: string;
    try {
      recovered = ethers.verifyMessage(input.nonce, input.signature);
    } catch {
      throw new PtfError(PtfErrorCode.OWNERSHIP_NOT_PROVEN, "Signature invalide.");
    }

    if (recovered.toLowerCase() !== normalised) {
      throw new PtfError(
        PtfErrorCode.OWNERSHIP_NOT_PROVEN,
        "La signature ne correspond pas à l'adresse PTF déclarée."
      );
    }

    // 3. Émettre un JWT sans aucune donnée en DB
    const token = this.signJwt(normalised);
    return { token };
  }

  async verifyJwt(token: string): Promise<JwtPayload> {
    try {
      return jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Token JWT invalide");
    }
  }

  private signJwt(ptfAddress: string): string {
    return jwt.sign({ ptfAddress }, this.jwtSecret, { expiresIn: SESSION_TTL });
  }
}
