import { createPublicClient, decodeEventLog, http, parseAbiItem, type Log } from "viem";
import { db } from "@narrative/db";
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
  for (const log of logs as Log[]) {
    if (!log.transactionHash || log.logIndex === undefined || !log.blockNumber) continue;
    const decoded = decodeEventLog({
      abi: [
        parseAbiItem("event Takeover(bytes32 indexed questionId,address indexed newHolder,address indexed previousHolder,uint256 price,bytes32 answerHash,uint256 timestamp)"),
        parseAbiItem("event QuestionResolved(bytes32 indexed questionId,bytes32 indexed winningAnswerHash,address winningHolder,uint256 cumulativeHoldSeconds)")
      ],
      data: log.data,
      topics: log.topics
    });
    const args = decoded.args as Record<string, unknown>;
    await db.onchainEvent.upsert({
      where: { txHash_logIndex: { txHash: log.transactionHash, logIndex: Number(log.logIndex) } },
      update: {},
      create: { txHash: log.transactionHash, logIndex: Number(log.logIndex), blockNumber: log.blockNumber, eventName: decoded.eventName, payload: JSON.parse(JSON.stringify(args, (_, value) => typeof value === "bigint" ? value.toString() : value)) }
    });
    if (decoded.eventName === "Takeover") {
      const questionId = String(args.questionId);
      const holderAddress = String(args.newHolder).toLowerCase();
      const previousHolder = String(args.previousHolder).toLowerCase();
      const timestamp = new Date(Number(args.timestamp) * 1000);
      await db.user.upsert({ where: { address: holderAddress }, update: {}, create: { address: holderAddress } });
      if (previousHolder !== "0x0000000000000000000000000000000000000000") await db.user.upsert({ where: { address: previousHolder }, update: {}, create: { address: previousHolder } });
      await db.question.upsert({ where: { id: questionId }, update: {}, create: { id: questionId, text: "On-chain narrative", proposerAddress: holderAddress, curatorAddress: holderAddress, startsAt: timestamp, endsAt: new Date(timestamp.getTime() + 86_400_000), status: "ACTIVE" } });
      const previous = await db.takeoverHistory.findFirst({ where: { questionId }, orderBy: { timestamp: "desc" } });
      if (previous) await db.takeoverHistory.update({ where: { id: previous.id }, data: { holdSeconds: BigInt(Math.max(0, Math.floor((timestamp.getTime() - previous.timestamp.getTime()) / 1000))) } });
      await db.takeoverHistory.create({ data: { questionId, holderAddress, previousHolder: previousHolder === "0x0000000000000000000000000000000000000000" ? null : previousHolder, answerHash: String(args.answerHash), priceWei: BigInt(String(args.price)), timestamp, txHash: log.transactionHash, logIndex: Number(log.logIndex) } });
    }
    if (decoded.eventName === "QuestionResolved") {
      await db.question.updateMany({ where: { id: String(args.questionId) }, data: { status: "RESOLVED", winningAnswerHash: String(args.winningAnswerHash), winningHolder: String(args.winningHolder).toLowerCase(), winningHoldSeconds: BigInt(String(args.cumulativeHoldSeconds)) } });
    }
  }
}

poll().catch((error) => { console.error("INDEXER: initial poll failed", error); process.exitCode = 1; });
setInterval(() => poll().catch((error) => console.error("INDEXER: poll failed", error)), 15_000);
