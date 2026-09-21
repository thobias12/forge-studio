// @ts-nocheck
import * as THREE from 'three'

type EnemyMode = 'overworld' | 'dungeon'

type EnemyProjectile = {
  mesh: THREE.Group
  velocity: THREE.Vector3
  source: THREE.Vector3
  damage: number
  radius: number
  age: number
  lifetime: number
  color: string
  previous: THREE.Vector3
}

const DEFAULT_ROLE_POISE = {
  skirmisher: 44,
  brute: 120,
  ranged: 34,
  caster: 46,
} as const

function hashUnit(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function roleOf(definition: any) {
  return definition?.role ?? 'skirmisher'
}

function styleOf(definition: any) {
  return definition?.attackStyle ?? 'melee'
}

function preferredRange(definition: any) {
  const role = roleOf(definition)
  if (Number.isFinite(definition?.preferredRange)) {
    return Math.max(.8, Number(definition.preferredRange))
  }
  if (role === 'ranged') return Math.max(4.5, definition?.attackRange * .82)
  if (role === 'caster') return Math.max(4.2, definition?.attackRange * .8)
  return Math.max(.9, definition?.attackRange * .86)
}

function retreatRange(definition: any) {
  if (Number.isFinite(definition?.retreatRange)) {
    return Math.max(.55, Number(definition.retreatRange))
  }
  const role = roleOf(definition)
  return role === 'ranged' || role === 'caster'
    ? Math.max(2.5, preferredRange(definition) * .55)
    : .8
}

function combatColor(definition: any) {
  return String(
    definition?.telegraphColor ??
      (roleOf(definition) === 'caster'
        ? '#9b6ee7'
        : roleOf(definition) === 'ranged'
          ? '#e0b36c'
          : roleOf(definition) === 'brute'
            ? '#d96645'
            : '#e8644d'),
  )
}

function roleHealthColor(role: string, elite: boolean, boss: boolean) {
  if (boss) return 0xdc525a
  if (elite) return 0xe58a4f
  if (role === 'caster') return 0xa873df
  if (role === 'ranged') return 0xd5a858
  if (role === 'brute') return 0xd36a4d
  return 0xc9574f
}

function roleMaterial(
  color: THREE.ColorRepresentation,
  options: {
    emissive?: THREE.ColorRepresentation
    emissiveIntensity?: number
    roughness?: number
    metalness?: number
  } = {},
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? .7,
    metalness: options.metalness ?? .08,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  })
}

function rolePart(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function limbPivot(
  length: number,
  radius: number,
  material: THREE.Material,
  name: string,
) {
  const pivot = new THREE.Group()
  pivot.name = name
  const limb = rolePart(
    new THREE.CylinderGeometry(
      radius * .86,
      radius,
      length,
      6,
    ),
    material,
    `${name}-mesh`,
  )
  limb.position.y = -length * .5
  pivot.add(limb)
  return pivot
}

function rememberRigRest(objects: Record<string, THREE.Object3D | undefined>) {
  const rest: Record<string, any> = {}
  for (const [key, object] of Object.entries(objects)) {
    if (!object) continue
    rest[key] = {
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.clone(),
    }
  }
  return rest
}

function decorateFallbackRole(enemy: any, definition: any, role: string) {
  const placeholder = enemy.group?.getObjectByName?.('__forge_placeholder')
  if (!placeholder || placeholder.userData.forgeCombatRoleDecorated) return
  placeholder.userData.forgeCombatRoleDecorated = true

  // Replace the original capsule/cylinder placeholder with a small procedural
  // humanoid rig. The real authored character asset still hides this entire
  // placeholder when it is available.
  for (const child of [...placeholder.children]) {
    child.visible = false
  }

  const accentColor = new THREE.Color(combatColor(definition))
  const bodyMaterial =
    enemy.placeholderMaterial instanceof THREE.MeshStandardMaterial
      ? enemy.placeholderMaterial
      : roleMaterial(definition.color)
  bodyMaterial.roughness = role === 'ranged' ? .7 : .78
  const boneMaterial = roleMaterial(
    role === 'caster' ? 0x756b78 : 0x81766d,
    { roughness: .9 },
  )
  const darkMaterial = roleMaterial(0x211c1a, {
    roughness: .84,
    metalness: .08,
  })
  const leatherMaterial = roleMaterial(0x443129, {
    roughness: .88,
  })
  const metalMaterial = roleMaterial(0x77736d, {
    roughness: .48,
    metalness: .58,
  })
  const accentMaterial = roleMaterial(accentColor, {
    roughness: .42,
    metalness: role === 'ranged' || role === 'brute' ? .3 : .08,
    emissive: accentColor,
    emissiveIntensity: role === 'caster' ? 1.2 : .16,
  })

  const root = new THREE.Group()
  root.name = '__forge_role_rig'
  placeholder.add(root)

  const brute = role === 'brute'
  const torsoWidth = brute ? .94 : role === 'caster' ? .68 : .64
  const torsoHeight = brute ? .78 : .7
  const torsoDepth = brute ? .56 : .42
  const shoulderY = brute ? 1.48 : 1.42
  const hipY = .73

  const pelvis = rolePart(
    new THREE.BoxGeometry(brute ? .72 : .5, .28, brute ? .48 : .38),
    darkMaterial,
    'pelvis',
  )
  pelvis.position.y = hipY
  root.add(pelvis)

  const torso = new THREE.Group()
  torso.name = 'torso-pivot'
  torso.position.y = 1.15
  const torsoMesh = rolePart(
    new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth),
    bodyMaterial,
    'torso',
  )
  torsoMesh.position.y = .08
  torso.add(torsoMesh)
  root.add(torso)

  const neck = rolePart(
    new THREE.CylinderGeometry(.1, .12, .18, 6),
    boneMaterial,
    'neck',
  )
  neck.position.set(0, .52, 0)
  torso.add(neck)

  const head = new THREE.Group()
  head.name = 'head-pivot'
  head.position.set(0, 1.82, 0)
  const skull = rolePart(
    new THREE.IcosahedronGeometry(brute ? .31 : .28, 1),
    boneMaterial,
    'head',
  )
  head.add(skull)
  root.add(head)

  const leftArm = limbPivot(
    brute ? .76 : .68,
    brute ? .135 : .095,
    bodyMaterial,
    'left-arm',
  )
  const rightArm = limbPivot(
    brute ? .76 : .68,
    brute ? .135 : .095,
    bodyMaterial,
    'right-arm',
  )
  leftArm.position.set(
    -(torsoWidth * .5 + (brute ? .12 : .08)),
    shoulderY,
    0,
  )
  rightArm.position.set(
    torsoWidth * .5 + (brute ? .12 : .08),
    shoulderY,
    0,
  )
  root.add(leftArm, rightArm)

  const leftLeg = limbPivot(
    brute ? .68 : .72,
    brute ? .135 : .11,
    darkMaterial,
    'left-leg',
  )
  const rightLeg = limbPivot(
    brute ? .68 : .72,
    brute ? .135 : .11,
    darkMaterial,
    'right-leg',
  )
  leftLeg.position.set(brute ? -.24 : -.18, .68, 0)
  rightLeg.position.set(brute ? .24 : .18, .68, 0)
  root.add(leftLeg, rightLeg)

  const leftBoot = rolePart(
    new THREE.BoxGeometry(brute ? .3 : .23, .17, .42),
    leatherMaterial,
    'left-boot',
  )
  const rightBoot = rolePart(
    new THREE.BoxGeometry(brute ? .3 : .23, .17, .42),
    leatherMaterial,
    'right-boot',
  )
  leftBoot.position.set(brute ? -.24 : -.18, .08, .08)
  rightBoot.position.set(brute ? .24 : .18, .08, .08)
  root.add(leftBoot, rightBoot)

  const weaponRoot = new THREE.Group()
  weaponRoot.name = 'weapon-root'
  root.add(weaponRoot)

  let focusGlow: THREE.Mesh | undefined
  let secondaryWeapon: THREE.Object3D | undefined

  if (role === 'brute') {
    const leftPad = rolePart(
      new THREE.BoxGeometry(.48, .28, .62),
      darkMaterial,
      'left-shoulder',
    )
    const rightPad = rolePart(
      new THREE.BoxGeometry(.48, .28, .62),
      darkMaterial,
      'right-shoulder',
    )
    leftPad.position.set(-.55, 1.5, 0)
    rightPad.position.set(.55, 1.5, 0)
    root.add(leftPad, rightPad)

    const chestPlate = rolePart(
      new THREE.BoxGeometry(.76, .5, .12),
      accentMaterial,
      'brute-chest-plate',
    )
    chestPlate.position.set(0, 1.25, .34)
    root.add(chestPlate)

    const mace = new THREE.Group()
    mace.name = 'brute-mace'
    const handle = rolePart(
      new THREE.CylinderGeometry(.045, .055, .9, 7),
      leatherMaterial,
      'mace-handle',
    )
    handle.rotation.x = Math.PI / 2
    handle.position.z = .4
    const headMesh = rolePart(
      new THREE.BoxGeometry(.38, .38, .38),
      metalMaterial,
      'mace-head',
    )
    headMesh.position.z = .92
    mace.add(handle, headMesh)
    mace.position.set(.56, .92, .05)
    weaponRoot.add(mace)
  } else if (role === 'ranged') {
    const hood = rolePart(
      new THREE.ConeGeometry(.38, .48, 8),
      darkMaterial,
      'arbalist-hood',
    )
    hood.position.set(0, 1.93, 0)
    hood.rotation.y = Math.PI / 8
    root.add(hood)

    const crossbow = new THREE.Group()
    crossbow.name = 'crossbow'
    const stock = rolePart(
      new THREE.BoxGeometry(.1, .1, .92),
      leatherMaterial,
      'crossbow-stock',
    )
    stock.position.z = .18
    const bow = rolePart(
      new THREE.TorusGeometry(.42, .035, 6, 18, Math.PI),
      metalMaterial,
      'crossbow-bow',
    )
    bow.rotation.set(Math.PI / 2, 0, Math.PI / 2)
    bow.position.z = .58
    const bolt = rolePart(
      new THREE.CylinderGeometry(.018, .018, .74, 5),
      accentMaterial,
      'crossbow-bolt',
    )
    bolt.rotation.x = Math.PI / 2
    bolt.position.z = .42
    crossbow.add(stock, bow, bolt)
    crossbow.position.set(0, 1.22, .32)
    weaponRoot.add(crossbow)

    const quiver = rolePart(
      new THREE.BoxGeometry(.22, .58, .2),
      leatherMaterial,
      'quiver',
    )
    quiver.position.set(-.3, 1.08, -.28)
    quiver.rotation.z = -.22
    root.add(quiver)
  } else if (role === 'caster') {
    const robe = rolePart(
      new THREE.ConeGeometry(.48, 1.15, 8),
      darkMaterial,
      'channeler-robe',
    )
    robe.position.y = .62
    root.add(robe)

    const hood = rolePart(
      new THREE.ConeGeometry(.4, .5, 8),
      darkMaterial,
      'channeler-hood',
    )
    hood.position.set(0, 1.94, 0)
    root.add(hood)

    const staff = new THREE.Group()
    staff.name = 'channeler-staff'
    const shaft = rolePart(
      new THREE.CylinderGeometry(.035, .045, 1.72, 7),
      leatherMaterial,
      'staff-shaft',
    )
    shaft.position.y = .74
    const orbMaterial = roleMaterial(accentColor, {
      roughness: .18,
      emissive: accentColor,
      emissiveIntensity: 2.2,
    })
    const orb = rolePart(
      new THREE.OctahedronGeometry(.16, 1),
      orbMaterial,
      'staff-orb',
    )
    orb.position.y = 1.67
    focusGlow = orb
    staff.add(shaft, orb)
    staff.position.set(.52, .22, .04)
    staff.rotation.z = -.08
    weaponRoot.add(staff)
  } else {
    const leftBlade = rolePart(
      new THREE.BoxGeometry(.07, .055, .62),
      accentMaterial,
      'left-blade',
    )
    const rightBlade = rolePart(
      new THREE.BoxGeometry(.07, .055, .62),
      accentMaterial,
      'right-blade',
    )
    leftBlade.position.set(-.4, .98, .32)
    rightBlade.position.set(.4, .98, .32)
    leftBlade.rotation.z = -.28
    rightBlade.rotation.z = .28
    weaponRoot.add(leftBlade, rightBlade)
    secondaryWeapon = leftBlade

    const scarf = rolePart(
      new THREE.BoxGeometry(.74, .12, .46),
      darkMaterial,
      'wretch-scarf',
    )
    scarf.position.set(0, 1.57, .02)
    scarf.rotation.z = .06
    root.add(scarf)
  }

  if (enemy.elite && !enemy.boss) {
    const eliteRing = rolePart(
      new THREE.TorusGeometry(.32, .025, 6, 20),
      accentMaterial,
      'elite-crown',
    )
    eliteRing.rotation.x = Math.PI / 2
    eliteRing.position.set(0, 2.2, 0)
    root.add(eliteRing)
  }

  enemy.__forgeRoleRig = {
    root,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponRoot,
    focusGlow,
    secondaryWeapon,
    bodyMaterial,
    accentMaterial,
    materials: [
      bodyMaterial,
      boneMaterial,
      darkMaterial,
      leatherMaterial,
      metalMaterial,
      accentMaterial,
    ],
  }
  enemy.__forgeRoleRig.rest = rememberRigRest({
    root,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponRoot,
  })
}

