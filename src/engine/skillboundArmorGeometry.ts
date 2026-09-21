import * as THREE from 'three'
import { equipmentMaterials } from './skillboundItemGeometry'
import type { SkillboundItemRecipe } from './skillboundItems'
import { buildConformedTunic } from './equipmentForgeV3/conform'
import { createEquipmentForgeV3Recipe } from './equipmentForgeV3/types'

export function findEquipmentBody(root: THREE.Object3D) {
  let body: THREE.SkinnedMesh | undefined; let score = -1
  root.traverse(o => {
    if (!(o instanceof THREE.SkinnedMesh) || o.userData.skillboundEquipment || /eye|hair|teeth|optional|equipment/i.test(o.name)) return
    const count = o.geometry.getAttribute('position')?.count ?? 0
    if (!o.geometry.getAttribute('skinWeight') || !o.geometry.getAttribute('skinIndex')) return
    const rank = count + (/body/i.test(o.name) ? 1_000_000 : 0)
    if (rank > score) { body = o; score = rank }
  })
  return body
}

/** Generates independent closed garment shells in the source body's bind space.
 * Skin indices, including optional breast bones, are transferred without renaming the rig.
 * No source geometry, skeleton, materials or visibility are modified.
 */
export function buildSkillboundArmor(source: THREE.SkinnedMesh, recipe: SkillboundItemRecipe) {
  if (recipe.family === 'chest') return buildTailoredChest(source, recipe)
  const root = new THREE.Group(); root.name = `EQ_${recipe.family}_${recipe.seed}`; root.userData.skillboundEquipment = true
  root.position.copy(source.position); root.quaternion.copy(source.quaternion); root.scale.copy(source.scale)
  const geometry = source.geometry; const p = geometry.getAttribute('position'); const n = geometry.getAttribute('normal')
  const si = geometry.getAttribute('skinIndex'); const sw = geometry.getAttribute('skinWeight')
  if (!p || !n || !si || !sw) throw new Error('Equipment fitting requires a skinned body with normals.')
  geometry.computeBoundingBox(); const box = geometry.boundingBox!; const height = box.max.y - box.min.y
  const cy = (y: number) => (y - box.min.y) / height
  const centerX = (box.min.x + box.max.x) / 2
  const m = equipmentMaterials(recipe)
  const mats = [m.cloth, m.leather, m.metal, m.edge]
  const names = source.skeleton.bones.map(b => b.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
  const component = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, c: number) => c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : c === 2 ? a.getZ(i) : a.getW(i)
  const boneName = (i: number) => { let best = 0; for (let j = 1; j < 4; j++) if (component(sw,i,j) > component(sw,i,best)) best = j; return names[component(si,i,best)] ?? '' }
  const included = (i: number) => {
    const y = cy(p.getY(i)); const name = boneName(i)
    const arm = /arm|hand|finger|thumb/.test(name)
    switch (recipe.family) {
      case 'gloves': return /hand|lowerarm|forearm/.test(name) && !/finger|thumb/.test(name)
      case 'legs': return y > .16 && y < .535 && !arm
      case 'boots': return y < .255 && !arm
      case 'helmet': return y > .925 && /head/.test(name)
      case 'waist': return y > .49 && y < .55 && !arm
      default: return false
    }
  }
  const bind = (g: THREE.BufferGeometry, name: string) => {
    const mesh = new THREE.SkinnedMesh(g, mats); mesh.name = name; mesh.userData.skillboundEquipment = true
    mesh.bindMode = source.bindMode; mesh.bind(source.skeleton, source.bindMatrix.clone()); mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true
    root.add(mesh); return mesh
  }
  if (recipe.family === 'cloak') {
    const positions: number[] = []; const indices: number[] = []; const uvs: number[] = []; const skinIndices: number[] = []; const weights: number[] = []
    const top = box.min.y + height * .82; const bottom = box.min.y + height * (.20 + recipe.variant * .022)
    const torso = Array.from({ length: p.count }, (_, i) => i).filter(i => cy(p.getY(i)) > .58 && cy(p.getY(i)) < .84 && !/arm|hand|finger/.test(boneName(i)))
    const back = torso.length ? Math.min(...torso.map(i => p.getZ(i))) - height * .025 : box.min.z
    const spine = Math.max(0, names.findIndex(name => /spine03|upperchest|chest|spine2/.test(name)))
    const columns = 20; const rows = 18
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
      const u = col / columns; const t = row / rows; const x = (u - .5) * height * (.29 + t * .14) * recipe.width
      const notch = row === rows ? (col % 4 === 0 ? .019 : col % 3 === 0 ? -.009 : 0) * height : 0
      positions.push(centerX + x, top + (bottom - top) * t + notch, back - Math.sin(t * Math.PI / 2) * height * .065 + Math.cos(u * Math.PI * 10) * height * (.006 + t * .01))
      uvs.push(u,t); skinIndices.push(spine,0,0,0); weights.push(1,0,0,0)
      if (row < rows && col < columns) { const a = row * (columns + 1) + col; indices.push(a,a+columns+1,a+1,a+1,a+columns+1,a+columns+2) }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4)); g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4)); g.setIndex(indices); g.computeVertexNormals()
    closeShell(g,height*.003); g.clearGroups(); g.addGroup(0,g.index!.count,0)
    bind(g,'EQ_Cape'); root.userData.secondaryMotion = 'Cape weights use the chest until a cloth/cape chain is supplied.'
  } else {
    const remap = new Map<number,number>(); const positions: number[] = []; const normals: number[] = []; const uvs: number[] = []; const skinIndices: number[] = []; const weights: number[] = []; const indices: number[] = []; const materials: number[] = []
    const ids = geometry.index; const count = ids?.count ?? p.count
    const indexOf = (i: number) => ids ? ids.getX(i) : i
    const put = (i: number) => {
      const old = remap.get(i); if (old !== undefined) return old
      const next = remap.size; remap.set(i,next); const y = cy(p.getY(i))
      const clearance = height * (recipe.construction === 'plate' ? .009 : .006)
      const fold = recipe.construction === 'cloth' ? Math.sin(y * 65 + p.getX(i) * 12) * height * .0008 : 0
      positions.push(p.getX(i)+n.getX(i)*(clearance+fold), p.getY(i)+n.getY(i)*clearance, p.getZ(i)+n.getZ(i)*(clearance+fold))
      normals.push(n.getX(i),n.getY(i),n.getZ(i)); const uv = geometry.getAttribute('uv'); uvs.push(uv?.getX(i) ?? 0,uv?.getY(i) ?? y)
      for(let c=0;c<4;c++){skinIndices.push(component(si,i,c));weights.push(component(sw,i,c))}
      return next
    }
    for(let j=0;j<count;j+=3){
      const tri=[indexOf(j),indexOf(j+1),indexOf(j+2)]
      if(tri.filter(included).length < 2) continue
      const y=tri.reduce((s,i)=>s+cy(p.getY(i)),0)/3; const x=tri.reduce((s,i)=>s+p.getX(i)-centerX,0)/3
      const knee=recipe.family==='legs' && y>.255 && y<.315
      const cuff=recipe.family==='boots' && y>.21 || recipe.family==='gloves' && /arm/.test(boneName(tri[0]))
      let material=recipe.construction==='cloth'?0:1
      if(recipe.family==='boots' && (y>.21 || y>.105&&y<.118)) material=3
      if(recipe.family==='boots'||recipe.family==='waist'||recipe.family==='gloves') material=1
      if(recipe.family==='helmet'||knee||cuff) material=recipe.construction==='plate'?2:1
      indices.push(...tri.map(put));materials.push(material)
    }
    if(!indices.length) { Object.values(m).forEach(mat=>mat.dispose()); throw new Error(`No ${recipe.family} fitting surface found on ${source.name}.`) }
    const buckets = mats.map(() => [] as number[])
    materials.forEach((material,i)=>buckets[material].push(indices[i*3],indices[i*3+1],indices[i*3+2]))
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));g.setIndex(buckets.flat())
    closeShell(g,height*.0025)
    // Four surface draws at most, regardless of source triangle order.
    g.clearGroups(); let start=0
    buckets.forEach((bucket,material)=>{if(bucket.length)g.addGroup(start,bucket.length,material);start+=bucket.length})
    g.addGroup(indices.length,g.index!.count-indices.length,recipe.family==='waist'?1:3)
    bind(g,`EQ_${recipe.family}`)
  }
  const nearest = (x: number, y: number) => {
    let best = 0; let score = Infinity
    for (let i=0;i<p.count;i++) {
      if (/arm|hand|finger/.test(boneName(i))) continue
      const distance = Math.pow(p.getX(i)-x,2)+Math.pow(p.getY(i)-y,2)
      if(distance<score){score=distance;best=i}
    }
    return best
  }
  const accessory = (g:THREE.BufferGeometry, x:number, y:number, z:number, material:number, name:string) => {
    g.translate(x,y,z);const index=nearest(x,y);const count=g.getAttribute('position').count
    const ids:number[]=[];const weights:number[]=[]
    for(let i=0;i<count;i++)for(let c=0;c<4;c++){ids.push(component(si,index,c));weights.push(component(sw,index,c))}
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ids,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));g.clearGroups();g.addGroup(0,g.index?.count??count,material);bind(g,name)
  }
  const frontAt = (y:number) => {
    let z=-Infinity
    for(let i=0;i<p.count;i++)if(Math.abs(cy(p.getY(i))-y)<.025&&!/arm|hand|finger/.test(boneName(i)))z=Math.max(z,p.getZ(i))
    return Number.isFinite(z)?z:box.max.z
  }
  if(recipe.family==='waist') {
    const y=box.min.y+height*.525;const z=frontAt(.525)+height*.015
    accessory(new THREE.TorusGeometry(height*.022,height*.004,5,4),centerX,y,z,3,'EQ_Waist_Buckle')
    for(const side of recipe.variant%2===0?[-1,1]:[1]) {
      const x=centerX+side*height*.105
      accessory(new THREE.BoxGeometry(height*.065,height*.073,height*.032),x,y-height*.038,z-height*.016,1,'EQ_Waist_Pouch')
      accessory(new THREE.BoxGeometry(height*.069,height*.026,height*.036),x,y-height*.013,z-height*.014,1,'EQ_Waist_PouchFlap')
      accessory(new THREE.BoxGeometry(height*.012,height*.014,height*.009),x,y-height*.02,z+height*.007,3,'EQ_Waist_PouchClasp')
    }
  }

  m.wood.dispose();m.magic.dispose()
  return root
}

