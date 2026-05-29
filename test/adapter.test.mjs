import assert from "node:assert/strict";
import test from "node:test";

import { buildGraphFromFiles } from "../src/adapter.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";

function note(path, cache = {}, mtime = Date.UTC(2026, 4, 28, 12)) {
  return {
    file: { path, basename: path.split("/").pop().replace(/\.md$/i, ""), stat: { mtime } },
    cache
  };
}

test("buildGraphFromFiles resolves wikilinks into deduped undirected edges", () => {
  const graph = buildGraphFromFiles(
    [
      note("Projects/Cerebro Mycelium.md", { links: [{ link: "Ada" }, { link: "Ada" }] }),
      note("People/Ada.md", {})
    ],
    DEFAULT_SETTINGS
  );

  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.edges, [{ a: "People/Ada.md", b: "Projects/Cerebro Mycelium.md" }]);
  assert.equal(graph.idx["Projects/Cerebro Mycelium.md"].degree, 1);
});

test("buildGraphFromFiles attaches recency freshness from file mtime", () => {
  const now = Date.UTC(2026, 4, 29, 12);
  const graph = buildGraphFromFiles(
    [
      note("Daily/Today.md", {}, Date.UTC(2026, 4, 29, 0)),
      note("Sources/Old.md", {}, Date.UTC(2026, 4, 27, 0))
    ],
    { ...DEFAULT_SETTINGS, recencyWindowHours: 24 },
    now
  );

  assert.equal(graph.idx["Daily/Today.md"].recencyHours, 12);
  assert.equal(graph.idx["Daily/Today.md"].freshness, 0.5);
  assert.equal(graph.idx["Sources/Old.md"].freshness, 0);
});

test("buildGraphFromFiles caps nodes by keeping highest-degree notes", () => {
  const graph = buildGraphFromFiles(
    [
      note("Projects/Hub.md", { links: [{ link: "A" }, { link: "B" }, { link: "C" }] }),
      note("Concepts/A.md", {}),
      note("Concepts/B.md", {}),
      note("Concepts/C.md", {})
    ],
    { ...DEFAULT_SETTINGS, nodeCap: 2, edgeCap: 10 }
  );

  assert.deepEqual(
    graph.nodes.map((node) => node.id).sort(),
    ["Concepts/A.md", "Projects/Hub.md"]
  );
  assert.equal(graph.edges.length, 1);
});