function restoreRigObject(
  object: THREE.Object3D | undefined,
  rest: any,
  alpha: number,
) {
  if (!object || !rest) return
  object.position.lerp(rest.position, alpha)
  object.rotation.x = THREE.MathUtils.lerp(
    object.rotation.x,
    rest.rotation.x,
    alpha,
  )
  object.rotation.y = THREE.MathUtils.lerp(
    object.rotation.y,
    rest.rotation.y,
    alpha,
  )
  object.rotation.z = THREE.MathUtils.lerp(
    object.rotation.z,
    rest.rotation.z,
    alpha,
  )
  object.scale.lerp(rest.scale, alpha)
}

function triggerEnemyAttackRelease(enemy: any) {
  enemy.__forgeAttackRelease = {
    age: 0,
    duration:
      enemy.combatRole === 'brute'
        ? .28
        : enemy.combatRole === 'caster'
          ? .32
          : .2,
  }
}

function triggerEnemyHitReaction(
  enemy: any,
  direction: THREE.Vector3,
  poiseBroken: boolean,
) {
  enemy.__forgeHitReaction = {
    age: 0,
    duration: poiseBroken ? .3 : .16,
    strength: poiseBroken ? 1 : .55,
    side:
      Math.abs(direction.x) > Math.abs(direction.z)
        ? Math.sign(direction.x || 1)
        : Math.sign(direction.z || 1),
  }
}

function updateEnemyPresentation(enemy: any, delta: number) {
  ensureEnemyState(enemy)
  const rig = enemy.__forgeRoleRig
  if (!rig || !enemy.group?.visible) return

  enemy.__forgePresentationTime =
    Number(enemy.__forgePresentationTime ?? 0) + delta
  const time = enemy.__forgePresentationTime
  const response = 1 - Math.exp(-delta * 18)
  const rest = rig.rest ?? {}

  for (const key of [
    'root',
    'torso',
    'head',
    'leftArm',
    'rightArm',
    'leftLeg',
    'rightLeg',
    'weaponRoot',
  ]) {
    restoreRigObject(rig[key], rest[key], response)
  }

  if (enemy.health <= 0) return

  const role = enemy.combatRole ?? roleOf(enemy.definition)
  const walking =
    Boolean(enemy.moving) &&
    Number(enemy.staggerRemaining ?? 0) <= 0 &&
    Number(enemy.windupRemaining ?? 0) <= 0
  const stride = Math.sin(time * (role === 'brute' ? 7 : 9))
  const breathe = Math.sin(time * 2.5) * .012

  rig.root.position.y += breathe
  if (walking) {
    const amount = role === 'brute' ? .28 : .38
    rig.leftLeg.rotation.x += stride * amount
    rig.rightLeg.rotation.x -= stride * amount
    rig.leftArm.rotation.x -= stride * amount * .55
    rig.rightArm.rotation.x += stride * amount * .55
    rig.root.rotation.z += Math.sin(time * 4.5) * .018
  }

  if (Number(enemy.staggerRemaining ?? 0) > 0) {
    const staggerRatio = THREE.MathUtils.clamp(
      Number(enemy.staggerRemaining) /
        Math.max(.08, enemy.combatRole === 'brute' ? .56 : .36),
      0,
      1,
    )
    rig.torso.rotation.x += .18 * staggerRatio
    rig.head.rotation.x -= .15 * staggerRatio
  }

  if (Number(enemy.windupRemaining ?? 0) > 0) {
    const progress = THREE.MathUtils.clamp(
      1 -
        Number(enemy.windupRemaining) /
          Math.max(.01, Number(enemy.windupDuration ?? .4)),
      0,
      1,
    )
    const anticipation = Math.sin(progress * Math.PI * .5)
    if (role === 'brute') {
      rig.torso.rotation.x -= .18 * anticipation
      rig.rightArm.rotation.x -= 2.15 * anticipation
      rig.leftArm.rotation.x -= 1.55 * anticipation
      rig.weaponRoot.rotation.x -= .75 * anticipation
    } else if (role === 'ranged') {
      rig.torso.rotation.x += .08 * anticipation
      rig.leftArm.rotation.x -= 1.15 * anticipation
      rig.rightArm.rotation.x -= 1.15 * anticipation
      rig.weaponRoot.rotation.x -= .18 * anticipation
      rig.root.position.z -= .08 * anticipation
    } else if (role === 'caster') {
      rig.rightArm.rotation.x -= 1.55 * anticipation
      rig.leftArm.rotation.x -= .78 * anticipation
      rig.weaponRoot.rotation.z += .26 * anticipation
      rig.head.rotation.x -= .1 * anticipation
      if (rig.focusGlow?.material) {
        rig.focusGlow.material.emissiveIntensity =
          2.2 + progress * 4.2
        rig.focusGlow.scale.setScalar(1 + progress * .55)
      }
    } else {
      rig.torso.rotation.y -= .42 * anticipation
      rig.rightArm.rotation.x -= 1.35 * anticipation
      rig.leftArm.rotation.x += .55 * anticipation
      rig.root.position.z -= .07 * anticipation
    }
    rig.accentMaterial.emissiveIntensity =
      (role === 'caster' ? 1.2 : .16) + progress * .85
  } else {
    rig.accentMaterial.emissiveIntensity = THREE.MathUtils.lerp(
      rig.accentMaterial.emissiveIntensity,
      role === 'caster' ? 1.2 : .16,
      response,
    )
    if (rig.focusGlow?.material) {
      rig.focusGlow.material.emissiveIntensity =
        THREE.MathUtils.lerp(
          rig.focusGlow.material.emissiveIntensity,
          2.2,
          response,
        )
      rig.focusGlow.scale.lerp(
        new THREE.Vector3(1, 1, 1),
        response,
      )
    }
  }

  const release = enemy.__forgeAttackRelease
  if (release) {
    release.age += delta
    const progress = THREE.MathUtils.clamp(
      release.age / release.duration,
      0,
      1,
    )
    const snap = Math.sin(progress * Math.PI)
    if (role === 'brute') {
      rig.torso.rotation.x += .52 * snap
      rig.rightArm.rotation.x += 2.25 * snap
      rig.leftArm.rotation.x += 1.35 * snap
      rig.root.position.z += .22 * snap
    } else if (role === 'ranged') {
      rig.root.position.z -= .18 * snap
      rig.torso.rotation.x -= .12 * snap
      rig.weaponRoot.rotation.x += .16 * snap
    } else if (role === 'caster') {
      rig.torso.rotation.x += .18 * snap
      rig.weaponRoot.rotation.z -= .48 * snap
      rig.root.position.y += .06 * snap
    } else {
      rig.torso.rotation.y += .9 * snap
      rig.rightArm.rotation.x += 1.75 * snap
      rig.leftArm.rotation.x -= .72 * snap
      rig.root.position.z += .18 * snap
    }
    if (progress >= 1) enemy.__forgeAttackRelease = undefined
  }

  const hit = enemy.__forgeHitReaction
  if (hit) {
    hit.age += delta
    const progress = THREE.MathUtils.clamp(hit.age / hit.duration, 0, 1)
    const kick = Math.sin(progress * Math.PI) * hit.strength
    rig.root.rotation.z += kick * .16 * hit.side
    rig.torso.rotation.x += kick * .16
    rig.head.rotation.z -= kick * .12 * hit.side
    if (progress >= 1) enemy.__forgeHitReaction = undefined
  }
}


