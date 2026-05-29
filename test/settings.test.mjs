import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings.ts";

test("normalizeSettings preserves valid pinned positions and drops invalid ones", () => {
  const settings = normalizeSettings({
    ...DEFAULT_SETTINGS,
    pinnedNodePositions: {
      "Projects/A.md": { x: 0.25, y: 0.75 },
      "Concepts/Clamp.md": { x: -2, y: 4 },
      "Bad/Number.md": { x: Number.NaN, y: 0.4 },
      "Bad/Shape.md": "nope"
    }
  });

  assert.deepEqual(settings.pinnedNodePositions, {
    "Projects/A.md": { x: 0.25, y: 0.75 },
    "Concepts/Clamp.md": { x: 0.04, y: 0.94 }
  });
});
