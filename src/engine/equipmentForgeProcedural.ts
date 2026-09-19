import * as THREE from 'three'
import {
  listAssets,
  saveAsset,
  type LibraryAsset,
} from '../lib/library'
import type { SkillboundBodyType } from '../lib/characterAssetRegistry'

export type ProceduralEquipmentStyle =
  | 'ranger'
  | 'guard'
  | 'battlemage'
  | 'raider'

export type ProceduralEquipmentRecipe = {
  format: 'forge-procedural-equipment'
  version: 1
  name: string
  bodyType: SkillboundBodyType
  style: ProceduralEquipmentStyle
  seed: number
  enabled: boolean
  chest: {
    enabled: boolean
    width: number
    depth: number
    length: number
    looseness: number
    leatherVest: boolean
    plateCoverage: number
    collarHeight: number
    shoulderSize: number
    shoulderAsymmetry: number
    strapCount: number
  }
  waist: {
    enabled: boolean
    beltWidth: number
    pouchCount: number
    tabardLength: number
    tabardWidth: number
  }
  cape: {
    enabled: boolean
    length: number
    width: number
    flare: number
  }
  materials: {
    cloth: string
    leather: string
    metal: string
    accent: string
  }
}

export const PROCEDURAL_EQUIPMENT_STYLES:
  Array<{
    id: ProceduralEquipmentStyle
    label: string
    description: string
  }> = [
    {
      id: 'ranger',
      label: 'Ranger',
      description:
        'Layered cloth and leather with restrained steel protection.',
    },
    {
      id: 'guard',
      label: 'Guard',
      description:
        'Broader torso protection, stronger plate coverage and structured shoulders.',
    },
    {
      id: 'battlemage',
      label: 'Battlemage',
      description:
        'Longer cloth silhouette with metal reinforcement and magical accent color.',
    },
    {
      id: 'raider',
      label: 'Raider',
      description:
        'Asymmetric rough leather, compact armor plates and heavier belts.',
    },
  ]

export function createProceduralEquipmentRecipe(
  bodyType: SkillboundBodyType = 'female',
  style: ProceduralEquipmentStyle = 'ranger',
): ProceduralEquipmentRecipe {
  const base: ProceduralEquipmentRecipe = {
    format: 'forge-procedural-equipment',
    version: 1,
    name: 'New Ranger Set',
    bodyType,
    style,
    seed: 1,
    enabled: true,
    chest: {
      enabled: true,
      width: bodyType === 'female' ? .98 : 1.04,
      depth: 1,
      length: .9,
      looseness: .08,
      leatherVest: true,
      plateCoverage: .24,
      collarHeight: .16,
      shoulderSize: .3,
      shoulderAsymmetry: .18,
      strapCount: 2,
    },
    waist: {
      enabled: true,
      beltWidth: .12,
      pouchCount: 2,
      tabardLength: .45,
      tabardWidth: .38,
    },
    cape: {
      enabled: true,
      length: .64,
      width: .78,
      flare: .22,
    },
    materials: {
      cloth: '#384737',
      leather: '#3f2b20',
      metal: '#59616a',
      accent: '#5f1f28',
    },
  }
  return applyProceduralStyle(base, style)
}

