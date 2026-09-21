import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { getAsset } from '../lib/library'
import { OFFICIAL_SKILLBOUND_BASE_IDS, type SkillboundBodyType } from '../lib/characterAssetRegistry'
import type { ForgeItemDefinition } from './forgeProject'
import { recipeForItem, type SkillboundItemRecipe } from './skillboundItems'
import { buildSkillboundProp } from './skillboundItemGeometry'
import { buildSkillboundArmor, findEquipmentBody } from './skillboundArmorGeometry'

const bodies = new Map<string, Promise<THREE.Group>>()
export const isGeneratedArmor = (r: SkillboundItemRecipe) => ['helmet','chest','gloves','legs','boots','cloak','waist'].includes(r.family)

export async function loadEquipmentFoundation(bodyType: SkillboundBodyType) {
  const id = OFFICIAL_SKILLBOUND_BASE_IDS[bodyType]
  const asset = await getAsset(id)
  if (!asset) throw new Error(`Import Skillbound ${bodyType === 'male' ? 'Male' : 'Female'} Base v1 in Character Creator to fit generated armor.`)
  // IndexedDB returns fresh Blob wrappers. Cache by immutable library revision instead.
  const key = `${id}:${asset.blob.size}:${asset.updatedAt}`
  let cached = bodies.get(key)
  if (!cached) {
    cached = (async () => {
      const url = URL.createObjectURL(asset.blob)
      try { return (await new GLTFLoader().loadAsync(url)).scene }
      finally { URL.revokeObjectURL(url) }
    })()
    bodies.set(key,cached)
    void cached.catch(() => bodies.delete(key))
    for (const [oldKey, old] of bodies) if (oldKey.startsWith(`${id}:`) && oldKey !== key) {
      bodies.delete(oldKey); void old.then(disposeGeneratedModel).catch(() => undefined)
    }
  }
  const root = clone(await cached)
  // Preview owns its resources; never dispose the cached foundation's geometry or material.
  root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry=o.geometry.clone(); o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone() } })
  root.updateMatrixWorld(true)
  return root
}

export function attachGeneratedArmor(character: THREE.Object3D, item: ForgeItemDefinition) {
  const recipe = recipeForItem(item)
  if (!recipe || !isGeneratedArmor(recipe)) return undefined
  const body = findEquipmentBody(character)
  if (!body?.parent) return undefined
  const root = buildSkillboundArmor(body,recipe)
  body.parent.add(root); root.updateMatrixWorld(true)
  return root
}

export async function buildGeneratedItemModel(item: ForgeItemDefinition, bodyType: SkillboundBodyType = 'female') {
  const recipe = recipeForItem(item)
  if (!recipe) return undefined
  if (!isGeneratedArmor(recipe)) return buildSkillboundProp(recipe)
  const foundation = await loadEquipmentFoundation(bodyType)
  try {
    const armor = attachGeneratedArmor(foundation,item)
    if (!armor) throw new Error('The selected foundation has no compatible skinned body.')
    const root = new THREE.Group();root.name=armor.name
    armor.updateMatrixWorld(true)
    armor.traverse(o=>{
      if (!(o instanceof THREE.Mesh)) return
      const geometry=o.geometry.clone();geometry.applyMatrix4(o.matrixWorld)
      geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight')
      const material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone()
      root.add(new THREE.Mesh(geometry,material))
    })
    const center=new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3())
    root.children.forEach(o=>o.position.sub(center))
    return root
  } finally { disposeGeneratedModel(foundation) }
}

export function disposeGeneratedModel(root: THREE.Object3D) {
  const geometries=new Set<THREE.BufferGeometry>();const materials=new Set<THREE.Material>()
  root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m))}})
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())
}
