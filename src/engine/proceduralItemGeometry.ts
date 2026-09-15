import * as THREE from 'three'
import type { ForgeItemGeneratorRecipe } from './itemGeneratorTypes'

export function buildProceduralItemGroup(recipe: ForgeItemGeneratorRecipe) {
  if (recipe.generatorId === 'weapon.sword') return buildSword(recipe)
  throw new Error(`Unsupported item generator: ${recipe.generatorId}`)
}

function buildSword(recipe: ForgeItemGeneratorRecipe) {
  const root = new THREE.Group()
  root.name = `Procedural Sword · ${recipe.seed}`

  const p = recipe.params
  const bladeLength = num(p.bladeLength, 1.55)
  const bladeWidth = num(p.bladeWidth, 0.23)
  const bladeThickness = num(p.bladeThickness, 0.075)
  const gripLength = num(p.gripLength, 0.48)
  const gripThickness = num(p.gripThickness, 0.075)
  const guardWidth = num(p.guardWidth, 0.62)
  const bladeStyle = str(p.bladeStyle, 'broad')
  const tipStyle = str(p.tipStyle, 'point')
  const fuller = str(p.fuller, 'single')
  const guardStyle = str(p.guardStyle, 'straight')
  const pommelStyle = str(p.pommelStyle, 'diamond')

  const bladeMaterial = material(recipe.materials.blade, 'iron')
  const guardMaterial = material(recipe.materials.guard, 'dark-iron')
  const gripMaterial = material(recipe.materials.grip, 'brown-leather')
  const accentMaterial = material(recipe.materials.accent, 'bronze')

  const blade = new THREE.Mesh(buildBladeGeometry(bladeLength, bladeWidth, bladeThickness, bladeStyle, tipStyle), bladeMaterial)
  blade.name = 'Blade'
  blade.position.y = 0.02
  root.add(blade)

  addFuller(root, fuller, bladeLength, bladeWidth, bladeThickness, guardMaterial)
  addGuard(root, guardStyle, guardWidth, bladeWidth, guardMaterial, accentMaterial)

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(gripThickness * 0.9, gripThickness, gripLength, 8), gripMaterial)
  grip.name = 'Grip'
  grip.position.y = -gripLength * 0.5 - 0.055
  root.add(grip)

  addGripWrap(root, gripLength, gripThickness, grip.position.y, accentMaterial)
  addPommel(root, pommelStyle, gripThickness, -gripLength - 0.1, accentMaterial)

  root.rotation.z = seededTilt(recipe.seed)
  root.userData.forgeGenerator = recipe.generatorId
  root.userData.forgeSeed = recipe.seed
  return root
}

