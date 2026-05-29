import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("README includes the generated animated demo asset", () => {
  const readme = fs.readFileSync(path.join(rootDir, "README.md"), "utf8")
  const assetPath = path.join(rootDir, "assets", "cerebro-mycelium.gif")

  assert.match(readme, /assets\/cerebro-mycelium\.gif/)
  assert.equal(fs.existsSync(assetPath), true)
})
