import type { PrismaClient, User, WalletLink } from "@prisma/client";
import type { IChainRegistry } from "../bal/chain.registry.js";
import jwt from "jsonwebtoken";
import { PtfError, PtfErrorCode } from "../types/errors.js";

export interface JwtPayload {
  userId: string;
  githubHandle?: string;
}

export interface IAuthService {
  loginWithGithub(
    githubCode: string
  ): Promise<{ token: string; user: User }>;
  verifyJwt(token: string): Promise<JwtPayload>;
  linkWallet(
    userId: string,
    chain: string,
    address: string,
    signature: string
  ): Promise<WalletLink>;
  getUserByAddress(address: string): Promise<User | null>;
  banUser(address: string, reason: string): Promise<void>;
  isBanned(address: string): Promise<boolean>;
}

export class AuthService implements IAuthService {
  private readonly jwtSecret: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly chainRegistry: IChainRegistry,
    jwtSecret?: string
  ) {
    this.jwtSecret = jwtSecret ?? process.env["JWT_SECRET"] ?? "ptf-dev-secret";
  }

  async loginWithGithub(
    githubCode: string
  ): Promise<{ token: string; user: User }> {
    // Échange le code GitHub contre un access token
    const githubToken = await this.exchangeGithubCode(githubCode);
    const githubUser = await this.fetchGithubUser(githubToken);

    const user = await this.prisma.user.upsert({
      where: { githubId: String(githubUser.id) },
      create: {
        githubId: String(githubUser.id),
        githubHandle: githubUser.login as string,
      },
      update: {
        githubHandle: githubUser.login as string,
      },
    });

    const token = this.signJwt({ userId: user.id, githubHandle: user.githubHandle ?? undefined });

    await this.prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 86400000), // 7 jours
      },
    });

    return { token, user };
  }

  async verifyJwt(token: string): Promise<JwtPayload> {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as JwtPayload;

      // Vérifier que la session existe en base
      const session = await this.prisma.session.findFirst({
        where: {
          token,
          expiresAt: { gt: new Date() },
        },
      });

      if (!session) {
        throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Session expirée ou invalide");
      }

      return payload;
    } catch (err) {
      if (err instanceof PtfError) throw err;
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Token JWT invalide");
    }
  }

  async linkWallet(
    userId: string,
    chain: string,
    address: string,
    signature: string
  ): Promise<WalletLink> {
    const adapter = this.chainRegistry.get(chain);

    if (!adapter.isValidAddress(address)) {
      throw new PtfError(PtfErrorCode.INVALID_ADDRESS, `Adresse invalide : ${address}`);
    }

    // Vérifier l'ownership via signature d'un nonce
    const nonce = `ptf-link-wallet:${userId}:${chain}:${Date.now()}`;
    const signer = await adapter.verifyEIP712Signature(
      { name: "PTF", version: "1", chainId: chain },
      { WalletLink: [{ name: "nonce", type: "string" }, { name: "userId", type: "string" }] },
      { nonce, userId },
      signature
    );

    if (signer.toLowerCase() !== address.toLowerCase()) {
      throw new PtfError(PtfErrorCode.OWNERSHIP_NOT_PROVEN, "Signature wallet invalide");
    }

    return this.prisma.walletLink.upsert({
      where: { chain_address: { chain, address: address.toLowerCase() } },
      create: {
        userId,
        chain,
        address: address.toLowerCase(),
        isPrimary: false,
      },
      update: { userId },
    });
  }

  async getUserByAddress(address: string): Promise<User | null> {
    const wallet = await this.prisma.walletLink.findFirst({
      where: { address: address.toLowerCase() },
      include: { user: true },
    });
    return wallet?.user ?? null;
  }

  async banUser(address: string, reason: string): Promise<void> {
    const user = await this.getUserByAddress(address);
    if (!user) return;

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isBanned: true, banReason: reason },
    });
  }

  async isBanned(address: string): Promise<boolean> {
    const user = await this.getUserByAddress(address);
    return user?.isBanned ?? false;
  }

  private signJwt(payload: JwtPayload): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: "7d" });
  }

  private async exchangeGithubCode(
    code: string
  ): Promise<string> {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: process.env["GITHUB_CLIENT_ID"],
        client_secret: process.env["GITHUB_CLIENT_SECRET"],
        code,
      }),
    });
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new PtfError(PtfErrorCode.UNAUTHORIZED, "Échange GitHub OAuth échoué");
    }
    return data.access_token;
  }

  private async fetchGithubUser(token: string): Promise<Record<string, unknown>> {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json() as Promise<Record<string, unknown>>;
  }
}
