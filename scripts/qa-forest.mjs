import { build } from 'esbuild'
import fs from 'node:fs'
import assert from 'node:assert/strict'

fs.mkdirSync('artifacts/world-qa', { recursive: true })
await build({ stdin: { contents: `export * from './src/engine/forestGeometry'; export * from './src/engine/worldAmbient'; export * from './src/engine/guidedWorld'`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: 'artifacts/world-qa/forest.mjs' })
const f = await import('../artifacts/world-qa/forest.mjs')
for (const geometry of [f.forestTrunk(), f.forestBranch(), f.forestCrown(1.5,2.7), f.forestBroadleaf(1.2), f.forestRock(), f.forestLog(), f.forestGrass(), f.forestFern()]) {
  assert.ok([...geometry.attributes.position.array].every(Number.isFinite))
  assert.ok([...geometry.attributes.normal.array].every(Number.isFinite))
  assert.ok(geometry.attributes.position.count < 3200, 'Prop exceeds geometry budget')
  geometry.dispose()
}
assert.deepEqual(f.forestCrown(1.5,2.7).attributes.position.array, f.forestCrown(1.5,2.7).attributes.position.array)
const silhouettes = new Set()
for (let variant=0;variant<4;variant++) {
  const g=f.forestDeadTree(variant)
  assert.ok([...g.attributes.position.array].every(Number.isFinite))
  assert.ok([...g.attributes.normal.array].every(Number.isFinite))
  assert.ok(g.attributes.position.count < 3200)
  g.computeBoundingBox()
  assert.ok(g.boundingBox.min.y >= 0 && g.boundingBox.max.y < 5.2)
  assert.deepEqual(g.attributes.position.array,f.forestDeadTree(variant).attributes.position.array)
  silhouettes.add(JSON.stringify(Array.from(f.forestSpeciesCrown(1.5,2.7,variant,0).attributes.position.array)))
  g.dispose()
}
assert.equal(silhouettes.size,4,'Tree species share identical silhouettes')
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
