import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import {
  ProjectRegistered,
  MerkleRootUpdated,
  TaskClaimed,
  ProjectLocked,
  ProjectDeactivated,
} from "../generated/ProjectRegistry/ProjectRegistry";
import { Project, Task, Developer, GlobalStats } from "../generated/schema";

function loadOrCreateGlobalStats(): GlobalStats {
  let stats = GlobalStats.load("global");
  if (!stats) {
    stats = new GlobalStats("global");
    stats.totalProjects = BigInt.fromI32(0);
    stats.totalTasksClaimed = BigInt.fromI32(0);
    stats.totalRewardsPaid = BigDecimal.fromString("0");
    stats.totalPunishments = BigInt.fromI32(0);
    stats.totalWithdrawals = BigDecimal.fromString("0");
    stats.lastUpdatedBlock = BigInt.fromI32(0);
  }
  return stats;
}

function projectTypeString(val: i32): string {
  return val == 0 ? "Public" : "Private";
}

function rewardModeString(val: i32): string {
  return val == 0 ? "Free" : "Paid";
}

export function handleProjectRegistered(event: ProjectRegistered): void {
  const id = event.params.projectId.toHexString();
  let project = new Project(id);
  project.owner = event.params.owner;
  project.projectType = projectTypeString(event.params.projectType);
  project.rewardMode = rewardModeString(event.params.rewardMode);
  project.escrowBalance = BigDecimal.fromString("0");
  project.locked = false;
  project.active = true;
  project.createdAt = event.block.timestamp;
  project.save();

  const stats = loadOrCreateGlobalStats();
  stats.totalProjects = stats.totalProjects.plus(BigInt.fromI32(1));
  stats.lastUpdatedBlock = event.block.number;
  stats.save();
}

export function handleMerkleRootUpdated(event: MerkleRootUpdated): void {
  const id = event.params.projectId.toHexString();
  const project = Project.load(id);
  if (!project) return;
  project.merkleRoot = event.params.merkleRoot;
  project.save();
}

export function handleTaskClaimed(event: TaskClaimed): void {
  const projectId = event.params.projectId.toHexString();
  const taskId = event.params.taskId.toHexString();

  let task = Task.load(taskId);
  if (!task) {
    task = new Task(taskId);
    task.project = projectId;
    task.claimedAt = event.block.timestamp;
  }
  task.save();

  const stats = loadOrCreateGlobalStats();
  stats.totalTasksClaimed = stats.totalTasksClaimed.plus(BigInt.fromI32(1));
  stats.lastUpdatedBlock = event.block.number;
  stats.save();
}

export function handleProjectLocked(event: ProjectLocked): void {
  const project = Project.load(event.params.projectId.toHexString());
  if (!project) return;
  project.locked = true;
  project.save();
}

export function handleProjectDeactivated(event: ProjectDeactivated): void {
  const project = Project.load(event.params.projectId.toHexString());
  if (!project) return;
  project.active = false;
  project.save();
}
