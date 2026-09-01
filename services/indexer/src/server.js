import http from "node:http";
import { createIndexer } from "./indexer.js";
import { startSubstreamsTail } from "./substreams.js";
import { executeQuery } from "./graphql.js";

const port = Number(process.env.PORT ?? 8080);
const throneAddress = process.env.THRONE_ADDRESS ?? "0x3953b9730A264C477c579B8dF7F84D30B013f99a";
const startBlock = Number(process.env.START_BLOCK ?? 43063693);
const rpcUrl = process.env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const substreamsEndpoint = process.env.SUBSTREAMS_ENDPOINT ?? "robinhood.substreams.pinax.network:443";
const substreamsApiKey = process.env.SUBSTREAMS_API_KEY ?? "";
const spkgUrl = process.env.SPKG_URL ?? "https://spkg.io/streamingfast/ethereum-explorer-v0.1.2.spkg";
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? 4000);

const indexer = createIndexer({ throneAddress, startBlock, rpcUrl });

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "access-control-allow-origin": "*", ...headers });
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), { "content-type": "application/json" });
}

async function readBody(req, limit = 1_000_000) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) {
      req.destroy();
      throw new Error("payload too large");
    }
  }
  return body;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return send(res, 204, "", {
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    });
  }

  if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
    return sendJson(res, 200, {
      ok: true,
      service: "narrative-indexer",
      mode: indexer.liveMode,
      syncedToBlock: indexer.lastProcessedBlock.toString(),
      events: indexer.journal.length,
      entities: {
        questions: indexer.store.questions.size,
        holders: indexer.store.holders.size,
        answers: indexer.store.answers.size,
        takeovers: indexer.store.takeovers.length,
        payouts: indexer.store.payouts.length
      }
    });
  }

  if (req.method === "POST" && (req.url === "/graphql" || req.url === "/" || req.url === "/query")) {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body);
      const result = executeQuery(payload.query ?? "", payload.variables ?? {}, indexer.store);
      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 400, { errors: [{ message: error.message ?? "invalid request" }] });
    }
  }

  sendJson(res, 404, { error: "not found" });
});

server.listen(port, () => {
  console.log(`narrative indexer listening on :${port} (throne ${throneAddress}, from block ${startBlock})`);
});

async function main() {
  try {
    const summary = await indexer.backfill();
    console.log(`[boot] backfill complete: ${summary.events} events indexed up to block ${summary.head}`);
  } catch (error) {
    console.error(`[boot] backfill failed: ${error.message ?? error}`);
  }

  if (substreamsApiKey) {
    try {
      console.log(`[boot] starting Pinax substreams live tail on ${substreamsEndpoint}`);
      await startSubstreamsTail({
        indexer,
        endpoint: substreamsEndpoint,
        apiKey: substreamsApiKey,
        spkgUrl,
        throneAddress,
        startBlockNum: Number(indexer.lastProcessedBlock) + 1
      });
    } catch (error) {
      console.error(`[boot] substreams tail failed (${error.message ?? error}), falling back to polling`);
      startPolling();
    }
  } else {
    console.log("[boot] SUBSTREAMS_API_KEY not set, using RPC log polling");
    startPolling();
  }
}

function startPolling() {
  indexer.liveMode = "polling";
  setInterval(() => {
    indexer.pollLatest().catch((error) => {
      console.error(`[poll] ${error.message ?? error}`);
    });
  }, pollIntervalMs);
}

main().catch((error) => {
  console.error(`[fatal] ${error.message ?? error}`);
  process.exitCode = 1;
});
