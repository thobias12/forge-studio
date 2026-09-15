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
  const bladeLength = num(p.bladeLength, 1.5)
  const bladeWidth = num(p.bladeWidth, 0.24)
  const bladeThickness = num(p.bladeThickness, 0.075)
  const bladeTaper = num(p.bladeTaper, 0.45)
  const gripLength = num(p.gripLength, 0.48)
  const gripThickness = num(p.gripThickness, 0.078)
  const gripTaper = num(p.gripTaper, 0.1)
  const guardWidth = num(p.guardWidth, 0.64)
  const guardThickness = num(p.guardThickness, 0.07)
  const wearAmount = num(p.wearAmount, 0.4)

  const bladeStyle = str(p.bladeStyle, 'arming')
  const crossSection = str(p.crossSection, 'diamond')
  const tipStyle = str(p.tipStyle, 'point')
  const fuller = str(p.fuller, 'single-long')
  const guardStyle = str(p.guardStyle, 'straight')
  const guardTip = str(p.guardTip, 'plain')
  const gripStyle = str(p.gripStyle, 'leather-bands')
  const pommelStyle = str(p.pommelStyle, 'scent-stopper')
  const wearStyle = str(p.wearStyle, 'worn')

  const bladeMaterial = material(recipe.materials.blade, 'iron', wearStyle, wearAmount)
  const guardMaterial = material(recipe.materials.guard, 'dark-iron', wearStyle, wearAmount)
  const gripMaterial = material(recipe.materials.grip, 'brown-leather', wearStyle, wearAmount)
  const accentMaterial = material(recipe.materials.accent, 'bronze', wearStyle, wearAmount)
  const grooveMaterial = material(wearStyle === 'rusted' || wearStyle === 'undead' ? 'rusted-iron' : 'dark-iron', 'dark-iron', wearStyle, wearAmount)

  const blade = new THREE.Mesh(buildBladeGeometry({
    length: bladeLength,
    width: bladeWidth,
    thickness: bladeThickness,
    taper: bladeTaper,
    style: bladeStyle,
    tip: tipStyle,
    crossSection,
    wearStyle,
    wearAmount,
    seed: recipe.seed,
  }), bladeMaterial)
  blade.name = 'Blade'
  blade.position.y = 0.025
  root.add(blade)

  addFuller(root, fuller, bladeLength, bladeWidth, bladeThickness, grooveMaterial)
  addWearMarks(root, bladeLength, bladeWidth, bladeThickness, wearStyle, wearAmount, recipe.seed)
  addGuard(root, {
    style: guardStyle,
    width: guardWidth,
    thickness: guardThickness,
    bladeWidth,
    tip: guardTip,
    wearStyle,
    wearAmount,
    seed: recipe.seed,
    material: guardMaterial,
    accent: accentMaterial,
  })

  const topRadius = gripThickness * (1 - gripTaper * 0.38)
  const bottomRadius = gripThickness * (1 + gripTaper * 0.32)
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, gripLength, 8), gripMaterial)
  grip.name = 'Grip'
  grip.position.y = -gripLength * 0.5 - 0.07
  root.add(grip)

  addGripFurniture(root, grip.position.y, gripLength, gripThickness, accentMaterial)
  addGripWrap(root, gripStyle, gripLength, gripThickness, grip.position.y, gripMaterial, accentMaterial, recipe.seed)
  addPommel(root, pommelStyle, gripThickness, -gripLength - 0.12, accentMaterial)

  root.rotation.z = seededTilt(recipe.seed, wearStyle, wearAmount)
  root.userData.forgeGenerator = recipe.generatorId
  root.userData.forgeSeed = recipe.seed
  root.userData.forgeFamily = bladeStyle
  root.userData.forgeWear = wearStyle
  return root
}

type BladeGeometryOptions = {
  length: number
  width: number
  thickness: number
  taper: number
  style: string
  tip: string
  crossSection: string
  wearStyle: string
  wearAmount: number
  seed: number
}

type BladeRow = { y: number; left: number; right: number }

