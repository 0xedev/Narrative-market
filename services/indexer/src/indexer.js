import { createPublicClient, http, decodeEventLog, defineChain } from "viem";
import { throneAbi } from "./abi.js";
import { applyEvent, createStore } from "./store.js";

const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com"] } }
});

export function createIndexer({ throneAddress, startBlock, rpcUrl }) {
  const address = throneAddress.toLowerCase();
  const client = createPublicClient({
    chain: robinhood,
    transport: http(rpcUrl ?? process.env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com")
  });

  const journal = [];
  let store = createStore();
  let lastProcessedBlock = 0n;
  let liveMode = "idle";

  function decode(log) {
    try {
      const decoded = decodeEventLog({ abi: throneAbi, data: log.data, topics: log.topics });
      if (!decoded.eventName) return null;
      return { eventName: decoded.eventName, args: decoded.args };
    } catch {
      return null;
    }
  }

  function rebuild() {
    store = createStore();
    for (const entry of journal) {
      applyEvent(store, entry);
    }
  }

  function applyLogs(logs, blockTimestamps) {
    let added = 0;
    for (const log of logs) {
      if (log.address.toLowerCase() !== address) continue;
      const decoded = decode(log);
      if (!decoded) continue;
      const timestamp = blockTimestamps.get(log.blockNumber) ?? 0n;
      const entry = {
        ...decoded,
        transactionHash: log.transactionHash,
        logIndex: Number(log.logIndex),
        blockNumber: Number(log.blockNumber),
        timestamp: timestamp.toString()
      };
      journal.push(entry);
      applyEvent(store, entry);
      added += 1;
      if (log.blockNumber > lastProcessedBlock) lastProcessedBlock = log.blockNumber;
    }
    return added;
  }

  async function fetchBlockTimestamps(blockNumbers) {
    const timestamps = new Map();
    const unique = [...new Set(blockNumbers.map((n) => BigInt(n)))];
    const batchSize = 8;
    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);
      const blocks = await Promise.all(batch.map((n) => client.getBlock({ blockNumber: n })));
      batch.forEach((n, idx) => timestamps.set(n, blocks[idx].timestamp));
    }
    return timestamps;
  }

  async function backfill(chunkSize = 5000) {
    const head = await client.getBlockNumber();
    let from = BigInt(startBlock);
    while (from <= head) {
      const to = from + BigInt(chunkSize) - 1n > head ? head : from + BigInt(chunkSize) - 1n;
      let logs = [];
      try {
        logs = await client.getLogs({ address: throneAddress, fromBlock: from, toBlock: to });
      } catch {
        const half = (to - from + 1n) / 2n;
        if (half <= 0n) throw new Error(`getLogs failed on block ${from}`);
        logs = [
          ...(await client.getLogs({ address: throneAddress, fromBlock: from, toBlock: from + half - 1n })),
          ...(await client.getLogs({ address: throneAddress, fromBlock: from + half, toBlock: to }))
        ];
      }
      if (logs.length) {
        const timestamps = await fetchBlockTimestamps(logs.map((log) => log.blockNumber));
        applyLogs(logs, timestamps);
      }
      from = to + 1n;
    }
    lastProcessedBlock = head;
    return { events: journal.length, head: head.toString() };
  }

  async function pollLatest() {
    const head = await client.getBlockNumber();
    if (head <= lastProcessedBlock) return 0;
    const logs = await client.getLogs({
      address: throneAddress,
      fromBlock: lastProcessedBlock + 1n,
      toBlock: head
    });
    const timestamps = logs.length ? await fetchBlockTimestamps(logs.map((log) => log.blockNumber)) : new Map();
    const added = applyLogs(logs, timestamps);
    lastProcessedBlock = head;
    return added;
  }

  function rollbackTo(blockNumber) {
    for (let i = journal.length - 1; i >= 0; i -= 1) {
      if (journal[i].blockNumber > blockNumber) {
        journal.splice(i, 1);
      }
    }
    lastProcessedBlock = BigInt(blockNumber);
    rebuild();
  }

  return {
    journal,
    get store() { return store; },
    get lastProcessedBlock() { return lastProcessedBlock; },
    get liveMode() { return liveMode; },
    set liveMode(mode) { liveMode = mode; },
    backfill,
    pollLatest,
    rollbackTo,
    rebuild,
    applyLogs,
    fetchBlockTimestamps
  };
}
