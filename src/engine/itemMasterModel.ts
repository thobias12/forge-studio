import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { ForgeItemDefinition } from './forgeProject'
import { itemClassification } from './itemTaxonomy'
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

export async function createStarterItemMaster(item: ForgeItemDefinition): Promise<LibraryAsset> {
  const root = new THREE.Group()
  const classification = itemClassification(item)
  root.name = `${item.name} Master Model`

  buildStarterForClassification(root, item.color, classification.itemType, classification.subtype)

  const blob = await exportGroupGlb(root)
  disposeGroup(root)

  return await saveAsset({
    id: itemMasterAssetId(item.id),
    name: `${item.name} Master Model`,
    category: 'props',
    kind: 'glb',
    mime: 'model/gltf-binary',
    tags: ['skillbound', 'item-master', 'starter', classification.itemType, classification.subtype, item.id],
    source: `Item Forge starter model · ${classification.itemType}/${classification.subtype}`,
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

function buildStarterForClassification(root: THREE.Group, accent: string, itemType: string, subtype: string) {
  if (itemType === 'armor') {
    if (subtype === 'helmet') return buildStarterHelmet(root, accent)
    if (subtype === 'gloves') return buildStarterGloves(root, accent)
    if (subtype === 'legs') return buildStarterLegs(root, accent)
    if (subtype === 'boots') return buildStarterBoots(root, accent)
    return buildStarterChest(root, accent)
  }
  if (itemType === 'offhand') {
    if (subtype === 'focus') return buildStarterFocus(root, accent)
    return buildStarterShield(root, accent)
  }
  if (itemType === 'weapon') {
    if (subtype === 'dagger') return buildStarterSword(root, accent, 0.58)
    if (subtype === 'axe') return buildStarterAxe(root, accent)
    if (subtype === 'mace') return buildStarterMace(root, accent)
    if (subtype === 'staff') return buildStarterStaff(root, accent, false)
    if (subtype === 'spear') return buildStarterStaff(root, accent, true)
    if (subtype === 'bow') return buildStarterBow(root, accent)
    return buildStarterSword(root, accent, 1)
  }
  buildStarterProp(root, accent)
}

function materials(accent: string) {
  return {
    steel: new THREE.MeshStandardMaterial({ color: 0xaab1b6, roughness: 0.42, metalness: 0.76 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x3f4548, roughness: 0.5, metalness: 0.65 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x4b3025, roughness: 0.88, metalness: 0 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x353a43, roughness: 0.92, metalness: 0 }),
    accent: new THREE.MeshStandardMaterial({ color: safeColor(accent), roughness: 0.55, metalness: 0.35 }),
  }
}

function buildStarterSword(root: THREE.Group, accent: string, lengthScale: number) {
  const mat = materials(accent)
  const bladeLength = 1.72 * lengthScale
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18 * Math.max(.72, lengthScale), bladeLength, 0.07), mat.steel)
  blade.position.y = bladeLength * .52
  root.add(blade)
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.035, bladeLength * .9, 0.075), mat.darkSteel)
  fuller.position.set(0, blade.position.y, -0.002)
  root.add(fuller)
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12 * Math.max(.75, lengthScale), 0.34 * lengthScale, 4), mat.steel)
  tip.position.y = bladeLength + 0.16 * lengthScale
  tip.rotation.y = Math.PI / 4
  root.add(tip)
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.72 * Math.max(.72, lengthScale), 0.09, 0.13), mat.darkSteel)
  guard.position.y = -0.005
  root.add(guard)
  const guardAccent = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.15), mat.accent)
  guardAccent.position.y = -0.01
  root.add(guardAccent)
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.52 * Math.max(.75, lengthScale), 8), mat.leather)
  grip.position.y = -0.31 * Math.max(.75, lengthScale)
  root.add(grip)
  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), mat.accent)
  pommel.position.y = -0.64 * Math.max(.75, lengthScale)
  root.add(pommel)
}

function buildStarterAxe(root: THREE.Group, accent: string) {
  const mat = materials(accent)
  addCylinder(root, .055, 1.5, [0, .25, 0], mat.leather)
  const head = new THREE.Mesh(new THREE.BoxGeometry(.52, .38, .13), mat.darkSteel)
  head.position.set(.18, .88, 0)
  head.rotation.z = -.16
  root.add(head)
  const edge = new THREE.Mesh(new THREE.ConeGeometry(.3, .5, 3), mat.steel)
  edge.position.set(.43, .89, 0)
  edge.rotation.z = -Math.PI / 2
  edge.rotation.y = Math.PI / 2
  root.add(edge)
  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(.1), mat.accent)
  cap.position.y = -.54
  root.add(cap)
}

function buildStarterMace(root: THREE.Group, accent: string) {
  const mat = materials(accent)
  addCylinder(root, .055, 1.35, [0, .12, 0], mat.leather)
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(.27, 0), mat.darkSteel)
  head.position.y = .92
  root.add(head)
  for (let index = 0; index < 6; index++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(.055, .2, 5), mat.steel)
    const angle = index / 6 * Math.PI * 2
    spike.position.set(Math.cos(angle) * .28, .92, Math.sin(angle) * .28)
    spike.rotation.z = Math.PI / 2
    spike.rotation.y = -angle
    root.add(spike)
  }
  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(.1), mat.accent)
  pommel.position.y = -.6
  root.add(pommel)
}

