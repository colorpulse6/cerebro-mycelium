#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const assetDir = path.join(rootDir, "assets")
const outputPath = path.join(assetDir, "cerebro-mycelium.gif")
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cerebro-mycelium-gif-"))

const width = 900
const height = 700
const frames = 32
const delay = 7

const clusters = [
  { key: "project", label: "PROJECTS", x: 270, y: 280, color: "#f2c87b", count: 34 },
  { key: "concept", label: "CONCEPTS", x: 525, y: 205, color: "#c8f5d6", count: 58 },
  { key: "source", label: "SOURCES", x: 235, y: 515, color: "#b8d4ff", count: 26 },
  { key: "people", label: "PEOPLE", x: 665, y: 345, color: "#f5b6a5", count: 24 },
  { key: "daily", label: "DAILY", x: 600, y: 540, color: "#fff3bb", count: 48 },
  { key: "index", label: "INDEX", x: 448, y: 398, color: "#d7d1ff", count: 10 },
]

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "")
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  }
}

function rgba(hex, opacity) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${opacity})`
}

function pointOnCubic(p0, p1, p2, p3, t) {
  const mt = 1 - t
  const a = mt * mt * mt
  const b = 3 * mt * mt * t
  const c = 3 * mt * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  }
}

function makeNodes() {
  const nodes = []
  clusters.forEach((cluster, clusterIndex) => {
    const random = rng(1000 + clusterIndex * 97)
    for (let i = 0; i < cluster.count; i += 1) {
      const angle = random() * Math.PI * 2
      const radius = 20 + Math.pow(random(), 0.72) * (cluster.count > 40 ? 115 : 78)
      const oval = 0.62 + random() * 0.4
      const x = cluster.x + Math.cos(angle) * radius
      const y = cluster.y + Math.sin(angle) * radius * oval
      const degree = 1 + Math.floor(random() * (i < 4 ? 9 : 4))
      const recent = random() > 0.76
      nodes.push({
        id: `${cluster.key}-${i}`,
        cluster: cluster.key,
        color: cluster.color,
        x,
        y,
        degree,
        recent,
        phase: random() * Math.PI * 2,
      })
    }
  })
  return nodes
}

function makeEdges(nodes) {
  const byCluster = new Map()
  for (const node of nodes) {
    byCluster.set(node.cluster, [...(byCluster.get(node.cluster) ?? []), node])
  }

  const edges = []
  const random = rng(4242)
  for (const cluster of clusters) {
    const group = byCluster.get(cluster.key) ?? []
    const hubs = group.slice(0, 4)
    for (const node of group.slice(4)) {
      if (random() < 0.68) {
        edges.push({ a: node, b: hubs[Math.floor(random() * hubs.length)], fibres: 1 + Math.floor(random() * 3) })
      }
    }
  }

  const bridgePairs = [
    ["project", "concept"],
    ["project", "index"],
    ["concept", "people"],
    ["concept", "daily"],
    ["source", "index"],
    ["index", "daily"],
    ["people", "daily"],
  ]
  for (const [aKey, bKey] of bridgePairs) {
    const a = byCluster.get(aKey) ?? []
    const b = byCluster.get(bKey) ?? []
    for (let i = 0; i < 11; i += 1) {
      edges.push({
        a: a[Math.floor(random() * Math.min(8, a.length))],
        b: b[Math.floor(random() * Math.min(8, b.length))],
        fibres: 2,
      })
    }
  }
  return edges.filter((edge) => edge.a && edge.b)
}

const nodes = makeNodes()
const edges = makeEdges(nodes)

function curveFor(edge, offset = 0) {
  const midX = (edge.a.x + edge.b.x) / 2
  const midY = (edge.a.y + edge.b.y) / 2
  const dx = edge.b.x - edge.a.x
  const dy = edge.b.y - edge.a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const bend = Math.min(90, len * 0.24) + offset * 10
  const control = {
    x: midX + nx * bend,
    y: midY + ny * bend,
  }
  return {
    p0: { x: edge.a.x, y: edge.a.y },
    p1: { x: (edge.a.x + control.x) / 2, y: (edge.a.y + control.y) / 2 },
    p2: { x: (edge.b.x + control.x) / 2, y: (edge.b.y + control.y) / 2 },
    p3: { x: edge.b.x, y: edge.b.y },
  }
}

function pathFor(curve) {
  return `M ${curve.p0.x.toFixed(1)} ${curve.p0.y.toFixed(1)} C ${curve.p1.x.toFixed(1)} ${curve.p1.y.toFixed(1)}, ${curve.p2.x.toFixed(1)} ${curve.p2.y.toFixed(1)}, ${curve.p3.x.toFixed(1)} ${curve.p3.y.toFixed(1)}`
}

function renderFrame(frame) {
  const t = frame / frames
  const elements = []
  elements.push(`<rect width="${width}" height="${height}" fill="#10110f"/>`)
  elements.push(`<circle cx="450" cy="350" r="420" fill="rgba(221,183,102,0.04)"/>`)
  elements.push(`<circle cx="570" cy="250" r="280" fill="rgba(166,220,190,0.035)"/>`)
  elements.push(`<circle cx="240" cy="510" r="250" fill="rgba(132,159,211,0.03)"/>`)

  for (const cluster of clusters) {
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 + clusters.indexOf(cluster) * 0.7)
    elements.push(`<circle cx="${cluster.x}" cy="${cluster.y}" r="${125 + pulse * 12}" fill="${rgba(cluster.color, 0.055)}"/>`)
  }

  edges.forEach((edge, edgeIndex) => {
    for (let fibre = 0; fibre < edge.fibres; fibre += 1) {
      const offset = (fibre - (edge.fibres - 1) / 2) * 0.85
      const curve = curveFor(edge, offset)
      const color = edge.a.color
      elements.push(`<path d="${pathFor(curve)}" fill="none" stroke="${rgba(color, 0.12)}" stroke-width="${0.8 + fibre * 0.18}" stroke-linecap="round"/>`)
      if (edgeIndex % 4 === 0 && fibre === 0) {
        const travel = (t * 1.35 + (edgeIndex % 19) / 19) % 1
        const spore = pointOnCubic(curve.p0, curve.p1, curve.p2, curve.p3, travel)
        elements.push(`<circle cx="${spore.x.toFixed(1)}" cy="${spore.y.toFixed(1)}" r="2.8" fill="${rgba(color, 0.7)}"/>`)
      }
    }
  })

  nodes.forEach((node, index) => {
    const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 + node.phase)
    const driftX = Math.cos(node.phase + t * Math.PI * 2) * 2.2
    const driftY = Math.sin(node.phase * 0.7 + t * Math.PI * 2) * 1.6
    const x = node.x + driftX
    const y = node.y + driftY
    const r = 1.8 + Math.min(4.2, node.degree * 0.58)
    if (node.recent) {
      elements.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 4 + wave * 11).toFixed(1)}" fill="${rgba(node.color, 0.1 + wave * 0.08)}"/>`)
      elements.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 2.1 + wave * 3).toFixed(1)}" fill="${rgba(node.color, 0.18)}"/>`)
    }
    if (node.degree > 6) {
      elements.push(`<line x1="${(x - r * 3.5).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + r * 3.5).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${rgba(node.color, 0.22)}" stroke-width="0.8"/>`)
      elements.push(`<line x1="${x.toFixed(1)}" y1="${(y - r * 3.5).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(y + r * 3.5).toFixed(1)}" stroke="${rgba(node.color, 0.18)}" stroke-width="0.8"/>`)
    }
    elements.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r + wave * 0.6).toFixed(1)}" fill="${rgba(node.color, node.recent ? 0.94 : 0.72)}"/>`)
    elements.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(1.1, r * 0.42).toFixed(1)}" fill="rgba(255,255,245,0.75)"/>`)
    if (index % 29 === 0) {
      elements.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 7 + wave * 14).toFixed(1)}" fill="none" stroke="${rgba(node.color, 0.18 - wave * 0.08)}" stroke-width="1.2"/>`)
    }
  })

  for (const cluster of clusters) {
    elements.push(`<text x="${cluster.x + 22}" y="${cluster.y - 110}" fill="rgba(240,242,226,0.55)" font-family="JetBrains Mono, Menlo, monospace" font-size="12" font-weight="700" letter-spacing="2">${cluster.label}</text>`)
  }

  elements.push(`<text x="28" y="40" fill="rgba(240,242,226,0.68)" font-family="JetBrains Mono, Menlo, monospace" font-size="14" font-weight="700" letter-spacing="2">CEREBRO MYCELIUM</text>`)
  elements.push(`<text x="28" y="62" fill="rgba(240,242,226,0.32)" font-family="JetBrains Mono, Menlo, monospace" font-size="10" letter-spacing="1.5">VAULT AS LIVING FUNGAL NETWORK</text>`)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${elements.join("")}</svg>`
}

fs.mkdirSync(assetDir, { recursive: true })

try {
  const framePaths = []
  for (let frame = 0; frame < frames; frame += 1) {
    const framePath = path.join(tmpDir, `frame-${String(frame).padStart(3, "0")}.svg`)
    fs.writeFileSync(framePath, renderFrame(frame))
    framePaths.push(framePath)
  }

  const result = spawnSync("magick", [
    "-delay",
    String(delay),
    "-loop",
    "0",
    ...framePaths,
    "-layers",
    "OptimizeTransparency",
    outputPath,
  ], { stdio: "inherit" })

  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  console.log(`Wrote ${outputPath}`)
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
