import { BigDecimal, BigInt, Address } from "@graphprotocol/graph-ts";
import {
  CreditClaimed,
  Transfer,
} from "../generated/CreditToken/CreditToken";
import { Developer, CreditEvent } from "../generated/schema";

const DECIMALS = BigDecimal.fromString("1000000");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function loadOrCreateDeveloper(address: string): Developer {
  let dev = Developer.load(address);
  if (!dev) {
    dev = new Developer(address);
    dev.reputationTotal = BigInt.fromI32(0);
    dev.save();
  }
  return dev;
}


export function handleCreditClaimed(event: CreditClaimed): void {
  const devAddr = event.params.to.toHexString().toLowerCase();
  loadOrCreateDeveloper(devAddr);

  const id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const amount = event.params.amount.toBigDecimal().div(DECIMALS);

  const creditEvent = new CreditEvent(id);
  creditEvent.dev = devAddr;
  creditEvent.eventType = "claimed";
  creditEvent.amount = amount;
  creditEvent.taskId = event.params.taskId;
  creditEvent.to = event.params.to;
  creditEvent.txHash = event.transaction.hash;
  creditEvent.blockNumber = event.block.number;
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.save();
}

export function handleTransfer(event: Transfer): void {
  const fromAddr = event.params.from.toHexString().toLowerCase();
  const toAddr = event.params.to.toHexString().toLowerCase();
  const amount = event.params.value.toBigDecimal().div(DECIMALS);

  // Ignorer les mint (from == 0x0) — déjà couverts par CreditClaimed
  if (fromAddr == ZERO_ADDRESS) return;

  const id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();

  // Transfer sortant (from) — fromAddr != ZERO_ADDRESS garanti par early-return ci-dessus
  loadOrCreateDeveloper(fromAddr);
  const outEvent = new CreditEvent(id + "-out");
  outEvent.dev = fromAddr;
  outEvent.eventType = "transfer_out";
  outEvent.amount = amount;
  outEvent.from = event.params.from;
  outEvent.to = event.params.to;
  outEvent.txHash = event.transaction.hash;
  outEvent.blockNumber = event.block.number;
  outEvent.timestamp = event.block.timestamp;
  outEvent.save();

  // Transfer entrant (to) — ignorer burns (to == 0x0)
  if (toAddr != ZERO_ADDRESS) {
    loadOrCreateDeveloper(toAddr);
    const inEvent = new CreditEvent(id + "-in");
    inEvent.dev = toAddr;
    inEvent.eventType = "transfer_in";
    inEvent.amount = amount;
    inEvent.from = event.params.from;
    inEvent.to = event.params.to;
    inEvent.txHash = event.transaction.hash;
    inEvent.blockNumber = event.block.number;
    inEvent.timestamp = event.block.timestamp;
    inEvent.save();
  }
}