function buildStarterStaff(root: THREE.Group, accent: string, spear: boolean) {
  const mat = materials(accent)
  addCylinder(root, .045, 2.35, [0, .55, 0], mat.leather)
  if (spear) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.12, .42, 5), mat.steel)
    tip.position.y = 1.94
    root.add(tip)
  } else {
    const focus = new THREE.Mesh(new THREE.OctahedronGeometry(.2), mat.accent)
    focus.position.y = 1.82
    root.add(focus)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.24, .035, 6, 12), mat.darkSteel)
    ring.position.y = 1.82
    root.add(ring)
  }
}

function buildStarterBow(root: THREE.Group, accent: string) {
  const mat = materials(accent)
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, 1.1, 8), mat.leather)
  upper.position.set(.16, .52, 0)
  upper.rotation.z = -.28
  root.add(upper)
  const lower = upper.clone()
  lower.position.set(.16, -.52, 0)
  lower.rotation.z = .28
  root.add(lower)
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .36, 8), mat.accent)
  grip.position.x = .02
  root.add(grip)
  const string = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, 2.12, 5), mat.steel)
  string.position.set(-.12, 0, 0)
  root.add(string)
}

function buildStarterShield(root: THREE.Group, accent: string) {
  const mat = materials(accent)
  const face = new THREE.Mesh(new THREE.CylinderGeometry(.46, .52, .12, 10), mat.darkSteel)
  face.rotation.x = Math.PI / 2
  root.add(face)
  const boss = new THREE.Mesh(new THREE.SphereGeometry(.18, 10, 7, 0, Math.PI * 2, 0, Math.PI * .58), mat.steel)
  boss.position.z = .09
  root.add(boss)
  const crest = new THREE.Mesh(new THREE.BoxGeometry(.12, .58, .08), mat.accent)
  crest.position.z = .14
  root.add(crest)
}

function buildStarterFocus(root: THREE.Group, accent: string) {
  const mat = materials(accent)
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.32, 1), mat.accent)
  root.add(core)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.46, .035, 6, 18), mat.darkSteel)
  ring.rotation.x = Math.PI / 2
  root.add(ring)
}

function buildStarterHelmet(root: THREE.Group, accent: string) {
  const mat = materials(accent)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.34, 12, 8, 0, Math.PI * 2, 0, Math.PI * .68), mat.darkSteel)
  dome.position.y = -.03
  dome.scale.z = .9
  root.add(dome)
  const brow = new THREE.Mesh(new THREE.BoxGeometry(.58, .1, .34), mat.steel)
  brow.position.set(0, -.08, -.08)
  root.add(brow)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(.075, .34, .07), mat.accent)
  nose.position.set(0, -.25, -.2)
  root.add(nose)
}

function buildStarterChest(root: THREE.Group, accent: string) {
  const mat = materials(accent)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(.62, .66, .28), mat.darkSteel)
  torso.scale.set(1, 1, .78)
  root.add(torso)
  const center = new THREE.Mesh(new THREE.BoxGeometry(.13, .58, .24), mat.accent)
  center.position.z = -.04
  root.add(center)
  const left = new THREE.Mesh(new THREE.BoxGeometry(.3, .14, .34), mat.steel)
  left.position.set(-.37, .25, 0)
  left.rotation.z = -.16
  root.add(left)
  const right = left.clone()
  right.position.x = .37
  right.rotation.z = .16
  root.add(right)
}

function buildStarterGloves(root: THREE.Group, accent: string) {
  const mat = materials(accent)
  for (const side of [-1, 1]) {
    const glove = new THREE.Mesh(new THREE.BoxGeometry(.2, .28, .18), mat.darkSteel)
    glove.position.x = side * .45
    root.add(glove)
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.13, .15, .15, 8), mat.accent)
    cuff.position.set(side * .45, .2, 0)
    root.add(cuff)
  }
}

function buildStarterLegs(root: THREE.Group, accent: string) {
  const mat = materials(accent)
  for (const side of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(.19, .38, .2), mat.darkSteel)
    thigh.position.set(side * .16, .2, 0)
    root.add(thigh)
    const shin = new THREE.Mesh(new THREE.BoxGeometry(.17, .42, .18), mat.steel)
    shin.position.set(side * .16, -.22, -.01)
    root.add(shin)
    const knee = new THREE.Mesh(new THREE.OctahedronGeometry(.12), mat.accent)
    knee.position.set(side * .16, -.02, -.11)
    root.add(knee)
  }
}

function buildStarterBoots(root: THREE.Group, accent: string) {
  const mat = materials(accent)
  for (const side of [-1, 1]) {
    const ankle = new THREE.Mesh(new THREE.BoxGeometry(.2, .28, .22), mat.darkSteel)
    ankle.position.set(side * .16, .08, 0)
    root.add(ankle)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.22, .16, .42), mat.steel)
    foot.position.set(side * .16, -.12, -.1)
    root.add(foot)
    const band = new THREE.Mesh(new THREE.BoxGeometry(.23, .07, .24), mat.accent)
    band.position.set(side * .16, .13, 0)
    root.add(band)
  }
}

function buildStarterProp(root: THREE.Group, accent: string) {
  const mat = materials(accent)
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.32, 1), mat.accent)
  root.add(core)
  const band = new THREE.Mesh(new THREE.TorusGeometry(.38, .04, 6, 16), mat.darkSteel)
  band.rotation.x = Math.PI / 2
  root.add(band)
}

function addCylinder(root: THREE.Group, radius: number, height: number, position: [number, number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.06, height, 8), material)
  mesh.position.set(...position)
  root.add(mesh)
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