function buildBladeGeometry(options: BladeGeometryOptions) {
  const { length, width, thickness, taper, style, tip, crossSection, wearStyle, wearAmount, seed } = options
  const shoulderY = 0.08
  const fractions = [0, 0.16, 0.34, 0.54, 0.72, 0.86, 0.94]
  const rows: BladeRow[] = fractions.map((t, index) => {
    const half = Math.max(width * 0.09, width * 0.5 * bladeWidthFactor(style, t, taper))
    const asym = bladeAsymmetry(style, wearStyle, wearAmount, seed, index, half)
    return { y: shoulderY + length * t, left: Math.max(width * 0.05, half * (1 + asym.left)), right: Math.max(width * 0.05, half * (1 + asym.right)) }
  })

  const last = rows[rows.length - 1]
  const tipY = shoulderY + length
  if (tip === 'spear') {
    rows.push({ y: tipY - length * 0.035, left: last.left * 0.48, right: last.right * 0.48 })
    rows.push({ y: tipY + length * 0.075, left: 0.003, right: 0.003 })
  } else if (tip === 'point') {
    rows.push({ y: tipY, left: 0.003, right: 0.003 })
  } else if (tip === 'chisel') {
    rows.push({ y: tipY, left: last.left * 0.62, right: last.right * 0.62 })
  } else if (tip === 'broken') {
    rows.push({ y: tipY - length * 0.045, left: last.left * 0.38, right: last.right * 0.68 })
    rows.push({ y: tipY - length * 0.012, left: last.left * 0.1, right: last.right * 0.44 })
  } else {
    rows.push({ y: tipY - length * 0.025, left: last.left * 0.45, right: last.right * 0.45 })
    rows.push({ y: tipY, left: last.left * 0.22, right: last.right * 0.22 })
  }

  const ringTemplate = crossSectionTemplate(crossSection)
  const vertices: number[] = []
  for (const row of rows) {
    const centerX = (row.right - row.left) * 0.5
    const halfSpan = (row.left + row.right) * 0.5
    for (const point of ringTemplate) {
      const x = centerX + point.x * halfSpan
      vertices.push(x, row.y, point.z * thickness * 0.5)
    }
  }

  const ringSize = ringTemplate.length
  const indices: number[] = []
  for (let r = 0; r < rows.length - 1; r += 1) {
    const aBase = r * ringSize
    const bBase = (r + 1) * ringSize
    for (let i = 0; i < ringSize; i += 1) {
      const next = (i + 1) % ringSize
      indices.push(aBase + i, aBase + next, bBase + next, aBase + i, bBase + next, bBase + i)
    }
  }

  const bottomCenter = vertices.length / 3
  vertices.push(0, rows[0].y, 0)
  const topCenter = vertices.length / 3
  vertices.push((rows[rows.length - 1].right - rows[rows.length - 1].left) * 0.5, rows[rows.length - 1].y, 0)
  for (let i = 0; i < ringSize; i += 1) {
    const next = (i + 1) % ringSize
    indices.push(bottomCenter, next, i)
    const topBase = (rows.length - 1) * ringSize
    indices.push(topCenter, topBase + i, topBase + next)
  }

  const indexed = new THREE.BufferGeometry()
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  indexed.setIndex(indices)
  const geometry = indexed.toNonIndexed()
  indexed.dispose()
  geometry.computeVertexNormals()
  return geometry
}

function crossSectionTemplate(style: string) {
  if (style === 'flat-bevel') return [
    { x: -1, z: 0 }, { x: -0.8, z: 1 }, { x: 0.8, z: 1 }, { x: 1, z: 0 }, { x: 0.8, z: -1 }, { x: -0.8, z: -1 },
  ]
  if (style === 'hex') return [
    { x: -1, z: 0 }, { x: -0.46, z: 1 }, { x: 0.46, z: 1 }, { x: 1, z: 0 }, { x: 0.46, z: -1 }, { x: -0.46, z: -1 },
  ]
  return [{ x: -1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 0 }, { x: 0, z: -1 }]
}

