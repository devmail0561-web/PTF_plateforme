import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

// --- Types ---

export interface TrackedCommit {
  hash: string;
  message: string;
  timestamp: string;
  filesChanged: number;
}

export interface VerificationResult {
  step: string;
  command: string;
  passed: boolean;
  output: string;
  ranAt: string;
}

export interface TrackedTask {
  taskId: string;
  projectId: string;
  branch: string;
  repoPath: string;
  repoUrl: string | null;
  claimedAt: string;
  commits: TrackedCommit[];
  verifications: VerificationResult[];
  pushed: boolean;
}

// --- Paths ---

const GLOBAL_DIR = join(homedir(), ".config", "ptf");
const GLOBAL_INDEX = join(GLOBAL_DIR, "active-tasks.json");

function ensureGlobalDir(): void {
  if (!existsSync(GLOBAL_DIR)) {
    mkdirSync(GLOBAL_DIR, { recursive: true });
  }
}

function localPath(repoPath: string): string {
  return join(repoPath, ".ptf", "active-task.json");
}

// --- Branch convention: ptf/<taskId> ---

export function parseTaskIdFromBranch(branch: string): string | null {
  if (branch.startsWith("ptf/")) {
    return branch.slice(4);
  }
  return null;
}

export function resolveTaskFromCwd(): TrackedTask | null {
  // 1. Try branch name as source of truth
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    const taskId = parseTaskIdFromBranch(branch);
    if (taskId) {
      // Look up in global index
      const byId = getTrackedTaskById(taskId);
      if (byId) return byId;
    }
  } catch {
    // Not in a git repo
  }

  // 2. Fallback: local .ptf/active-task.json
  return getTrackedTask();
}

// --- Global index (maps projectId → tracked task) ---

function loadGlobalIndex(): Record<string, TrackedTask> {
  ensureGlobalDir();
  if (!existsSync(GLOBAL_INDEX)) return {};
  try {
    return JSON.parse(readFileSync(GLOBAL_INDEX, "utf-8"));
  } catch {
    return {};
  }
}

function saveGlobalIndex(index: Record<string, TrackedTask>): void {
  ensureGlobalDir();
  writeFileSync(GLOBAL_INDEX, JSON.stringify(index, null, 2), "utf-8");
}

// --- Sync local file ---

function syncLocal(task: TrackedTask): void {
  const ptfDir = join(task.repoPath, ".ptf");
  if (!existsSync(ptfDir)) {
    mkdirSync(ptfDir, { recursive: true });
  }
  writeFileSync(localPath(task.repoPath), JSON.stringify(task, null, 2), "utf-8");
}

// --- Public API ---

export function trackTask(task: TrackedTask): void {
  syncLocal(task);

  const index = loadGlobalIndex();
  index[task.projectId] = task;
  saveGlobalIndex(index);
}

export function getTrackedTask(repoPath?: string): TrackedTask | null {
  const dir = repoPath ?? process.cwd();
  const file = localPath(dir);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

export function getTrackedTaskByProject(projectId: string): TrackedTask | null {
  const index = loadGlobalIndex();
  return index[projectId] ?? null;
}

export function getTrackedTaskById(taskId: string): TrackedTask | null {
  const index = loadGlobalIndex();
  return Object.values(index).find((t) => t.taskId === taskId) ?? null;
}

export function getAllTrackedTasks(): TrackedTask[] {
  const index = loadGlobalIndex();
  return Object.values(index);
}

export function updateTrackedTask(projectId: string, update: Partial<TrackedTask>): void {
  const index = loadGlobalIndex();
  const existing = index[projectId];
  if (!existing) return;

  const updated = { ...existing, ...update };
  index[projectId] = updated;
  saveGlobalIndex(index);
  syncLocal(updated);
}

export function addCommit(projectId: string, commit: TrackedCommit): void {
  const index = loadGlobalIndex();
  const existing = index[projectId];
  if (!existing) return;

  if (!existing.commits.find((c) => c.hash === commit.hash)) {
    existing.commits.push(commit);
    saveGlobalIndex(index);
    syncLocal(existing);
  }
}

export function addVerification(projectId: string, result: VerificationResult): void {
  const index = loadGlobalIndex();
  const existing = index[projectId];
  if (!existing) return;

  existing.verifications.push(result);
  saveGlobalIndex(index);
  syncLocal(existing);
}

export function untrackTask(projectId: string): void {
  const index = loadGlobalIndex();
  const existing = index[projectId];

  if (existing) {
    const file = localPath(existing.repoPath);
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }

  delete index[projectId];
  saveGlobalIndex(index);
}