/** Use a garment's own continuous rings, cuffs and neckline, not a selection of body triangles. */
function buildTailoredChest(source: THREE.SkinnedMesh, recipe: SkillboundItemRecipe) {
  const materials = equipmentMaterials(recipe)
  const fitted = createEquipmentForgeV3Recipe()
  fitted.length = 1.02 + (recipe.length - 1) * .4
  fitted.looseness = recipe.construction === 'plate' ? .2 : .14
  fitted.waistTaper = .16
  fitted.hemFlare = .12
  fitted.neckline = recipe.variant % 2 === 0 ? 'round' : 'high'
  fitted.sleeve = 'short'
  fitted.layers = { vest: recipe.construction !== 'cloth', belt: false, tabard: false, cape: false }
  const root = new THREE.Group()
  root.name = `EQ_Chest_${recipe.seed}`
  root.userData.skillboundEquipment = true
  root.position.copy(source.position)
  root.quaternion.copy(source.quaternion)
  root.scale.copy(source.scale)
  // Fit in bind pose even when equipment changes while the live character runs.
  // Never call pose() on the player's shared skeleton.
  const restBones = source.skeleton.boneInverses.map(inverse => {
    const bone = new THREE.Bone()
    inverse.clone().invert().decompose(bone.position, bone.quaternion, bone.scale)
    bone.updateMatrixWorld(true)
    return bone
  })
  restBones.forEach((bone, i) => { bone.name = source.skeleton.bones[i].name })
  const restSkeleton = new THREE.Skeleton(restBones, source.skeleton.boneInverses.map(m => m.clone()))
  const fitSource = new THREE.SkinnedMesh(source.geometry, source.material)
  source.bindMatrix.decompose(fitSource.position, fitSource.quaternion, fitSource.scale)
  fitSource.bind(restSkeleton, source.bindMatrix.clone())
  fitSource.updateMatrixWorld(true)
  const { meshes } = buildConformedTunic(fitSource, fitted, materials.cloth, materials.leather,
    recipe.construction === 'plate' ? materials.metal : materials.leather, materials.edge, materials.metal)
  for (const mesh of meshes) {
    // The fitter returns siblings of the body. Move them under the owning slot
    // without applying the body's local transform twice.
    root.add(mesh)
    mesh.position.set(0, 0, 0)
    mesh.quaternion.identity()
    mesh.scale.set(1, 1, 1)
    mesh.bindMode = source.bindMode
    mesh.bind(source.skeleton, source.bindMatrix.clone())
    mesh.userData.skillboundEquipment = true
  }
  const used = new Set<THREE.Material>()
  meshes.forEach(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => used.add(m)))
  Object.values(materials).forEach(m => { if (!used.has(m)) m.dispose() })
  restSkeleton.dispose()
  return root
}

