import { defineChain, type Chain } from "viem";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 4663);
const rpcOverride = process.env.NEXT_PUBLIC_RH_RPC_URL;

export const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: "https://robinhoodchain.blockscout.com" }
  },
  testnet: false
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: "https://explorer.testnet.chain.robinhood.com" }
  },
  testnet: true
});

const baseChain = chainId === 46630 ? robinhoodTestnet : robinhoodMainnet;

export const activeChain: Chain = rpcOverride
  ? { ...baseChain, rpcUrls: { default: { http: [rpcOverride] } } }
  : baseChain;
