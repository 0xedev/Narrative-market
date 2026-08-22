#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
source "$repo_root/.env"
set +a
export PATH="/home/ayojoseph/.foundry/bin:$PATH"

export RH_RPC_URL="${NEXT_PUBLIC_RH_RPC_URL:?NEXT_PUBLIC_RH_RPC_URL is required}"
export RH_MAINNET_RPC_URL="${RH_MAINNET_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"

deployer_address="$(cast wallet address "$DEPLOYER_PRIVATE_KEY")"
export TREASURY_ADDRESS="$deployer_address"

echo "Deploying from $deployer_address with deployer as treasury and curator."
cd "$repo_root/contracts"
forge script script/Deploy.s.sol:Deploy --rpc-url robinhood_testnet --broadcast --slow