function ensureEnemyState(enemy: any) {
  if (!enemy) return

  // Normalize the mechanical fields first, even for already-decorated enemies.
  // Several spawn paths predate Combat v3 and may omit these values.
  enemy.attackTimer = Number.isFinite(enemy.attackTimer)
    ? enemy.attackTimer
    : 0
  enemy.windupRemaining = Number.isFinite(enemy.windupRemaining)
    ? enemy.windupRemaining
    : 0
  enemy.windupDuration = Number.isFinite(enemy.windupDuration)
    ? enemy.windupDuration
    : Number(enemy.definition?.attackWindup ?? .42)
  enemy.staggerRemaining = Number.isFinite(enemy.staggerRemaining)
    ? enemy.staggerRemaining
    : 0
  enemy.recoveryRemaining = Number.isFinite(enemy.recoveryRemaining)
    ? enemy.recoveryRemaining
    : 0
  if (!(enemy.knockback instanceof THREE.Vector3)) {
    enemy.knockback = new THREE.Vector3()
  }

  if (enemy.__forgeCombatV3) return
  const definition = enemy.definition ?? {}
  const role = roleOf(definition)
  const basePoise = Math.max(
    8,
    Number(
      definition.poise ??
        DEFAULT_ROLE_POISE[role as keyof typeof DEFAULT_ROLE_POISE] ??
        44,
    ),
  )
  const multiplier = enemy.boss ? 2.25 : enemy.elite ? 1.45 : 1

  enemy.__forgeCombatV3 = true
  enemy.combatRole = role
  enemy.attackStyle = styleOf(definition)
  enemy.preferredRange = preferredRange(definition)
  enemy.retreatRange = retreatRange(definition)
  enemy.strafeWeight = Math.max(0, Number(definition.strafeWeight ?? .12))
  enemy.maxPoise = basePoise * multiplier
  enemy.poise = enemy.maxPoise
  enemy.poiseRecovery = Math.max(0, Number(definition.poiseRecovery ?? 12))
  enemy.poiseRecoveryDelay = 0
  enemy.attackTarget = new THREE.Vector3()
  enemy.attackTargetValid = false
  decorateFallbackRole(enemy, definition, role)

  if (enemy.elite && !enemy.boss) {
    const roll = hashUnit(`${enemy.id}:elite-modifier`)
    enemy.eliteModifier =
      roll < .34 ? 'Bulwark' :
        roll < .67 ? 'Relentless' :
          'Swift'
    if (enemy.eliteModifier === 'Bulwark') {
      enemy.maxPoise *= 1.48
      enemy.poise = enemy.maxPoise
      enemy.poiseRecovery *= 1.18
    } else if (enemy.eliteModifier === 'Relentless') {
      if (Number.isFinite(enemy.attackCooldown)) {
        enemy.attackCooldown *= .8
      }
      enemy.damage = Number.isFinite(enemy.damage)
        ? enemy.damage * 1.08
        : enemy.damage
    } else if (enemy.eliteModifier === 'Swift') {
      if (Number.isFinite(enemy.moveSpeed)) {
        enemy.moveSpeed *= 1.2
      }
    }
  }

  const material = enemy.telegraph?.material
  if (material?.color) material.color.set(combatColor(definition))

  const healthMaterial = enemy.healthFill?.material
  if (healthMaterial?.color) {
    healthMaterial.color.setHex(
      roleHealthColor(role, Boolean(enemy.elite), Boolean(enemy.boss)),
    )
  }

  if (!enemy.boss && enemy.group && Number.isFinite(definition.scale)) {
    enemy.group.scale.setScalar(
      THREE.MathUtils.clamp(Number(definition.scale), .72, 1.45),
    )
  }

  if (enemy.telegraph?.geometry) {
    const style = styleOf(definition)
    enemy.telegraph.visible = false
    const telegraphMaterial = enemy.telegraph.material
    if (telegraphMaterial) telegraphMaterial.opacity = 0

    if (style === 'projectile') {
      enemy.telegraph.geometry.dispose?.()
      enemy.telegraph.geometry = new THREE.RingGeometry(.38, .64, 32)
    } else if (style === 'area') {
      const radius = Math.max(1.1, Number(definition.areaRadius ?? 1.9))
      enemy.telegraph.geometry.dispose?.()
      enemy.telegraph.geometry = new THREE.RingGeometry(
        radius * .78,
        radius,
        40,
      )
    } else {
      const outer = Math.max(.72, Number(definition.attackRange ?? 1.5) * .82)
      const inner = Math.max(.56, outer - .16)
      const roleAngle =
        role === 'brute'
          ? Math.PI * .72
          : Math.PI * .56
      enemy.telegraph.geometry.dispose?.()
      enemy.telegraph.geometry = new THREE.RingGeometry(
        inner,
        outer,
        28,
        1,
        -Math.PI / 2 - roleAngle / 2,
        roleAngle,
      )
    }
  }
}

function startDungeonArrival(runtime: any, enemy: any) {
  if (!enemy?.group || enemy.__forgeSpawnArrival) return

  const role = enemy.combatRole ?? roleOf(enemy.definition)
  const color = new THREE.Color(combatColor(enemy.definition))
  const cueDelay =
    (enemy.boss ? .42 : .24) +
    hashUnit(`${enemy.id}:arrival-delay`) * (enemy.boss ? .08 : .16)
  const emergeDuration = enemy.boss ? .78 : .56
  const duration = cueDelay + emergeDuration
  const baseScale = Math.max(.01, Number(enemy.group.scale.x || 1))
  const baseY = enemy.group.position.y
  const ringRadius =
    enemy.boss ? 1.28 :
      role === 'brute' ? .92 :
        role === 'caster' ? .8 :
          .72

  const effect = new THREE.Group()
  effect.position.set(
    enemy.group.position.x,
    baseY + .035,
    enemy.group.position.z,
  )

  const ringMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: .62,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(
      ringRadius * .72,
      ringRadius,
      enemy.boss ? 40 : 30,
    ),
    ringMaterial,
  )
  ring.rotation.x = -Math.PI / 2
  effect.add(ring)

  const glowMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: .14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(
      ringRadius * .48,
      ringRadius * .7,
      enemy.boss ? 2.8 : 2.15,
      20,
      1,
      true,
    ),
    glowMaterial,
  )
  glow.position.y = enemy.boss ? 1.3 : 1
  effect.add(glow)

  ;(runtime.world ?? runtime.scene)?.add(effect)

  enemy.__forgeSpawnArrival = {
    age: 0,
    duration,
    cueDelay,
    emergeDuration,
    baseScale,
    baseY,
    effect,
    ringMaterial,
    glowMaterial,
  }

  enemy.group.scale.setScalar(baseScale * .001)
  enemy.group.position.y = baseY - (enemy.boss ? .52 : .38)
  enemy.staggerRemaining = Math.max(
    Number(enemy.staggerRemaining ?? 0),
    duration + .12,
  )
  enemy.attackTimer = Math.max(
    Number(enemy.attackTimer ?? 0),
    duration + .2,
  )
  enemy.telegraph.visible = false
  runtime.spawnPulse?.(
    new THREE.Vector3(
      enemy.group.position.x,
      baseY,
      enemy.group.position.z,
    ),
    `#${color.getHexString()}`,
    ringRadius * 1.15,
    .14,
  )
}