export function applyProceduralStyle(
  recipe: ProceduralEquipmentRecipe,
  style: ProceduralEquipmentStyle,
) {
  const next = structuredClone(recipe)
  next.style = style

  if (style === 'ranger') {
    next.name = 'Deadwood Ranger'
    next.chest.width =
      next.bodyType === 'female' ? .98 : 1.03
    next.chest.depth = 1
    next.chest.length = .9
    next.chest.looseness = .08
    next.chest.leatherVest = true
    next.chest.plateCoverage = .22
    next.chest.collarHeight = .18
    next.chest.shoulderSize = .28
    next.chest.shoulderAsymmetry = .22
    next.chest.strapCount = 2
    next.waist.beltWidth = .11
    next.waist.pouchCount = 2
    next.waist.tabardLength = .38
    next.waist.tabardWidth = .34
    next.cape.length = .58
    next.cape.width = .74
    next.cape.flare = .2
    next.materials = {
      cloth: '#384737',
      leather: '#3f2b20',
      metal: '#59616a',
      accent: '#5f1f28',
    }
  } else if (style === 'guard') {
    next.name = 'Ironwatch Guard'
    next.chest.width =
      next.bodyType === 'female' ? 1.02 : 1.08
    next.chest.depth = 1.05
    next.chest.length = .82
    next.chest.looseness = .04
    next.chest.leatherVest = true
    next.chest.plateCoverage = .72
    next.chest.collarHeight = .12
    next.chest.shoulderSize = .62
    next.chest.shoulderAsymmetry = 0
    next.chest.strapCount = 1
    next.waist.beltWidth = .14
    next.waist.pouchCount = 1
    next.waist.tabardLength = .34
    next.waist.tabardWidth = .3
    next.cape.length = .42
    next.cape.width = .62
    next.cape.flare = .12
    next.materials = {
      cloth: '#303a42',
      leather: '#352b25',
      metal: '#68717b',
      accent: '#233a52',
    }
  } else if (style === 'battlemage') {
    next.name = 'Ashen Battlemage'
    next.chest.width =
      next.bodyType === 'female' ? .97 : 1.02
    next.chest.depth = 1
    next.chest.length = 1.08
    next.chest.looseness = .12
    next.chest.leatherVest = false
    next.chest.plateCoverage = .38
    next.chest.collarHeight = .38
    next.chest.shoulderSize = .38
    next.chest.shoulderAsymmetry = .08
    next.chest.strapCount = 1
    next.waist.beltWidth = .09
    next.waist.pouchCount = 1
    next.waist.tabardLength = .68
    next.waist.tabardWidth = .44
    next.cape.length = .76
    next.cape.width = .84
    next.cape.flare = .3
    next.materials = {
      cloth: '#29243d',
      leather: '#322522',
      metal: '#555967',
      accent: '#7758a7',
    }
  } else {
    next.name = 'Marsh Raider'
    next.chest.width =
      next.bodyType === 'female' ? 1 : 1.06
    next.chest.depth = 1.04
    next.chest.length = .82
    next.chest.looseness = .06
    next.chest.leatherVest = true
    next.chest.plateCoverage = .34
    next.chest.collarHeight = .04
    next.chest.shoulderSize = .46
    next.chest.shoulderAsymmetry = .72
    next.chest.strapCount = 3
    next.waist.beltWidth = .16
    next.waist.pouchCount = 3
    next.waist.tabardLength = .22
    next.waist.tabardWidth = .3
    next.cape.length = .35
    next.cape.width = .58
    next.cape.flare = .16
    next.materials = {
      cloth: '#3a352d',
      leather: '#4a2d1e',
      metal: '#53504c',
      accent: '#6c3424',
    }
  }

  return next
}

