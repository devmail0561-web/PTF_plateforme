import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import {
  ProjectFunded,
  TaskRewardReleased,
  PunishmentExecuted,
  WithdrawalExecuted,
  UTXOSpent,
} from "../generated/EscrowVault/EscrowVault";
import {
  Project,
  Task,
  TaskReward,
  Punishment,
  Withdrawal,
  UTXORecord,
  Developer,
  GlobalStats,
} from "../generated/schema";

const DECIMALS = BigDecimal.fromString("1000000"); // 6 décimales

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

function loadOrCreateDeveloper(address: string): Developer {
  let dev = Developer.load(address);
  if (!dev) {
    dev = new Developer(address);
    dev.reputationTotal = BigInt.fromI32(0);
    dev.save();
  }
  return dev;
}

export function handleProjectFunded(event: ProjectFunded): void {
  const projectId = event.params.projectId.toHexString();
  const project = Project.load(projectId);
  if (!project) return;

  const amount = event.params.amount.toBigDecimal().div(DECIMALS);
  project.escrowBalance = project.escrowBalance.plus(amount);
  project.save();
}

export function handleTaskRewardReleased(event: TaskRewardReleased): void {
  const id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const projectId = event.params.projectId.toHexString();
  const taskId = event.params.taskId.toHexString();
  const devAddr = event.params.dev.toHexString().toLowerCase();
  const amount = event.params.amount.toBigDecimal().div(DECIMALS);

  // S'assurer que le developer existe
  loadOrCreateDeveloper(devAddr);

  // Créer le reward
  const reward = new TaskReward(id);
  reward.project = projectId;
  reward.task = taskId;
  reward.dev = event.params.dev;
  reward.amount = amount;
  reward.txHash = event.transaction.hash;
  reward.blockNumber = event.block.number;
  reward.timestamp = event.block.timestamp;
  reward.save();

  // Mettre à jour le solde escrow du projet
  const project = Project.load(projectId);
  if (project) {
    project.escrowBalance = project.escrowBalance.minus(amount);
    if (project.escrowBalance.lt(BigDecimal.fromString("0"))) {
      project.escrowBalance = BigDecimal.fromString("0");
    }
    project.save();
  }

  const stats = loadOrCreateGlobalStats();
  stats.totalRewardsPaid = stats.totalRewardsPaid.plus(amount);
  stats.lastUpdatedBlock = event.block.number;
  stats.save();
}

export function handlePunishmentExecuted(event: PunishmentExecuted): void {
  const id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const amount = event.params.amount.toBigDecimal().div(DECIMALS);

  const punishment = new Punishment(id);
  punishment.project = event.params.projectId.toHexString();
  punishment.taskId = event.params.taskId;
  punishment.dev = event.params.dev;
  punishment.amount = amount;
  punishment.punishmentType = event.params.punishmentType;
  punishment.txHash = event.transaction.hash;
  punishment.blockNumber = event.block.number;
  punishment.timestamp = event.block.timestamp;
  punishment.save();

  const stats = loadOrCreateGlobalStats();
  stats.totalPunishments = stats.totalPunishments.plus(BigInt.fromI32(1));
  stats.lastUpdatedBlock = event.block.number;
  stats.save();
}

export function handleWithdrawalExecuted(event: WithdrawalExecuted): void {
  const id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const amount = event.params.amount.toBigDecimal().div(DECIMALS);

  const withdrawal = new Withdrawal(id);
  withdrawal.owner = event.params.owner;
  withdrawal.amount = amount;
  withdrawal.destination = event.params.destination;
  withdrawal.proofHash = event.params.proofHash;
  withdrawal.txHash = event.transaction.hash;
  withdrawal.blockNumber = event.block.number;
  withdrawal.timestamp = event.block.timestamp;
  withdrawal.save();

  const stats = loadOrCreateGlobalStats();
  stats.totalWithdrawals = stats.totalWithdrawals.plus(amount);
  stats.lastUpdatedBlock = event.block.number;
  stats.save();
}

export function handleUTXOSpent(event: UTXOSpent): void {
  const utxoId = event.params.utxoId.toHexString();

  // address(0) = création UTXO (mintUTXOReceipt), sinon = dépense
  const isCreation = event.params.owner.toHexString() == "0x0000000000000000000000000000000000000000";

  let utxo = UTXORecord.load(utxoId);
  if (!utxo) {
    utxo = new UTXORecord(utxoId);
    utxo.owner = event.params.owner;
    utxo.spent = false;
    utxo.txHash = event.transaction.hash;
  }

  if (!isCreation) {
    utxo.spent = true;
    utxo.spentAt = event.block.timestamp;
  }

  utxo.save();
}
