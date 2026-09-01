import { createRequest, streamBlocks, createAuthInterceptor, createRegistry, fetchSubstream } from "@substreams/core";
import { createGrpcTransport } from "@connectrpc/connect-node";

function toHex(bytes) {
  if (typeof bytes === "string") return bytes.startsWith("0x") ? bytes : `0x${bytes}`;
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function collectLogs(block) {
  const logs = [];
  const seen = new Set();
  const traces = block.transactionTraces ?? [];
  for (const trace of traces) {
    const transactionHash = toHex(trace.hash);
    const receiptLogs = trace.receipt?.logs ?? [];
    for (const log of receiptLogs) {
      addLog(log, transactionHash, logs, seen);
    }
    for (const call of trace.calls ?? []) {
      for (const log of call.logs ?? []) {
        addLog(log, transactionHash, logs, seen);
      }
    }
  }
  return logs;
}

function addLog(log, transactionHash, logs, seen) {
  const index = log.index ?? log.logIndex;
  const identity = index === undefined
    ? `${transactionHash}:${toHex(log.address)}:${(log.topics ?? []).map(toHex).join(",")}:${toHex(log.data ?? new Uint8Array())}`
    : `${transactionHash}:${String(index)}`;
  if (seen.has(identity)) return;
  seen.add(identity);
  logs.push({ log, transactionHash });
}

export async function startSubstreamsTail({ indexer, endpoint, apiKey, spkgUrl, startBlockNum, throneAddress, onCursor }) {
  const pkg = await fetchSubstream(spkgUrl);
  const registry = createRegistry(pkg);
  const targetAddress = (throneAddress ?? process.env.THRONE_ADDRESS ?? "").toLowerCase();
  const transport = createGrpcTransport({
    baseUrl: `https://${endpoint}`,
    interceptors: [createAuthInterceptor(apiKey)],
    jsonOptions: { typeRegistry: registry }
  });

  let cursor = null;
  let streamRestartBackoff = 1000;

  async function runStream() {
    const request = createRequest({
      substreamPackage: pkg,
      outputModule: "map_block_full",
      productionMode: true,
      ...(cursor ? { startCursor: cursor } : { startBlockNum: String(startBlockNum) })
    });

    for await (const response of streamBlocks(transport, request)) {
      if (response.message?.case === "blockScopedData") {
        const data = response.message.value;
        const output = data.output?.mapOutput;
        const block = output ? output.unpack(registry) : undefined;
        if (block) {
          const blockNumber = Number(block.number);
          const timestamp = BigInt(Math.floor(Number(block.timestamp?.seconds ?? 0)));
          const timestamps = new Map([[blockNumber, timestamp]]);
          const decodedLogs = [];
          let logIndex = 0;
          for (const { log, transactionHash } of collectLogs(block)) {
            const logAddress = toHex(log.address).toLowerCase();
            decodedLogs.push({ address: logAddress, topics: (log.topics ?? []).map(toHex), data: toHex(log.data ?? new Uint8Array()), transactionHash, logIndex: logIndex++, blockNumber });
          }
          const usable = decodedLogs.filter((log) => log.address === targetAddress);
          indexer.applyLogs(usable, timestamps);
        }
        if (data.cursor) {
          cursor = data.cursor;
          if (onCursor) onCursor(cursor);
        }
      } else if (response.message?.case === "blockUndoSignal") {
        const lastValidBlock = Number(response.message.value.lastValidBlock?.num ?? 0);
        indexer.rollbackTo(lastValidBlock);
        cursor = response.message.value.lastValidCursor ?? cursor;
      }
      streamRestartBackoff = 1000;
    }
  }

  indexer.liveMode = "substreams";
  while (true) {
    try {
      await runStream();
      throw new Error("substreams stream ended unexpectedly");
    } catch (error) {
      console.error(`[substreams] stream error (${error.message ?? error}), retrying in ${streamRestartBackoff}ms`);
      await new Promise((resolve) => setTimeout(resolve, streamRestartBackoff));
      streamRestartBackoff = Math.min(streamRestartBackoff * 2, 30_000);
    }
  }
}
