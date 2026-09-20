import { build } from 'esbuild'
import fs from 'node:fs'
import assert from 'node:assert/strict'

fs.mkdirSync('artifacts/world-qa', { recursive: true })
await build({ stdin: { contents: `export * from './src/engine/forestGeometry'; export * from './src/engine/worldAmbient'; export * from './src/engine/guidedWorld'`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: 'artifacts/world-qa/forest.mjs' })
const f = await import('../artifacts/world-qa/forest.mjs')
for (const geometry of [f.forestBranch(), f.forestCrown(1.5,2.7), f.forestBroadleaf(1.2), f.forestRock(), f.forestLog(), f.forestGrass(), f.forestFern()]) {
  assert.ok([...geometry.attributes.position.array].every(Number.isFinite))
  assert.ok([...geometry.attributes.normal.array].every(Number.isFinite))
  assert.ok(geometry.attributes.position.count < 2000, 'Prop exceeds geometry budget')
  geometry.dispose()
}
assert.deepEqual(f.forestCrown(1.5,2.7).attributes.position.array, f.forestCrown(1.5,2.7).attributes.position.array)
const preset = JSON.parse(fs.readFileSync('public/projects/skillbound/regions/deadwood.region.json','utf8'))
for (const seed of [8472152,7319]) {
  const region = f.generateGuidedRegion(preset,seed,1)
  const before = JSON.stringify(region)
  const start = performance.now()
  const visuals = f.buildWorldAmbientVisuals(region)
  const grass = visuals.group.children.find(c => c.name === 'Forest grass ground cover')
  assert.ok(grass && grass.count > 1500 && grass.count <= 6500, 'Missing grass or exceeded instance budget')
  assert.ok(grass.count * grass.geometry.attributes.position.count / 3 < 180000, 'Grass exceeds triangle budget')
  assert.equal(JSON.stringify(region), before, 'Visual pass changed world data')
  console.log(JSON.stringify({seed, grassTufts:grass.count, grassTriangles:grass.count*27, ambientBuildMs:Math.round(performance.now()-start)}))
  const geometries = new Set(), materials = new Set()
  visuals.group.traverse(o => { if(o.geometry) geometries.add(o.geometry); if(o.material) for(const m of [o.material].flat()) materials.add(m) })
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose())
}
console.log('FOREST QA PASS: finite geometry, deterministic crowns, bounded grass, unchanged world data')
