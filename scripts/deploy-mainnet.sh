#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
source "$repo_root/.env"
set +a

export RH_MAINNET_RPC_URL="${RH_MAINNET_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
export DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is required}"

deployer_address="$(cast wallet address "$DEPLOYER_PRIVATE_KEY")"
export TREASURY_ADDRESS="${MAINNET_TREASURY_ADDRESS:-$deployer_address}"

echo "Deploying from $deployer_address with treasury $TREASURY_ADDRESS on Robinhood mainnet (4663)."
cd "$repo_root/contracts"
forge script script/Deploy.s.sol:Deploy --rpc-url robinhood_mainnet --broadcast --slow
