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
    next.chest.length = 1.02
    next.chest.looseness = .08
    next.chest.leatherVest = true
    next.chest.plateCoverage = .12
    next.chest.collarHeight = .11
    next.chest.shoulderSize = .06
    next.chest.shoulderAsymmetry = .22
    next.chest.strapCount = 2
    next.waist.beltWidth = .08
    next.waist.pouchCount = 2
    next.waist.tabardLength = .34
    next.waist.tabardWidth = .46
    next.cape.length = .46
    next.cape.width = .43
    next.cape.flare = .1
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
    next.chest.shoulderSize = .36
    next.chest.shoulderAsymmetry = 0
    next.chest.strapCount = 1
    next.waist.beltWidth = .1
    next.waist.pouchCount = 1
    next.waist.tabardLength = .34
    next.waist.tabardWidth = .3
    next.cape.length = .42
    next.cape.width = .52
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
    next.chest.shoulderSize = .24
    next.chest.shoulderAsymmetry = .08
    next.chest.strapCount = 1
    next.waist.beltWidth = .075
    next.waist.pouchCount = 1
    next.waist.tabardLength = .68
    next.waist.tabardWidth = .44
    next.cape.length = .76
    next.cape.width = .64
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
    next.chest.shoulderSize = .3
    next.chest.shoulderAsymmetry = .72
    next.chest.strapCount = 3
    next.waist.beltWidth = .11
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
    .08,
    0,
    .46,
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
    .018,
    .05,
    .14,
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
    .06,
    .26,
    .58,
  )
  next.cape.length = jitter(
    next.cape.length,
    .16,
    0,
    .9,
  )
  next.cape.width = jitter(
    next.cape.width,
    .06,
    .36,
    .72,
  )
  next.cape.flare = jitter(
    next.cape.flare,
    .07,
    0,
    .34,
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

export function disposeProceduralEquipmentVisual(
  bodyRoot: THREE.Object3D,
) {
  const objects: THREE.Object3D[] = []
  const materials = new Set<THREE.Material>()
  bodyRoot.traverse((object) => {
    if (!object.userData.proceduralEquipment) {
      return
    }
    objects.push(object)
    if (object instanceof THREE.Mesh) {
      object.geometry?.dispose()
      const list = Array.isArray(object.material)
        ? object.material
        : [object.material]
      list.forEach((material) => {
        if (material) materials.add(material)
      })
    }
  })
  objects
    .sort((a, b) => depthOf(b) - depthOf(a))
    .forEach((object) => object.removeFromParent())
  materials.forEach((material) => material.dispose())
  const marker = bodyRoot.getObjectByName(
    '__forge_procedural_equipment',
  )
  marker?.removeFromParent()
}

function buildChest(
  bodyRoot: THREE.Object3D,
  root: THREE.Group,
  recipe: ProceduralEquipmentRecipe,
  materials: MaterialSet,
  fit: ReturnType<typeof bodyFit>,
) {
  const chest = recipe.chest
  const topY = fit.neckY - .105
  const bottomY = THREE.MathUtils.clamp(
    fit.waistY + .015 -
      (chest.length - .85) * .22,
    fit.waistY - .09,
    fit.waistY + .11,
  )
  const shellOffset =
    .006 + chest.looseness * .035

  const shell = new THREE.Mesh(
    fittedGarmentTorsoGeometry(
      fit,
      bottomY,
      topY,
      chest.width,
      chest.depth,
      chest.looseness,
    ),
    materials.cloth,
  )
  shell.castShadow = true
  shell.receiveShadow = false
  shell.name = 'Procedural_Tunic'
  attachPreservingWorld(
    bodyRoot,
    findBone(bodyRoot, 'spine_02', 'spine_03'),
    shell,
  )
  root.userData.chestShell = shell

  if (chest.leatherVest) {
    buildVestPanels(
      bodyRoot,
      materials,
      fit,
      chest.width,
      chest.depth,
      topY,
      bottomY,
      shellOffset,
    )
  }

  buildSleeve(
    bodyRoot,
    materials,
    fit,
    'L',
    chest.looseness,
  )
  buildSleeve(
    bodyRoot,
    materials,
    fit,
    'R',
    chest.looseness,
  )

  const plateCoverage =
    THREE.MathUtils.clamp(
      chest.plateCoverage,
      0,
      1,
    )
  if (plateCoverage > .025) {
    const plateWidth =
      (.18 + plateCoverage * .19) *
      chest.width
    const plateHeight =
      .1 + plateCoverage * .18
    const plate = new THREE.Mesh(
      ovalArmorPanelGeometry(
        plateWidth,
        plateHeight,
        .024 + plateCoverage * .018,
      ),
      materials.metal,
    )
    const plateY =
      fit.chestY + .055
    const chestSurfaceZ =
      sampleBodySurfaceZ(
        bodyRoot,
        plateY,
        0,
        'front',
        .14,
        .12,
      ) ??
      fit.chestFront
    plate.position.set(
      0,
      plateY,
      chestSurfaceZ +
        shellOffset +
        .008,
    )
    plate.rotation.x = -.045
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

    if (plateCoverage > .32) {
      const lowerPlate = new THREE.Mesh(
        ovalArmorPanelGeometry(
          plateWidth * .78,
          plateHeight * .3,
          .014,
        ),
        materials.metalDark,
      )
      const lowerPlateY =
        fit.chestY -
        plateHeight * .55
      const lowerChestSurfaceZ =
        sampleBodySurfaceZ(
          bodyRoot,
          lowerPlateY,
          0,
          'front',
          .14,
          .12,
        ) ??
        fit.chestFront
      lowerPlate.position.set(
        0,
        lowerPlateY,
        lowerChestSurfaceZ +
          shellOffset +
          .006,
      )
      lowerPlate.castShadow = true
      lowerPlate.name =
        'Procedural_LowerBreastPlate'
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
  }

  buildShoulderYoke(
    bodyRoot,
    materials,
    fit,
    chest.width,
  )

  if (chest.collarHeight > .02) {
    buildCollarBand(
      bodyRoot,
      materials,
      fit,
      chest.collarHeight,
    )
  }

  const shoulderBase = chest.shoulderSize
  if (shoulderBase > .025) {
    buildShoulder(
      bodyRoot,
      recipe,
      materials,
      fit,
      'L',
      shoulderBase *
        (1 +
          chest.shoulderAsymmetry *
            .32),
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
            .28),
    )
  }

  const strapCount = Math.max(
    0,
    Math.min(
      4,
      Math.round(chest.strapCount),
    ),
  )
  const strapHeight =
    (topY - bottomY) * .46
  for (
    let index = 0;
    index < strapCount;
    index += 1
  ) {
    const spread =
      strapCount === 1
        ? 0
        : (index / (strapCount - 1) - .5) *
          .16
    const strap = new THREE.Mesh(
      curvedPanelGeometry(
        .016,
        strapHeight,
        .009,
        .1,
      ),
      materials.leatherDark,
    )
    strap.position.set(
      spread,
      fit.chestY + .018 -
        Math.abs(spread) * .05,
      fit.chestFront +
        shellOffset +
        .008,
    )
    strap.rotation.z =
      (index % 2 === 0 ? 1 : -1) *
      (.12 + index * .018)
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
  const anchor =
    findBone(
      bodyRoot,
      `upperarm_${side}`,
      `clavicle_${side}`,
      'spine_03',
    )
  const anchorPosition =
    objectPositionInBody(
      bodyRoot,
      anchor,
      new THREE.Vector3(
        sign * fit.shoulderX,
        fit.shoulderY,
        0,
      ),
    )

  const width =
    .072 + amount * .095
  const depth =
    .085 + amount * .06
  const height =
    .027 + amount * .025

  const shoulder = new THREE.Mesh(
    new THREE.SphereGeometry(
      1,
      18,
      8,
      0,
      Math.PI * 2,
      0,
      Math.PI * .46,
    ),
    materials.metal,
  )
  shoulder.scale.set(
    width,
    height,
    depth,
  )
  shoulder.position.copy(
    anchorPosition,
  )
  shoulder.position.x +=
    sign * (.008 + amount * .006)
  shoulder.position.y += .012
  shoulder.position.z -= .004
  shoulder.rotation.set(
    -.17,
    sign * -.06,
    sign * -.23,
  )
  shoulder.castShadow = true
  shoulder.name =
    `Procedural_Shoulder_${side}`
  attachPreservingWorld(
    bodyRoot,
    anchor,
    shoulder,
  )

  if (amount > .3) {
    const lower = new THREE.Mesh(
      new THREE.SphereGeometry(
        1,
        16,
        7,
        0,
        Math.PI * 2,
        0,
        Math.PI * .38,
      ),
      materials.metalDark,
    )
    lower.scale.set(
      width * .72,
      height * .52,
      depth * .74,
    )
    lower.position.copy(
      anchorPosition,
    )
    lower.position.x +=
      sign * (.014 + amount * .008)
    lower.position.y -= .026
    lower.position.z -= .012
    lower.rotation.set(
      -.22,
      sign * -.05,
      sign * -.27,
    )
    lower.castShadow = true
    lower.name =
      `Procedural_ShoulderLower_${side}`
    attachPreservingWorld(
      bodyRoot,
      anchor,
      lower,
    )
  }

  void recipe
}

function buildSleeve(
  bodyRoot: THREE.Object3D,
  materials: MaterialSet,
  fit: ReturnType<typeof bodyFit>,
  side: 'L' | 'R',
  looseness: number,
) {
  const upper =
    findBone(bodyRoot, `upperarm_${side}`)
  const lower =
    findBone(
      bodyRoot,
      `lowerarm_${side}`,
      `forearm_${side}`,
    )
  if (!upper || !lower) return

  const start = objectPositionInBody(
    bodyRoot,
    upper,
  )
  const end = objectPositionInBody(
    bodyRoot,
    lower,
  )
  const direction =
    end.clone().sub(start)
  const armLength = direction.length()
  if (armLength < .05) return
  direction.normalize()

  const sleeveLength =
    Math.min(
      .145,
      armLength * .34,
    )
  const center = start
    .clone()
    .addScaledVector(
      direction,
      sleeveLength * .52,
    )
  const radius =
    fit.armRadius *
    (1 + looseness * .8)

  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radius * .98,
      radius * .9,
      sleeveLength,
      16,
      1,
      true,
    ),
    materials.clothDouble,
  )
  sleeve.position.copy(center)
  sleeve.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction,
  )
  sleeve.castShadow = true
  sleeve.name =
    `Procedural_Sleeve_${side}`
  attachPreservingWorld(
    bodyRoot,
    upper,
    sleeve,
  )

  const cuffCenter = start
    .clone()
    .addScaledVector(
      direction,
      sleeveLength * .94,
    )
  const cuff = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radius * .945,
      radius * .92,
      .022,
      16,
      1,
      true,
    ),
    materials.leatherDark,
  )
  cuff.position.copy(cuffCenter)
  cuff.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction,
  )
  cuff.castShadow = true
  cuff.name =
    `Procedural_SleeveTrim_${side}`
  attachPreservingWorld(
    bodyRoot,
    upper,
    cuff,
  )
}

