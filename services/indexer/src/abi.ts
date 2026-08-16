export const throneAbi = [
  {
    type: "event",
    name: "Takeover",
    inputs: [
      { indexed: true, name: "questionId", type: "bytes32" },
      { indexed: true, name: "newHolder", type: "address" },
      { indexed: true, name: "previousHolder", type: "address" },
      { indexed: false, name: "price", type: "uint256" },
      { indexed: false, name: "answerHash", type: "bytes32" },
      { indexed: false, name: "timestamp", type: "uint256" }
    ]
  },
  {
    type: "event",
    name: "QuestionResolved",
    inputs: [
      { indexed: true, name: "questionId", type: "bytes32" },
      { indexed: true, name: "winningAnswerHash", type: "bytes32" },
      { indexed: false, name: "winningHolder", type: "address" },
      { indexed: false, name: "cumulativeHoldSeconds", type: "uint256" }
    ]
  }
] as const;
