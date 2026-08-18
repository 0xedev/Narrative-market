import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  CarryoverAnswerSubmitted,
  PayoutDistributed,
  QuestionProposed,
  QuestionQueued,
  QuestionResolved,
  QuestionRotated,
  QuestionStarted,
  RewardsMinted,
  Takeover
} from "../generated/NarrativeThrone/NarrativeThrone";
import { Answer, Holder, Payout, Proposal, Question, Reward, Takeover as TakeoverEntity } from "../generated/schema";

const ZERO = BigInt.fromI32(0);
const ZERO_ADDRESS = Address.zero();

function holderId(address: Address): string {
  return address.toHexString();
}

function questionId(id: Bytes): string {
  return id.toHexString();
}

function getHolder(address: Address): Holder {
  const id = holderId(address);
  let holder = Holder.load(id);
  if (holder == null) {
    holder = new Holder(id);
    holder.address = address;
    holder.totalHeldSeconds = ZERO;
    holder.takeovers = ZERO;
    holder.wins = ZERO;
    holder.rewardsMinted = ZERO;
    holder.payoutsReceived = ZERO;
    holder.save();
  }
  return holder as Holder;
}

function getQuestion(id: Bytes): Question {
  const key = questionId(id);
  let question = Question.load(key);
  if (question == null) {
    question = new Question(key);
    question.uri = "";
    question.proposer = ZERO_ADDRESS;
    question.curator = ZERO_ADDRESS;
    question.status = "UNKNOWN";
    question.startsAt = ZERO;
    question.endsAt = ZERO;
    question.active = false;
    question.lastTakeoverAt = ZERO;
    question.save();
  }
  return question as Question;
}

function answerId(question: Question, hash: Bytes, holder: Address): string {
  return question.id + "-" + hash.toHexString() + "-" + holder.toHexString();
}

function getAnswer(question: Question, hash: Bytes, uri: string, holderAddress: Address, timestamp: BigInt): Answer {
  const id = answerId(question, hash, holderAddress);
  let answer = Answer.load(id);
  if (answer == null) {
    answer = new Answer(id);
    answer.hash = hash;
    answer.question = question.id;
    answer.holdSeconds = ZERO;
    answer.firstSeenAt = timestamp;
  }
  answer.uri = uri;
  answer.holder = getHolder(holderAddress).id;
  answer.lastSeenAt = timestamp;
  answer.save();
  return answer as Answer;
}

function settleCurrentAnswer(question: Question, timestamp: BigInt): void {
  const currentAnswerId = question.currentAnswer;
  if (currentAnswerId != null) {
    const answer = Answer.load(currentAnswerId as string);
    if (answer != null) {
      const elapsed = timestamp.minus(question.lastTakeoverAt);
      if (elapsed.gt(ZERO)) {
        answer.holdSeconds = answer.holdSeconds.plus(elapsed);
        answer.lastSeenAt = timestamp;
        answer.save();

        const holder = Holder.load(answer.holder);
        if (holder != null) {
          holder.totalHeldSeconds = holder.totalHeldSeconds.plus(elapsed);
          holder.save();
        }
      }
    }
  }
  question.lastTakeoverAt = timestamp;
}

export function handleQuestionProposed(event: QuestionProposed): void {
  const question = getQuestion(event.params.questionId);
  question.uri = event.params.questionUri;
  question.proposer = event.params.proposer;
  question.status = "PROPOSED";
  question.save();

  const id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const proposal = new Proposal(id);
  proposal.questionId = event.params.questionId;
  proposal.proposer = event.params.proposer;
  proposal.uri = event.params.questionUri;
  proposal.timestamp = event.params.timestamp;
  proposal.save();
}

export function handleQuestionQueued(event: QuestionQueued): void {
  const question = getQuestion(event.params.questionId);
  question.uri = event.params.questionUri;
  question.curator = event.params.curator;
  question.status = "QUEUED";
  question.save();
}

export function handleQuestionStarted(event: QuestionStarted): void {
  const question = getQuestion(event.params.questionId);
  question.uri = event.params.questionUri;
  question.curator = event.params.curator;
  question.status = "ACTIVE";
  question.active = true;
  question.startsAt = event.params.startsAt;
  question.endsAt = event.params.endsAt;
  question.lastTakeoverAt = event.params.startsAt;
  question.currentHolder = null;
  question.currentAnswer = null;
  question.save();
}

