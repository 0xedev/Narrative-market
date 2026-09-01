import { ZERO_ADDRESS, normalizeAddress, normalizeBytes } from "./abi.js";

export function createStore() {
  return {
    holders: new Map(),
    questions: new Map(),
    answers: new Map(),
    takeovers: [],
    payouts: [],
    rewards: [],
    proposals: []
  };
}

function getHolder(store, address) {
  const id = normalizeAddress(address);
  let holder = store.holders.get(id);
  if (!holder) {
    holder = {
      id,
      address: id,
      totalHeldSeconds: 0n,
      takeovers: 0n,
      wins: 0n,
      rewardsMinted: 0n,
      payoutsReceived: 0n
    };
    store.holders.set(id, holder);
  }
  return holder;
}

function getQuestion(store, questionId) {
  const id = normalizeBytes(questionId);
  let question = store.questions.get(id);
  if (!question) {
    question = {
      id,
      uri: "",
      proposer: ZERO_ADDRESS,
      curator: ZERO_ADDRESS,
      status: "UNKNOWN",
      startsAt: 0n,
      endsAt: 0n,
      active: false,
      lastTakeoverAt: 0n,
      currentHolder: null,
      currentAnswer: null,
      winningAnswer: null,
      winningHolder: null,
      winningHoldSeconds: null
    };
    store.questions.set(id, question);
  }
  return question;
}

function answerId(question, hash, holder) {
  return `${question.id}-${normalizeBytes(hash)}-${normalizeAddress(holder)}`;
}

function getAnswer(store, question, hash, uri, holderAddress, timestamp) {
  const id = answerId(question, hash, holderAddress);
  let answer = store.answers.get(id);
  if (!answer) {
    answer = {
      id,
      hash: normalizeBytes(hash),
      question: question.id,
      holder: null,
      holdSeconds: 0n,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      uri
    };
    store.answers.set(id, answer);
  }
  answer.uri = uri;
  answer.holder = getHolder(store, holderAddress).id;
  answer.lastSeenAt = timestamp;
  return answer;
}

function settleCurrentAnswer(store, question, timestamp) {
  if (question.currentAnswer) {
    const answer = store.answers.get(question.currentAnswer);
    if (answer) {
      const elapsed = timestamp - question.lastTakeoverAt;
      if (elapsed > 0n) {
        answer.holdSeconds += elapsed;
        answer.lastSeenAt = timestamp;
        const holder = store.holders.get(answer.holder);
        if (holder) holder.totalHeldSeconds += elapsed;
      }
    }
  }
  question.lastTakeoverAt = timestamp;
}

function eventKey(log) {
  return `${log.transactionHash}-${log.logIndex}`;
}