/** Duplicate the inner wall and stitch only open boundaries; copy skin data to every new vertex. */
function closeShell(g: THREE.BufferGeometry, thickness: number) {
  const p=g.getAttribute('position'); const n=g.getAttribute('normal'); const count=p.count;const original=Array.from(g.index!.array);const edges=new Map<string,[number,number,number]>()
  for(let i=0;i<original.length;i+=3)for(let c=0;c<3;c++){const a=original[i+c],b=original[i+(c+1)%3];const key=`${Math.min(a,b)}:${Math.max(a,b)}`;const edge=edges.get(key);if(edge)edge[2]++;else edges.set(key,[a,b,1])}
  for(const [name,attr] of Object.entries(g.attributes)){
    const values=Array.from(attr.array); const inner=Array.from(attr.array)
    if(name==='position')for(let i=0;i<count;i++){inner[i*3]-=n.getX(i)*thickness;inner[i*3+1]-=n.getY(i)*thickness;inner[i*3+2]-=n.getZ(i)*thickness}
    const Ctor=name==='skinIndex'?THREE.Uint16BufferAttribute:THREE.Float32BufferAttribute;g.setAttribute(name,new Ctor([...values,...inner],attr.itemSize))
  }
  const index=[...original];for(let i=0;i<original.length;i+=3)index.push(original[i+2]+count,original[i+1]+count,original[i]+count)
  edges.forEach(([a,b,uses])=>{if(uses===1)index.push(a,b,b+count,a,b+count,a+count)})
  g.setIndex(index);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere()
}
