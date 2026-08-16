# Narrative Markets

Narrative Markets is a daily on-chain narrative competition. One question is active at a time. The current King submits an answer, earns the protocol's fixed emission stream while holding the Throne, and can be dethroned by anyone willing to pay the current decaying takeover price with a new answer.

The longest-held answer wins the day. This is a mindshare game, not a truth-resolution or prediction market.

## Repository layout

- `contracts/` — Foundry contracts and tests.
- `apps/web/` — Next.js frontend with the yellow/green visual system.
- `packages/db/` — Prisma schema for questions, answers, events, and stats.
- `services/indexer/` — Viem event indexer for Robinhood Chain.
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
pnpm db:generate
pnpm dev
```

Copy `.env.example` to `.env.local` for the web app and configure the deployed contract address after testnet deployment.

## Contracts

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit
forge test -vvv
```

Deploy with a throwaway testnet key only. Never commit private keys.
