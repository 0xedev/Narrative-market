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
const rpcUrl = env.NEXT_PUBLIC_RH_RPC_URL || "https://rpc.testnet.chain.robinhood.com";
const throneAddress = getAddress(env.NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS);
const account = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const chain = defineChain({ id: 46630, name: "Robinhood Chain Testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } }, testnet: true });
const abi = JSON.parse(fs.readFileSync(path.join(root, "contracts", "out", "NarrativeThrone.sol", "NarrativeThrone.json"), "utf8")).abi;
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

async function read(functionName, args = []) {
  return publicClient.readContract({ address: throneAddress, abi, functionName, args });
}

async function write(functionName, args) {
  const hash = await wallet.writeContract({ address: throneAddress, abi, functionName, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  return hash;
}

const activeQuestion = await read("activeQuestionId");
const questionEnd = await read("questionEnd");
const now = BigInt(Math.floor(Date.now() / 1000));
if (activeQuestion !== "0x0000000000000000000000000000000000000000000000000000000000000000" && questionEnd > now) {
  console.log(JSON.stringify({ status: "already-active", activeQuestion, questionEnd: questionEnd.toString() }, null, 2));
} else {
  const id = keccak256(stringToHex(`live-testnet-question-${Date.now()}`));
  const uri = `data:application/json;base64,${Buffer.from(JSON.stringify({ id, type: "question", content: "What should the next chapter of Narrative Markets remember?" })).toString("base64")}`;
  const answer = "Keep the rules visible and the rewards immediate.";
  const answerHash = keccak256(stringToHex(answer));
  const answerUri = `data:application/json;base64,${Buffer.from(JSON.stringify({ id: answerHash, type: "answer", content: answer })).toString("base64")}`;
  const queue = await write("queueQuestion", [id, account.address, uri]);
  const rotate = await write("rotateIfDue", [86400n, parseEther("0.00001"), parseEther("0.001")]);
  const carryover = await write("submitCarryoverAnswer", [answerHash, answerUri]);
  console.log(JSON.stringify({ status: "activated", id, queue, rotate, carryover }, null, 2));
}
