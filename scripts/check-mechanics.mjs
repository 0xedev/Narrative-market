import assert from "node:assert/strict";

const HOUR = 3600;
const DAY = 86400;
const INITIAL = 4e18;
const TAIL = 0.01e18;

function priceAt(startPrice, floor, elapsed, decay = HOUR) {
  if (elapsed >= decay) return floor;
  return floor + ((startPrice - floor) * (decay - elapsed)) / decay;
}

function rateAt(secondsFromDeployment) {
  const halvings = Math.floor(secondsFromDeployment / (30 * DAY));
  return Math.max(INITIAL / 2 ** halvings, TAIL);
}

function rewardsBetween(from, to) {
  let total = 0;
  let cursor = from;
  while (cursor < to) {
    const period = 30 * DAY;
    const nextBoundary = (Math.floor(cursor / period) + 1) * period;
    const segmentEnd = Math.min(nextBoundary, to);
    total += (segmentEnd - cursor) * rateAt(cursor);
    cursor = segmentEnd;
  }
  return total;
}

assert.equal(priceAt(0.002, 0.001, 0), 0.002);
assert.equal(priceAt(0.002, 0.001, HOUR), 0.001);
assert.equal(priceAt(0.002, 0.001, HOUR * 2), 0.001);
assert.equal(rateAt(0), INITIAL);
assert.equal(rateAt(30 * DAY), INITIAL / 2);
assert.equal(rewardsBetween(0, 30 * DAY), INITIAL * 30 * DAY);
assert.equal(rewardsBetween(30 * DAY, 60 * DAY), (INITIAL / 2) * 30 * DAY);
assert.equal(rewardsBetween(30 * DAY - 10, 30 * DAY + 10), (10 * INITIAL) + (10 * INITIAL / 2));

console.log("Narrative Markets mechanics checks passed.");