export function applyEvent(store, log) {
  const timestamp = BigInt(log.timestamp);
  switch (log.eventName) {
    case "QuestionProposed": {
      const question = getQuestion(store, log.args.questionId);
      question.uri = log.args.questionUri;
      question.proposer = normalizeAddress(log.args.proposer);
      question.status = "PROPOSED";
      store.proposals.push({
        id: eventKey(log),
        questionId: normalizeBytes(log.args.questionId),
        proposer: normalizeAddress(log.args.proposer),
        uri: log.args.questionUri,
        timestamp: log.args.timestamp
      });
      break;
    }
    case "QuestionQueued": {
      const question = getQuestion(store, log.args.questionId);
      question.uri = log.args.questionUri;
      question.curator = normalizeAddress(log.args.curator);
      question.status = "QUEUED";
      break;
    }
    case "QuestionStarted": {
      const question = getQuestion(store, log.args.questionId);
      question.uri = log.args.questionUri;
      question.curator = normalizeAddress(log.args.curator);
      question.status = "ACTIVE";
      question.active = true;
      question.startsAt = log.args.startsAt;
      question.endsAt = log.args.endsAt;
      question.lastTakeoverAt = log.args.startsAt;
      question.currentHolder = null;
      question.currentAnswer = null;
      break;
    }
    case "QuestionRotated": {
      const question = getQuestion(store, log.args.newQuestionId);
      question.uri = log.args.questionUri;
      question.status = "ACTIVE";
      question.active = true;
      question.currentAnswer = null;
      if (normalizeAddress(log.args.carriedHolder) !== ZERO_ADDRESS) {
        question.currentHolder = getHolder(store, log.args.carriedHolder).id;
      }
      break;
    }
    case "QuestionResolved": {
      const question = getQuestion(store, log.args.questionId);
      settleCurrentAnswer(store, question, timestamp);
      question.status = "RESOLVED";
      question.active = false;
      question.winningHolder = normalizeAddress(log.args.winningHolder);
      question.winningHoldSeconds = log.args.cumulativeHoldSeconds;
      if (normalizeAddress(log.args.winningHolder) !== ZERO_ADDRESS) {
        const winner = getHolder(store, log.args.winningHolder);
        winner.wins += 1n;
        const winningId = answerId(question, log.args.winningAnswerHash, log.args.winningHolder);
        const answer = store.answers.get(winningId);
        if (answer) {
          answer.holdSeconds = log.args.cumulativeHoldSeconds;
          question.winningAnswer = answer.id;
        }
      }
      break;
    }
    case "CarryoverAnswerSubmitted": {
      const question = getQuestion(store, log.args.questionId);
      const answer = getAnswer(store, question, log.args.answerHash, log.args.answerUri, log.args.holder, log.args.timestamp);
      question.currentHolder = getHolder(store, log.args.holder).id;
      question.currentAnswer = answer.id;
      question.lastTakeoverAt = log.args.timestamp;
      break;
    }
    case "Takeover": {
      const question = getQuestion(store, log.args.questionId);
      settleCurrentAnswer(store, question, log.args.timestamp);
      const newHolder = getHolder(store, log.args.newHolder);
      newHolder.takeovers += 1n;
      const answer = getAnswer(store, question, log.args.answerHash, log.args.answerUri, log.args.newHolder, log.args.timestamp);
      store.takeovers.push({
        id: eventKey(log),
        question: question.id,
        newHolder: newHolder.id,
        previousHolder: normalizeAddress(log.args.previousHolder) !== ZERO_ADDRESS ? getHolder(store, log.args.previousHolder).id : null,
        answer: answer.id,
        price: log.args.price,
        timestamp: log.args.timestamp,
        transactionHash: log.transactionHash
      });
      question.currentHolder = newHolder.id;
      question.currentAnswer = answer.id;
      question.lastTakeoverAt = log.args.timestamp;
      break;
    }
    case "RewardsMinted": {
      const holder = getHolder(store, log.args.holder);
      holder.rewardsMinted += log.args.amount;
      store.rewards.push({
        id: eventKey(log),
        question: getQuestion(store, log.args.questionId).id,
        holder: holder.id,
        amount: log.args.amount,
        timestamp,
        transactionHash: log.transactionHash
      });
      break;
    }
    case "PayoutDistributed": {
      const payout = {
        id: eventKey(log),
        question: getQuestion(store, log.args.questionId).id,
        previousHolder: null,
        treasury: normalizeAddress(log.args.treasury),
        curator: normalizeAddress(log.args.curator),
        holderAmount: log.args.holderAmount,
        treasuryAmount: log.args.treasuryAmount,
        curatorAmount: log.args.curatorAmount,
        timestamp,
        transactionHash: log.transactionHash
      };
      if (normalizeAddress(log.args.previousHolder) !== ZERO_ADDRESS) {
        const holder = getHolder(store, log.args.previousHolder);
        holder.payoutsReceived += log.args.holderAmount;
        payout.previousHolder = holder.id;
      }
      store.payouts.push(payout);
      break;
    }
    default:
      break;
  }
}
