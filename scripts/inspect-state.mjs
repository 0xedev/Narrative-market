import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  defineChain,
  formatEther,
  getAddress,
  http
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

const throneAbi = JSON.parse(
  fs.readFileSync(path.join(root, "contracts", "out", "NarrativeThrone.sol", "NarrativeThrone.json"), "utf8")
).abi;
const tokenAbi = JSON.parse(
  fs.readFileSync(path.join(root, "contracts", "out", "NarrativeToken.sol", "NarrativeToken.json"), "utf8")
).abi;

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

async function inspect() {
  const ethBalance = await publicClient.getBalance({ address: account.address });
  const tokenAddress = getAddress(await publicClient.readContract({
    address: throneAddress,
    abi: throneAbi,
    functionName: "narr"
  }));
  const tokenBalance = await publicClient.readContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [account.address]
  });

  const activeQuestionId = await publicClient.readContract({
    address: throneAddress,
    abi: throneAbi,
    functionName: "activeQuestionId"
  });
  const currentHolder = await publicClient.readContract({
    address: throneAddress,
    abi: throneAbi,
    functionName: "currentHolder"
  });
  const currentPrice = await publicClient.readContract({
    address: throneAddress,
    abi: throneAbi,
    functionName: "getCurrentPrice"
  });
  const floorPrice = await publicClient.readContract({
    address: throneAddress,
    abi: throneAbi,
    functionName: "floorPrice"
  });
  const questionEnd = await publicClient.readContract({
    address: throneAddress,
    abi: throneAbi,
    functionName: "questionEnd"
  });
  const currentEpoch = await publicClient.readContract({
    address: throneAddress,
    abi: throneAbi,
    functionName: "currentEpoch"
  });
  const treasury = await publicClient.readContract({
    address: throneAddress,
    abi: throneAbi,
    functionName: "treasury"
  });
  const currentCurator = await publicClient.readContract({
    address: throneAddress,
    abi: throneAbi,
    functionName: "currentCurator"
  });
  const lastRewardAccrualAt = await publicClient.readContract({
    address: throneAddress,
    abi: throneAbi,
    functionName: "lastRewardAccrualAt"
  });
  const carryoverAnswerRequired = await publicClient.readContract({
    address: throneAddress,
    abi: throneAbi,
    functionName: "carryoverAnswerRequired"
  });

  console.log(JSON.stringify({
    chainId,
    deployerAddress: account.address,
    ethBalance: formatEther(ethBalance),
    narrBalance: formatEther(tokenBalance),
    tokenAddress,
    throneAddress,
    activeQuestionId,
    currentHolder,
    isCurrentHolder: currentHolder.toLowerCase() === account.address.toLowerCase(),
    currentPrice: formatEther(currentPrice),
    floorPrice: formatEther(floorPrice),
    questionEnd: Number(questionEnd),
    now: Math.floor(Date.now() / 1000),
    currentEpoch: Number(currentEpoch),
    treasury,
    currentCurator,
    lastRewardAccrualAt: Number(lastRewardAccrualAt),
    carryoverAnswerRequired
  }, null, 2));
}

inspect().catch(console.error);