function bladeWidthFactor(style: string, t: number, taper: number) {
  let factor = 1
  if (style === 'arming') factor = 1 - t * (0.28 + taper * 0.34)
  else if (style === 'straight') factor = 0.96 - t * taper * 0.22
  else if (style === 'broad') factor = 1.08 - t * (0.18 + taper * 0.3)
  else if (style === 'tapered') factor = 1 - t * (0.42 + taper * 0.45)
  else if (style === 'falchion') factor = 0.82 + Math.sin(Math.PI * Math.min(1, t * 1.05)) * 0.28 + t * 0.14 - taper * t * 0.24
  else if (style === 'leaf') factor = 0.78 + Math.sin(Math.PI * t) * 0.42 - taper * t * 0.28
  else if (style === 'jagged') factor = 1.02 - t * (0.14 + taper * 0.26)
  return Math.max(0.16, factor)
}

function bladeAsymmetry(style: string, wearStyle: string, wearAmount: number, seed: number, row: number, half: number) {
  const noisy = style === 'jagged' || wearStyle === 'crude' || wearStyle === 'undead' || wearStyle === 'rusted'
  if (!noisy || row === 0) return { left: 0, right: 0 }
  const strength = Math.min(0.28, (style === 'jagged' ? 0.1 : 0.025) + wearAmount * (wearStyle === 'crude' ? 0.14 : 0.07))
  const left = signedNoise(seed + row * 41) * strength
  const right = signedNoise(seed + row * 73 + 19) * strength
  const chip = wearAmount > 0.55 && seeded(seed + row * 97) > 0.72 ? -Math.min(0.18, 0.04 + wearAmount * 0.12) : 0
  return half > 0 ? { left: left + (row % 2 === 0 ? chip : 0), right: right + (row % 2 ? chip : 0) } : { left: 0, right: 0 }
}

function addFuller(root: THREE.Group, style: string, length: number, width: number, thickness: number, mat: THREE.Material) {
  if (style === 'none') return
  const long = style === 'single-long' || style === 'double'
  const channelLength = length * (long ? 0.69 : 0.43)
  const y = 0.11 + channelLength * 0.5
  const channelWidth = Math.max(0.014, width * (style === 'double' ? 0.045 : 0.065))
  const offsets = style === 'double' ? [-width * 0.16, width * 0.16] : [0]
  for (const face of [-1, 1]) {
    offsets.forEach((x, index) => {
      const channel = new THREE.Mesh(new THREE.BoxGeometry(channelWidth, channelLength, 0.006), mat)
      channel.name = `Fuller ${face > 0 ? 'Front' : 'Back'} ${index + 1}`
      channel.position.set(x, y, face * thickness * 0.52)
      root.add(channel)
    })
  }
}

function addWearMarks(root: THREE.Group, length: number, width: number, thickness: number, style: string, amount: number, seed: number) {
  if (amount < 0.22 || style === 'clean' || style === 'noble') return
  const count = Math.max(1, Math.round(amount * (style === 'crude' || style === 'undead' ? 5 : 3)))
  const markMaterial = material(style === 'rusted' ? 'rusted-iron' : 'dark-iron', 'dark-iron', style, amount)
  for (let i = 0; i < count; i += 1) {
    const rx = signedNoise(seed + i * 113)
    const ry = seeded(seed + i * 179)
    const w = Math.max(0.018, width * (0.08 + seeded(seed + i * 229) * 0.12))
    const h = length * (0.025 + seeded(seed + i * 281) * 0.055)
    for (const face of [-1, 1]) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.004), markMaterial)
      mark.position.set(rx * width * 0.28, 0.2 + ry * length * 0.68, face * thickness * 0.53)
      mark.rotation.z = signedNoise(seed + i * 313) * 0.28
      root.add(mark)
    }
  }
}

type GuardOptions = {
  style: string
  width: number
  thickness: number
  bladeWidth: number
  tip: string
  wearStyle: string
  wearAmount: number
  seed: number
  material: THREE.Material
  accent: THREE.Material
}

