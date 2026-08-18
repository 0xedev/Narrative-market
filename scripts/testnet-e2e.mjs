import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  getAddress,
  getContract,
  http,
  keccak256,
  parseEther,
  parseEventLogs,
  stringToHex
} from "../apps/web/node_modules/viem/_esm/index.js";
import { generatePrivateKey, privateKeyToAccount } from "../apps/web/node_modules/viem/_esm/accounts/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      })
  );
}

function requireValue(config, key) {
  const value = config[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function assertThat(condition, message) {
  if (!condition) throw new Error(message);
}

function jsonUri(type, content, id) {
  const payload = JSON.stringify({ id, type, content });
  return `data:application/json;base64,${Buffer.from(payload).toString("base64")}`;
}

function getEvents(receipt, abi, eventName) {
  return parseEventLogs({ abi, logs: receipt.logs, eventName, strict: false });
}

function eventOrThrow(receipt, abi, eventName) {
  const event = getEvents(receipt, abi, eventName)[0];
  assertThat(event, `${eventName} was not emitted in ${receipt.transactionHash}`);
  return event;
}

async function main() {
  const fileEnv = readDotEnv(path.join(repoRoot, ".env"));
  const config = { ...fileEnv, ...process.env };
  const rpcUrl = config.NEXT_PUBLIC_RH_RPC_URL || "https://rpc.testnet.chain.robinhood.com";
  const chain = defineChain({
    id: 46630,
    name: "Robinhood Chain Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    testnet: true
  });

  const deployer = privateKeyToAccount(requireValue(config, "DEPLOYER_PRIVATE_KEY"));
  const throneAddress = getAddress(requireValue(config, "NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS"));
  const holderKey = config.E2E_HOLDER_PRIVATE_KEY?.trim() || generatePrivateKey();
  const holder = privateKeyToAccount(holderKey);

  const throneArtifact = JSON.parse(fs.readFileSync(path.join(repoRoot, "contracts", "out", "NarrativeThrone.sol", "NarrativeThrone.json"), "utf8"));
  const tokenArtifact = JSON.parse(fs.readFileSync(path.join(repoRoot, "contracts", "out", "NarrativeToken.sol", "NarrativeToken.json"), "utf8"));
  const throneAbi = throneArtifact.abi;
  const tokenAbi = tokenArtifact.abi;

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const deployerWallet = createWalletClient({ account: deployer, chain, transport: http(rpcUrl) });
  const holderWallet = createWalletClient({ account: holder, chain, transport: http(rpcUrl) });

  async function read(functionName, args = []) {
    return publicClient.readContract({ address: throneAddress, abi: throneAbi, functionName, args });
  }

  async function write(wallet, functionName, args = [], value) {
    const hash = await wallet.writeContract({
      address: throneAddress,
      abi: throneAbi,
      functionName,
      args,
      ...(value === undefined ? {} : { value })
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assertThat(receipt.status === "success", `${functionName} reverted in ${hash}`);
    return receipt;
  }

  async function take(wallet, questionId, answerHash, answerUri, expectedEpoch) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const price = await read("getCurrentPrice");
      try {
        const receipt = await write(
          wallet,
          "takeThrone",
          [questionId, answerHash, answerUri, expectedEpoch, price, BigInt(Math.floor(Date.now() / 1000) + 120)],
          price
        );
        return { receipt, price };
      } catch (error) {
        if (attempt === 7) throw error;
        await waitFor(1);
      }
    }
    throw new Error("takeThrone could not match the decaying price");
  }

  async function waitFor(seconds) {
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  const chainId = await publicClient.getChainId();
  assertThat(chainId === 46630, `wrong chain: ${chainId}`);
  const bytecode = await publicClient.getBytecode({ address: throneAddress });
  assertThat(bytecode && bytecode !== "0x", "throne has no deployed bytecode");

  const tokenAddress = getAddress(await read("narr"));
  const owner = getAddress(await read("owner"));
  const minter = getAddress(await publicClient.readContract({ address: tokenAddress, abi: tokenAbi, functionName: "minter" }));
  assertThat(owner === deployer.address, `owner mismatch: ${owner}`);
  assertThat(minter === throneAddress, `minter mismatch: ${minter}`);

  const initialHolderBalance = await publicClient.getBalance({ address: holder.address });
  if (initialHolderBalance < parseEther("0.00005")) {
    const fundingHash = await deployerWallet.sendTransaction({ to: holder.address, value: parseEther("0.0001") });
    await publicClient.waitForTransactionReceipt({ hash: fundingHash });
  }
  const fundedHolderBalance = await publicClient.getBalance({ address: holder.address });
  assertThat(fundedHolderBalance >= parseEther("0.00005"), "holder wallet was not funded");

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const q1 = keccak256(stringToHex(`narrative-e2e-question-1-${suffix}`));
  const q2 = keccak256(stringToHex(`narrative-e2e-question-2-${suffix}`));
  const q1Uri = jsonUri("question", "Which idea should shape the next decade?", q1);
  const q2Uri = jsonUri("question", "What should the network remember next?", q2);
  const answer1 = "Open protocols win when the community can inspect the rules.";
  const answer2 = "The next chapter belongs to builders who keep the story legible.";
  const answer3 = "A durable narrative is one that rewards participation, not noise.";
  const answer1Hash = keccak256(stringToHex(answer1));
  const answer2Hash = keccak256(stringToHex(answer2));
  const answer3Hash = keccak256(stringToHex(answer3));
  const answer1Uri = jsonUri("answer", answer1, answer1Hash);
  const answer2Uri = jsonUri("answer", answer2, answer2Hash);
  const answer3Uri = jsonUri("answer", answer3, answer3Hash);
  const floor = parseEther("0.00001");
  const maximum = parseEther("0.001");
  const duration = 45n;

  const proposal1 = await write(holderWallet, "proposeQuestion", [q1, q1Uri]);
  const proposal2 = await write(holderWallet, "proposeQuestion", [q2, q2Uri]);
  const start = await write(deployerWallet, "startFirstQuestion", [q1, deployer.address, q1Uri, duration, floor, maximum]);
  const queue = await write(deployerWallet, "queueQuestion", [q2, deployer.address, q2Uri]);

  let epoch = await read("currentEpoch");
  const firstTakeover = (await take(deployerWallet, q1, answer1Hash, answer1Uri, epoch)).receipt;
  eventOrThrow(firstTakeover, throneAbi, "Takeover");
  eventOrThrow(firstTakeover, throneAbi, "PayoutDistributed");
  assertThat((await publicClient.getBalance({ address: throneAddress })) === 0n, "throne retained ETH after first takeover");

  await waitFor(3);
  epoch = await read("currentEpoch");
  const secondTake = await take(holderWallet, q1, answer2Hash, answer2Uri, epoch);
  const secondTakeover = secondTake.receipt;
  const secondPrice = secondTake.price;
  const secondPayout = eventOrThrow(secondTakeover, throneAbi, "PayoutDistributed");
  const secondReward = eventOrThrow(secondTakeover, throneAbi, "RewardsMinted");
  const secondSettledPrice = secondPayout.args.holderAmount + secondPayout.args.treasuryAmount + secondPayout.args.curatorAmount;
  const secondTransfer = getEvents(secondTakeover, tokenAbi, "Transfer").find((event) => event.args.from === "0x0000000000000000000000000000000000000000");
  assertThat(secondTransfer, "second takeover did not emit a direct NARR mint");
  assertThat(secondReward.args.amount > 0n, "second takeover minted no NARR reward");
  assertThat(secondPayout.args.holderAmount === secondSettledPrice * 8000n / 10000n, "holder payout is not 80%");
  assertThat(secondPayout.args.treasuryAmount === secondSettledPrice * 1500n / 10000n, "treasury payout is not 15%");
  assertThat(secondPayout.args.curatorAmount === secondSettledPrice - secondPayout.args.holderAmount - secondPayout.args.treasuryAmount, "curator payout is not the conserved remainder");
  assertThat((await publicClient.getBalance({ address: throneAddress })) === 0n, "throne retained ETH after second takeover");

  let staleRejected = false;
  try {
    await publicClient.simulateContract({
      account: deployer,
      address: throneAddress,
      abi: throneAbi,
      functionName: "takeThrone",
      args: [q1, answer1Hash, answer1Uri, 1n, secondPrice, BigInt(Math.floor(Date.now() / 1000) + 120)],
      value: secondPrice
    });
  } catch {
    staleRejected = true;
  }
  assertThat(staleRejected, "stale epoch takeover was accepted by simulation");

  const questionEnd = await read("questionEnd");
  const secondsUntilRotation = Number(questionEnd) - Math.floor(Date.now() / 1000) + 2;
  if (secondsUntilRotation > 0) await waitFor(secondsUntilRotation);
  const rotation = await write(deployerWallet, "rotateIfDue", [duration, floor, maximum]);
  eventOrThrow(rotation, throneAbi, "QuestionResolved");
  eventOrThrow(rotation, throneAbi, "QuestionRotated");
  const rotationReward = eventOrThrow(rotation, throneAbi, "RewardsMinted");
  assertThat(rotationReward.args.amount > 0n, "rotation minted no direct NARR reward");
  assertThat(getAddress(await read("currentHolder")) === holder.address, "holder did not carry into the next question");
  assertThat((await read("currentAnswerHash")) === "0x0000000000000000000000000000000000000000000000000000000000000000", "carryover answer was not cleared");
  assertThat(await read("carryoverAnswerRequired"), "carryover answer was not required");
  assertThat((await publicClient.getBalance({ address: throneAddress })) === 0n, "throne retained ETH after rotation");

  const carryover = await write(holderWallet, "submitCarryoverAnswer", [answer3Hash, answer3Uri]);
  eventOrThrow(carryover, throneAbi, "CarryoverAnswerSubmitted");
  assertThat(!(await read("carryoverAnswerRequired")), "carryover answer remained required");

  epoch = await read("currentEpoch");
  const finalTake = await take(deployerWallet, q2, answer1Hash, answer1Uri, epoch);
  const finalTakeover = finalTake.receipt;
  const finalPayout = eventOrThrow(finalTakeover, throneAbi, "PayoutDistributed");
  const finalReward = eventOrThrow(finalTakeover, throneAbi, "RewardsMinted");
  const finalSettledPrice = finalPayout.args.holderAmount + finalPayout.args.treasuryAmount + finalPayout.args.curatorAmount;
  assertThat(finalPayout.args.previousHolder === holder.address, "final payout previous holder mismatch");
  assertThat(finalPayout.args.holderAmount === finalSettledPrice * 8000n / 10000n, "final holder payout is not 80%");
  assertThat(finalReward.args.amount > 0n, "final takeover minted no direct NARR reward");
  assertThat((await read("answerHoldSeconds", [q2, answer3Hash])) > 0n, "new-question answer time was not recorded");
  assertThat((await publicClient.getBalance({ address: throneAddress })) === 0n, "throne retained ETH after final takeover");

  const deployerNarr = await publicClient.readContract({ address: tokenAddress, abi: tokenAbi, functionName: "balanceOf", args: [deployer.address] });
  const holderNarr = await publicClient.readContract({ address: tokenAddress, abi: tokenAbi, functionName: "balanceOf", args: [holder.address] });
  const results = {
    chainId,
    deployer: deployer.address,
    holder: holder.address,
    holderWalletWasEphemeral: !config.E2E_HOLDER_PRIVATE_KEY,
    throne: throneAddress,
    token: tokenAddress,
    receipts: {
      proposal1: proposal1.transactionHash,
      proposal2: proposal2.transactionHash,
      start: start.transactionHash,
      queue: queue.transactionHash,
      firstTakeover: firstTakeover.transactionHash,
      secondTakeover: secondTakeover.transactionHash,
      rotation: rotation.transactionHash,
      carryover: carryover.transactionHash,
      finalTakeover: finalTakeover.transactionHash
    },
    directRewardAmounts: {
      secondTakeover: secondReward.args.amount.toString(),
      rotation: rotationReward.args.amount.toString(),
      finalTakeover: finalReward.args.amount.toString()
    },
    narrBalances: {
      deployer: formatEther(deployerNarr),
      holder: formatEther(holderNarr)
    },
    throneBalance: formatEther(await publicClient.getBalance({ address: throneAddress }))
  };
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