function finishDungeonArrival(runtime: any, enemy: any) {
  const arrival = enemy.__forgeSpawnArrival
  if (!arrival) return
  enemy.group.scale.setScalar(arrival.baseScale)
  enemy.group.position.y = arrival.baseY
  arrival.effect?.parent?.remove(arrival.effect)
  arrival.effect?.traverse?.((child: any) => {
    child.geometry?.dispose?.()
    if (Array.isArray(child.material)) {
      child.material.forEach((material: any) => material.dispose?.())
    } else {
      child.material?.dispose?.()
    }
  })
  enemy.__forgeSpawnArrival = undefined
}

function updateDungeonArrivals(runtime: any, delta: number) {
  for (const enemy of runtime.enemies.values()) {
    const arrival = enemy.__forgeSpawnArrival
    if (!arrival) continue
    if (enemy.health <= 0 || !enemy.group?.parent) {
      finishDungeonArrival(runtime, enemy)
      continue
    }

    arrival.age += delta
    const totalProgress = THREE.MathUtils.clamp(
      arrival.age / Math.max(.01, arrival.duration),
      0,
      1,
    )
    const emergeProgress = THREE.MathUtils.clamp(
      (arrival.age - arrival.cueDelay) /
        Math.max(.01, arrival.emergeDuration),
      0,
      1,
    )
    const eased = 1 - Math.pow(1 - emergeProgress, 3)
    const cueProgress = THREE.MathUtils.clamp(
      arrival.age / Math.max(.01, arrival.cueDelay),
      0,
      1,
    )

    if (arrival.age < arrival.cueDelay) {
      enemy.group.scale.setScalar(arrival.baseScale * .001)
      enemy.group.position.y =
        arrival.baseY - (enemy.boss ? .52 : .38)
    } else {
      enemy.group.scale.setScalar(
        arrival.baseScale * (.08 + eased * .92),
      )
      enemy.group.position.y =
        arrival.baseY -
        (1 - eased) * (enemy.boss ? .52 : .38)
    }

    arrival.effect.rotation.y += delta * (enemy.boss ? 1.4 : 2.2)
    arrival.effect.scale.setScalar(
      .78 + cueProgress * .2 + emergeProgress * .12,
    )
    arrival.ringMaterial.opacity =
      arrival.age < arrival.cueDelay
        ? .18 + cueProgress * .58
        : .76 * (1 - emergeProgress * .82)
    arrival.glowMaterial.opacity =
      arrival.age < arrival.cueDelay
        ? .04 + cueProgress * (enemy.boss ? .2 : .13)
        : .08 + Math.sin(emergeProgress * Math.PI) * (enemy.boss ? .26 : .18)

    enemy.staggerRemaining = Math.max(
      Number(enemy.staggerRemaining ?? 0),
      Math.max(0, arrival.duration - arrival.age) + .08,
    )
    enemy.attackTimer = Math.max(
      Number(enemy.attackTimer ?? 0),
      Math.max(0, arrival.duration - arrival.age) + .22,
    )
    enemy.telegraph.visible = false
    runtime.setEnemyMoving?.(enemy, false)

    if (totalProgress >= 1) {
      finishDungeonArrival(runtime, enemy)
      runtime.spawnPulse?.(
        enemy.group.position,
        `#${new THREE.Color(combatColor(enemy.definition)).getHexString()}`,
        enemy.boss ? 1.55 : 1.02,
        .12,
      )
    }
  }
}

function initializeNewEnemies(runtime: any, before: Set<any>, mode: EnemyMode) {
  const collection =
    mode === 'dungeon'
      ? [...runtime.enemies.values()]
      : [...runtime.enemies]
  for (const enemy of collection) {
    if (before.has(enemy)) continue
    ensureEnemyState(enemy)
    if (mode === 'dungeon') startDungeonArrival(runtime, enemy)
  }
}

function ensureProjectileState(runtime: any) {
  runtime.__forgeEnemyProjectiles ??= []
  return runtime.__forgeEnemyProjectiles as EnemyProjectile[]
}

function moveEnemyAway(runtime: any, enemy: any, delta: number, mode: EnemyMode) {
  const role = enemy.combatRole ?? roleOf(enemy.definition)
  if (role !== 'ranged' && role !== 'caster') return
  if (
    enemy.health <= 0 ||
    enemy.windupRemaining > 0 ||
    enemy.staggerRemaining > 0 ||
    enemy.recoveryRemaining > 0
  ) {
    return
  }

  if (mode === 'dungeon') {
    const encounter = runtime.encounters?.get(enemy.encounterId)
    if (!encounter?.active || encounter.cleared) return
  }

  const toEnemy = enemy.group.position
    .clone()
    .sub(runtime.player.position)
    .setY(0)
  const distance = toEnemy.length()
  const desired = enemy.preferredRange ?? preferredRange(enemy.definition)
  if (distance >= desired - .18 || distance <= .001) return

  const attackHoldDistance = Math.max(
    enemy.retreatRange ?? retreatRange(enemy.definition),
    desired * .72,
  )
  if (distance < attackHoldDistance) {
    if (mode === 'dungeon') {
      enemy.attackTimer = Math.max(Number(enemy.attackTimer ?? 0), .16)
    } else {
      enemy.attackCooldown = Math.max(Number(enemy.attackCooldown ?? 0), .16)
    }
  }

  toEnemy.normalize()
  const side = hashUnit(`${enemy.id}:combat-side`) > .5 ? 1 : -1
  const tangent = new THREE.Vector3(-toEnemy.z, 0, toEnemy.x)
    .multiplyScalar(side * (enemy.strafeWeight ?? .15))
  const direction = toEnemy.add(tangent).normalize()
  const pressure = THREE.MathUtils.clamp((desired - distance) / desired, .15, 1)
  const speed = Math.max(1.25, enemy.moveSpeed ?? enemy.definition.moveSpeed ?? 3)
  const step = direction.multiplyScalar(speed * delta * (.55 + pressure * .55))

  if (mode === 'dungeon') runtime.tryMoveEnemy(enemy, step)
  else runtime.moveActor(enemy.group, step, .58)

  enemy.group.rotation.y = Math.atan2(
    runtime.player.position.x - enemy.group.position.x,
    runtime.player.position.z - enemy.group.position.z,
  )
  runtime.setEnemyMoving?.(enemy, true)
}

function addCombatOrbit(runtime: any, enemy: any, delta: number, mode: EnemyMode) {
  if ((enemy.combatRole ?? roleOf(enemy.definition)) !== 'skirmisher') return
  if (
    enemy.health <= 0 ||
    enemy.windupRemaining > 0 ||
    enemy.staggerRemaining > 0 ||
    enemy.recoveryRemaining > 0
  ) {
    return
  }
  const dx = runtime.player.position.x - enemy.group.position.x
  const dz = runtime.player.position.z - enemy.group.position.z
  const distance = Math.hypot(dx, dz)
  if (distance < 1.7 || distance > 3.2) return
  const side = hashUnit(`${enemy.id}:skirmish-side`) > .5 ? 1 : -1
  const tangent = new THREE.Vector3(-dz, 0, dx)
  if (tangent.lengthSq() < .001) return
  tangent
    .normalize()
    .multiplyScalar(
      Math.max(1.2, enemy.moveSpeed ?? enemy.definition.moveSpeed ?? 3) *
        delta *
        .16 *
        side,
    )
  if (mode === 'dungeon') runtime.tryMoveEnemy(enemy, tangent)
  else runtime.moveActor(enemy.group, tangent, .58)
}

function updatePoise(enemy: any, delta: number) {
  ensureEnemyState(enemy)
  enemy.poiseRecoveryDelay = Math.max(
    0,
    Number(enemy.poiseRecoveryDelay ?? 0) - delta,
  )
  if (
    enemy.health <= 0 ||
    enemy.poiseRecoveryDelay > 0 ||
    enemy.poise >= enemy.maxPoise
  ) {
    return
  }
  enemy.poise = Math.min(
    enemy.maxPoise,
    enemy.poise + enemy.poiseRecovery * delta,
  )
}