function buildWaist(
  bodyRoot: THREE.Object3D,
  root: THREE.Group,
  recipe: ProceduralEquipmentRecipe,
  materials: MaterialSet,
  fit: ReturnType<typeof bodyFit>,
) {
  const waist = recipe.waist
  const pelvis =
    findBone(
      bodyRoot,
      'pelvis',
      'spine_01',
    )

  const beltHeight =
    Math.max(
      .034,
      waist.beltWidth * .46,
    )
  const belt = new THREE.Mesh(
    beltBandGeometry(
      fit.waistRadius * 1.005,
      fit.waistDepth * 1.015,
      beltHeight,
      .005,
    ),
    materials.leather,
  )
  belt.position.set(
    0,
    fit.waistY + .006,
    0,
  )
  belt.castShadow = true
  belt.name = 'Procedural_BeltBand'
  attachPreservingWorld(
    bodyRoot,
    pelvis,
    belt,
  )
  root.userData.belt = belt

  const buckle = new THREE.Mesh(
    roundedPlateGeometry(
      .052,
      .043,
      .008,
      .018,
    ),
    materials.metal,
  )
  buckle.position.set(
    0,
    fit.waistY + .006,
    fit.waistDepth + .011,
  )
  buckle.castShadow = true
  buckle.name = 'Procedural_Buckle'
  attachPreservingWorld(
    bodyRoot,
    pelvis,
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
    const angle =
      side * (.76 + row * .22)
    const radiusX =
      fit.waistRadius * .985
    const radiusZ =
      fit.waistDepth * .99
    const pouch = new THREE.Mesh(
      roundedPlateGeometry(
        .068,
        .085,
        .028,
        .022,
      ),
      materials.leatherDark,
    )
    pouch.position.set(
      Math.sin(angle) * radiusX,
      fit.waistY - .052,
      Math.cos(angle) * radiusZ,
    )
    pouch.rotation.y = angle
    pouch.rotation.z =
      side * .055
    pouch.castShadow = true
    pouch.name =
      `Procedural_Pouch_${index}`
    attachPreservingWorld(
      bodyRoot,
      pelvis,
      pouch,
    )
  }

  if (waist.tabardLength > .02) {
    const length =
      .13 +
      waist.tabardLength * .42
    const topWidth =
      .15 +
      waist.tabardWidth * .32
    const bottomWidth =
      topWidth * .72

    const panel = new THREE.Mesh(
      clothPanelGeometry(
        length,
        topWidth,
        bottomWidth,
        .011,
        .032,
      ),
      materials.clothDouble,
    )
    panel.position.set(
      0,
      fit.waistY - .014,
      fit.waistDepth + .006,
    )
    panel.castShadow = true
    panel.name = 'Procedural_Tabard'
    attachPreservingWorld(
      bodyRoot,
      pelvis,
      panel,
    )

    const accent = new THREE.Mesh(
      clothPanelGeometry(
        length * .84,
        topWidth * .1,
        bottomWidth * .13,
        .012,
        .018,
      ),
      materials.accentDouble,
    )
    accent.position.set(
      0,
      fit.waistY - .04,
      fit.waistDepth + .012,
    )
    accent.name =
      'Procedural_TabardAccent'
    attachPreservingWorld(
      bodyRoot,
      pelvis,
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
    .2 + cape.length * .66
  const topWidth =
    .22 + cape.width * .15
  const bottomWidth =
    topWidth *
    (1.06 + cape.flare * .38)
  const geometry = capeGeometry(
    length,
    topWidth,
    bottomWidth,
    cape.flare,
  )
  const mesh = new THREE.Mesh(
    geometry,
    materials.accentDouble,
  )
  const capeY =
    fit.capeY - .018
  const upperBackSurfaceZ =
    sampleBodySurfaceZ(
      bodyRoot,
      capeY,
      0,
      'back',
      .18,
      .12,
    ) ??
    -fit.capeBack
  mesh.position.set(
    0,
    capeY,
    upperBackSurfaceZ - .008,
  )
  mesh.rotation.x = .008
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
        .022,
        10,
        7,
      ),
      materials.metal,
    )
    clasp.scale.z = .55
    const claspY =
      fit.capeY - .004
    const claspX =
      sign * .145
    const claspSurfaceZ =
      sampleBodySurfaceZ(
        bodyRoot,
        claspY,
        claspX,
        'front',
        .08,
        .1,
      ) ??
      fit.capeFront
    clasp.position.set(
      claspX,
      claspY,
      claspSurfaceZ + .006,
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

function buildVestPanels(
  bodyRoot: THREE.Object3D,
  materials: MaterialSet,
  fit: ReturnType<typeof bodyFit>,
  widthScale: number,
  depthScale: number,
  topY: number,
  bottomY: number,
  offset: number,
) {
  const spine =
    findBone(
      bodyRoot,
      'spine_03',
      'spine_02',
    )
  const height =
    Math.max(
      .22,
      (topY - bottomY) * .72,
    )
  const panelWidth =
    .115 * widthScale
  const sampledFrontZ =
    sampleBodySurfaceZ(
      bodyRoot,
      fit.chestY,
      0,
      'front',
      .16,
      .18,
    ) ??
    fit.chestFront
  const frontZ =
    sampledFrontZ *
      depthScale +
    offset +
    .004

  for (const sign of [-1, 1]) {
    const panel = new THREE.Mesh(
      curvedPanelGeometry(
        panelWidth,
        height,
        .016,
        .28,
      ),
      materials.leather,
    )
    panel.position.set(
      sign * .085 * widthScale,
      fit.chestY - .015,
      frontZ,
    )
    panel.rotation.set(
      -.025,
      sign * -.025,
      sign * -.08,
    )
    panel.castShadow = true
    panel.name =
      sign < 0
        ? 'Procedural_VestLeft'
        : 'Procedural_VestRight'
    attachPreservingWorld(
      bodyRoot,
      spine,
      panel,
    )
  }

  const lower = new THREE.Mesh(
    curvedPanelGeometry(
      .245 * widthScale,
      .075,
      .01,
      .18,
    ),
    materials.leatherDark,
  )
  lower.position.set(
    0,
    bottomY + .055,
    fit.waistDepth + .018,
  )
  lower.castShadow = true
  lower.name = 'Procedural_VestLower'
  attachPreservingWorld(
    bodyRoot,
    spine,
    lower,
  )
}

function ovalArmorPanelGeometry(
  width: number,
  height: number,
  bulge: number,
) {
  const columns = 14
  const rows = 10
  const positions: number[] = []
  const indices: number[] = []
  const uvs: number[] = []

  for (
    let row = 0;
    row <= rows;
    row += 1
  ) {
    const v = row / rows
    const yn = v * 2 - 1
    const rowWidth =
      width *
      (.58 +
        .42 *
          Math.sqrt(
            Math.max(
              0,
              1 - yn * yn,
            ),
          ))
    for (
      let column = 0;
      column <= columns;
      column += 1
    ) {
      const u = column / columns
      const centered = u - .5
      const edge =
        Math.abs(centered) * 2
      const x = centered * rowWidth
      const y =
        (.5 - v) * height
      const dome =
        Math.max(
          0,
          1 - edge * edge,
        ) *
        Math.max(
          0,
          1 - yn * yn,
        )
      const z =
        Math.sqrt(dome) *
        bulge
      positions.push(x, y, z)
      uvs.push(u, 1 - v)
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
      const c0 =
        a + columns + 1
      const d = c0 + 1
      indices.push(
        a,
        c0,
        b,
        b,
        c0,
        d,
      )
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
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      uvs,
      2,
    ),
  )
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function buildShoulderYoke(
  bodyRoot: THREE.Object3D,
  materials: MaterialSet,
  fit: ReturnType<typeof bodyFit>,
  widthScale: number,
) {
  const front = new THREE.Mesh(
    curvedPanelGeometry(
      .41 * widthScale,
      .072,
      .016,
      .18,
    ),
    materials.cloth,
  )
  front.position.set(
    0,
    fit.shoulderY - .015,
    fit.chestFront + .006,
  )
  front.rotation.x = -.13
  front.castShadow = true
  front.name = 'Procedural_ShoulderYokeFront'
  attachPreservingWorld(
    bodyRoot,
    findBone(
      bodyRoot,
      'spine_03',
      'spine_02',
    ),
    front,
  )

  const back = new THREE.Mesh(
    curvedPanelGeometry(
      .39 * widthScale,
      .062,
      .013,
      .16,
    ),
    materials.cloth,
  )
  back.position.set(
    0,
    fit.shoulderY - .012,
    -fit.upperBack,
  )
  back.rotation.set(
    .13,
    Math.PI,
    0,
  )
  back.castShadow = true
  back.name = 'Procedural_ShoulderYokeBack'
  attachPreservingWorld(
    bodyRoot,
    findBone(
      bodyRoot,
      'spine_03',
      'spine_02',
    ),
    back,
  )
}

function buildCollarBand(
  bodyRoot: THREE.Object3D,
  materials: MaterialSet,
  fit: ReturnType<typeof bodyFit>,
  height: number,
) {
  const collarHeight =
    .042 + height * .09
  const front = new THREE.Mesh(
    curvedPanelGeometry(
      .25 + height * .08,
      collarHeight,
      .012,
      .2,
    ),
    materials.leather,
  )
  front.position.set(
    0,
    fit.neckY - .045,
    fit.neckFront,
  )
  front.rotation.x = -.16
  front.castShadow = true
  front.name = 'Procedural_CollarFront'
  attachPreservingWorld(
    bodyRoot,
    findBone(
      bodyRoot,
      'neck_01',
      'spine_03',
    ),
    front,
  )

  const back = new THREE.Mesh(
    curvedPanelGeometry(
      .24 + height * .07,
      collarHeight * .9,
      .01,
      .18,
    ),
    materials.leatherDark,
  )
  back.position.set(
    0,
    fit.neckY - .043,
    -fit.neckBack,
  )
  back.rotation.set(
    .16,
    Math.PI,
    0,
  )
  back.castShadow = true
  back.name = 'Procedural_CollarBack'
  attachPreservingWorld(
    bodyRoot,
    findBone(
      bodyRoot,
      'neck_01',
      'spine_03',
    ),
    back,
  )
}

function beltBandGeometry(
  radiusX: number,
  radiusZ: number,
  height: number,
  offset: number,
) {
  const segments = 40
  const positions: number[] = []
  const indices: number[] = []
  const uvs: number[] = []

  for (
    let row = 0;
    row <= 1;
    row += 1
  ) {
    const y =
      (row - .5) * height
    for (
      let index = 0;
      index <= segments;
      index += 1
    ) {
      const u = index / segments
      const angle =
        u * Math.PI * 2
      const sx = Math.sin(angle)
      const cz = Math.cos(angle)
      const normal = new THREE.Vector2(
        sx / Math.max(.001, radiusX),
        cz / Math.max(.001, radiusZ),
      ).normalize()
      positions.push(
        sx * radiusX +
          normal.x * offset,
        y,
        cz * radiusZ +
          normal.y * offset,
      )
      uvs.push(u, row)
    }
  }

  for (
    let index = 0;
    index < segments;
    index += 1
  ) {
    const a = index
    const b = index + 1
    const d =
      segments + 1 + index
    const e = d + 1
    indices.push(
      a,
      d,
      b,
      b,
      d,
      e,
    )
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
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      uvs,
      2,
    ),
  )
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function roundedPlateGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
) {
  const shape = new THREE.Shape()
  const x = width * .5
  const y = height * .5
  const r = Math.min(
    radius,
    x * .8,
    y * .8,
  )

  shape.moveTo(-x + r, -y)
  shape.lineTo(x - r, -y)
  shape.quadraticCurveTo(
    x,
    -y,
    x,
    -y + r,
  )
  shape.lineTo(x, y - r)
  shape.quadraticCurveTo(
    x,
    y,
    x - r,
    y,
  )
  shape.lineTo(-x + r, y)
  shape.quadraticCurveTo(
    -x,
    y,
    -x,
    y - r,
  )
  shape.lineTo(-x, -y + r)
  shape.quadraticCurveTo(
    -x,
    -y,
    -x + r,
    -y,
  )

  const geometry =
    new THREE.ExtrudeGeometry(
      shape,
      {
        depth,
        bevelEnabled: true,
        bevelSize: .003,
        bevelThickness: .003,
        bevelSegments: 1,
        steps: 1,
      },
    )
  geometry.center()
  return geometry
}

function capeGeometry(
  length: number,
  topWidth: number,
  bottomWidth: number,
  flare: number,
) {
  const columns = 10
  const rows = 14
  const positions: number[] = []
  const indices: number[] = []
  const uvs: number[] = []

  for (
    let row = 0;
    row <= rows;
    row += 1
  ) {
    const v = row / rows
    const eased =
      v * v * (3 - 2 * v)
    const width =
      THREE.MathUtils.lerp(
        topWidth,
        bottomWidth,
        eased,
      )
    const hemLift =
      v > .88
        ? Math.pow(
            (v - .88) / .12,
            2,
          ) *
          .035
        : 0

    for (
      let column = 0;
      column <= columns;
      column += 1
    ) {
      const u = column / columns
      const centered = u - .5
      const x = centered * width
      const edge =
        Math.abs(centered) * 2
      const fold =
        Math.sin(
          u * Math.PI * 5,
        ) *
        (.008 +
          v *
            (.018 + flare * .018))
      const shoulderCurve =
        Math.pow(edge, 1.55) *
        (.009 + v * .012)
      const hang =
        Math.sin(v * Math.PI) *
        (.018 + flare * .025)
      const shoulderDrop =
        Math.pow(edge, 1.7) *
        .025 *
        (1 - v)
      const y =
        -v * length -
        shoulderDrop +
        hemLift *
          (1 -
            Math.cos(
              centered * Math.PI * 2,
            ) *
              .18)
      const z =
        (1 - v) * .018 -
        fold -
        shoulderCurve -
        hang
      positions.push(x, y, z)
      uvs.push(u, 1 - v)
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
        row * (columns + 1) +
        column
      const b = a + 1
      const c0 = a + columns + 1
      const d = c0 + 1
      indices.push(
        a,
        c0,
        b,
        b,
        c0,
        d,
      )
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
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      uvs,
      2,
    ),
  )
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function clothPanelGeometry(
  length: number,
  topWidth: number,
  bottomWidth: number,
  curve: number,
  hemPoint: number,
) {
  const columns = 6
  const rows = 9
  const positions: number[] = []
  const indices: number[] = []
  const uvs: number[] = []

  for (
    let row = 0;
    row <= rows;
    row += 1
  ) {
    const v = row / rows
    const width =
      THREE.MathUtils.lerp(
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
      const centered = u - .5
      const edge =
        Math.abs(centered) * 2
      const x = centered * width
      const point =
        v > .76
          ? hemPoint *
            Math.pow(
              (v - .76) / .24,
              2,
            ) *
            (1 - edge * .55)
          : 0
      const y =
        -v * length - point
      const z =
        Math.sin(u * Math.PI) *
        curve *
        (.35 + v * .65)
      positions.push(x, y, z)
      uvs.push(u, 1 - v)
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
        row * (columns + 1) +
        column
      const b = a + 1
      const c0 = a + columns + 1
      const d = c0 + 1
      indices.push(
        a,
        c0,
        b,
        b,
        c0,
        d,
      )
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
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      uvs,
      2,
    ),
  )
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function curvedPanelGeometry(
  width: number,
  height: number,
  bulge: number,
  taper: number,
) {
  const columns = 8
  const rows = 6
  const positions: number[] = []
  const indices: number[] = []
  const uvs: number[] = []

  for (
    let row = 0;
    row <= rows;
    row += 1
  ) {
    const v = row / rows
    const rowWidth =
      width *
      (1 -
        taper *
          Math.abs(v - .5) *
          1.1)
    for (
      let column = 0;
      column <= columns;
      column += 1
    ) {
      const u = column / columns
      const centered = u - .5
      const x = centered * rowWidth
      const y = (.5 - v) * height
      const z =
        Math.cos(
          centered * Math.PI,
        ) *
        bulge
      positions.push(x, y, z)
      uvs.push(u, 1 - v)
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
        row * (columns + 1) +
        column
      const b = a + 1
      const c0 = a + columns + 1
      const d = c0 + 1
      indices.push(
        a,
        c0,
        b,
        b,
        c0,
        d,
      )
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
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      uvs,
      2,
    ),
  )
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function fittedGarmentTorsoGeometry(
  fit: ReturnType<typeof bodyFit>,
  bottomY: number,
  topY: number,
  widthScale: number,
  depthScale: number,
  looseness: number,
) {
  const rings = 14
  const segments = 32
  const positions: number[] = []
  const indices: number[] = []
  const uvs: number[] = []

  for (
    let ring = 0;
    ring <= rings;
    ring += 1
  ) {
    const t = ring / rings
    const y = THREE.MathUtils.lerp(
      bottomY,
      topY,
      t,
    )

    const waistBlend =
      THREE.MathUtils.smoothstep(
        t,
        0,
        .55,
      )
    const upperBlend =
      THREE.MathUtils.smoothstep(
        t,
        .58,
        1,
      )
    const bustBlend =
      Math.exp(
        -Math.pow(
          (t - .67) / .2,
          2,
        ),
      )

    const baseX =
      THREE.MathUtils.lerp(
        fit.waistRadius * .96,
        fit.torsoX * .9,
        waistBlend,
      )
    const radiusX =
      THREE.MathUtils.lerp(
        baseX,
        fit.torsoX * .78,
        upperBlend,
      ) *
      widthScale *
      (1 + looseness * .72)

    const frontBase =
      THREE.MathUtils.lerp(
        fit.waistDepth * .94,
        fit.chestFront * .9,
        waistBlend,
      )
    const frontRadius =
      THREE.MathUtils.lerp(
        frontBase +
          bustBlend * fit.bustDepth,
        fit.chestFront * .72,
        upperBlend,
      ) *
      depthScale *
      (1 + looseness * .58)

    const backBase =
      THREE.MathUtils.lerp(
        fit.waistDepth * .9,
        fit.upperBack * 1.08,
        waistBlend,
      )
    const backRadius =
      THREE.MathUtils.lerp(
        backBase,
        fit.upperBack * .9,
        upperBlend,
      ) *
      depthScale *
      (1 + looseness * .45)

    for (
      let segment = 0;
      segment < segments;
      segment += 1
    ) {
      const u = segment / segments
      const angle = u * Math.PI * 2
      const sx = Math.sin(angle)
      const cz = Math.cos(angle)
      const zRadius =
        cz >= 0
          ? frontRadius
          : backRadius
      const sideFlatten =
        1 -
        Math.pow(
          Math.abs(sx),
          3,
        ) *
          .045
      positions.push(
        sx * radiusX,
        y,
        cz * zRadius * sideFlatten,
      )
      uvs.push(u, t)
    }
  }

  for (
    let ring = 0;
    ring < rings;
    ring += 1
  ) {
    for (
      let segment = 0;
      segment < segments;
      segment += 1
    ) {
      const next =
        (segment + 1) % segments
      const a =
        ring * segments + segment
      const b =
        ring * segments + next
      const c0 =
        (ring + 1) * segments + segment
      const d =
        (ring + 1) * segments + next
      indices.push(
        a,
        c0,
        b,
        b,
        c0,
        d,
      )
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
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      uvs,
      2,
    ),
  )
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}


type BodyShellOptions = {
  name: string
  minY: number
  maxY: number
  maxAbsX: number
  widthScale: number
  depthScale: number
  offset: number
  frontOnly?: boolean
  sideAllowance?: number
}

function createBodyDerivedShell(
  bodyRoot: THREE.Object3D,
  material: THREE.Material,
  options: BodyShellOptions,
) {
  const source =
    findPrimaryBodyMesh(bodyRoot)
  if (!source) return undefined

  const geometry = source.geometry
  const position =
    geometry.getAttribute('position')
  const normal =
    geometry.getAttribute('normal')
  const skinIndex =
    geometry.getAttribute('skinIndex')
  const skinWeight =
    geometry.getAttribute('skinWeight')
  if (
    !position ||
    !normal ||
    !skinIndex ||
    !skinWeight
  ) {
    return undefined
  }

  bodyRoot.updateMatrixWorld(true)
  source.updateMatrixWorld(true)
  const inverseBody =
    bodyRoot.matrixWorld
      .clone()
      .invert()
  const sourceToBody =
    inverseBody.multiply(
      source.matrixWorld,
    )

  const outPosition: number[] = []
  const outNormal: number[] = []
  const outSkinIndex: number[] = []
  const outSkinWeight: number[] = []
  const outUv: number[] = []
  const uv = geometry.getAttribute('uv')
  const index = geometry.index
  const triangleCount = index
    ? index.count / 3
    : position.count / 3
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const d = new THREE.Vector3()
  const center = new THREE.Vector3()
  const local = new THREE.Vector3()
  const localNormal =
    new THREE.Vector3()

  const vertexIndex = (
    triangle: number,
    corner: number,
  ) =>
    index
      ? index.getX(
          triangle * 3 + corner,
        )
      : triangle * 3 + corner

  for (
    let triangle = 0;
    triangle < triangleCount;
    triangle += 1
  ) {
    const ia = vertexIndex(triangle, 0)
    const ib = vertexIndex(triangle, 1)
    const ic = vertexIndex(triangle, 2)
    a.fromBufferAttribute(
      position as THREE.BufferAttribute,
      ia,
    ).applyMatrix4(sourceToBody)
    b.fromBufferAttribute(
      position as THREE.BufferAttribute,
      ib,
    ).applyMatrix4(sourceToBody)
    d.fromBufferAttribute(
      position as THREE.BufferAttribute,
      ic,
    ).applyMatrix4(sourceToBody)
    center
      .copy(a)
      .add(b)
      .add(d)
      .multiplyScalar(1 / 3)

    if (
      center.y < options.minY ||
      center.y > options.maxY ||
      Math.abs(center.x) >
        options.maxAbsX
    ) {
      continue
    }
    if (
      options.frontOnly &&
      center.z <
        -(options.sideAllowance ?? .04)
    ) {
      continue
    }

    for (
      const sourceIndex of [ia, ib, ic]
    ) {
      local.fromBufferAttribute(
        position as THREE.BufferAttribute,
        sourceIndex,
      )
      localNormal.fromBufferAttribute(
        normal as THREE.BufferAttribute,
        sourceIndex,
      )
      local.x *= options.widthScale
      local.z *= options.depthScale
      local.addScaledVector(
        localNormal,
        options.offset,
      )
      outPosition.push(
        local.x,
        local.y,
        local.z,
      )
      outNormal.push(
        localNormal.x,
        localNormal.y,
        localNormal.z,
      )
      for (
        let component = 0;
        component < 4;
        component += 1
      ) {
        outSkinIndex.push(
          skinIndex.getComponent(
            sourceIndex,
            component,
          ),
        )
        outSkinWeight.push(
          skinWeight.getComponent(
            sourceIndex,
            component,
          ),
        )
      }
      if (uv) {
        outUv.push(
          uv.getX(sourceIndex),
          uv.getY(sourceIndex),
        )
      }
    }
  }

  if (!outPosition.length) {
    return undefined
  }

  const shellGeometry =
    new THREE.BufferGeometry()
  shellGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      outPosition,
      3,
    ),
  )
  shellGeometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      outNormal,
      3,
    ),
  )
  shellGeometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(
      outSkinIndex,
      4,
    ),
  )
  shellGeometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(
      outSkinWeight,
      4,
    ),
  )
  if (outUv.length) {
    shellGeometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        outUv,
        2,
      ),
    )
  }
  shellGeometry.computeBoundingSphere()

  const shell = new THREE.SkinnedMesh(
    shellGeometry,
    material,
  )
  shell.name = options.name
  shell.bindMode = source.bindMode
  shell.position.copy(source.position)
  shell.quaternion.copy(
    source.quaternion,
  )
  shell.scale.copy(source.scale)
  shell.bind(
    source.skeleton,
    source.bindMatrix.clone(),
  )
  shell.castShadow = true
  shell.receiveShadow = false
  shell.frustumCulled = false
  shell.userData.proceduralEquipment =
    true
  source.parent?.add(shell)
  return shell
}

