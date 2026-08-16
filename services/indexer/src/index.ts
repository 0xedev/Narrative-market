import { createPublicClient, http, parseAbiItem, type Log } from "viem";
import { robinhoodTestnet } from "../../../apps/web/lib/chain";

const address = process.env.NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS as `0x${string}` | undefined;
const rpcUrl = process.env.INDEXER_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com";

if (!address) {
  console.warn("INDEXER: NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS is not configured; indexer is idle.");
}

const client = createPublicClient({ chain: robinhoodTestnet, transport: http(rpcUrl) });

async function poll() {
  if (!address) return;
  const latest = await client.getBlockNumber();
  const from = process.env.INDEXER_START_BLOCK ? BigInt(process.env.INDEXER_START_BLOCK) : latest > 2000n ? latest - 2000n : 0n;
  const logs = await client.getLogs({
    address,
    fromBlock: from,
    toBlock: latest,
    events: [
      parseAbiItem("event Takeover(bytes32 indexed questionId,address indexed newHolder,address indexed previousHolder,uint256 price,bytes32 answerHash,uint256 timestamp)"),
      parseAbiItem("event QuestionResolved(bytes32 indexed questionId,bytes32 indexed winningAnswerHash,address winningHolder,uint256 cumulativeHoldSeconds)")
    ]
  });
  console.log(`INDEXER: scanned ${logs.length} events through block ${latest}`);
  for (const log of logs as Log[]) console.log(JSON.stringify({ blockNumber: log.blockNumber?.toString(), txHash: log.transactionHash, topics: log.topics }));
}

poll().catch((error) => { console.error("INDEXER: initial poll failed", error); process.exitCode = 1; });
setInterval(() => poll().catch((error) => console.error("INDEXER: poll failed", error)), 15_000);