function registerPoiseHit(
  runtime: any,
  enemy: any,
  damage: number,
  knockbackMultiplier: number,
) {
  ensureEnemyState(enemy)
  const role = enemy.combatRole
  const roleFactor =
    role === 'brute' ? .72 :
      role === 'ranged' ? 1.08 :
        role === 'caster' ? 1.02 :
          .96
  const poiseDamage =
    Math.max(5, damage * .72 + Math.max(0, knockbackMultiplier - .5) * 8) *
    roleFactor

  enemy.poise = Math.max(0, enemy.poise - poiseDamage)
  enemy.poiseRecoveryDelay = 1.05
  if (enemy.poise > 0) {
    return {
      broken: false,
      stagger:
        enemy.boss ? .012 :
          enemy.elite ? .025 :
            role === 'brute' ? .028 :
              role === 'ranged' ? .085 :
                .06,
    }
  }

  const breakStagger =
    enemy.boss ? .34 :
      enemy.elite ? .48 :
        role === 'brute' ? .56 :
          .5
  enemy.poise = enemy.maxPoise * (enemy.boss ? .4 : .28)
  enemy.poiseRecoveryDelay = enemy.boss ? 1.6 : 1.25
  runtime.spawnPulse?.(
    enemy.group.position,
    enemy.boss ? '#ffb265' : '#e5c37b',
    enemy.boss ? 1.9 : 1.35,
    .18,
  )
  return { broken: true, stagger: breakStagger }
}

function combatEnemies(runtime: any, mode: EnemyMode) {
  return mode === 'dungeon'
    ? [...runtime.enemies.values()]
    : [...runtime.enemies]
}

function attackSlotAvailable(
  runtime: any,
  enemy: any,
  mode: EnemyMode,
) {
  if (enemy.boss) return true
  ensureEnemyState(enemy)

  const style = enemy.attackStyle
  const active = combatEnemies(runtime, mode).filter((other: any) => {
    if (other === enemy || other.health <= 0) return false
    if (mode === 'dungeon' && other.encounterId !== enemy.encounterId) {
      return false
    }
    ensureEnemyState(other)
    return (
      Number(other.windupRemaining ?? 0) > 0 ||
      Number(other.recoveryRemaining ?? 0) > .08
    )
  })

  const winding = active.filter(
    (other: any) => Number(other.windupRemaining ?? 0) > 0,
  )
  if (winding.length >= 3) return false

  const sameStyle = active.filter(
    (other: any) => other.attackStyle === style,
  ).length

  if (style === 'melee') return sameStyle < 2
  if (style === 'area') return sameStyle < 1
  if (style === 'projectile') return sameStyle < 1
  return true
}

function deferDungeonAttack(enemy: any) {
  const jitter = hashUnit(`${enemy.id}:attack-slot`) * .12
  enemy.attackTimer = Math.max(
    Number(enemy.attackTimer ?? 0),
    .14 + jitter,
  )
  if (enemy.telegraph) enemy.telegraph.visible = false
}

function refineDungeonTelegraphs(runtime: any) {
  for (const enemy of runtime.enemies.values()) {
    const telegraph = enemy.telegraph
    if (!telegraph?.visible || enemy.health <= 0) continue
    ensureEnemyState(enemy)

    const material = telegraph.material
    if (!material) continue
    const progress = THREE.MathUtils.clamp(
      1 -
        Number(enemy.windupRemaining ?? 0) /
          Math.max(.01, Number(enemy.windupDuration ?? .4)),
      0,
      1,
    )

    if (enemy.attackStyle === 'melee') {
      material.opacity = .06 + progress * .38
      telegraph.scale.setScalar(.9 + progress * .08)
    } else if (enemy.attackStyle === 'projectile') {
      material.opacity = .08 + progress * .48
      telegraph.scale.setScalar(.9 + progress * .1)
    } else {
      material.opacity = .1 + progress * .56
      telegraph.scale.setScalar(.92 + progress * .08)
    }
  }
}

function ensureCombatFxState(runtime: any) {
  runtime.__forgeCombatPresentationFx ??= []
  return runtime.__forgeCombatPresentationFx as any[]
}

function spawnSparkBurst(
  runtime: any,
  position: THREE.Vector3,
  color: string,
  count = 6,
  power = 1,
  elevated = .9,
) {
  const group = new THREE.Group()
  group.position.set(position.x, position.y + elevated, position.z)
  const particles: any[] = []
  const seed =
    Math.round(position.x * 31) ^
    Math.round(position.z * 67) ^
    count
  for (let index = 0; index < count; index += 1) {
    const angle =
      (index / Math.max(1, count)) * Math.PI * 2 +
      hashUnit(`${seed}:${index}:spark`) * .52
    const speed =
      (.75 + hashUnit(`${seed}:${index}:speed`) * .85) * power
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: .9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(
      new THREE.TetrahedronGeometry(.055 + power * .012, 0),
      material,
    )
    mesh.position.set(0, 0, 0)
    group.add(mesh)
    particles.push({
      mesh,
      material,
      velocity: new THREE.Vector3(
        Math.cos(angle) * speed,
        .55 * power +
          hashUnit(`${seed}:${index}:up`) * .9 * power,
        Math.sin(angle) * speed,
      ),
      spin:
        (hashUnit(`${seed}:${index}:spin`) - .5) *
        10,
    })
  }
  ;(runtime.world ?? runtime.scene)?.add(group)
  ensureCombatFxState(runtime).push({
    kind: 'sparks',
    group,
    particles,
    age: 0,
    duration: .34 + power * .12,
  })
}

function spawnMeleeReleaseFx(runtime: any, enemy: any) {
  const role = enemy.combatRole ?? roleOf(enemy.definition)
  const color = combatColor(enemy.definition)
  if (role === 'brute') {
    const position = enemy.group.position.clone()
    runtime.spawnPulse?.(position, color, 1.5, .2)
    spawnSparkBurst(runtime, position, color, 8, 1.15, .35)
    return
  }

  const group = new THREE.Group()
  group.position.copy(enemy.group.position)
  group.position.y += .12
  group.rotation.y = enemy.group.rotation.y
  const angle = role === 'skirmisher' ? Math.PI * .62 : Math.PI * .5
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: .58,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  const arc = new THREE.Mesh(
    new THREE.RingGeometry(
      .68,
      role === 'skirmisher' ? 1.35 : 1.18,
      28,
      1,
      -Math.PI / 2 - angle / 2,
      angle,
    ),
    material,
  )
  arc.rotation.x = -Math.PI / 2
  group.add(arc)
  ;(runtime.world ?? runtime.scene)?.add(group)
  ensureCombatFxState(runtime).push({
    kind: 'arc',
    group,
    materials: [material],
    age: 0,
    duration: .18,
  })
}

function spawnCasterImpactFx(
  runtime: any,
  position: THREE.Vector3,
  color: string,
  radius: number,
) {
  const group = new THREE.Group()
  group.position.copy(position)
  const materials: THREE.Material[] = []
  const parts: THREE.Object3D[] = []

  const discMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: .32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius * .72, 32),
    discMaterial,
  )
  disc.rotation.x = -Math.PI / 2
  disc.position.y = .05
  group.add(disc)
  materials.push(discMaterial)

  for (let index = 0; index < 7; index += 1) {
    const angle = (index / 7) * Math.PI * 2
    const distance = radius * (.28 + (index % 2) * .24)
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: .72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    const shard = new THREE.Mesh(
      new THREE.ConeGeometry(.08, .8 + (index % 3) * .22, 5),
      material,
    )
    shard.position.set(
      Math.cos(angle) * distance,
      .12,
      Math.sin(angle) * distance,
    )
    shard.scale.y = .05
    group.add(shard)
    materials.push(material)
    parts.push(shard)
  }

  ;(runtime.world ?? runtime.scene)?.add(group)
  ensureCombatFxState(runtime).push({
    kind: 'caster',
    group,
    materials,
    parts,
    age: 0,
    duration: .46,
    radius,
  })
}

