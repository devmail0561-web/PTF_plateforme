import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import Conf from "conf";
import type { PtfProjectConfig, PtfUserConfig } from "../types.js";

const userConf = new Conf<PtfUserConfig>({
  projectName: "ptf",
  projectVersion: "0.1.0",
});

// ptfApiUrl is left undefined when not explicitly set so PtfApiClient.isOffline()
// returns true correctly instead of defaulting to the production API URL.
export function loadUserConfig(): PtfUserConfig {
  return {
    ptfApiUrl:    userConf.get("ptfApiUrl"),
    ptfNodeUrl:   userConf.get("ptfNodeUrl"),
    walletAddress: userConf.get("walletAddress"),
    sessionToken: userConf.get("sessionToken"),
    githubToken:  userConf.get("githubToken"),
    llmProvider:  userConf.get("llmProvider"),
    llmApiKey:    userConf.get("llmApiKey"),
    llmUrl:       userConf.get("llmUrl"),
    llmModel:     userConf.get("llmModel"),
  };
}

// undefined values are deleted from the store so callers can clear a key
// (e.g. saveUserConfig({ sessionToken: undefined }) on logout).
export function saveUserConfig(partial: Partial<PtfUserConfig>): void {
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      userConf.set(key, value);
    } else {
      userConf.delete(key as keyof PtfUserConfig);
    }
  }
}

export function getUserConfigPath(): string {
  return userConf.path;
}

// Walks up the full directory tree until .ptf/config.json is found or FS root
// is reached — allows running PTF commands from any subdirectory of the project.
function findPtfRoot(startDir: string): string | null {
  let current = startDir;

  while (true) {
    const configPath = join(current, ".ptf", "config.json");
    if (existsSync(configPath)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function loadProjectConfig(dir?: string): PtfProjectConfig | null {
  const startDir = dir ?? process.cwd();
  const projectRoot = findPtfRoot(startDir);
  if (!projectRoot) return null;

  const configPath = join(projectRoot, ".ptf", "config.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as PtfProjectConfig;
  } catch {
    return null;
  }
}

export function saveProjectConfig(
  config: PtfProjectConfig,
  dir?: string
): void {
  const projectDir = dir ?? process.cwd();
  const ptfDir = join(projectDir, ".ptf");

  if (!existsSync(ptfDir)) {
    mkdirSync(ptfDir, { recursive: true });
  }

  const configPath = join(ptfDir, "config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function requireProjectConfig(dir?: string): PtfProjectConfig {
  const config = loadProjectConfig(dir);
  if (!config) {
    const msg = "Aucun projet PTF trouvé dans ce répertoire ou ses parents.\n" +
      "Initialisez un projet avec : ptf init --name <nom> --type public";
    console.error(msg);
    throw new Error(msg);
  }
  return config;
}

export function saveDraftTasks(tasks: unknown[], dir?: string): void {
  const projectDir = dir ?? process.cwd();
  const ptfDir = join(projectDir, ".ptf");

  if (!existsSync(ptfDir)) {
    mkdirSync(ptfDir, { recursive: true });
  }

  const draftPath = join(ptfDir, "tasks-draft.json");
  writeFileSync(draftPath, JSON.stringify(tasks, null, 2), "utf-8");
}

export function loadDraftTasks(dir?: string): unknown[] | null {
  const projectDir = dir ?? process.cwd();
  const draftPath = join(projectDir, ".ptf", "tasks-draft.json");

  if (!existsSync(draftPath)) return null;

  try {
    const raw = readFileSync(draftPath, "utf-8");
    return JSON.parse(raw) as unknown[];
  } catch {
    return null;
  }
}


export function ensureGitignore(projectDir: string): void {
  const gitignorePath = join(projectDir, ".gitignore");
  const ptfSecrets = ".ptf/secrets\n.ptf/*.key\n";

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, ptfSecrets, "utf-8");
    return;
  }

  const existing = readFileSync(gitignorePath, "utf-8");
  if (!existing.includes(".ptf/secrets")) {
    writeFileSync(gitignorePath, existing + "\n# PTF secrets\n" + ptfSecrets, "utf-8");
  }
}
