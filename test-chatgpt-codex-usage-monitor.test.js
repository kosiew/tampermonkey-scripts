"use strict";
const assert = require("assert");
const { computeSurplusOrDeficit } = require("./chatgpt-codex-usage-monitor.js");

function approxEqual(actual, expected, tol = 1e-2) {
  return Math.abs(actual - expected) <= tol;
}

// Test 1: example from user (surplus case)
(function testExampleSurplus() {
  const today = new Date(2026, 0, 1); // Jan 1
  const resetDate = new Date(2026, 0, 4); // Jan 4 -> daysRemaining 3
  const remaining = 56;
  const r = computeSurplusOrDeficit(remaining, resetDate, today);
  assert(r && r.ok, "Result should be ok");
  assert.strictEqual(r.usedPercent, 44);
  assert(
    approxEqual(r.averageUsedPerDaySoFar, 11),
    `avgUsed ${r.averageUsedPerDaySoFar}`,
  );
  assert(approxEqual(r.remainingAveragePerDay, 56 / 3));
  assert(approxEqual(r.dailyDiff, 56 / 3 - 11));
  assert(approxEqual(r.equivalentDaysTotal, 56 / 11));
  assert(approxEqual(r.equivalentBufferDays, 56 / 11 - 3));
  // quota-based days: quota ~= 100/7 %/day -> daysFromQuota = remaining / (100/7) = remaining * 7 / 100
  assert(approxEqual(r.quotaPerDay, 100 / 7));
  assert(approxEqual(r.daysFromQuota, (56 * 7) / 100));
  // quota-based buffer = daysFromQuota - daysRemaining (3)
  assert(approxEqual(r.quotaBufferDays, (56 * 7) / 100 - 3));
  console.log("testExampleSurplus passed");
})();

// Test 2: start of week, no usage yet -> equiv null
(function testNoUsageYet() {
  const today = new Date(2026, 0, 1);
  const resetDate = new Date(2026, 0, 8); // daysRemaining 7
  const remaining = 100;
  const r = computeSurplusOrDeficit(remaining, resetDate, today);
  assert(r && r.ok);
  assert.strictEqual(r.usedPercent, 0);
  assert.strictEqual(r.averageUsedPerDaySoFar, 0);
  assert.strictEqual(r.equivalentDaysTotal, null);
  assert.strictEqual(r.equivalentBufferDays, null);
  console.log("testNoUsageYet passed");
})();

// Test 3: deficit case
(function testDeficit() {
  const today = new Date(2026, 0, 1);
  const resetDate = new Date(2026, 0, 4); // 3 days remaining
  const remaining = 10; // 90% used
  const r = computeSurplusOrDeficit(remaining, resetDate, today);
  assert(r && r.ok);
  assert(r.status === "deficit");
  // equivalentDaysTotal = remainingPercent / avgUsedPerDaySoFar (avgUsedPerDaySoFar = 90/4=22.5)
  assert(approxEqual(r.equivalentDaysTotal, 10 / (90 / 4)));
  // Buffer negative
  assert(r.equivalentBufferDays < 0);
  console.log("testDeficit passed");
})();

console.log("All tests passed");