function updateCombatFx(runtime: any, delta: number) {
  const effects = ensureCombatFxState(runtime)
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    const effect = effects[index]
    effect.age += delta
    const progress = THREE.MathUtils.clamp(
      effect.age / Math.max(.01, effect.duration),
      0,
      1,
    )

    if (effect.kind === 'sparks') {
      for (const particle of effect.particles) {
        particle.mesh.position.addScaledVector(
          particle.velocity,
          delta,
        )
        particle.velocity.y -= delta * 3.8
        particle.mesh.rotation.x += particle.spin * delta
        particle.mesh.rotation.z += particle.spin * .7 * delta
        particle.material.opacity = (1 - progress) * .9
        particle.mesh.scale.setScalar(.7 + progress * .5)
      }
    } else if (effect.kind === 'arc') {
      effect.group.scale.setScalar(.88 + progress * .34)
      for (const material of effect.materials ?? []) {
        material.opacity = (1 - progress) * .58
      }
    } else if (effect.kind === 'caster') {
      effect.group.rotation.y += delta * 1.7
      for (let partIndex = 0; partIndex < effect.parts.length; partIndex += 1) {
        const part = effect.parts[partIndex]
        const rise = Math.sin(progress * Math.PI)
        part.position.y = .08 + rise * (.55 + partIndex * .025)
        part.scale.y = .05 + rise * 1.1
      }
      for (const material of effect.materials ?? []) {
        material.opacity *= Math.max(.82, 1 - delta * 5.5)
      }
    }

    if (progress < 1) continue
    effect.group.parent?.remove(effect.group)
    effect.group.traverse((child: any) => {
      child.geometry?.dispose?.()
      if (Array.isArray(child.material)) {
        child.material.forEach((material: any) => material.dispose?.())
      } else {
        child.material?.dispose?.()
      }
    })
    effects.splice(index, 1)
  }
}

function spawnEnemyAttackReleaseFx(runtime: any, enemy: any) {
  const role = enemy.combatRole ?? roleOf(enemy.definition)
  if (role === 'caster') return
  if (enemy.attackStyle === 'melee') {
    spawnMeleeReleaseFx(runtime, enemy)
  } else if (enemy.attackStyle === 'projectile') {
    spawnSparkBurst(
      runtime,
      enemy.group.position,
      combatColor(enemy.definition),
      4,
      .48,
      1.22,
    )
  }
}

function beginRoleAttack(runtime: any, enemy: any, baseBegin: Function) {
  ensureEnemyState(enemy)
  enemy.attackTarget.copy(runtime.player.position)
  enemy.attackTargetValid = true

  const toPlayer = runtime.player.position
    .clone()
    .sub(enemy.group.position)
    .setY(0)
  if (toPlayer.lengthSq() > .001) {
    enemy.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z)
    enemy.group.updateMatrixWorld(true)
  }

  baseBegin.call(runtime, enemy)

  const style = enemy.attackStyle
  const telegraph = enemy.telegraph
  if (!telegraph) return

  const material = telegraph.material
  if (material?.color) material.color.set(combatColor(enemy.definition))

  if (style === 'area' || style === 'projectile') {
    enemy.group.updateMatrixWorld(true)
    const localTarget = enemy.group.worldToLocal(
      enemy.attackTarget.clone(),
    )
    telegraph.position.set(localTarget.x, .045, localTarget.z)
  } else {
    telegraph.position.set(0, .045, 0)
  }
}

function finishAttackState(runtime: any, enemy: any, mode: EnemyMode) {
  enemy.telegraph.visible = false
  enemy.telegraph.position.set(0, .045, 0)
  if (mode === 'dungeon') {
    enemy.attackTimer = enemy.attackCooldown
  } else {
    enemy.attackCooldown = enemy.definition.attackCooldown
  }
  enemy.recoveryRemaining = Math.max(
    enemy.recoveryRemaining ?? 0,
    .18 + (enemy.windupDuration ?? .4) * .16,
  )
}

function spawnProjectile(runtime: any, enemy: any, mode: EnemyMode) {
  const definition = enemy.definition
  const color = combatColor(definition)
  const radius = THREE.MathUtils.clamp(
    Number(definition.projectileRadius ?? .18),
    .1,
    .42,
  )
  const speed = THREE.MathUtils.clamp(
    Number(definition.projectileSpeed ?? 11),
    5,
    24,
  )
  const origin = enemy.group.position
    .clone()
    .add(new THREE.Vector3(0, 1.18, 0))
  const target = (enemy.attackTargetValid
    ? enemy.attackTarget.clone()
    : runtime.player.position.clone())
    .add(new THREE.Vector3(0, .76, 0))
  const direction = target.sub(origin)
  direction.y *= .16
  if (direction.lengthSq() < .001) direction.set(0, 0, -1)
  direction.normalize()

  const group = new THREE.Group()
  const shaftMaterial = new THREE.MeshStandardMaterial({
    color: 0x5b4635,
    roughness: .72,
    metalness: .08,
  })
  const glowMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: .68,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  const tipMaterial = new THREE.MeshStandardMaterial({
    color: 0xb9b4aa,
    roughness: .36,
    metalness: .7,
    emissive: new THREE.Color(color),
    emissiveIntensity: .28,
  })

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(.024, .028, .72, 6),
    shaftMaterial,
  )
  shaft.rotation.x = Math.PI / 2
  shaft.castShadow = true

  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(.075, .2, 6),
    tipMaterial,
  )
  tip.rotation.x = Math.PI / 2
  tip.position.z = .45
  tip.castShadow = true

  const fletchA = new THREE.Mesh(
    new THREE.BoxGeometry(.16, .025, .16),
    glowMaterial,
  )
  fletchA.position.z = -.36
  fletchA.rotation.z = Math.PI / 4
  const fletchB = fletchA.clone()
  fletchB.rotation.z = -Math.PI / 4

  const streak = new THREE.Mesh(
    new THREE.BoxGeometry(.045, .045, .72),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: .2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  streak.position.z = -.58

  group.add(shaft, tip, fletchA, fletchB, streak)
  group.position.copy(origin)
  group.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    direction,
  )
  ;(runtime.world ?? runtime.scene).add(group)

  ensureProjectileState(runtime).push({
    mesh: group,
    velocity: direction.clone().multiplyScalar(speed),
    source: enemy.group.position.clone(),
    damage: enemy.damage ?? definition.attackDamage,
    radius,
    age: 0,
    lifetime: 3.2,
    color,
    previous: origin.clone(),
  })

  spawnSparkBurst(runtime, origin, color, 4, .42, 0)
}
function resolveAreaAttack(runtime: any, enemy: any, mode: EnemyMode) {
  const definition = enemy.definition
  const radius = THREE.MathUtils.clamp(
    Number(definition.areaRadius ?? 1.9),
    .9,
    4.2,
  )
  const target = enemy.attackTargetValid
    ? enemy.attackTarget.clone()
    : runtime.player.position.clone()
  target.y = runtime.floorHeightAt
    ? runtime.floorHeightAt(target.x, target.z)
    : runtime.player.position.y
  const color = combatColor(definition)

  runtime.spawnPulse?.(target, color, radius * 1.12, .24)
  spawnCasterImpactFx(runtime, target, color, radius)
  spawnSparkBurst(runtime, target, color, 9, .85, .12)
  void runtime.spawnBoundVfx?.(definition.attackVfxAssetId, target)

  const dx = runtime.player.position.x - target.x
  const dz = runtime.player.position.z - target.z
  if (Math.hypot(dx, dz) <= radius) {
    damagePlayer(runtime, enemy.damage ?? definition.attackDamage, enemy.group.position, mode, color)
  }
}

function damagePlayer(
  runtime: any,
  damage: number,
  source: THREE.Vector3,
  mode: EnemyMode,
  color = '#ef776b',
) {
  if (runtime.dodgeRemaining > 0) {
    runtime.spawnPulse?.(runtime.player.position, '#88bca0', 1.05, .16)
    return
  }

  if (mode === 'overworld' && typeof runtime.damagePlayer === 'function') {
    runtime.damagePlayer(damage, source)
    return
  }

  runtime.playerHealth = Math.max(0, runtime.playerHealth - damage)
  runtime.playerVisual?.play('hit', false)
  runtime.spawnDamageNumber?.(runtime.player.position, damage, color)
  runtime.spawnPulse?.(runtime.player.position, color, 1.15, .18)
  const recoil = runtime.player.position
    .clone()
    .sub(source)
    .setY(0)
  if (recoil.lengthSq() > .001) {
    runtime.movePlayer?.(recoil.normalize().multiplyScalar(.42))
  }
  runtime.hitStopRemaining = Math.max(runtime.hitStopRemaining ?? 0, .024)
  runtime.cameraShake = Math.max(runtime.cameraShake ?? 0, .34)
  if (runtime.playerHealth <= 0) runtime.respawnPlayer?.()
  runtime.emitState?.()
}

function updateProjectiles(runtime: any, delta: number, mode: EnemyMode) {
  const projectiles = ensureProjectileState(runtime)
  for (let index = projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = projectiles[index]
    projectile.age += delta
    projectile.previous.copy(projectile.mesh.position)
    projectile.mesh.position.addScaledVector(projectile.velocity, delta)
    projectile.mesh.rotateZ(delta * 7.5)

    const pulse = .88 + Math.sin(projectile.age * 18) * .08
    projectile.mesh.scale.setScalar(pulse)

    const dx = projectile.mesh.position.x - runtime.player.position.x
    const dz = projectile.mesh.position.z - runtime.player.position.z
    const hitRadius = projectile.radius + .52
    if (dx * dx + dz * dz <= hitRadius * hitRadius) {
      runtime.spawnPulse?.(
        projectile.mesh.position,
        projectile.color,
        .72,
        .12,
      )
      spawnSparkBurst(
        runtime,
        projectile.mesh.position,
        projectile.color,
        8,
        .72,
        0,
      )
      damagePlayer(
        runtime,
        projectile.damage,
        projectile.source,
        mode,
        projectile.color,
      )
      removeProjectile(runtime, projectiles, index)
      continue
    }

    if (projectile.age >= projectile.lifetime) {
      spawnSparkBurst(
        runtime,
        projectile.mesh.position,
        projectile.color,
        3,
        .28,
        0,
      )
      removeProjectile(runtime, projectiles, index)
    }
  }
}
function removeProjectile(runtime: any, list: EnemyProjectile[], index: number) {
  const projectile = list[index]
  projectile.mesh.parent?.remove(projectile.mesh)
  projectile.mesh.traverse((child: any) => {
    child.geometry?.dispose?.()
    if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose?.())
    else child.material?.dispose?.()
  })
  list.splice(index, 1)
}

