import { PtfError, PtfErrorCode } from "../types/errors.js";
import {
  ELIGIBLE_SPDX_IDS,
  GITHUB_CREATABLE_LICENSES,
  getFallbackLicenseText,
  getLicense,
  type LicenseEntry,
} from "./licenses.js";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface RepoLicenseInfo {
  isPublic:          boolean;
  spdxId:            string | null;
  isReputationEligible: boolean;
  name:              string;
  url:               string | null;
  category:          string;       // "osi" | "free" | "source" | "proprietary"
}

export interface LicenseCheckResult extends RepoLicenseInfo {
  /** true  → repo is public + license is reputation-eligible */
  passes:       boolean;
  /** Human-readable reason if passes=false */
  reason:       string | null;
  /** If passes=false and the repo is GitHub: instructions to fix */
  instruction:  string | null;
}

export interface IGithubService {
  /**
   * Non-blocking check: always returns a result, never throws.
   * passes=true  → eligible for reputation points.
   * passes=false → instruction tells the user what to do.
   */
  checkRepoLicense(repoUrl: string): Promise<LicenseCheckResult>;

  /**
   * Strict check (used at project activation). Throws on failure.
   */
  verifyOpenSourceRepo(repoUrl: string): Promise<RepoLicenseInfo>;

  /**
   * Create or update the LICENSE.md file in the repository via the GitHub Contents API.
   * Requires a GitHub user access token with repo write access.
   * Returns the URL of the created/updated file.
   */
  createLicenseFile(params: {
    repoUrl:     string;
    spdxId:      string;
    authorName:  string;
    year?:       number;
    userToken:   string; // user's GitHub OAuth token (write access)
  }): Promise<{ fileUrl: string; commitSha: string }>;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class GithubService implements IGithubService {
  private readonly appToken: string | undefined;

  constructor() {
    this.appToken = process.env["GITHUB_TOKEN"];
  }

  // ── Non-blocking check ────────────────────────────────────────────────────

  async checkRepoLicense(repoUrl: string): Promise<LicenseCheckResult> {
    let owner: string, repo: string;
    try {
      ({ owner, repo } = parseRepoUrl(repoUrl));
    } catch {
      return {
        isPublic: false, spdxId: null, isReputationEligible: false,
        name: "Unknown", url: null, category: "proprietary",
        passes: false,
        reason: `URL de dépôt invalide : "${repoUrl}"`,
        instruction: "Format attendu : https://github.com/owner/repo",
      };
    }

    let repoData: GithubRepoResponse;
    try {
      repoData = await this.githubFetch<GithubRepoResponse>(
        `https://api.github.com/repos/${owner}/${repo}`
      );
    } catch (err) {
      const msg = err instanceof PtfError ? err.message : "Erreur GitHub API";
      return {
        isPublic: false, spdxId: null, isReputationEligible: false,
        name: "Unknown", url: null, category: "proprietary",
        passes: false, reason: msg,
        instruction: "Vérifiez que le dépôt est accessible et que l'URL est correcte.",
      };
    }

    if (repoData.private) {
      return {
        isPublic: false, spdxId: null, isReputationEligible: false,
        name: "Private", url: null, category: "proprietary",
        passes: false,
        reason: `Le dépôt ${owner}/${repo} est privé.`,
        instruction:
          "Rendez le dépôt public sur GitHub (Settings → Change visibility) " +
          "pour que les tâches donnent des points de réputation.",
      };
    }

    const spdxId = repoData.license?.spdx_id ?? null;

    if (!spdxId || spdxId === "NOASSERTION") {
      return {
        isPublic: true, spdxId: null, isReputationEligible: false,
        name: "No license", url: null, category: "proprietary",
        passes: false,
        reason: `Aucun fichier de licence détecté dans ${owner}/${repo}.`,
        instruction: buildNoLicenseInstruction(owner, repo),
      };
    }

    const entry = getLicense(spdxId);
    const eligible = ELIGIBLE_SPDX_IDS.has(spdxId);

    if (!eligible) {
      return {
        isPublic: true, spdxId, isReputationEligible: false,
        name:     entry?.name ?? spdxId,
        url:      entry?.url  ?? repoData.license?.url ?? null,
        category: entry?.category ?? "source",
        passes: false,
        reason: `La licence "${spdxId}" ne donne pas droit aux points de réputation.`,
        instruction: buildIneligibleInstruction(spdxId, owner, repo),
      };
    }

    return {
      isPublic: true, spdxId, isReputationEligible: true,
      name:     entry?.name ?? repoData.license?.name ?? spdxId,
      url:      entry?.url  ?? repoData.license?.url ?? null,
      category: entry?.category ?? "osi",
      passes: true, reason: null, instruction: null,
    };
  }

  // ── Strict check (used at activate()) ────────────────────────────────────

  async verifyOpenSourceRepo(repoUrl: string): Promise<RepoLicenseInfo> {
    const result = await this.checkRepoLicense(repoUrl);
    if (!result.passes) {
      const code = !result.isPublic
        ? PtfErrorCode.REPO_NOT_PUBLIC
        : result.spdxId === null
          ? PtfErrorCode.REPO_NO_LICENSE
          : PtfErrorCode.REPO_LICENSE_NOT_OSI;
      throw new PtfError(code, result.reason + (result.instruction ? " " + result.instruction : ""));
    }
    return result;
  }

  // ── Auto-create LICENSE.md ────────────────────────────────────────────────

  async createLicenseFile(params: {
    repoUrl:    string;
    spdxId:     string;
    authorName: string;
    year?:      number;
    userToken:  string;
  }): Promise<{ fileUrl: string; commitSha: string }> {
    const { owner, repo } = parseRepoUrl(params.repoUrl);
    const year = params.year ?? new Date().getFullYear();

    // Try GitHub Licenses API template first
    const githubKey = GITHUB_CREATABLE_LICENSES.get(params.spdxId);
    let content: string;

    if (githubKey) {
      try {
        const tmpl = await this.githubFetch<{ body: string }>(
          `https://api.github.com/licenses/${githubKey}`
        );
        content = tmpl.body
          .replace(/\[year\]/gi,    String(year))
          .replace(/\[fullname\]/gi, params.authorName)
          .replace(/\[name of copyright owner\]/gi, params.authorName);
      } catch {
        // Fall back to local template if GitHub API is unavailable
        content = getFallbackLicenseText(params.spdxId, year, params.authorName);
      }
    } else {
      content = getFallbackLicenseText(params.spdxId, year, params.authorName);
    }

    // Check if LICENSE.md already exists (to get its SHA for update)
    const filePath   = "LICENSE.md";
    const apiBase    = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const b64Content = Buffer.from(content, "utf-8").toString("base64");

    let existingSha: string | undefined;
    try {
      const existing = await this.githubFetch<{ sha: string }>(apiBase, params.userToken);
      existingSha = existing.sha;
    } catch {
      // File doesn't exist — create it
    }

    const body: Record<string, unknown> = {
      message: existingSha
        ? `chore: update LICENSE.md to ${params.spdxId}`
        : `chore: add LICENSE.md (${params.spdxId})`,
      content: b64Content,
    };
    if (existingSha) body["sha"] = existingSha;

    const result = await this.githubPut<{
      content: { html_url: string };
      commit:  { sha: string };
    }>(apiBase, body, params.userToken);

    return {
      fileUrl:   result.content.html_url,
      commitSha: result.commit.sha,
    };
  }

  // ── HTTP helpers ──────────────────────────────────────────────────────────

  private async githubFetch<T>(url: string, userToken?: string): Promise<T> {
    const token = userToken ?? this.appToken;
    const headers: Record<string, string> = {
      Accept:                  "application/vnd.github+json",
      "X-GitHub-Api-Version":  "2022-11-28",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url, { headers, signal: controller.signal });

      if (res.status === 404)         throw new PtfError(PtfErrorCode.REPO_NOT_FOUND,      `GitHub 404 : ${url}`);
      if (res.status === 403 || res.status === 429) throw new PtfError(PtfErrorCode.GITHUB_RATE_LIMITED, "Limite GitHub atteinte. Configurez GITHUB_TOKEN.");
      if (!res.ok)                    throw new PtfError(PtfErrorCode.GITHUB_API_ERROR,     `GitHub HTTP ${res.status}`);

      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async githubPut<T>(url: string, body: Record<string, unknown>, userToken: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept:                  "application/vnd.github+json",
      "X-GitHub-Api-Version":  "2022-11-28",
      "Content-Type":          "application/json",
      Authorization:           `Bearer ${userToken}`,
    };

    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(url, {
        method: "PUT", headers,
        body:   JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new PtfError(PtfErrorCode.GITHUB_API_ERROR, `GitHub PUT ${res.status}: ${detail}`);
      }

      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRepoUrl(raw: string): { owner: string; repo: string } {
  const cleaned = raw.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const match   =
    cleaned.match(/github\.com\/([^/]+)\/([^/]+)/) ??
    cleaned.match(/^([^/]+)\/([^/]+)$/);

  if (!match) {
    throw new PtfError(
      PtfErrorCode.INVALID_REPO_URL,
      `URL invalide : "${raw}". Format attendu : https://github.com/owner/repo`
    );
  }
  return { owner: match[1], repo: match[2] };
}

function buildNoLicenseInstruction(owner: string, repo: string): string {
  const examples = ["MIT", "Apache-2.0", "GPL-3.0-only", "AGPL-3.0-only"];
  return (
    `Pour ajouter une licence : \n` +
    `  • Via PTF : utilisez createProjectLicense(repoUrl, spdxId) pour créer LICENSE.md automatiquement.\n` +
    `  • Manuellement : ajoutez un fichier LICENSE ou LICENSE.md à la racine de ${owner}/${repo}.\n` +
    `Licences recommandées pour la réputation : ${examples.join(", ")}.`
  );
}

function buildIneligibleInstruction(spdxId: string, owner: string, repo: string): string {
  const entry = getLicense(spdxId);
  const cat   = entry?.category ?? "source";
  if (cat === "source") {
    return (
      `"${spdxId}" est une licence source-available, non libre. ` +
      `Pour des points de réputation, remplacez-la par une licence libre (MIT, Apache-2.0, GPL-3.0…). ` +
      `Utilisez createProjectLicense(repoUrl, newSpdxId) pour mettre à jour LICENSE.md automatiquement.`
    );
  }
  if (cat === "proprietary") {
    return (
      `Les projets sous licence propriétaire ne donnent pas de points de réputation. ` +
      `Pour les recevoir, choisissez une licence open-source (MIT, Apache-2.0, GPL-3.0, AGPL-3.0…).`
    );
  }
  return `Licence "${spdxId}" non reconnue comme éligible. Consultez la liste des licences via getLicenses().`;
}

// ── GitHub API types ──────────────────────────────────────────────────────────

interface GithubRepoResponse {
  private: boolean;
  license: { key: string; name: string; spdx_id: string | null; url: string | null } | null;
}
