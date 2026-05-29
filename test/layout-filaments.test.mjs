import assert from "node:assert/strict";
import test from "node:test";

import { makeFilaments, radiusFor } from "../src/filaments.ts";
import { assignPositions } from "../src/layout.ts";
import { PALETTES } from "../src/palette.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";

function graph() {
  const nodes = [
    node("Projects/A.md", "project", 3),
    node("People/B.md", "person", 2),
    node("Concepts/C.md", "concept", 1),
    node("Sources/D.md", "source", 0)
  ];
  const edges = [
    { a: "Projects/A.md", b: "People/B.md" },
    { a: "Projects/A.md", b: "Concepts/C.md" },
    { a: "People/B.md", b: "Concepts/C.md" }
  ];
  return {
    nodes,
    edges,
    idx: Object.fromEntries(nodes.map((item) => [item.id, item])),
    adj: {
      "Projects/A.md": ["People/B.md", "Concepts/C.md"],
      "People/B.md": ["Projects/A.md", "Concepts/C.md"],
      "Concepts/C.md": ["Projects/A.md", "People/B.md"],
      "Sources/D.md": []
    },
    KIND_LABEL: {},
    activePalette: PALETTES.wood,
    activePaletteName: "wood",
    CHAOS: { wobbleAmp: 0.018, wobbleSpeed: 0.6, halo: 0.6, bloom: 0.5, blob: 0, jitter: 1 }
  };
}

function node(path, kind, degree) {
  return {
    id: path,
    path,
    name: path.split("/").pop().replace(/\.md$/i, ""),
    title: path.split("/").pop().replace(/\.md$/i, ""),
    kind,
    kindLabel: kind.toUpperCase(),
    status: "active",
    hub: degree >= 3,
    degree,
    color: PALETTES.wood.kinds[kind],
    freshness: 0,
    recencyHours: null
  };
}

test("assignPositions gives every node deterministic normalized coordinates", () => {
  const first = graph();
  const second = graph();

  assignPositions(first, DEFAULT_SETTINGS);
  assignPositions(second, DEFAULT_SETTINGS);

  for (const item of first.nodes) {
    assert.ok(item._baseX >= 0.04 && item._baseX <= 0.96);
    assert.ok(item._baseY >= 0.06 && item._baseY <= 0.94);
    assert.equal(item._baseX, second.idx[item.id]._baseX);
    assert.equal(item._baseY, second.idx[item.id]._baseY);
  }
});

test("assignPositions honors user-pinned node coordinates", () => {
  const sample = graph();
  const settings = {
    ...DEFAULT_SETTINGS,
    pinnedNodePositions: {
      "Projects/A.md": { x: 0.82, y: 0.18 }
    }
  };

  assignPositions(sample, settings);

  assert.equal(sample.idx["Projects/A.md"]._baseX, 0.82);
  assert.equal(sample.idx["Projects/A.md"]._baseY, 0.18);
  assert.notEqual(sample.idx["People/B.md"]._baseX, undefined);
});

test("makeFilaments creates stable 1-3 fibre bezier strands per edge", () => {
  const sample = graph();
  assignPositions(sample, DEFAULT_SETTINGS);

  const filaments = makeFilaments(sample, 900, 600);
  const counts = new Map();
  for (const filament of filaments) {
    counts.set(filament.edgeIdx, (counts.get(filament.edgeIdx) ?? 0) + 1);
    assert.equal(filament.p0.length, 2);
    assert.equal(filament.p3.length, 2);
  }

  assert.equal(counts.size, sample.edges.length);
  for (const count of counts.values()) {
    assert.ok(count >= 1 && count <= 3);
  }
  assert.deepEqual(filaments, makeFilaments(sample, 900, 600));
});

test("radiusFor is deterministic for real and decorative micro nodes", () => {
  const hub = node("Projects/A.md", "project", 7);
  hub.hub = true;
  const micro = { ...hub, id: "Projects/A.md.m0", _micro: true };

  assert.ok(radiusFor(hub) > radiusFor(micro));
  assert.equal(radiusFor(micro), radiusFor(micro));
});