export function randomizeProceduralEquipmentRecipe(
  recipe: ProceduralEquipmentRecipe,
) {
  const next = structuredClone(recipe)
  next.seed = Math.max(1, Math.floor(next.seed) + 1)
  const random = seededRandom(
    hashSeed(
      `${next.bodyType}:${next.style}:${next.seed}`,
    ),
  )
  const jitter = (
    value: number,
    spread: number,
    min: number,
    max: number,
  ) =>
    THREE.MathUtils.clamp(
      value + (random() * 2 - 1) * spread,
      min,
      max,
    )

  next.chest.width = jitter(
    next.chest.width,
    .05,
    .86,
    1.14,
  )
  next.chest.depth = jitter(
    next.chest.depth,
    .06,
    .86,
    1.15,
  )
  next.chest.length = jitter(
    next.chest.length,
    .12,
    .68,
    1.2,
  )
  next.chest.looseness = jitter(
    next.chest.looseness,
    .05,
    0,
    .22,
  )
  next.chest.plateCoverage = jitter(
    next.chest.plateCoverage,
    .18,
    0,
    1,
  )
  next.chest.collarHeight = jitter(
    next.chest.collarHeight,
    .1,
    0,
    .55,
  )
  next.chest.shoulderSize = jitter(
    next.chest.shoulderSize,
    .16,
    0,
    .85,
  )
  next.chest.shoulderAsymmetry = jitter(
    next.chest.shoulderAsymmetry,
    .24,
    0,
    1,
  )
  next.chest.strapCount =
    Math.max(
      0,
      Math.min(
        4,
        next.chest.strapCount +
          (random() > .68
            ? random() > .5
              ? 1
              : -1
            : 0),
      ),
    )
  next.waist.beltWidth = jitter(
    next.waist.beltWidth,
    .035,
    .06,
    .2,
  )
  next.waist.pouchCount = Math.max(
    0,
    Math.min(
      4,
      next.waist.pouchCount +
        (random() > .55
          ? random() > .5
            ? 1
            : -1
          : 0),
    ),
  )
  next.waist.tabardLength = jitter(
    next.waist.tabardLength,
    .14,
    0,
    .85,
  )
  next.waist.tabardWidth = jitter(
    next.waist.tabardWidth,
    .08,
    .18,
    .55,
  )
  next.cape.length = jitter(
    next.cape.length,
    .16,
    0,
    .9,
  )
  next.cape.width = jitter(
    next.cape.width,
    .1,
    .42,
    .95,
  )
  next.cape.flare = jitter(
    next.cape.flare,
    .12,
    0,
    .5,
  )
  return next
}

export async function saveProceduralEquipmentRecipe(
  recipe: ProceduralEquipmentRecipe,
) {
  const blob = new Blob(
    [JSON.stringify(recipe, null, 2)],
    {
      type:
        'application/x-forge-procedural-equipment+json',
    },
  )
  return await saveAsset({
    id: `procedural-equipment-${crypto.randomUUID()}`,
    name: recipe.name,
    category: 'characters',
    kind: 'file',
    mime: blob.type,
    tags: [
      'equipment-forge-procedural',
      `body-type:${recipe.bodyType}`,
      `equipment-style:${recipe.style}`,
    ],
    favorite: false,
    source: 'Equipment Forge Creator',
    blob,
  })
}

export async function listProceduralEquipmentRecipes() {
  const assets = await listAssets()
  return assets.filter((asset) =>
    asset.tags.includes(
      'equipment-forge-procedural',
    ),
  )
}

export async function parseProceduralEquipmentRecipe(
  asset: LibraryAsset,
) {
  const raw = JSON.parse(
    await asset.blob.text(),
  ) as ProceduralEquipmentRecipe
  if (
    raw?.format !==
      'forge-procedural-equipment' ||
    raw.version !== 1
  ) {
    throw new Error(
      'That library item is not a supported Equipment Forge creator recipe.',
    )
  }
  return raw
}

export function buildProceduralEquipmentVisual(
  bodyRoot: THREE.Object3D,
  recipe: ProceduralEquipmentRecipe,
) {
  const root = new THREE.Group()
  root.name = '__forge_procedural_equipment'
  root.userData.recipe = recipe
  bodyRoot.add(root)

  if (!recipe.enabled) return root

  const materials = createMaterialSet(recipe)
  const fit = bodyFit(recipe.bodyType)

  if (recipe.chest.enabled) {
    buildChest(
      bodyRoot,
      root,
      recipe,
      materials,
      fit,
    )
  }
  if (recipe.waist.enabled) {
    buildWaist(
      bodyRoot,
      root,
      recipe,
      materials,
      fit,
    )
  }
  if (recipe.cape.enabled) {
    buildCape(
      bodyRoot,
      root,
      recipe,
      materials,
      fit,
    )
  }

  return root
}

