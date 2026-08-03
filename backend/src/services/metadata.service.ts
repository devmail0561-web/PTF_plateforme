/**
 * MetadataService — content-addressed storage for task and project metadata.
 *
 * Design:
 *   - Metadata content lives in PostgreSQL (existing) and on PTF nodes.
 *   - A keccak256 hash of the immutable fields is anchored on-chain via
 *     ProjectRegistry.registerTaskMetadata() at publish time.
 *   - Any client can verify integrity: hashMetadata(content) == on-chain hash.
 *   - When a task is validated or a project archived, any node can push the
 *     content to Arweave and anchor the Arweave ID on-chain. First valid call
 *     wins; the contract rejects duplicates (AlreadyArchived).
 *
 * Phase 1 (current): PostgreSQL is the content store. The hash acts as a
 * tamper-evidence seal — divergence between the DB and the on-chain hash
 * signals a compromise.
 *
 * Phase 2 (future): gossip protocol distributes content across nodes so no
 * single PostgreSQL instance is the only copy.
 */

import { ethers } from "ethers";
import type { Task, Project } from "@prisma/client";
import type { IChainAdapter } from "../bal/chain.adapter.js";
import type { IStorageProvider } from "./storage.provider.js";
import type {
  TaskConstraints,
  TaskScoring,
  ClaimCriteria,
  Punishments,
  VerificationStep,
} from "../types/index.js";

// ── Serialisation ──────────────────────────────────────────────────────────────
// Deterministic: keys sorted recursively so keccak256 is identical on every node.

function sortKeysDeep(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.keys(obj as object)
        .sort()
        .map((k) => [k, sortKeysDeep((obj as Record<string, unknown>)[k])])
    );
  }
  return obj;
}

export function serializeForHash(content: object): string {
  return JSON.stringify(sortKeysDeep(content));
}

export function hashMetadata(content: object): string {
  return ethers.keccak256(ethers.toUtf8Bytes(serializeForHash(content)));
}

// ── Hashable field extractors ──────────────────────────────────────────────────
// Only immutable fields are included. Mutable operational fields (status,
// claimedAt, devAddress, deadline, commitHash...) are excluded.

export interface TaskHashableFields {
  taskId:            string;
  projectId:         string;
  title:             string;
  type:              string;
  priority:          string;
  context:           string;
  objective:         string;
  deliverable:       string;
  outOfScope:        string[];
  constraints:       TaskConstraints;
  verificationSteps: VerificationStep[];
  claimCriteria:     ClaimCriteria;
  punishments:       Punishments;
  scoring:           TaskScoring;
  dependencies:      string[];
  duration:          string;
  rewardAmount:      string | null;  // stringified to avoid float precision issues
  rewardToken:       string | null;
  rewardMode:        string;
  createdAt:         string;         // ISO — included for temporal uniqueness
}

export function extractTaskHashableFields(task: Task): TaskHashableFields {
  return {
    taskId:            task.id,
    projectId:         task.projectId,
    title:             task.title,
    type:              task.type,
    priority:          task.priority,
    context:           task.context,
    objective:         task.objective,
    deliverable:       task.deliverable,
    outOfScope:        task.outOfScope,
    constraints:       task.constraints as unknown as TaskConstraints,
    verificationSteps: task.verificationSteps as unknown as VerificationStep[],
    claimCriteria:     task.claimCriteria as unknown as ClaimCriteria,
    punishments:       task.punishments as unknown as Punishments,
    scoring:           task.scoring as unknown as TaskScoring,
    dependencies:      task.dependencies,
    duration:          task.duration,
    rewardAmount:      task.rewardAmount?.toString() ?? null,
    rewardToken:       task.rewardToken ?? null,
    rewardMode:        task.rewardAmount ? "paid" : "free",
    createdAt:         task.createdAt.toISOString(),
  };
}

export interface ProjectHashableFields {
  projectId:    string;
  name:         string;
  type:         string;
  rewardMode:   string;
  chain:        string;
  language:     string | null;
  ownerAddress: string;
  createdAt:    string;
}

export function extractProjectHashableFields(project: Project): ProjectHashableFields {
  return {
    projectId:    project.id,
    name:         project.name,
    type:         project.type,
    rewardMode:   project.rewardMode,
    chain:        project.chain,
    language:     project.language ?? null,
    ownerAddress: project.ownerAddress,
    createdAt:    project.createdAt.toISOString(),
  };
}

// ── MetadataService ────────────────────────────────────────────────────────────

export interface IMetadataService {
  hashTask(task: Task): string;
  hashProject(project: Project): string;
  registerTask(task: Task): Promise<void>;
  registerProject(project: Project): Promise<void>;
  archiveTask(task: Task): Promise<string>;
  archiveProject(project: Project): Promise<string>;
  verifyTask(task: Task): Promise<boolean>;
}

export class MetadataService implements IMetadataService {
  constructor(
    private readonly chainAdapter: IChainAdapter,
    private readonly storage: IStorageProvider,
  ) {}

  hashTask(task: Task): string {
    return hashMetadata(extractTaskHashableFields(task));
  }

  hashProject(project: Project): string {
    return hashMetadata(extractProjectHashableFields(project));
  }

  // Called at task creation — anchors hash on-chain.
  // The hash is also stored in Task.metadataHash (PostgreSQL) for fast local
  // verification without an RPC call.
  async registerTask(task: Task): Promise<void> {
    const hash = this.hashTask(task);
    await this.chainAdapter.registerTaskMetadata(task.id, hash);
  }

  async registerProject(project: Project): Promise<void> {
    const hash = this.hashProject(project);
    await this.chainAdapter.registerProjectMetadata(project.id, hash);
  }

  // Called when task reaches "validated". Any node can call this — the contract
  // rejects duplicates (AlreadyArchived). Returns the Arweave ID.
  async archiveTask(task: Task): Promise<string> {
    const fields     = extractTaskHashableFields(task);
    const serialized = serializeForHash(fields);
    const hash       = ethers.keccak256(ethers.toUtf8Bytes(serialized));

    const ref = await this.storage.store(serialized, {
      taskId:    task.id,
      projectId: task.projectId,
      hash,
    });

    await this.chainAdapter.setTaskArchiveId(task.id, ref.id, hash);
    return ref.id;
  }

  async archiveProject(project: Project): Promise<string> {
    const fields     = extractProjectHashableFields(project);
    const serialized = serializeForHash(fields);
    const hash       = ethers.keccak256(ethers.toUtf8Bytes(serialized));

    const ref = await this.storage.store(serialized, {
      projectId: project.id,
      hash,
    });

    await this.chainAdapter.setProjectArchiveId(project.id, ref.id, hash);
    return ref.id;
  }

  // Verifies local DB content matches the on-chain hash.
  // Returns false if hashes diverge (DB tampered) or hash not registered yet.
  async verifyTask(task: Task): Promise<boolean> {
    if (!task.metadataHash) return false;
    const localHash = this.hashTask(task);
    if (localHash !== task.metadataHash) return false;
    return this.chainAdapter.verifyTaskMetadata(task.id, localHash);
  }
}
