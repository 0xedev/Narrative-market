import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  getAddress,
  http,
  keccak256,
  parseEther,
  stringToHex
} from "../apps/web/node_modules/viem/_esm/index.js";
import { privateKeyToAccount } from "../apps/web/node_modules/viem/_esm/accounts/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = fs.readFileSync(path.join(root, ".env"), "utf8");
const env = Object.fromEntries(
  envFile
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    })
);

const rpcUrl = env.NEXT_PUBLIC_RH_RPC_URL || "https://rpc.testnet.chain.robinhood.com";
const chainId = Number(env.NEXT_PUBLIC_CHAIN_ID || 46630);
const chain = defineChain({
  id: chainId,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } }
});

const account = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const throneAddress = getAddress(env.NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS);
const maxTakeoverPrice = parseEther(env.MAX_TAKEOVER_PRICE || "0.00002");
const minEthReserve = parseEther(env.MIN_ETH_RESERVE || "0.00005");
const autoSettle = env.AUTO_SETTLE === "true";

const throneAbi = JSON.parse(
  fs.readFileSync(path.join(root, "contracts", "out", "NarrativeThrone.sol", "NarrativeThrone.json"), "utf8")
).abi;
const tokenAbi = JSON.parse(
  fs.readFileSync(path.join(root, "contracts", "out", "NarrativeToken.sol", "NarrativeToken.json"), "utf8")
).abi;

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonUri(type, content, id) {
  const payload = JSON.stringify({ id, type, content });
  return `data:application/json;base64,${Buffer.from(payload).toString("base64")}`;
}

async function read(functionName, args = []) {
  return publicClient.readContract({ address: throneAddress, abi: throneAbi, functionName, args });
}