function buildChest(
  bodyRoot: THREE.Object3D,
  root: THREE.Group,
  recipe: ProceduralEquipmentRecipe,
  materials: MaterialSet,
  fit: ReturnType<typeof bodyFit>,
) {
  const chest = recipe.chest
  const centerY =
    fit.chestY -
    (chest.length - .9) * .08
  const height =
    .48 * chest.length
  const radius =
    .265 *
    chest.width *
    (1 + chest.looseness)
  const depth =
    .17 *
    chest.depth *
    (1 + chest.looseness * .65)

  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radius * .88,
      radius,
      height,
      14,
      1,
      true,
    ),
    materials.cloth,
  )
  shell.scale.z = depth / radius
  shell.position.set(0, centerY, 0)
  shell.castShadow = true
  shell.name = 'Procedural_Tunic'
  attachPreservingWorld(
    bodyRoot,
    findBone(
      bodyRoot,
      'spine_03',
      'spine_02',
    ),
    shell,
  )
  root.userData.chestShell = shell

  if (chest.leatherVest) {
    const vest = new THREE.Mesh(
      new THREE.CylinderGeometry(
        radius * .9,
        radius * .97,
        height * .72,
        12,
        1,
        true,
        -.78,
        Math.PI * 1.56,
      ),
      materials.leather,
    )
    vest.scale.z =
      (depth * 1.06) / radius
    vest.position.set(
      0,
      centerY + .02,
      .012,
    )
    vest.rotation.y = -.02
    vest.castShadow = true
    vest.name = 'Procedural_LeatherVest'
    attachPreservingWorld(
      bodyRoot,
      findBone(
        bodyRoot,
        'spine_03',
        'spine_02',
      ),
      vest,
    )
  }

  const plateCoverage =
    THREE.MathUtils.clamp(
      chest.plateCoverage,
      0,
      1,
    )
  if (plateCoverage > .02) {
    const plateWidth =
      .22 + plateCoverage * .24
    const plateHeight =
      .12 + plateCoverage * .2
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(
        plateWidth,
        plateHeight,
        .045 + plateCoverage * .025,
        2,
        2,
        1,
      ),
      materials.metal,
    )
    plate.position.set(
      0,
      centerY + .06,
      depth + .02,
    )
    plate.scale.x =
      chest.width * .96
    plate.rotation.x = -.03
    plate.castShadow = true
    plate.name = 'Procedural_BreastPlate'
    attachPreservingWorld(
      bodyRoot,
      findBone(
        bodyRoot,
        'spine_03',
        'spine_02',
      ),
      plate,
    )

    const lowerPlate = new THREE.Mesh(
      new THREE.BoxGeometry(
        plateWidth * .86,
        plateHeight * .38,
        .04,
      ),
      materials.metalDark,
    )
    lowerPlate.position.set(
      0,
      centerY - plateHeight * .52,
      depth + .018,
    )
    lowerPlate.castShadow = true
    attachPreservingWorld(
      bodyRoot,
      findBone(
        bodyRoot,
        'spine_02',
        'spine_01',
      ),
      lowerPlate,
    )
  }

  if (chest.collarHeight > .02) {
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(
        .145 *
          (1 + chest.collarHeight * .16),
        .015 +
          chest.collarHeight * .025,
        6,
        18,
        Math.PI * 1.64,
      ),
      materials.leather,
    )
    collar.position.set(
      0,
      fit.neckY - .025,
      .005,
    )
    collar.rotation.set(
      Math.PI / 2,
      0,
      Math.PI * .18,
    )
    collar.scale.x = 1.06
    collar.scale.z = .76
    collar.castShadow = true
    collar.name = 'Procedural_Collar'
    attachPreservingWorld(
      bodyRoot,
      findBone(
        bodyRoot,
        'neck_01',
        'spine_03',
      ),
      collar,
    )
  }

  const shoulderBase =
    chest.shoulderSize
  if (shoulderBase > .03) {
    buildShoulder(
      bodyRoot,
      recipe,
      materials,
      fit,
      'L',
      shoulderBase *
        (1 +
          chest.shoulderAsymmetry *
            .28),
    )
    buildShoulder(
      bodyRoot,
      recipe,
      materials,
      fit,
      'R',
      shoulderBase *
        (1 -
          chest.shoulderAsymmetry *
            .24),
    )
  }

  const strapCount =
    Math.max(
      0,
      Math.min(
        4,
        Math.round(chest.strapCount),
      ),
    )
  for (
    let index = 0;
    index < strapCount;
    index += 1
  ) {
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(
        .035,
        height * .78,
        .018,
      ),
      materials.leatherDark,
    )
    const spread =
      strapCount === 1
        ? 0
        : (index / (strapCount - 1) - .5) *
          .22
    strap.position.set(
      spread,
      centerY,
      depth + .046,
    )
    strap.rotation.z =
      (index % 2 === 0 ? 1 : -1) *
      (.08 + index * .018)
    strap.castShadow = true
    strap.name =
      `Procedural_Strap_${index}`
    attachPreservingWorld(
      bodyRoot,
      findBone(
        bodyRoot,
        'spine_03',
        'spine_02',
      ),
      strap,
    )
  }
}

