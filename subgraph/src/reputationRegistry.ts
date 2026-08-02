import { BigInt } from "@graphprotocol/graph-ts";
import { ReputationUpdated } from "../generated/ReputationRegistry/ReputationRegistry";
import { Developer, ReputationEvent } from "../generated/schema";

function loadOrCreateDeveloper(address: string): Developer {
  let dev = Developer.load(address);
  if (!dev) {
    dev = new Developer(address);
    dev.reputationTotal = BigInt.fromI32(0);
    dev.save();
  }
  return dev;
}

export function handleReputationUpdated(event: ReputationUpdated): void {
  const devAddr = event.params.dev.toHexString().toLowerCase();
  const dev = loadOrCreateDeveloper(devAddr);

  // Mettre à jour le score total (newTotal est la valeur on-chain)
  dev.reputationTotal = event.params.newTotal;
  dev.save();

  // Enregistrer l'event dans l'historique
  const id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const repEvent = new ReputationEvent(id);
  repEvent.dev = devAddr;
  repEvent.delta = event.params.delta;
  repEvent.newTotal = event.params.newTotal;
  repEvent.taskId = event.params.taskId;
  repEvent.reason = event.params.reason;
  repEvent.txHash = event.transaction.hash;
  repEvent.blockNumber = event.block.number;
  repEvent.timestamp = event.block.timestamp;
  repEvent.save();
}
