const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { hashPin } = require("../pin.js");
const {
  DISABLE_DELAY_MS,
  DISABLE_WARNING,
  pendingDisableAtFromNow,
  isDisableDue,
  normalizePendingDisableAt,
  formatDisableCountdown
} = require("../disable-delay.js");

test("hashPin is the SHA-256 hex of the PIN", async () => {
  const pin = "1234";
  const expected = createHash("sha256").update(pin).digest("hex");
  assert.equal(await hashPin(pin), expected);
});

test("a scheduled turn-off is not due until the delay has elapsed", () => {
  const now = 1_700_000_000_000;
  const pendingAt = pendingDisableAtFromNow(now);

  assert.equal(DISABLE_DELAY_MS, 30_000);
  assert.equal(pendingAt, now + DISABLE_DELAY_MS);
  assert.equal(isDisableDue(pendingAt, now), false);
  assert.equal(isDisableDue(pendingAt, pendingAt - 1), false);
  assert.equal(isDisableDue(pendingAt, pendingAt), true);
  assert.equal(isDisableDue(normalizePendingDisableAt(undefined), now), false);
  assert.equal(isDisableDue(normalizePendingDisableAt("nope"), now), false);
  assert.equal(formatDisableCountdown(pendingAt, now), "0:30");
  assert.equal(formatDisableCountdown(pendingAt, pendingAt), "0:00");
  assert.match(DISABLE_WARNING, /30 seconds/);
  assert.match(DISABLE_WARNING, /cancel/i);
});