function buildShoulder(
  bodyRoot: THREE.Object3D,
  recipe: ProceduralEquipmentRecipe,
  materials: MaterialSet,
  fit: ReturnType<typeof bodyFit>,
  side: 'L' | 'R',
  amount: number,
) {
  const sign = side === 'L' ? 1 : -1
  const width =
    .12 + amount * .15
  const shoulder = new THREE.Mesh(
    new THREE.BoxGeometry(
      width,
      .07 + amount * .045,
      .16 + amount * .08,
      2,
      1,
      2,
    ),
    materials.metal,
  )
  shoulder.position.set(
    sign *
      (fit.shoulderX +
        amount * .025),
    fit.shoulderY,
    .012,
  )
  shoulder.rotation.set(
    -.08,
    sign * -.08,
    sign * -.14,
  )
  shoulder.castShadow = true
  shoulder.name =
    `Procedural_Shoulder_${side}`
  attachPreservingWorld(
    bodyRoot,
    findBone(
      bodyRoot,
      `clavicle_${side}`,
      `upperarm_${side}`,
      'spine_03',
    ),
    shoulder,
  )

  if (amount > .42) {
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(
        width * .8,
        .035,
        .12 + amount * .05,
      ),
      materials.metalDark,
    )
    cap.position.set(
      sign *
        (fit.shoulderX +
          amount * .035),
      fit.shoulderY - .055,
      -.015,
    )
    cap.rotation.set(
      -.08,
      sign * -.06,
      sign * -.17,
    )
    cap.castShadow = true
    attachPreservingWorld(
      bodyRoot,
      findBone(
        bodyRoot,
        `upperarm_${side}`,
        `clavicle_${side}`,
      ),
      cap,
    )
  }

  void recipe
}