export function handleQuestionRotated(event: QuestionRotated): void {
  const question = getQuestion(event.params.newQuestionId);
  question.uri = event.params.questionUri;
  question.status = "ACTIVE";
  question.active = true;
  question.currentAnswer = null;
  if (event.params.carriedHolder != ZERO_ADDRESS) {
    question.currentHolder = getHolder(event.params.carriedHolder).id;
  }
  question.save();
}

export function handleQuestionResolved(event: QuestionResolved): void {
  const question = getQuestion(event.params.questionId);
  settleCurrentAnswer(question, event.block.timestamp);
  question.status = "RESOLVED";
  question.active = false;
  question.winningHolder = event.params.winningHolder;
  question.winningHoldSeconds = event.params.cumulativeHoldSeconds;
  if (event.params.winningHolder != ZERO_ADDRESS) {
    const winner = getHolder(event.params.winningHolder);
    winner.wins = winner.wins.plus(BigInt.fromI32(1));
    winner.save();
  }
  if (event.params.winningHolder != ZERO_ADDRESS) {
    const answer = Answer.load(answerId(question, event.params.winningAnswerHash, event.params.winningHolder));
    if (answer != null) {
      answer.holdSeconds = event.params.cumulativeHoldSeconds;
      answer.save();
      question.winningAnswer = answer.id;
    }
  }
  question.save();
}

export function handleCarryoverAnswerSubmitted(event: CarryoverAnswerSubmitted): void {
  const question = getQuestion(event.params.questionId);
  const answer = getAnswer(question, event.params.answerHash, event.params.answerUri, event.params.holder, event.params.timestamp);
  question.currentHolder = getHolder(event.params.holder).id;
  question.currentAnswer = answer.id;
  question.lastTakeoverAt = event.params.timestamp;
  question.save();
}

export function handleTakeover(event: Takeover): void {
  const question = getQuestion(event.params.questionId);
  settleCurrentAnswer(question, event.params.timestamp);
  const newHolder = getHolder(event.params.newHolder);
  newHolder.takeovers = newHolder.takeovers.plus(BigInt.fromI32(1));
  newHolder.save();

  const answer = getAnswer(question, event.params.answerHash, event.params.answerUri, event.params.newHolder, event.params.timestamp);
  const takeover = new TakeoverEntity(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  takeover.question = question.id;
  takeover.newHolder = newHolder.id;
  takeover.answer = answer.id;
  takeover.price = event.params.price;
  takeover.timestamp = event.params.timestamp;
  takeover.transactionHash = event.transaction.hash;
  if (event.params.previousHolder != ZERO_ADDRESS) {
    takeover.previousHolder = getHolder(event.params.previousHolder).id;
  }
  takeover.save();

  question.currentHolder = newHolder.id;
  question.currentAnswer = answer.id;
  question.lastTakeoverAt = event.params.timestamp;
  question.save();
}

export function handleRewardsMinted(event: RewardsMinted): void {
  const holder = getHolder(event.params.holder);
  holder.rewardsMinted = holder.rewardsMinted.plus(event.params.amount);
  holder.save();

  const reward = new Reward(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  reward.question = getQuestion(event.params.questionId).id;
  reward.holder = holder.id;
  reward.amount = event.params.amount;
  reward.timestamp = event.block.timestamp;
  reward.transactionHash = event.transaction.hash;
  reward.save();
}

export function handlePayoutDistributed(event: PayoutDistributed): void {
  const payout = new Payout(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  payout.question = getQuestion(event.params.questionId).id;
  payout.treasury = event.params.treasury;
  payout.curator = event.params.curator;
  payout.holderAmount = event.params.holderAmount;
  payout.treasuryAmount = event.params.treasuryAmount;
  payout.curatorAmount = event.params.curatorAmount;
  payout.timestamp = event.block.timestamp;
  payout.transactionHash = event.transaction.hash;
  if (event.params.previousHolder != ZERO_ADDRESS) {
    const holder = getHolder(event.params.previousHolder);
    holder.payoutsReceived = holder.payoutsReceived.plus(event.params.holderAmount);
    holder.save();
    payout.previousHolder = holder.id;
  }
  payout.save();
}
