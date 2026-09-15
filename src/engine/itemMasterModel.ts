import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { ForgeItemDefinition } from './forgeProject'
import { saveAsset, type LibraryAsset } from '../lib/library'

const CREATOR_INTENT_KEY = 'forge:item-master-model:intent'
const CREATOR_RESULT_KEY = 'forge:item-master-model:result'

export type ItemModelCreatorIntent = {
  itemId: string
  itemName: string
  startedAt: string
}

export type ItemModelCreatorResult = {
  itemId: string
  assetId: string
  completedAt: string
}

export function itemMasterAssetId(itemId: string) {
  return `skillbound:item-master:${itemId}`
}

export async function createStarterItemMaster(item: Pick<ForgeItemDefinition, 'id' | 'name' | 'slot' | 'color'>): Promise<LibraryAsset> {
  const root = new THREE.Group()
  root.name = `${item.name} Master Model`

  if (item.slot === 'weapon') buildStarterSword(root, item.color)

  const blob = await exportGroupGlb(root)
  disposeGroup(root)

  return await saveAsset({
    id: itemMasterAssetId(item.id),
    name: `${item.name} Master Model`,
    category: 'props',
    kind: 'glb',
    mime: 'model/gltf-binary',
    tags: ['skillbound', 'item-master', 'starter', item.id],
    source: 'Item Forge starter model',
    blob,
  })
}

export async function importItemMasterGlb(file: File, item: Pick<ForgeItemDefinition, 'id' | 'name'>): Promise<LibraryAsset> {
  if (!file.name.toLowerCase().endsWith('.glb')) throw new Error('Item Forge currently accepts binary .glb master models.')
  if (!file.size) throw new Error('The selected GLB is empty.')

  return await saveAsset({
    id: itemMasterAssetId(item.id),
    name: `${item.name} Master Model`,
    category: 'props',
    kind: 'glb',
    mime: 'model/gltf-binary',
    tags: ['skillbound', 'item-master', 'imported', item.id],
    source: `Item Forge import · ${file.name}`,
    blob: file,
  })
}

export function beginItemModelCreator(intent: Omit<ItemModelCreatorIntent, 'startedAt'>) {
  sessionStorage.setItem(CREATOR_INTENT_KEY, JSON.stringify({ ...intent, startedAt: new Date().toISOString() } satisfies ItemModelCreatorIntent))
  sessionStorage.removeItem(CREATOR_RESULT_KEY)
}

export function readItemModelCreatorIntent(): ItemModelCreatorIntent | undefined {
  return readSession<ItemModelCreatorIntent>(CREATOR_INTENT_KEY)
}

export function completeItemModelCreator(assetId: string) {
  const intent = readItemModelCreatorIntent()
  if (!intent) return
  sessionStorage.setItem(CREATOR_RESULT_KEY, JSON.stringify({ itemId: intent.itemId, assetId, completedAt: new Date().toISOString() } satisfies ItemModelCreatorResult))
  sessionStorage.removeItem(CREATOR_INTENT_KEY)
}

export function consumeItemModelCreatorResult(): ItemModelCreatorResult | undefined {
  const result = readSession<ItemModelCreatorResult>(CREATOR_RESULT_KEY)
  if (result) sessionStorage.removeItem(CREATOR_RESULT_KEY)
  return result
}

function readSession<T>(key: string): T | undefined {
  const value = sessionStorage.getItem(key)
  if (!value) return undefined
  try { return JSON.parse(value) as T } catch { return undefined }
}

function buildStarterSword(root: THREE.Group, accent: string) {
  const steel = new THREE.MeshStandardMaterial({ color: 0xaab1b6, roughness: 0.42, metalness: 0.76 })
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x3f4548, roughness: 0.5, metalness: 0.65 })
  const leather = new THREE.MeshStandardMaterial({ color: 0x4b3025, roughness: 0.88, metalness: 0 })
  const accentMaterial = new THREE.MeshStandardMaterial({ color: safeColor(accent), roughness: 0.55, metalness: 0.35 })

  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.72, 0.07), steel)
  blade.position.y = 0.9
  blade.scale.x = 0.86
  root.add(blade)

  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.56, 0.075), darkSteel)
  fuller.position.set(0, 0.88, -0.002)
  root.add(fuller)

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 4), steel)
  tip.position.y = 1.93
  tip.rotation.y = Math.PI / 4
  root.add(tip)

  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.09, 0.13), darkSteel)
  guard.position.y = -0.005
  root.add(guard)

  const guardAccent = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.15), accentMaterial)
  guardAccent.position.y = -0.01
  root.add(guardAccent)

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.52, 8), leather)
  grip.position.y = -0.31
  root.add(grip)

  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), accentMaterial)
  pommel.position.y = -0.64
  root.add(pommel)

  root.rotation.z = -0.05
}

async function exportGroupGlb(root: THREE.Group) {
  const exporter = new GLTFExporter()
  const result = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(root, (value) => {
      if (value instanceof ArrayBuffer) resolve(value)
      else reject(new Error('Forge expected binary GLB output.'))
    }, reject, { binary: true, trs: true, onlyVisible: false })
  })
  return new Blob([result], { type: 'model/gltf-binary' })
}

function disposeGroup(root: THREE.Group) {
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const entries = Array.isArray(object.material) ? object.material : [object.material]
    entries.forEach((material) => materials.add(material))
  })
  materials.forEach((material) => material.dispose())
}

function safeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#8e8a80'
}