function buildWaist(
  bodyRoot: THREE.Object3D,
  root: THREE.Group,
  recipe: ProceduralEquipmentRecipe,
  materials: MaterialSet,
  fit: ReturnType<typeof bodyFit>,
) {
  const waist = recipe.waist
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(
      fit.waistRadius,
      fit.waistRadius,
      Math.max(.045, waist.beltWidth),
      14,
      1,
      true,
    ),
    materials.leather,
  )
  belt.scale.z =
    fit.waistDepth / fit.waistRadius
  belt.position.set(0, fit.waistY, 0)
  belt.castShadow = true
  belt.name = 'Procedural_Belt'
  attachPreservingWorld(
    bodyRoot,
    findBone(
      bodyRoot,
      'pelvis',
      'spine_01',
    ),
    belt,
  )
  root.userData.belt = belt

  const buckle = new THREE.Mesh(
    new THREE.BoxGeometry(
      .085,
      .065,
      .025,
    ),
    materials.metal,
  )
  buckle.position.set(
    0,
    fit.waistY,
    fit.waistDepth + .026,
  )
  buckle.castShadow = true
  attachPreservingWorld(
    bodyRoot,
    findBone(bodyRoot, 'pelvis'),
    buckle,
  )

  const pouchCount = Math.max(
    0,
    Math.min(
      4,
      Math.round(waist.pouchCount),
    ),
  )
  for (
    let index = 0;
    index < pouchCount;
    index += 1
  ) {
    const side =
      index % 2 === 0 ? 1 : -1
    const row =
      Math.floor(index / 2)
    const pouch = new THREE.Mesh(
      new THREE.BoxGeometry(
        .105,
        .13,
        .06,
        2,
        2,
        1,
      ),
      materials.leatherDark,
    )
    pouch.position.set(
      side *
        (.19 + row * .035),
      fit.waistY - .07,
      .06 + row * .012,
    )
    pouch.rotation.z =
      side * (.09 + row * .03)
    pouch.castShadow = true
    attachPreservingWorld(
      bodyRoot,
      findBone(bodyRoot, 'pelvis'),
      pouch,
    )
  }

  if (waist.tabardLength > .02) {
    const length =
      .18 + waist.tabardLength * .48
    const width =
      .12 + waist.tabardWidth * .32
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(
        width,
        length,
        .018,
      ),
      materials.cloth,
    )
    panel.position.set(
      0,
      fit.waistY -
        length * .5 -
        .04,
      fit.waistDepth + .012,
    )
    panel.castShadow = true
    panel.name = 'Procedural_Tabard'
    attachPreservingWorld(
      bodyRoot,
      findBone(bodyRoot, 'pelvis'),
      panel,
    )

    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(
        width * .16,
        length * .88,
        .008,
      ),
      materials.accent,
    )
    accent.position.set(
      0,
      fit.waistY -
        length * .5 -
        .04,
      fit.waistDepth + .024,
    )
    attachPreservingWorld(
      bodyRoot,
      findBone(bodyRoot, 'pelvis'),
      accent,
    )
  }
}

function buildCape(
  bodyRoot: THREE.Object3D,
  root: THREE.Group,
  recipe: ProceduralEquipmentRecipe,
  materials: MaterialSet,
  fit: ReturnType<typeof bodyFit>,
) {
  const cape = recipe.cape
  if (cape.length <= .02) return

  const length =
    .28 + cape.length * .78
  const topWidth =
    .34 + cape.width * .24
  const bottomWidth =
    topWidth *
    (1 + cape.flare * .7)
  const geometry = capeGeometry(
    length,
    topWidth,
    bottomWidth,
  )
  const mesh = new THREE.Mesh(
    geometry,
    materials.accentDouble,
  )
  mesh.position.set(
    0,
    fit.capeY,
    -fit.capeBack,
  )
  mesh.rotation.x = -.08
  mesh.castShadow = true
  mesh.name = 'Procedural_Cape'
  attachPreservingWorld(
    bodyRoot,
    findBone(
      bodyRoot,
      'spine_03',
      'spine_02',
    ),
    mesh,
  )
  root.userData.cape = mesh

  for (const sign of [-1, 1]) {
    const clasp = new THREE.Mesh(
      new THREE.SphereGeometry(
        .026,
        8,
        6,
      ),
      materials.metal,
    )
    clasp.position.set(
      sign * .16,
      fit.capeY + .015,
      fit.capeFront,
    )
    clasp.castShadow = true
    attachPreservingWorld(
      bodyRoot,
      findBone(
        bodyRoot,
        'spine_03',
        'spine_02',
      ),
      clasp,
    )
  }
}

