import { createConfig, http, injected } from "wagmi";
import { activeChain } from "./chain";

export const config = createConfig({
  chains: [activeChain],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [activeChain.id]: http() }
});
