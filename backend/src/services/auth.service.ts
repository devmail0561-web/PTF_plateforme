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

// ── In-memory nonce store ─────────────────────────────────────────────────────

interface NonceEntry {
  address:   string;
  expiresAt: number;
}

const nonceStore = new Map<string, NonceEntry>();

// Periodic cleanup of expired nonces (runs every minute)
setInterval(() => {
  const now = Date.now();
  for (const [nonce, entry] of nonceStore) {
    if (entry.expiresAt < now) nonceStore.delete(nonce);
  }
}, 60_000);

// ── Service ───────────────────────────────────────────────────────────────────

export class AuthService implements IAuthService {
  private readonly jwtSecret: string;

  constructor(jwtSecret?: string) {
    const secret = jwtSecret ?? process.env["JWT_SECRET"];
    if (!secret) {
      throw new Error(
        "[PTF] JWT_SECRET env var is required. " +
        "Set it to a cryptographically random string (≥32 chars) before starting the server."
      );
    }
    this.jwtSecret = secret;
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

    // Invalider l'éventuel nonce précédent pour cette adresse
    for (const [existingNonce, entry] of nonceStore) {
      if (entry.address === normalised) nonceStore.delete(existingNonce);
    }

    nonceStore.set(nonce, { address: normalised, expiresAt });

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

    // 1. Vérifier le nonce en mémoire
    const entry = nonceStore.get(input.nonce);
    if (!entry || entry.address !== normalised || entry.expiresAt < Date.now()) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Challenge invalide, expiré ou déjà utilisé.");
    }

    // 2. Consommer le nonce (usage unique, atomique en JS single-threaded)
    nonceStore.delete(input.nonce);

    // 3. Vérifier la signature : ecrecover(nonce, signature) == ptfAddress
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

    // 4. Émettre un JWT sans aucune donnée en DB
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