async function write(functionName, args = [], value) {
  const hash = await wallet.writeContract({
    address: throneAddress,
    abi: throneAbi,
    functionName,
    args,
    ...(value === undefined ? {} : { value })
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction reverted: ${hash}`);
  }
  return receipt;
}

async function takeThroneDirect() {
  const questionId = await read("activeQuestionId");
  const epoch = await read("currentEpoch");
  const price = await read("getCurrentPrice");
  const ethBalance = await publicClient.getBalance({ address: account.address });
  if (price > maxTakeoverPrice) {
    console.log(`[Miner] Takeover skipped: price ${formatEther(price)} exceeds limit ${formatEther(maxTakeoverPrice)}.`);
    return;
  }
  if (ethBalance < price + minEthReserve) {
    console.log(`[Miner] Takeover skipped: preserving ${formatEther(minEthReserve)} ETH reserve.`);
    return;
  }
  const answer = `Mining narrative value at block ${Date.now()}`;
  const answerHash = keccak256(stringToHex(answer));
  const answerUri = jsonUri("answer", answer, answerHash);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  console.log(`[Miner] Taking throne to settle & refresh. Price: ${formatEther(price)} ETH (epoch ${epoch})...`);
  const receipt = await write("takeThrone", [questionId, answerHash, answerUri, epoch, maxTakeoverPrice, deadline], price);
  console.log(`[Miner] Throne taken & accrued tokens settled! Tx: ${receipt.transactionHash}`);
}

async function rotateQuestion() {
  console.log(`[Miner] Active question expired or none active. Preparing rotation...`);
  const qId = keccak256(stringToHex(`miner-question-${Date.now()}`));
  const qUri = jsonUri("question", "What narrative creates the most durable decentralized consensus?", qId);
  const duration = 86400n * 7n; // 7 days active window
  const floor = parseEther("0.00001");

  console.log(`[Miner] Queuing new question: ${qId.slice(0, 10)}...`);
  await write("queueQuestion", [qId, account.address, qUri]);

  console.log(`[Miner] Rotating question (mints pending rewards)...`);
  await write("rotateIfDue", [duration, floor]);
}

async function startFirstQuestion() {
  const qId = keccak256(stringToHex(`miner-first-question-${Date.now()}`));
  const qUri = jsonUri("question", "What narrative creates the most durable decentralized consensus?", qId);
  const duration = 86400n * 7n;
  const floor = parseEther("0.00001");

  console.log(`[Miner] Mainnet throne is uninitialized. Starting first question...`);
  const receipt = await write("startFirstQuestion", [qId, account.address, qUri, duration, floor]);
  console.log(`[Miner] First question started. Tx: ${receipt.transactionHash}`);
}

async function handleCarryoverIfRequired() {
  const carryoverRequired = await read("carryoverAnswerRequired");
  const holder = await read("currentHolder");
  const isHolder = holder.toLowerCase() === account.address.toLowerCase();
  if (carryoverRequired && isHolder) {
    console.log(`[Miner] Submitting carryover answer...`);
    const answer = "Continuous narrative mining active.";
    const answerHash = keccak256(stringToHex(answer));
    const answerUri = jsonUri("answer", answer, answerHash);
    const receipt = await write("submitCarryoverAnswer", [answerHash, answerUri]);
    console.log(`[Miner] Carryover answer submitted. Tx: ${receipt.transactionHash}`);
  }
}

async function runLoop() {
  console.log(`=======================================================`);
  console.log(`          NARRATIVE TOKENS CONTINUOUS MINER            `);
  console.log(`=======================================================`);
  console.log(`Miner Account:  ${account.address}`);
  console.log(`Throne Address: ${throneAddress}`);
  console.log(`RPC URL:        ${rpcUrl}`);

  let tokenAddress;
  let lastSettleTime = Date.now();
  const SETTLE_INTERVAL_MS = 3 * 60 * 1000; // Settle / mint every 3 minutes

  while (true) {
    try {
      if (!tokenAddress) {
        tokenAddress = getAddress(await read("narr"));
        console.log(`Token Address:  ${tokenAddress}\n`);
      }
      const now = BigInt(Math.floor(Date.now() / 1000));
      const ethBal = await publicClient.getBalance({ address: account.address });
      const narrBal = await publicClient.readContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [account.address]
      });

      const activeQ = await read("activeQuestionId");
      const qEnd = await read("questionEnd");
      const holder = await read("currentHolder");
      const isHolder = holder.toLowerCase() === account.address.toLowerCase();
      const lastRewardAccrual = Number(await read("lastRewardAccrualAt"));
      const accruedSecs = Math.max(0, Math.floor(Date.now() / 1000) - lastRewardAccrual);
      const estimatedPendingNarr = isHolder ? accruedSecs * 4 : 0;

      console.log(`-------------------------------------------------------`);
      console.log(`[${new Date().toLocaleTimeString()}] ETH: ${formatEther(ethBal)} | Minted NARR: ${formatEther(narrBal)}`);
      console.log(`Holder: ${holder} (${isHolder ? "YOU" : "OTHER"})`);
      console.log(`Accruing: ~${estimatedPendingNarr.toLocaleString()} unminted NARR (+4/sec)`);
      console.log(`Question End: ${qEnd.toString()} (Remaining: ${qEnd > now ? (qEnd - now).toString() + "s" : "EXPIRED"})`);

      await handleCarryoverIfRequired();

      if (activeQ === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        await startFirstQuestion();
      } else if (now >= qEnd) {
        await rotateQuestion();
        await handleCarryoverIfRequired();
      }

      const updatedHolder = await read("currentHolder");
      const timeSinceSettle = Date.now() - lastSettleTime;

      if (updatedHolder.toLowerCase() !== account.address.toLowerCase()) {
        console.log(`[Miner] Not current holder! Taking throne...`);
        await takeThroneDirect();
        lastSettleTime = Date.now();
      } else if (autoSettle && timeSinceSettle >= SETTLE_INTERVAL_MS) {
        console.log(`[Miner] Periodic checkpoint: Settling accrued tokens to wallet...`);
        await takeThroneDirect();
        lastSettleTime = Date.now();
      } else {
        console.log(`[Miner] Mining actively! You hold the throne. Rewards remain accruing until settlement.`);
      }

      await sleep(20000);
    } catch (err) {
      console.error(`[Miner Error]`, err.message || err);
      await sleep(10000);
    }
  }
}

runLoop().catch(console.error);
