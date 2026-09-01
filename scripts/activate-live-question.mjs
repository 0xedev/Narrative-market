import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, getAddress, http, keccak256, parseEther, stringToHex } from "../apps/web/node_modules/viem/_esm/index.js";
import { privateKeyToAccount } from "../apps/web/node_modules/viem/_esm/accounts/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
const chainId = Number(env.NEXT_PUBLIC_CHAIN_ID || 4663);
const rpcUrl = env.NEXT_PUBLIC_RH_RPC_URL || (chainId === 4663 ? "https://rpc.mainnet.chain.robinhood.com" : "https://rpc.testnet.chain.robinhood.com");
const targetAddresses = process.argv.slice(2).length > 0 
  ? process.argv.slice(2).map(getAddress)
  : [getAddress(env.NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS || "0x3d683C4867b2ed61FDD37F5339C68A3d6fb17B29")];

const account = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const chain = defineChain({
  id: chainId,
  name: chainId === 4663 ? "Robinhood Chain" : "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: chainId === 46630
});
const abi = JSON.parse(fs.readFileSync(path.join(root, "contracts", "out", "NarrativeThrone.sol", "NarrativeThrone.json"), "utf8")).abi;
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

async function read(address, functionName, args = []) {
  return publicClient.readContract({ address, abi, functionName, args });
}

async function write(address, functionName, args) {
  const hash = await wallet.writeContract({ address, abi, functionName, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted on ${address}`);
  return hash;
}

for (const throneAddress of targetAddresses) {
  console.log(`\n--- Activating question on Throne: ${throneAddress} (Chain ${chainId}) ---`);
  const activeQuestion = await read(throneAddress, "activeQuestionId");
  const questionEnd = await read(throneAddress, "questionEnd");
  const now = BigInt(Math.floor(Date.now() / 1000));
  
  if (activeQuestion !== "0x0000000000000000000000000000000000000000000000000000000000000000" && questionEnd > now) {
    const remainingSecs = questionEnd - now;
    console.log(JSON.stringify({ status: "already-active", throneAddress, activeQuestion, questionEnd: questionEnd.toString(), remainingSecs: remainingSecs.toString() }, null, 2));
    continue;
  }

  const id = keccak256(stringToHex(`live-mainnet-question-${Date.now()}-${throneAddress.slice(0, 6)}`));
  const questionText = "What will define the next on-chain narrative?";
  const uri = `data:application/json;base64,${Buffer.from(JSON.stringify({ id, type: "question", content: questionText })).toString("base64")}`;
  const answer = "Attention is the only scarce asset.";
  const answerHash = keccak256(stringToHex(answer));
  const answerUri = `data:application/json;base64,${Buffer.from(JSON.stringify({ id: answerHash, type: "answer", content: answer })).toString("base64")}`;

  console.log(`1. Queueing new question: "${questionText}"...`);
  const queue = await write(throneAddress, "queueQuestion", [id, account.address, uri]);
  console.log(`   Queued tx: ${queue}`);

  console.log(`2. Rotating question (Duration: 24h, Floor: 0.00001 ETH)...`);
  const rotate = await write(throneAddress, "rotateIfDue", [86400n, parseEther("0.00001")]);
  console.log(`   Rotated tx: ${rotate}`);

  console.log(`3. Submitting carryover answer...`);
  const carryover = await write(throneAddress, "submitCarryoverAnswer", [answerHash, answerUri]);
  console.log(`   Carryover tx: ${carryover}`);

  console.log(JSON.stringify({ status: "activated", throneAddress, id, questionText, queue, rotate, carryover }, null, 2));
}
