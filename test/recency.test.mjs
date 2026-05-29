import assert from "node:assert/strict";
import test from "node:test";

import { formatRecency, freshnessFromMtime, recencyHoursFromMtime } from "../src/recency.ts";

test("freshnessFromMtime decays linearly across the configured window", () => {
  const now = Date.UTC(2026, 4, 29, 12);

  assert.equal(freshnessFromMtime(now, 24, now), 1);
  assert.equal(freshnessFromMtime(now - 12 * 60 * 60 * 1000, 24, now), 0.5);
  assert.equal(freshnessFromMtime(now - 36 * 60 * 60 * 1000, 24, now), 0);
});

test("recency format keeps focus card copy compact", () => {
  assert.equal(formatRecency(0.3), "18m ago");
  assert.equal(formatRecency(4), "4h ago");
  assert.equal(formatRecency(49), "2d ago");
  assert.equal(formatRecency(null), "mtime unknown");
});

test("recencyHoursFromMtime returns null for missing mtimes", () => {
  assert.equal(recencyHoursFromMtime(undefined, Date.UTC(2026, 4, 29, 12)), null);
});
