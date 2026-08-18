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