function buildBladeGeometry(length: number, width: number, thickness: number, style: string, tip: string) {
  const segments = style === 'jagged' ? 6 : 4
  const halfT = thickness / 2
  const shoulderY = 0.08
  const tipY = shoulderY + length
  const rows: Array<{ y: number; half: number }> = []

  for (let i = 0; i < segments; i += 1) {
    const t = i / Math.max(1, segments - 1)
    let half = width * 0.5
    if (style === 'tapered') half *= 1 - t * 0.42
    else if (style === 'straight') half *= 0.92
    else if (style === 'jagged') half *= i % 2 ? 0.82 : 1.08
    else if (style === 'broad') half *= 1 - t * 0.18
    rows.push({ y: shoulderY + length * t * 0.86, half })
  }

  const lastHalf = rows[rows.length - 1]?.half ?? width * 0.35
  if (tip === 'point') rows.push({ y: tipY, half: 0 })
  else if (tip === 'chisel') rows.push({ y: tipY, half: Math.max(lastHalf * 0.58, width * 0.12) })
  else rows.push({ y: tipY - length * 0.035, half: lastHalf * 0.52 })

  const vertices: number[] = []
  for (const z of [-halfT, halfT]) for (const row of rows) vertices.push(-row.half, row.y, z, row.half, row.y, z)

  const rowCount = rows.length
  const indices: number[] = []
  const front = 0
  const back = rowCount * 2

  for (let i = 0; i < rowCount - 1; i += 1) {
    const a = front + i * 2, b = a + 1, c = a + 2, d = a + 3
    indices.push(a, b, d, a, d, c)
    const e = back + i * 2, f = e + 1, g = e + 2, h = e + 3
    indices.push(e, h, f, e, g, h)
    indices.push(a, c, g, a, g, e)
    indices.push(b, f, h, b, h, d)
  }

  indices.push(front, back + 1, front + 1, front, back, back + 1)
  const lastFront = front + (rowCount - 1) * 2
  const lastBack = back + (rowCount - 1) * 2
  indices.push(lastFront, lastFront + 1, lastBack + 1, lastFront, lastBack + 1, lastBack)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function addFuller(root: THREE.Group, style: string, length: number, width: number, thickness: number, mat: THREE.Material) {
  if (style === 'none') return
  const channelLength = length * 0.7
  const y = length * 0.45
  const channelWidth = Math.max(0.018, width * 0.07)
  const depth = thickness * 1.04
  const offsets = style === 'double' ? [-width * 0.16, width * 0.16] : [0]
  offsets.forEach((x, index) => {
    const channel = new THREE.Mesh(new THREE.BoxGeometry(channelWidth, channelLength, depth), mat)
    channel.name = `Fuller ${index + 1}`
    channel.position.set(x, y, 0)
    root.add(channel)
  })
}

function addGuard(root: THREE.Group, style: string, width: number, bladeWidth: number, mat: THREE.Material, accent: THREE.Material) {
  const y = 0
  const center = new THREE.Mesh(new THREE.BoxGeometry(Math.max(bladeWidth * 1.15, 0.2), 0.11, 0.14), accent)
  center.name = 'Guard Core'
  center.position.y = y
  root.add(center)

  const armWidth = style === 'short' ? width * 0.75 : width
  if (style === 'curved') {
    const segmentW = armWidth * 0.48
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(segmentW, 0.075, 0.12), mat)
      arm.position.set(side * armWidth * 0.29, side * 0.035, 0)
      arm.rotation.z = side * 0.22
      root.add(arm)
    }
  } else {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(armWidth, style === 'cross' ? 0.085 : 0.075, 0.12), mat)
    bar.name = 'Guard'
    bar.position.y = y
    root.add(bar)
    if (style === 'cross') {
      for (const side of [-1, 1]) {
        const quillon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.23, 0.11), mat)
        quillon.position.set(side * armWidth * 0.46, 0.07, 0)
        quillon.rotation.z = side * 0.16
        root.add(quillon)
      }
    }
  }
}

function addGripWrap(root: THREE.Group, gripLength: number, gripThickness: number, centerY: number, mat: THREE.Material) {
  const count = Math.max(3, Math.round(gripLength / 0.09))
  for (let i = 0; i < count; i += 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(gripThickness * 0.94, gripThickness * 0.1, 4, 8), mat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = centerY - gripLength * 0.42 + (gripLength * 0.84 * i) / Math.max(1, count - 1)
    root.add(ring)
  }
}

function addPommel(root: THREE.Group, style: string, thickness: number, y: number, mat: THREE.Material) {
  let geometry: THREE.BufferGeometry
  if (style === 'round') geometry = new THREE.SphereGeometry(thickness * 1.45, 8, 6)
  else if (style === 'flat') geometry = new THREE.CylinderGeometry(thickness * 1.55, thickness * 1.55, thickness * 0.75, 8)
  else if (style === 'spiked') geometry = new THREE.ConeGeometry(thickness * 1.35, thickness * 3.1, 6)
  else geometry = new THREE.OctahedronGeometry(thickness * 1.65, 0)
  const pommel = new THREE.Mesh(geometry, mat)
  pommel.name = 'Pommel'
  pommel.position.y = y
  if (style === 'spiked') pommel.rotation.z = Math.PI
  root.add(pommel)
}

function material(id = 'iron', fallback = 'iron') {
  const key = id || fallback
  const palette: Record<string, [number, number, number]> = {
    iron: [0x7b8184, 0.58, 0.62],
    'dark-iron': [0x343b40, 0.62, 0.66],
    steel: [0xb8c1c8, 0.34, 0.82],
    'weathered-steel': [0x73746f, 0.7, 0.58],
    bronze: [0x8f6841, 0.55, 0.56],
    'brown-leather': [0x4f3225, 0.9, 0.02],
    'black-leather': [0x252426, 0.92, 0.01],
    'red-leather': [0x63332c, 0.9, 0.01],
    wood: [0x6b4a31, 0.92, 0.02],
  }
  const [color, roughness, metalness] = palette[key] ?? palette[fallback] ?? palette.iron
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

function seededTilt(seed: number) {
  const normalized = ((seed % 1000) / 1000 - 0.5) * 0.035
  return normalized
}

function num(value: unknown, fallback: number) { const n = Number(value); return Number.isFinite(n) ? n : fallback }
function str(value: unknown, fallback: string) { return typeof value === 'string' ? value : fallback }
