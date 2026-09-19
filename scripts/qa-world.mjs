import {build} from 'esbuild'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
fs.mkdirSync('artifacts/world-qa',{recursive:true})
await build({entryPoints:['src/engine/guidedWorld.ts'],bundle:true,platform:'node',format:'esm',outfile:'artifacts/world-qa/current.mjs'})
const {generateGuidedRegion}=await import('../artifacts/world-qa/current.mjs')
const hashes=JSON.parse(fs.readFileSync('scripts/qa-fixtures/classic-world-hashes.json','utf8'))
const preset=JSON.parse(fs.readFileSync('public/projects/skillbound/regions/deadwood.region.json','utf8'))
const results=[]

for(const seed of [8472152,7319,18427,90210,1,42,777,4294967295]){
 const classic=structuredClone(preset);delete classic.worldGen.layout
 assert.equal(createHash('sha256').update(JSON.stringify(generateGuidedRegion(classic,seed,1))).digest('hex'),hashes[seed],'Classic geography changed')
 const region=generateGuidedRegion(preset,seed,1)
 assert.deepEqual(region,generateGuidedRegion(preset,seed,1),'Non-deterministic')
 assert.notEqual(region.seed,generateGuidedRegion(classic,seed,1).seed,'Save namespace collision')
 const loops=region.paths.filter(p=>p.id.startsWith('exploration-'))
 assert.equal(loops.length%2,0,'Incomplete loop')
 const off=structuredClone(preset);off.worldGen.loops=0
 assert.equal(generateGuidedRegion(off,seed,1).paths.filter(p=>p.id.startsWith('exploration-')).length,0)
 assert.ok(region.terrain.heights.every(Number.isFinite))
 assert.ok(region.pois.some(p=>p.label==='The Fallen Sanctuary'))
 results.push({seed,valid:region.validation.valid,issues:region.validation.issues,loops:loops.length/2,objects:region.dressing.length})
}
fs.writeFileSync('artifacts/world-qa/results.json',JSON.stringify(results,null,2))
console.log(JSON.stringify(results,null,2))
assert.ok(results.every(r=>r.valid),'Invalid generated regions')
assert.ok(results.some(r=>r.loops>0),'No safe loops generated')
console.log('WORLD QA PASS: 8 seeds, deterministic layouts, classic parity, isolated saves, valid navigation, loops toggle')
const variations=[]
for (const seed of [7319,18427,90210]) for (const size of ['small','large']) for (const water of [0,.8]) {
 const input=structuredClone(preset);Object.assign(input.worldGen,{size,water,loops:1})
 const r=generateGuidedRegion(input,seed,1)
 variations.push({seed,size,water,valid:r.validation.valid,issues:r.validation.issues,loops:r.paths.filter(p=>p.id.startsWith('exploration-')).length/2})
}
fs.writeFileSync('artifacts/world-qa/variations.json',JSON.stringify(variations,null,2))
console.log(JSON.stringify(variations,null,2))
assert.ok(variations.every(r=>r.valid),'Size/water variation invalid')
