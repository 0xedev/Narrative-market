// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {NarrativeToken} from "./NarrativeToken.sol";

contract NarrativeThrone is Ownable, Pausable, ReentrancyGuard {
    uint256 public constant BPS = 10_000;
    uint256 public constant KING_BPS = 8_000;
    uint256 public constant TREASURY_BPS = 1_500;
    uint256 public constant CURATOR_BPS = 500;
    uint256 public constant DECAY_PERIOD = 1 hours;
    uint256 public constant HALVING_PERIOD = 30 days;
    uint256 public constant INITIAL_EMISSION = 4 ether;
    uint256 public constant TAIL_EMISSION = 0.01 ether;

    NarrativeToken public immutable narr;
    uint256 public immutable emissionStart;

    address public treasury;
    bytes32 public activeQuestionId;
    bytes32 public queuedQuestionId;
    address public queuedCurator;
    uint64 public questionStart;
    uint64 public questionEnd;
    uint64 public lastTakeoverAt;
    uint64 public lastRewardAccrualAt;
    uint64 public currentEpoch;

    address public currentHolder;
    bytes32 public currentAnswerHash;
    uint256 public currentPrice;
    uint256 public floorPrice;
    uint256 public maxPrice;
    address public currentCurator;
    bool public carryoverAnswerRequired;

    mapping(address => uint256) public pendingRewards;
    mapping(address => uint256) public ethCredits;
    mapping(bytes32 => mapping(bytes32 => uint256)) public answerHoldSeconds;
    mapping(bytes32 => bytes32) public leadingAnswer;
    mapping(bytes32 => uint256) public leadingHoldSeconds;
    mapping(bytes32 => bool) public questionResolved;

    error InvalidAddress();
    error InvalidQuestion();
    error InvalidAnswer();
    error QuestionNotActive();
    error QuestionStillActive();
    error DeadlineExpired();
    error PriceTooHigh();
    error IncorrectPayment();
    error NotCurrentHolder();
    error NoRewards();
    error NoQueuedQuestion();
    error InvalidPriceBounds();

    event Takeover(
        bytes32 indexed questionId,
        address indexed newHolder,
        address indexed previousHolder,
        uint256 price,
        bytes32 answerHash,
        uint256 timestamp
    );
    event RewardsAccrued(bytes32 indexed questionId, address indexed holder, uint256 amount);
    event Claimed(address indexed holder, uint256 amount);
    event QuestionQueued(bytes32 indexed questionId, address indexed curator);
    event QuestionRotated(bytes32 indexed previousQuestionId, bytes32 indexed newQuestionId, address indexed carriedHolder);
    event QuestionResolved(bytes32 indexed questionId, bytes32 indexed winningAnswerHash, address winningHolder, uint256 cumulativeHoldSeconds);
    event EthCredited(address indexed account, uint256 amount);
    event TreasuryUpdated(address indexed treasury);

    constructor(address token, address treasury_) Ownable(msg.sender) {
        if (token == address(0) || treasury_ == address(0)) revert InvalidAddress();
        narr = NarrativeToken(token);
        treasury = treasury_;
        emissionStart = block.timestamp;
    }

    function startFirstQuestion(bytes32 questionId, address curator_, uint256 duration, uint256 floor, uint256 maximum)
        external
        onlyOwner
    {
        if (activeQuestionId != bytes32(0) || questionId == bytes32(0) || curator_ == address(0)) revert InvalidQuestion();
        _validatePrices(floor, maximum);
        _startQuestion(questionId, curator_, duration, floor, maximum, bytes32(0));
    }

    function queueQuestion(bytes32 questionId, address curator_) external onlyOwner {
        if (questionId == bytes32(0) || curator_ == address(0)) revert InvalidQuestion();
        queuedQuestionId = questionId;
        queuedCurator = curator_;
        emit QuestionQueued(questionId, curator_);
    }

    function rotateIfDue(uint256 duration, uint256 floor, uint256 maximum) external whenNotPaused {
        if (activeQuestionId == bytes32(0) || block.timestamp < questionEnd) revert QuestionStillActive();
        if (queuedQuestionId == bytes32(0)) revert NoQueuedQuestion();
        _validatePrices(floor, maximum);

        bytes32 previousQuestion = activeQuestionId;
        _settleHolder();
        bytes32 winner = leadingAnswer[previousQuestion];
        address winnerHolder = currentHolder;
        questionResolved[previousQuestion] = true;
        emit QuestionResolved(previousQuestion, winner, winnerHolder, leadingHoldSeconds[previousQuestion]);

        address carried = currentHolder;
        bytes32 next = queuedQuestionId;
        address curator_ = queuedCurator;
        queuedQuestionId = bytes32(0);
        queuedCurator = address(0);
        _startQuestion(next, curator_, duration, floor, maximum, carried);
        emit QuestionRotated(previousQuestion, next, carried);
    }

    function submitCarryoverAnswer(bytes32 answerHash) external whenNotPaused {
        if (!carryoverAnswerRequired || msg.sender != currentHolder) revert NotCurrentHolder();
        if (answerHash == bytes32(0)) revert InvalidAnswer();
        currentAnswerHash = answerHash;
        carryoverAnswerRequired = false;
        lastTakeoverAt = uint64(block.timestamp);
    }

    function takeThrone(bytes32 questionId, bytes32 answerHash, uint256 maxAcceptedPrice, uint256 deadline)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 price)
    {
        if (questionId != activeQuestionId || block.timestamp >= questionEnd) revert QuestionNotActive();
        if (answerHash == bytes32(0)) revert InvalidAnswer();
        if (block.timestamp > deadline) revert DeadlineExpired();

        price = getCurrentPrice();
        if (price > maxAcceptedPrice) revert PriceTooHigh();
        if (msg.value != price) revert IncorrectPayment();

        _settleHolder();
        address previousHolder = currentHolder;
        uint256 kingPayment = price * KING_BPS / BPS;
        uint256 treasuryPayment = price * TREASURY_BPS / BPS;
        uint256 curatorPayment = price - kingPayment - treasuryPayment;

        if (previousHolder == address(0)) {
            treasuryPayment += kingPayment;
            kingPayment = 0;
        } else {
            ethCredits[previousHolder] += kingPayment;
            emit EthCredited(previousHolder, kingPayment);
        }
        ethCredits[treasury] += treasuryPayment;
        ethCredits[currentCurator] += curatorPayment;
        emit EthCredited(treasury, treasuryPayment);
        emit EthCredited(currentCurator, curatorPayment);

        uint256 nextPrice = price * 2;
        if (nextPrice < floorPrice) nextPrice = floorPrice;
        if (nextPrice > maxPrice) nextPrice = maxPrice;

        currentHolder = msg.sender;
        currentAnswerHash = answerHash;
        currentPrice = nextPrice;
        lastTakeoverAt = uint64(block.timestamp);
        lastRewardAccrualAt = uint64(block.timestamp);
        currentEpoch++;
        carryoverAnswerRequired = false;

        emit Takeover(activeQuestionId, msg.sender, previousHolder, price, answerHash, block.timestamp);
    }

    function claimRewards() external nonReentrant returns (uint256 amount) {
        if (msg.sender == currentHolder) _accrueRewards();
        amount = pendingRewards[msg.sender];
        if (amount == 0) revert NoRewards();
        pendingRewards[msg.sender] = 0;
        narr.mint(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function withdrawEth() external nonReentrant {
        uint256 amount = ethCredits[msg.sender];
        if (amount == 0) revert NoRewards();
        ethCredits[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "ETH_TRANSFER_FAILED");
    }

    function getCurrentPrice() public view returns (uint256) {
        if (activeQuestionId == bytes32(0)) return 0;
        uint256 elapsed = block.timestamp - lastTakeoverAt;
        if (elapsed >= DECAY_PERIOD) return floorPrice;
        if (currentPrice <= floorPrice) return floorPrice;
        return floorPrice + ((currentPrice - floorPrice) * (DECAY_PERIOD - elapsed) / DECAY_PERIOD);
    }

    function getEmissionRate() public view returns (uint256) {
        return _rateAt(block.timestamp);
    }

    function pendingReward(address holder) external view returns (uint256) {
        uint256 amount = pendingRewards[holder];
        if (holder == currentHolder && activeQuestionId != bytes32(0)) {
            amount += _rewardsBetween(lastRewardAccrualAt, block.timestamp);
        }
        return amount;
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert InvalidAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function _startQuestion(bytes32 questionId, address curator_, uint256 duration, uint256 floor, uint256 maximum, address carriedHolder) internal {
        if (duration == 0 || questionId == bytes32(0) || curator_ == address(0)) revert InvalidQuestion();
        activeQuestionId = questionId;
        currentCurator = curator_;
        questionStart = uint64(block.timestamp);
        questionEnd = uint64(block.timestamp + duration);
        floorPrice = floor;
        maxPrice = maximum;
        currentPrice = floor;
        currentHolder = carriedHolder;
        currentAnswerHash = bytes32(0);
        lastTakeoverAt = uint64(block.timestamp);
        lastRewardAccrualAt = uint64(block.timestamp);
        carryoverAnswerRequired = carriedHolder != address(0);
    }

    function _settleHolder() internal {
        if (currentHolder == address(0)) {
            lastRewardAccrualAt = uint64(block.timestamp);
            return;
        }
        _accrueRewards();
        if (currentAnswerHash != bytes32(0)) {
            uint256 interval = block.timestamp - lastTakeoverAt;
            uint256 total = answerHoldSeconds[activeQuestionId][currentAnswerHash] + interval;
            answerHoldSeconds[activeQuestionId][currentAnswerHash] = total;
            if (total > leadingHoldSeconds[activeQuestionId]) {
                leadingHoldSeconds[activeQuestionId] = total;
                leadingAnswer[activeQuestionId] = currentAnswerHash;
            }
        }
    }

    function _accrueRewards() internal {
        uint256 amount = _rewardsBetween(lastRewardAccrualAt, block.timestamp);
        if (amount > 0) {
            pendingRewards[currentHolder] += amount;
            emit RewardsAccrued(activeQuestionId, currentHolder, amount);
        }
        lastRewardAccrualAt = uint64(block.timestamp);
    }

    function _rewardsBetween(uint256 from, uint256 to) internal view returns (uint256 total) {
        if (to <= from) return 0;
        uint256 cursor = from;
        while (cursor < to) {
            uint256 halvings = cursor <= emissionStart ? 0 : (cursor - emissionStart) / HALVING_PERIOD;
            uint256 nextBoundary = emissionStart + ((halvings + 1) * HALVING_PERIOD);
            uint256 segmentEnd = nextBoundary < to ? nextBoundary : to;
            total += (segmentEnd - cursor) * _rateAt(cursor);
            cursor = segmentEnd;
        }
    }

    function _rateAt(uint256 timestamp) internal view returns (uint256 rate) {
        uint256 halvings = timestamp <= emissionStart ? 0 : (timestamp - emissionStart) / HALVING_PERIOD;
        rate = INITIAL_EMISSION >> halvings;
        if (rate < TAIL_EMISSION) rate = TAIL_EMISSION;
    }

    function _validatePrices(uint256 floor, uint256 maximum) internal pure {
        if (floor == 0 || maximum < floor) revert InvalidPriceBounds();
    }

    receive() external payable {}
}