function findPrimaryBodyMesh(
  root: THREE.Object3D,
) {
  let best:
    | THREE.SkinnedMesh
    | undefined
  let bestScore = -1

  root.traverse((object) => {
    if (
      !(object instanceof THREE.SkinnedMesh)
    ) {
      return
    }
    const geometry = object.geometry
    if (
      !geometry?.getAttribute('position') ||
      !geometry.getAttribute('skinIndex') ||
      !geometry.getAttribute('skinWeight')
    ) {
      return
    }

    const lower =
      object.name.toLowerCase()
    if (
      lower.includes('optional') ||
      lower.includes('eye') ||
      lower.includes('teeth') ||
      lower.includes('hair')
    ) {
      return
    }

    const count =
      geometry.getAttribute('position').count
    const score =
      count +
      (lower.includes('body')
        ? 1000000
        : 0)
    if (score > bestScore) {
      bestScore = score
      best = object
    }
  })
  return best
}

type MaterialSet = {
  cloth: THREE.MeshStandardMaterial
  clothDouble: THREE.MeshStandardMaterial
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

  const clothDouble = cloth.clone()
  clothDouble.side = THREE.DoubleSide
  clothDouble.name = 'Creator Cloth Double'

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
    clothDouble,
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
        torsoX: .305,
        chestFront: .17,
        bustDepth: .026,
        upperBack: .115,
        neckFront: .122,
        neckBack: .105,
        armRadius: .066,
        waistY: .985,
        waistRadius: .22,
        waistDepth: .145,
        capeY: 1.485,
        capeBack: .125,
        capeFront: .15,
      }
    : {
        chestY: 1.3,
        neckY: 1.545,
        shoulderY: 1.48,
        shoulderX: .315,
        torsoX: .335,
        chestFront: .185,
        bustDepth: .008,
        upperBack: .125,
        neckFront: .13,
        neckBack: .112,
        armRadius: .073,
        waistY: .99,
        waistRadius: .235,
        waistDepth: .155,
        capeY: 1.5,
        capeBack: .135,
        capeFront: .16,
      }
}