function roleTargetSnapshot(runtime: any, snapshot: any, mode: EnemyMode) {
  if (!snapshot?.target) return snapshot
  const enemy =
    mode === 'dungeon'
      ? runtime.enemies.get(snapshot.target.id)
      : runtime.enemies.find((entry: any) => entry.id === snapshot.target.id)
  if (!enemy) return snapshot
  ensureEnemyState(enemy)
  return {
    ...snapshot,
    target: {
      ...snapshot.target,
      name:
        enemy.bossProfile?.name ??
        snapshot.target.name,
      role: enemy.combatRole,
      elite: Boolean(enemy.elite),
      eliteModifier: enemy.eliteModifier,
      poise: Math.max(0, Math.round(enemy.poise)),
      maxPoise: Math.max(1, Math.round(enemy.maxPoise)),
    },
  }
}

function applyOverworldDefinition(enemy: any, definition: any) {
  if (!enemy || !definition || enemy.definition?.id === definition.id) {
    ensureEnemyState(enemy)
    return
  }
  enemy.definition = definition
  enemy.health = definition.maxHealth
  enemy.windupDuration = definition.attackWindup ?? .42
  enemy.attackCooldown = Math.min(enemy.attackCooldown ?? 0, .15)
  enemy.bodyMaterial?.color?.set(definition.color)
  if (enemy.group && Number.isFinite(definition.scale)) {
    enemy.group.scale.setScalar(
      THREE.MathUtils.clamp(Number(definition.scale), .72, 1.45),
    )
  }
  enemy.__forgeCombatV3 = false
  ensureEnemyState(enemy)
}

function selectOverworldDefinition(runtime: any, enemy: any) {
  const roster = runtime.gameplay?.enemies ?? []
  if (roster.length <= 1) return enemy.definition
  const byRole = new Map(roster.map((entry: any) => [roleOf(entry), entry]))
  const roll = hashUnit(`${runtime.region?.seed ?? 0}:${enemy.id}:combat-v3`)
  const role =
    roll < .44 ? 'skirmisher' :
      roll < .64 ? 'ranged' :
        roll < .84 ? 'brute' :
          'caster'
  return byRole.get(role) ?? roster[Math.floor(roll * roster.length)] ?? enemy.definition
}

function registerDungeonDeath(runtime: any, enemy: any) {
  runtime.__forgeCombatDeaths ??= []
  const away = enemy.group.position
    .clone()
    .sub(runtime.player.position)
    .setY(0)
  if (away.lengthSq() < .001) {
    const angle = hashUnit(`${enemy.id}:death`) * Math.PI * 2
    away.set(Math.cos(angle), 0, Math.sin(angle))
  } else {
    away.normalize()
  }
  const side = hashUnit(`${enemy.id}:death-side`) > .5 ? 1 : -1
  const role = enemy.combatRole ?? roleOf(enemy.definition)
  const duration = enemy.boss ? 1.02 : .96
  runtime.__forgeCombatDeaths.push({
    enemy,
    age: 0,
    duration,
    velocity: away.multiplyScalar(
      enemy.boss ? .45 : enemy.elite ? .92 : 1.18,
    ),
    roll: side * (enemy.boss ? .32 : enemy.elite ? .68 : .88),
    baseScale: enemy.group.scale.clone(),
    baseY: enemy.group.position.y,
  })

  const color = combatColor(enemy.definition)
  spawnSparkBurst(
    runtime,
    enemy.group.position,
    color,
    enemy.boss ? 18 : enemy.elite ? 12 : 8,
    enemy.boss ? 1.4 : enemy.elite ? 1.05 : .78,
    role === 'brute' ? .72 : 1,
  )
  if (role === 'caster') {
    spawnCasterImpactFx(
      runtime,
      enemy.group.position.clone(),
      color,
      enemy.boss ? 2.25 : 1.25,
    )
  } else {
    runtime.spawnPulse?.(
      enemy.group.position,
      color,
      enemy.boss ? 2.5 : 1.15,
      .18,
    )
  }

  const placeholder =
    enemy.group?.getObjectByName?.('__forge_placeholder')
  placeholder?.traverse?.((child: any) => {
    const materials = Array.isArray(child.material)
      ? child.material
      : child.material
        ? [child.material]
        : []
    for (const material of materials) {
      if (!('opacity' in material)) continue
      material.transparent = true
      material.userData.__forgeDeathBaseOpacity =
        Number.isFinite(material.opacity) ? material.opacity : 1
    }
  })
}

function updateDungeonDeaths(runtime: any, delta: number) {
  const deaths = runtime.__forgeCombatDeaths ?? []
  for (let index = deaths.length - 1; index >= 0; index -= 1) {
    const death = deaths[index]
    death.age += delta
    const enemy = death.enemy
    if (!enemy?.group?.parent) {
      deaths.splice(index, 1)
      continue
    }

    const progress = THREE.MathUtils.clamp(
      death.age / Math.max(.01, death.duration),
      0,
      1,
    )
    const drift = death.velocity.clone().multiplyScalar(delta)
    enemy.group.position.add(drift)
    death.velocity.multiplyScalar(Math.max(0, 1 - delta * 6.4))

    enemy.group.rotation.z +=
      death.roll * delta * (1 - progress * .35)
    enemy.group.position.y =
      death.baseY -
      Math.max(0, progress - .52) * (enemy.boss ? .28 : .42)
    const shrink = THREE.MathUtils.lerp(
      1,
      enemy.boss ? .86 : .68,
      Math.max(0, (progress - .5) / .5),
    )
    enemy.group.scale.copy(death.baseScale).multiplyScalar(shrink)

    const placeholder =
      enemy.group?.getObjectByName?.('__forge_placeholder')
    placeholder?.traverse?.((child: any) => {
      const materials = Array.isArray(child.material)
        ? child.material
        : child.material
          ? [child.material]
          : []
      for (const material of materials) {
        const baseOpacity =
          material.userData?.__forgeDeathBaseOpacity ?? 1
        material.opacity =
          baseOpacity *
          (1 - Math.max(0, (progress - .42) / .58) * .92)
      }
    })

    if (progress < 1) continue
    enemy.group.visible = false
    deaths.splice(index, 1)
  }
}