function addGuard(root: THREE.Group, options: GuardOptions) {
  const { style, width, thickness, bladeWidth, tip, wearStyle, wearAmount, seed, material: mat, accent } = options
  const coreW = Math.max(bladeWidth * 1.18, 0.19)
  const core = new THREE.Mesh(new THREE.BoxGeometry(coreW, Math.max(0.09, thickness * 1.22), 0.15), accent)
  core.name = 'Guard Core'
  root.add(core)

  const half = width * 0.5
  const inner = coreW * 0.42
  const pointsFor = (side: number): Array<[number, number]> => {
    if (style === 'downturned') return [[side * inner, 0], [side * half * 0.58, -0.035], [side * half, -0.13]]
    if (style === 'upturned') return [[side * inner, 0], [side * half * 0.58, 0.035], [side * half, 0.13]]
    if (style === 'swept') return [[side * inner, 0], [side * half * 0.52, side > 0 ? -0.02 : 0.025], [side * half, -0.17]]
    if (style === 'crescent') return [[side * inner, 0], [side * half * 0.58, 0.055], [side * half, 0.17]]
    if (style === 'block') return [[side * inner, 0], [side * half * 0.82, 0]]
    if (style === 'asymmetric') return side < 0
      ? [[side * inner, 0], [side * half * 0.62, -0.04], [side * half, -0.17]]
      : [[side * inner, 0], [side * half * 0.62, 0.02], [side * half * 0.76, 0.065]]
    return [[side * inner, 0], [side * half, 0]]
  }

  for (const side of [-1, 1]) {
    const pts = pointsFor(side)
    const localThickness = thickness * (style === 'block' ? 1.3 : 1)
    for (let i = 0; i < pts.length - 1; i += 1) {
      const wobble = (wearStyle === 'crude' || wearStyle === 'rusted') ? signedNoise(seed + side * 100 + i * 37) * wearAmount * 0.018 : 0
      addBarBetween(root, [pts[i][0], pts[i][1] + wobble], [pts[i + 1][0], pts[i + 1][1]], localThickness, 0.12, mat, `Guard ${side < 0 ? 'L' : 'R'} ${i + 1}`)
    }
    const end = pts[pts.length - 1]
    const prev = pts[Math.max(0, pts.length - 2)]
    addGuardTip(root, tip, end, prev, thickness, mat)
  }
}

function addBarBetween(root: THREE.Group, a: [number, number], b: [number, number], thickness: number, depth: number, mat: THREE.Material, name: string) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const length = Math.hypot(dx, dy)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(length, thickness, depth), mat)
  bar.name = name
  bar.position.set((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, 0)
  bar.rotation.z = Math.atan2(dy, dx)
  root.add(bar)
}

function addGuardTip(root: THREE.Group, style: string, end: [number, number], previous: [number, number], thickness: number, mat: THREE.Material) {
  if (style === 'plain') return
  if (style === 'knob') {
    const knob = new THREE.Mesh(new THREE.OctahedronGeometry(thickness * 0.8, 0), mat)
    knob.position.set(end[0], end[1], 0)
    root.add(knob)
    return
  }
  const dx = end[0] - previous[0]
  const dy = end[1] - previous[1]
  const angle = Math.atan2(dy, dx)
  const spike = new THREE.Mesh(new THREE.ConeGeometry(thickness * 0.52, thickness * 2.2, 5), mat)
  spike.position.set(end[0] + Math.cos(angle) * thickness * 0.7, end[1] + Math.sin(angle) * thickness * 0.7, 0)
  spike.rotation.z = angle - Math.PI / 2
  root.add(spike)
}

function addGripFurniture(root: THREE.Group, centerY: number, length: number, thickness: number, mat: THREE.Material) {
  for (const y of [centerY + length * 0.49, centerY - length * 0.49]) {
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(thickness * 1.13, thickness * 1.13, 0.035, 8), mat)
    ferrule.position.y = y
    root.add(ferrule)
  }
}

function addGripWrap(root: THREE.Group, style: string, gripLength: number, gripThickness: number, centerY: number, gripMat: THREE.Material, accentMat: THREE.Material, seed: number) {
  if (style === 'smooth') return
  const count = style === 'cloth-wrap' ? Math.max(5, Math.round(gripLength / 0.055)) : Math.max(4, Math.round(gripLength / 0.075))
  const mat = style === 'wood-ribbed' ? gripMat : accentMat
  for (let i = 0; i < count; i += 1) {
    const t = count <= 1 ? 0.5 : i / (count - 1)
    const radius = gripThickness * (0.94 + (style === 'cloth-wrap' ? signedNoise(seed + i * 17) * 0.06 : 0))
    const tube = gripThickness * (style === 'cloth-wrap' ? 0.13 : style === 'spiral' ? 0.085 : 0.09)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 4, 10), mat)
    ring.rotation.x = Math.PI / 2
    if (style === 'spiral') ring.rotation.z = (t - 0.5) * 0.28
    ring.position.y = centerY - gripLength * 0.42 + gripLength * 0.84 * t
    if (style === 'cloth-wrap') ring.position.x = signedNoise(seed + i * 29) * gripThickness * 0.07
    root.add(ring)
  }
}