function sampleBodySurfaceZ(
  bodyRoot: THREE.Object3D,
  targetY: number,
  targetX: number,
  side: 'front' | 'back',
  xRadius = .12,
  yRadius = .1,
) {
  const source =
    findPrimaryBodyMesh(bodyRoot)
  if (!source) return undefined

  const position =
    source.geometry.getAttribute(
      'position',
    )
  if (!position) return undefined

  bodyRoot.updateMatrixWorld(true)
  source.updateMatrixWorld(true)

  const sourceToBody =
    bodyRoot.matrixWorld
      .clone()
      .invert()
      .multiply(
        source.matrixWorld,
      )

  const point =
    new THREE.Vector3()
  let best:
    | number
    | undefined
  let bestDistance =
    Number.POSITIVE_INFINITY

  for (
    let index = 0;
    index < position.count;
    index += 1
  ) {
    point
      .fromBufferAttribute(
        position as THREE.BufferAttribute,
        index,
      )
      .applyMatrix4(sourceToBody)

    const dx =
      Math.abs(point.x - targetX)
    const dy =
      Math.abs(point.y - targetY)
    if (
      dx > xRadius ||
      dy > yRadius
    ) {
      continue
    }

    const distance =
      (dx / xRadius) ** 2 +
      (dy / yRadius) ** 2

    if (
      best === undefined ||
      distance <
        bestDistance * .72
    ) {
      best = point.z
      bestDistance = distance
      continue
    }

    if (
      distance <=
      bestDistance * 1.28
    ) {
      best =
        side === 'front'
          ? Math.max(
              best,
              point.z,
            )
          : Math.min(
              best,
              point.z,
            )
    }
  }

  return best
}

function objectPositionInBody(
  bodyRoot: THREE.Object3D,
  object: THREE.Object3D | undefined,
  fallback = new THREE.Vector3(),
) {
  if (!object) return fallback.clone()
  bodyRoot.updateMatrixWorld(true)
  object.updateMatrixWorld(true)
  const world =
    object.getWorldPosition(
      new THREE.Vector3(),
    )
  return bodyRoot.worldToLocal(world)
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
  object.userData.proceduralEquipment = true
  bodyRoot.add(object)
  bodyRoot.updateMatrixWorld(true)
  object.updateMatrixWorld(true)
  if (bone) {
    bone.updateMatrixWorld(true)
    bone.attach(object)
  }
}

function depthOf(object: THREE.Object3D) {
  let depth = 0
  let parent = object.parent
  while (parent) {
    depth += 1
    parent = parent.parent
  }
  return depth
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