function capeGeometry(
  length: number,
  topWidth: number,
  bottomWidth: number,
) {
  const columns = 4
  const rows = 6
  const positions: number[] = []
  const indices: number[] = []

  for (
    let row = 0;
    row <= rows;
    row += 1
  ) {
    const v = row / rows
    const width = THREE.MathUtils.lerp(
      topWidth,
      bottomWidth,
      v,
    )
    for (
      let column = 0;
      column <= columns;
      column += 1
    ) {
      const u = column / columns
      const x = (u - .5) * width
      const y = -v * length
      const curve =
        Math.sin((u - .5) * Math.PI) *
        .025 *
        (1 + v)
      const z =
        -curve -
        Math.sin(v * Math.PI) * .04
      positions.push(x, y, z)
    }
  }

  for (
    let row = 0;
    row < rows;
    row += 1
  ) {
    for (
      let column = 0;
      column < columns;
      column += 1
    ) {
      const a =
        row * (columns + 1) + column
      const b = a + 1
      const c = a + columns + 1
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry =
    new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      positions,
      3,
    ),
  )
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

type MaterialSet = {
  cloth: THREE.MeshStandardMaterial
  leather: THREE.MeshStandardMaterial
  leatherDark: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  metalDark: THREE.MeshStandardMaterial
  accent: THREE.MeshStandardMaterial
  accentDouble: THREE.MeshStandardMaterial
}

function createMaterialSet(
  recipe: ProceduralEquipmentRecipe,
): MaterialSet {
  const cloth =
    new THREE.MeshStandardMaterial({
      color: recipe.materials.cloth,
      roughness: .88,
      metalness: 0,
    })
  cloth.name = 'Creator Cloth'

  const leather =
    new THREE.MeshStandardMaterial({
      color: recipe.materials.leather,
      roughness: .78,
      metalness: .02,
    })
  leather.name = 'Creator Leather'

  const leatherDark = leather.clone()
  leatherDark.color.multiplyScalar(.72)
  leatherDark.name = 'Creator Dark Leather'

  const metal =
    new THREE.MeshStandardMaterial({
      color: recipe.materials.metal,
      roughness: .42,
      metalness: .82,
    })
  metal.name = 'Creator Metal'

  const metalDark = metal.clone()
  metalDark.color.multiplyScalar(.74)
  metalDark.name = 'Creator Dark Metal'

  const accent =
    new THREE.MeshStandardMaterial({
      color: recipe.materials.accent,
      roughness: .84,
      metalness: 0,
    })
  accent.name = 'Creator Accent'

  const accentDouble = accent.clone()
  accentDouble.side = THREE.DoubleSide
  accentDouble.name = 'Creator Cape'

  return {
    cloth,
    leather,
    leatherDark,
    metal,
    metalDark,
    accent,
    accentDouble,
  }
}

function bodyFit(
  bodyType: SkillboundBodyType,
) {
  return bodyType === 'female'
    ? {
        chestY: 1.285,
        neckY: 1.535,
        shoulderY: 1.46,
        shoulderX: .285,
        waistY: .985,
        waistRadius: .22,
        waistDepth: .145,
        capeY: 1.485,
        capeBack: .17,
        capeFront: .15,
      }
    : {
        chestY: 1.3,
        neckY: 1.545,
        shoulderY: 1.48,
        shoulderX: .315,
        waistY: .99,
        waistRadius: .235,
        waistDepth: .155,
        capeY: 1.5,
        capeBack: .18,
        capeFront: .16,
      }
}

function findBone(
  root: THREE.Object3D,
  ...names: string[]
) {
  for (const name of names) {
    const exact = root.getObjectByName(name)
    if (exact instanceof THREE.Bone) {
      return exact
    }
  }
  let found: THREE.Bone | undefined
  root.traverse((object) => {
    if (
      found ||
      !(object instanceof THREE.Bone)
    ) {
      return
    }
    const normalized =
      object.name.toLowerCase()
    if (
      names.some(
        (name) =>
          normalized ===
          name.toLowerCase(),
      )
    ) {
      found = object
    }
  })
  return found
}

function attachPreservingWorld(
  bodyRoot: THREE.Object3D,
  bone: THREE.Object3D | undefined,
  object: THREE.Object3D,
) {
  bodyRoot.add(object)
  bodyRoot.updateMatrixWorld(true)
  object.updateMatrixWorld(true)
  if (bone) {
    bone.updateMatrixWorld(true)
    bone.attach(object)
  }
}

function hashSeed(value: string) {
  let hash = 2166136261
  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(
      next ^ (next >>> 15),
      next | 1,
    )
    next ^= next +
      Math.imul(
        next ^ (next >>> 7),
        next | 61,
      )
    return (
      ((next ^ (next >>> 14)) >>> 0) /
      4294967296
    )
  }
}