function addPommel(root: THREE.Group, style: string, thickness: number, y: number, mat: THREE.Material) {
  let geometry: THREE.BufferGeometry
  if (style === 'round') geometry = new THREE.SphereGeometry(thickness * 1.4, 8, 6)
  else if (style === 'wheel') geometry = new THREE.CylinderGeometry(thickness * 1.7, thickness * 1.7, thickness * 0.8, 10)
  else if (style === 'faceted') geometry = new THREE.IcosahedronGeometry(thickness * 1.5, 0)
  else if (style === 'scent-stopper') geometry = new THREE.CylinderGeometry(thickness * 1.05, thickness * 1.7, thickness * 1.8, 8)
  else if (style === 'cap') geometry = new THREE.CylinderGeometry(thickness * 1.5, thickness * 1.35, thickness * 0.8, 8)
  else if (style === 'spiked') geometry = new THREE.ConeGeometry(thickness * 1.3, thickness * 3, 6)
  else geometry = new THREE.OctahedronGeometry(thickness * 1.65, 0)
  const pommel = new THREE.Mesh(geometry, mat)
  pommel.name = 'Pommel'
  pommel.position.y = y
  if (style === 'spiked') pommel.rotation.z = Math.PI
  root.add(pommel)
}

function material(id = 'iron', fallback = 'iron', wearStyle = 'clean', wearAmount = 0) {
  const key = id || fallback
  const palette: Record<string, [number, number, number]> = {
    iron: [0x747b80, 0.6, 0.68],
    'dark-iron': [0x343b40, 0.66, 0.7],
    steel: [0xaebac3, 0.3, 0.86],
    'weathered-steel': [0x6e7475, 0.72, 0.62],
    'rusted-iron': [0x6d4935, 0.9, 0.48],
    'blackened-steel': [0x303840, 0.48, 0.82],
    'silvered-steel': [0xc4cbd0, 0.22, 0.9],
    bronze: [0x8f6841, 0.58, 0.58],
    'brown-leather': [0x4f3225, 0.9, 0.02],
    'black-leather': [0x252426, 0.92, 0.01],
    'red-leather': [0x63332c, 0.9, 0.01],
    'tan-leather': [0x79583b, 0.86, 0.02],
    cloth: [0x353238, 0.98, 0],
    wood: [0x6b4a31, 0.92, 0.02],
  }
  const [baseColor, baseRoughness, metalness] = palette[key] ?? palette[fallback] ?? palette.iron
  const color = new THREE.Color(baseColor)
  if (wearStyle === 'rusted') color.lerp(new THREE.Color(0x6a3f2b), wearAmount * 0.22)
  else if (wearStyle === 'undead') color.lerp(new THREE.Color(0x35433d), wearAmount * 0.16)
  else if (wearStyle === 'noble') color.lerp(new THREE.Color(0xd0c6ac), 0.05)
  const roughness = Math.min(1, baseRoughness + (wearStyle === 'clean' || wearStyle === 'noble' ? 0 : wearAmount * 0.16))
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true })
}

function seededTilt(seed: number, wearStyle: string, wearAmount: number) {
  if (wearStyle === 'clean' || wearStyle === 'noble') return 0
  const strength = wearStyle === 'crude' ? 0.018 : 0.008
  return signedNoise(seed ^ 0x37ac91) * strength * wearAmount
}

function seeded(seed: number) {
  let x = seed | 0
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  return (x >>> 0) / 4294967295
}

function signedNoise(seed: number) { return seeded(seed) * 2 - 1 }
function num(value: unknown, fallback: number) { const n = Number(value); return Number.isFinite(n) ? n : fallback }
function str(value: unknown, fallback: string) { return typeof value === 'string' ? value : fallback }