export function installOverworldEnemyCombatRuntime(Runtime: any) {
  if (Runtime.prototype.__forgeEnemyCombatV3Overworld) return
  Runtime.prototype.__forgeEnemyCombatV3Overworld = true
  const proto = Runtime.prototype

  const baseBuildEnemies = proto.buildEnemies
  const baseSpawnEnemy = proto.spawnEnemy
  const baseUpdateEnemies = proto.updateEnemies
  const baseBeginEnemyAttack = proto.beginEnemyAttack
  const baseResolveEnemyAttack = proto.resolveEnemyAttack
  const baseDamageEnemy = proto.damageEnemy
  const baseDamagePlayer = proto.damagePlayer
  const baseMakeSnapshot = proto.makeSnapshot

  proto.spawnEnemy = function (...args: any[]) {
    const before = new Set(this.enemies)
    const result = baseSpawnEnemy.apply(this, args)
    initializeNewEnemies(this, before, 'overworld')
    return result
  }

  proto.buildEnemies = function (...args: any[]) {
    const before = new Set(this.enemies)
    const result = baseBuildEnemies.apply(this, args)
    const created = this.enemies.filter((enemy: any) => !before.has(enemy))
    for (const enemy of created) {
      applyOverworldDefinition(
        enemy,
        selectOverworldDefinition(this, enemy),
      )
    }
    return result
  }

  proto.updateEnemies = function (delta: number) {
    for (const enemy of this.enemies) {
      ensureEnemyState(enemy)
      updatePoise(enemy, delta)
      moveEnemyAway(this, enemy, delta, 'overworld')
      addCombatOrbit(this, enemy, delta, 'overworld')
    }
    const result = baseUpdateEnemies.call(this, delta)
    for (const enemy of this.enemies) {
      updateEnemyPresentation(enemy, delta)
    }
    updateProjectiles(this, delta, 'overworld')
    updateCombatFx(this, delta)
    return result
  }

  proto.beginEnemyAttack = function (enemy: any) {
    return beginRoleAttack(this, enemy, baseBeginEnemyAttack)
  }

  proto.resolveEnemyAttack = function (enemy: any) {
    ensureEnemyState(enemy)
    triggerEnemyAttackRelease(enemy)
    spawnEnemyAttackReleaseFx(this, enemy)
    const style = enemy.attackStyle
    if (style === 'melee') {
      return baseResolveEnemyAttack.call(this, enemy)
    }
    finishAttackState(this, enemy, 'overworld')
    if (style === 'projectile') {
      spawnProjectile(this, enemy, 'overworld')
    } else {
      resolveAreaAttack(this, enemy, 'overworld')
    }
  }

  proto.damageEnemy = function (
    enemy: any,
    damage: number,
    direction: THREE.Vector3,
    color: string,
    presentation = 'standard',
    knockbackMultiplier = 1,
    hitStop?: number,
    cameraShake?: number,
    staggerSeconds?: number,
  ) {
    const poise = registerPoiseHit(
      this,
      enemy,
      damage,
      knockbackMultiplier,
    )
    return baseDamageEnemy.call(
      this,
      enemy,
      damage,
      direction,
      color,
      presentation,
      knockbackMultiplier,
      hitStop,
      cameraShake,
      poise?.stagger ?? staggerSeconds,
    )
  }

  proto.damagePlayer = function (...args: any[]) {
    if (this.__forgeCombatLabInvulnerable) {
      this.spawnPulse?.(this.player.position, '#79c79a', .72, .1)
      return
    }
    return baseDamagePlayer.apply(this, args)
  }

  proto.spawnCombatLabPack = function (
    selection: 'mixed' | 'skirmisher' | 'brute' | 'ranged' | 'caster' = 'mixed',
  ) {
    this.__forgeCombatLabSequence =
      Number(this.__forgeCombatLabSequence ?? 0) + 1
    const sequence = this.__forgeCombatLabSequence
    const roster = this.gameplay?.enemies ?? []
    const byRole = new Map(
      roster.map((definition: any) => [roleOf(definition), definition]),
    )
    const roles =
      selection === 'mixed'
        ? ['skirmisher', 'skirmisher', 'brute', 'ranged', 'ranged', 'caster']
        : selection === 'skirmisher'
          ? ['skirmisher', 'skirmisher', 'skirmisher']
          : selection === 'ranged'
            ? ['ranged', 'ranged']
            : [selection]

    let spawned = 0
    roles.forEach((role, index) => {
      const definition =
        byRole.get(role) ??
        roster.find((candidate: any) => candidate.id === role)
      if (!definition) return

      const angle =
        index / Math.max(1, roles.length) * Math.PI * 2 +
        hashUnit(`combat-lab:${sequence}:${index}`) * .48
      const radius =
        role === 'ranged' || role === 'caster'
          ? 6.1
          : role === 'brute'
            ? 4.5
            : 3.8
      const x = this.player.position.x + Math.cos(angle) * radius
      const z = this.player.position.z + Math.sin(angle) * radius
      this.spawnEnemy(
        `combat-lab:${sequence}:${role}:${index}`,
        definition,
        x,
        z,
        {
          transient: true,
          respawn: false,
          respawnSeconds: 0,
        },
      )
      spawned += 1
    })

    this.setMessage?.(
      `Combat Lab · spawned ${spawned} ${selection === 'mixed' ? 'mixed enemies' : selection + (spawned === 1 ? '' : 's')}.`,
      2,
    )
    this.emitState?.()
    return spawned
  }

  proto.clearCombatLab = function () {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index]
      if (!enemy.transient || !String(enemy.id).startsWith('combat-lab:')) {
        continue
      }
      if (this.focusEnemyId === enemy.id) this.focusEnemyId = undefined
      enemy.visual?.dispose?.()
      enemy.group.parent?.remove(enemy.group)
      this.disposeObject?.(enemy.group)
      this.enemies.splice(index, 1)
    }
    const projectiles = ensureProjectileState(this)
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      removeProjectile(this, projectiles, index)
    }
    this.setMessage?.('Combat Lab cleared.', 1.4)
    this.emitState?.()
  }

  proto.setCombatLabInvulnerable = function (enabled: boolean) {
    this.__forgeCombatLabInvulnerable = Boolean(enabled)
    if (enabled) {
      this.playerHealth = this.playerDefinition?.maxHealth ?? this.playerHealth
    }
    this.setMessage?.(
      enabled
        ? 'Combat Lab · invulnerability enabled.'
        : 'Combat Lab · invulnerability disabled.',
      1.4,
    )
    this.emitState?.()
  }

  proto.setCombatLabTimeScale = function (scale: number) {
    const value = THREE.MathUtils.clamp(
      Number.isFinite(scale) ? scale : 1,
      .2,
      1,
    )
    this.__forgeCombatLabTimeScale = value
    this.setMessage?.(
      value < .999
        ? `Combat Lab · ${value.toFixed(2)}× slow motion.`
        : 'Combat Lab · normal speed.',
      1.2,
    )
    this.emitState?.()
  }

  proto.makeSnapshot = function (...args: any[]) {
    return {
      ...roleTargetSnapshot(
        this,
        baseMakeSnapshot.apply(this, args),
        'overworld',
      ),
      combatLabInvulnerable: Boolean(this.__forgeCombatLabInvulnerable),
      combatLabTimeScale: THREE.MathUtils.clamp(
        Number(this.__forgeCombatLabTimeScale ?? 1),
        .2,
        1,
      ),
    }
  }
}

export function installDungeonEnemyCombatRuntime(Runtime: any) {
  if (Runtime.prototype.__forgeEnemyCombatV3Dungeon) return
  Runtime.prototype.__forgeEnemyCombatV3Dungeon = true
  const proto = Runtime.prototype

  const baseSpawnEnemy = proto.spawnEnemy
  const baseUpdateEnemies = proto.updateEnemies
  const baseBeginEnemyAttack = proto.beginEnemyAttack
  const baseResolveEnemyAttack = proto.resolveEnemyAttack
  const baseDamageEnemy = proto.damageEnemy
  const baseKillEnemy = proto.killEnemy
  const baseMakeSnapshot = proto.makeSnapshot

  proto.spawnEnemy = function (...args: any[]) {
    const before = new Set(this.enemies.values())
    const result = baseSpawnEnemy.apply(this, args)
    initializeNewEnemies(this, before, 'dungeon')
    return result
  }

  proto.updateEnemies = function (delta: number) {
    updateDungeonArrivals(this, delta)
    for (const enemy of this.enemies.values()) {
      ensureEnemyState(enemy)
      updatePoise(enemy, delta)
      if (!enemy.__forgeSpawnArrival) {
        moveEnemyAway(this, enemy, delta, 'dungeon')
        addCombatOrbit(this, enemy, delta, 'dungeon')
      }
    }
    const result = baseUpdateEnemies.call(this, delta)
    for (const enemy of this.enemies.values()) {
      updateEnemyPresentation(enemy, delta)
    }
    refineDungeonTelegraphs(this)
    updateProjectiles(this, delta, 'dungeon')
    updateDungeonDeaths(this, delta)
    updateCombatFx(this, delta)
    return result
  }

  proto.beginEnemyAttack = function (enemy: any) {
    ensureEnemyState(enemy)
    if (enemy.__forgeSpawnArrival) {
      deferDungeonAttack(enemy)
      return
    }
    if (!attackSlotAvailable(this, enemy, 'dungeon')) {
      deferDungeonAttack(enemy)
      return
    }
    return beginRoleAttack(this, enemy, baseBeginEnemyAttack)
  }

  proto.resolveEnemyAttack = function (enemy: any) {
    ensureEnemyState(enemy)
    triggerEnemyAttackRelease(enemy)
    spawnEnemyAttackReleaseFx(this, enemy)
    const style = enemy.attackStyle
    if (style === 'melee') {
      return baseResolveEnemyAttack.call(this, enemy)
    }
    finishAttackState(this, enemy, 'dungeon')
    if (style === 'projectile') {
      spawnProjectile(this, enemy, 'dungeon')
    } else {
      resolveAreaAttack(this, enemy, 'dungeon')
    }
  }

  proto.damageEnemy = function (
    enemy: any,
    damage: number,
    direction: THREE.Vector3,
    color: string,
    knockbackMultiplier = 1,
    hitStop?: number,
    cameraShake?: number,
    staggerSeconds?: number,
  ) {
    const poise = registerPoiseHit(
      this,
      enemy,
      damage,
      knockbackMultiplier,
    )
    return baseDamageEnemy.call(
      this,
      enemy,
      damage,
      direction,
      color,
      knockbackMultiplier,
      hitStop,
      cameraShake,
      poise?.stagger ?? staggerSeconds,
    )
  }

  proto.killEnemy = function (enemy: any) {
    finishDungeonArrival(this, enemy)
    registerDungeonDeath(this, enemy)
    return baseKillEnemy.call(this, enemy)
  }

  proto.makeSnapshot = function (...args: any[]) {
    return roleTargetSnapshot(
      this,
      baseMakeSnapshot.apply(this, args),
      'dungeon',
    )
  }
}
