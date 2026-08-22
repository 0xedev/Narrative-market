# Narrative Markets

Narrative Markets is a daily on-chain narrative competition. One question is active at a time. The current King submits an answer, earns the protocol's fixed emission stream while holding the Throne, and can be dethroned by anyone willing to pay the current decaying takeover price with a new answer.

The longest-held answer wins the day. This is a mindshare game, not a truth-resolution or prediction market.

## Repository layout

- `contracts/` — Foundry contracts and tests.
- `apps/web/` — Next.js frontend with the yellow/green visual system.
- `subgraph/` — The Graph schema and event mappings for questions, answers, events, and stats.
- `design/` — Imagen-generated visual direction used before frontend implementation.

## Protocol defaults

- Robinhood Chain testnet: chain ID `46630`.
- Robinhood Chain mainnet: chain ID `4663`.
- Native ETH takeover payments.
- 80% to the dethroned King, 15% treasury, 5% curator.
- Linear price decay over one hour toward a non-zero floor.
- The next starting price is `min(maxPrice, paidPrice * 2)`.
- NARR emissions begin at 4 tokens per second, halve every 30 days, and stop decaying at 0.01 tokens per second.
- The current holder carries into the next question, but must submit a fresh answer. The previous answer does not carry over.

## Live deployments

### Robinhood Chain mainnet (chain ID 4663)

- NarrativeThrone: `0x3d683C4867b2ed61FDD37F5339C68A3d6fb17B29` (verified on Blockscout)
- NarrativeToken (NARR): `0x72D76aC324914E0D9C50B1Da83FA6F941EE1137B`
- Deployed at block `43063693` via `scripts/deploy-mainnet.sh`.

### Robinhood Chain testnet (chain ID 46630)

- NarrativeThrone: `0xd87fCf950760F9373E656387736f8EAfC3757dA2`
- NarrativeToken (NARR): `0x3147400e2e7724818DaA5e96524aE46E543aB433`

### Hosting

- Frontend: Vercel (`apps/web`), configured through `apps/web/.env.production`.
- Indexer proxy: Railway (`services/indexer`), a dependency-free GraphQL proxy that forwards
  `POST /graphql` to the upstream Pinax endpoint configured via `SUBGRAPH_UPSTREAM_URL`
  (optionally authenticated with `SUBGRAPH_API_KEY`). Health check at `/health`.
- Subgraph indexing: Pinax hosts the Graph Node for Robinhood Chain mainnet. Point
  `subgraph/subgraph.yaml` at the deployed throne address/start block, then run
  `pnpm subgraph:build` and `pnpm --dir subgraph deploy:pinax` with `PINAX_NODE_URL` and
  `PINAX_IPFS_URL` set from your Pinax account.

## Security testing

The contract suite includes an adversarial battery in addition to functional tests:

- `contracts/test/NarrativeThroneAttack.t.sol` — reentrancy during payouts, donation extraction,
  rejecting-king DoS and recovery via rotation, win attribution theft via answer copying,
  double-mint prevention, emission bounds, long-dormancy settlement, and an ETH conservation fuzz
  across randomized takeover sequences.
- `contracts/test/NarrativeThroneInvariant.t.sol` — Foundry invariant suite: the throne never
  custodies ETH, prices stay within `[floor, max]`, NARR supply is bounded by the emission cap,
  epochs track state transitions, and settled holders always have answers.
- `contracts/test/live/RhTestnetFork.t.sol` — fork tests against the deployed testnet contracts
  (`RH_TESTNET_RPC_URL` must be set).
- `scripts/testnet-e2e.mjs` — end-to-end protocol exercise against live testnet contracts.

Run everything with:

```bash
cd contracts
forge test --fuzz-runs 1000 -vvv
```

## Local setup

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `apps/web/.env.local`, configure the deployed throne and subgraph addresses, and run the web app from the workspace root.

## Contracts

```bash
cd contracts
forge install --no-git oz=OpenZeppelin/openzeppelin-contracts@v5.0.2
forge install --no-git foundry-rs/forge-std
forge test --fuzz-runs 1000 -vvv
```

The throne deploys its immutable NARR token internally. Deploy with a throwaway testnet key only. Never commit private keys.

The Foundry profile targets the Paris EVM because Robinhood Chain testnet does not support the Shanghai `PUSH0` opcode.

## Subgraph

Update `subgraph/subgraph.yaml` with the deployed throne address and start block, then run:

```bash
pnpm subgraph:codegen
pnpm subgraph:build
```

Configure the resulting GraphQL endpoint as `NEXT_PUBLIC_SUBGRAPH_URL` for the web app.

The Graph currently lists Robinhood Chain mainnet (`robinhood`, chain ID `4663`) as a supported network, but not Robinhood Chain testnet (`46630`). The testnet manifest therefore uses `robinhood-testnet` and must be deployed to a dedicated Graph Node for the pilot. If managed testnet support becomes available, update the manifest network identifier before deploying.

For a local/dedicated Graph Node, start Graph Node and IPFS, update the contract address and start block, then run `pnpm --dir subgraph deploy:node` and point `NEXT_PUBLIC_SUBGRAPH_URL` at the node's GraphQL endpoint.

The repository includes a testnet Graph Node stack in `infra/graph-node/docker-compose.yml`. Start it with `docker compose -f infra/graph-node/docker-compose.yml up -d`, create the `narrative-markets` deployment on port `8020`, deploy the generated subgraph, and use `http://localhost:8000/subgraphs/name/narrative-markets` locally. The Graph Node Postgres volume is indexing infrastructure only; contract state remains authoritative onchain.

