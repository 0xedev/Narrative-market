export const narrativeThroneAbi = [
  { type: "function", name: "activeQuestionId", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "activeQuestionUri", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "currentAnswerHash", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "currentAnswerUri", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "currentEpoch", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "currentHolder", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "currentPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "questionEnd", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "questionStart", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "carryoverAnswerRequired", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "getCurrentPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getEmissionRate", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "narr", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "proposeQuestion", stateMutability: "nonpayable", inputs: [{ name: "questionId", type: "bytes32" }, { name: "questionUri", type: "string" }], outputs: [] },
  { type: "function", name: "queueQuestion", stateMutability: "nonpayable", inputs: [{ name: "questionId", type: "bytes32" }, { name: "curator", type: "address" }, { name: "questionUri", type: "string" }], outputs: [] },
  { type: "function", name: "startFirstQuestion", stateMutability: "nonpayable", inputs: [{ name: "questionId", type: "bytes32" }, { name: "curator", type: "address" }, { name: "questionUri", type: "string" }, { name: "duration", type: "uint256" }, { name: "floor", type: "uint256" }, { name: "maximum", type: "uint256" }], outputs: [] },
  { type: "function", name: "rotateIfDue", stateMutability: "nonpayable", inputs: [{ name: "duration", type: "uint256" }, { name: "floor", type: "uint256" }, { name: "maximum", type: "uint256" }], outputs: [] },
  { type: "function", name: "submitCarryoverAnswer", stateMutability: "nonpayable", inputs: [{ name: "answerHash", type: "bytes32" }, { name: "answerUri", type: "string" }], outputs: [] },
  { type: "function", name: "takeThrone", stateMutability: "payable", inputs: [{ name: "questionId", type: "bytes32" }, { name: "answerHash", type: "bytes32" }, { name: "answerUri", type: "string" }, { name: "expectedEpoch", type: "uint64" }, { name: "maxAcceptedPrice", type: "uint256" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "price", type: "uint256" }] },
  { type: "function", name: "pause", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "unpause", stateMutability: "nonpayable", inputs: [], outputs: [] }
] as const;

export const narrativeTokenAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "minter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }
] as const;
