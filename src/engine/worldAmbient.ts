import * as THREE from 'three'
import {
  buildRiverOccupancyMask,
  riverOccupancySample,
  sampleTerrainHeight,
  sampleTerrainSurface,
  type GeneratedRegion,
} from './guidedWorld'

export type WorldAmbientVisuals = {
  group: THREE.Group
  actors: THREE.Object3D[]
}

type AmbientKind =
  | 'grass'
  | 'flower'
  | 'mushroom'
  | 'firefly'
  | 'bird'
  | 'lantern'

type AmbientAnchor = {
  kind: AmbientKind
  x: number
  z: number
  scale: number
  rotation: number
  variant: number
}

export function buildWorldAmbientVisuals(
  region: GeneratedRegion,
): WorldAmbientVisuals {
  const group = new THREE.Group()
  group.name = 'WorldAmbientLife'
  const actors: THREE.Object3D[] = []
  const anchors = buildAmbientAnchors(region)

  addGrass(group, region, anchors.filter((item) => item.kind === 'grass'))
  addFlowers(group, region, anchors.filter((item) => item.kind === 'flower'))
  addMushrooms(group, region, anchors.filter((item) => item.kind === 'mushroom'))
  addLanterns(group, actors, region, anchors.filter((item) => item.kind === 'lantern'))
  addFireflies(group, actors, region, anchors.filter((item) => item.kind === 'firefly'))
  addBirds(group, actors, region, anchors.filter((item) => item.kind === 'bird'))

  return { group, actors }
}

export function updateWorldAmbientVisuals(
  visuals: WorldAmbientVisuals,
  time: number,
) {
  for (const actor of visuals.actors) {
    const kind = actor.userData.ambientKind as string | undefined
    const phase = Number(actor.userData.phase ?? 0)

    if (kind === 'firefly') {
      actor.rotation.y = phase + time * .18
      actor.children.forEach((child, index) => {
        const baseX = Number(child.userData.baseX ?? child.position.x)
        const baseY = Number(child.userData.baseY ?? child.position.y)
        const baseZ = Number(child.userData.baseZ ?? child.position.z)
        child.position.x = baseX + Math.sin(time * (1.1 + index * .09) + phase + index) * .16
        child.position.y = baseY + Math.sin(time * (1.8 + index * .13) + phase * 1.7 + index * .8) * .18
        child.position.z = baseZ + Math.cos(time * (1.05 + index * .07) + phase + index * .6) * .15
        const material = child instanceof THREE.Mesh
          ? child.material
          : undefined
        if (material instanceof THREE.MeshBasicMaterial) {
          material.opacity = .58 + Math.sin(time * 2.6 + phase + index) * .22
        }
      })
      continue
    }

    if (kind === 'bird') {
      const anchorX = Number(actor.userData.anchorX ?? actor.position.x)
      const anchorY = Number(actor.userData.anchorY ?? actor.position.y)
      const anchorZ = Number(actor.userData.anchorZ ?? actor.position.z)
      const radius = Number(actor.userData.radius ?? 3.2)
      const speed = Number(actor.userData.speed ?? .19)
      const angle = phase + time * speed
      actor.position.set(
        anchorX + Math.cos(angle) * radius,
        anchorY + Math.sin(time * .7 + phase) * .45,
        anchorZ + Math.sin(angle) * radius,
      )
      actor.rotation.y = -angle + Math.PI * .5
      const flap = Math.sin(time * 7.5 + phase) * .52
      const leftWing = actor.getObjectByName('AmbientBirdWingL')
      const rightWing = actor.getObjectByName('AmbientBirdWingR')
      if (leftWing) leftWing.rotation.z = .28 + flap
      if (rightWing) rightWing.rotation.z = -.28 - flap
      continue
    }

    if (kind === 'lantern') {
      const glow = actor.getObjectByName('AmbientLanternGlow')
      if (glow instanceof THREE.PointLight) {
        const base = Number(actor.userData.baseIntensity ?? .95)
        glow.intensity =
          base * (.9 + Math.sin(time * 7.2 + phase) * .06 + Math.sin(time * 3.1 + phase * 2) * .04)
      }
    }
  }
}

function buildAmbientAnchors(region: GeneratedRegion) {
  const anchors: AmbientAnchor[] = []
  const random = seededAmbientRandom(region.seed ^ 0x5f3759df)
  const biome = region.biome.toLowerCase()
  const isAutumn = biome.includes('autumn')
  const isHighland = biome.includes('highland')
  const isMarsh =
    biome.includes('marsh') ||
    biome.includes('swamp') ||
    biome.includes('drowned')
  const isCorrupt = biome.includes('corrupt')
  const isFarmland =
    biome.includes('farmland') ||
    biome.includes('meadow') ||
    biome.includes('grassland')
  const isForest =
    !isHighland &&
    !isMarsh &&
    !isCorrupt &&
    !isFarmland

  const width = region.bounds.maxX - region.bounds.minX
  const depth = region.bounds.maxZ - region.bounds.minZ
  const areaScale = THREE.MathUtils.clamp(
    Math.sqrt(Math.max(1, width * depth) / 10500),
    .72,
    1.38,
  )
  const moodGrass =
    region.mood === 'deadwood'
      ? .64
      : region.mood === 'bleak'
        ? .52
        : region.mood === 'dark'
          ? .86
          : 1
  const moodFlowers =
    region.mood === 'deadwood'
      ? .34
      : region.mood === 'bleak'
        ? .42
        : region.mood === 'dark'
          ? .62
          : 1

  const grassBase =
    isFarmland ? 120 :
      isAutumn ? 92 :
        isHighland ? 72 :
          isMarsh ? 78 :
            isCorrupt ? 42 :
              105
  const flowerBase =
    isFarmland ? 52 :
      isAutumn ? 34 :
        isHighland ? 16 :
          isMarsh ? 14 :
            isCorrupt ? 6 :
              34
  const mushroomBase =
    isMarsh ? 28 :
      isAutumn ? 22 :
        isHighland ? 7 :
          isFarmland ? 9 :
            isCorrupt ? 11 :
              26

  placeGroundAnchors(
    region,
    anchors,
    'grass',
    Math.round(grassBase * areaScale * moodGrass),
    random,
    1.15,
    .45,
    (x, z) => {
      const surface = sampleTerrainSurface(region, x, z)
      return (
        surface.meadow > .045 ||
        surface['forest-floor'] > .065 ||
        surface.scrub > .08 ||
        random() < .3
      )
    },
  )
  placeGroundAnchors(
    region,
    anchors,
    'flower',
    Math.round(flowerBase * areaScale * moodFlowers),
    random,
    1.55,
    .65,
    (x, z) => {
      const surface = sampleTerrainSurface(region, x, z)
      return (
        surface.meadow > .085 ||
        (isForest && surface['forest-floor'] > .08) ||
        (isAutumn && surface['forest-floor'] > .06) ||
        random() < .16
      )
    },
  )

  const naturalAnchors = region.dressing.filter((item) =>
    item.type === 'tree' ||
    item.type === 'dead-tree' ||
    item.type === 'stump' ||
    item.type === 'root-cluster'
  )
  const mushroomCount = Math.round(
    (mushroomBase +
      (region.mood === 'deadwood' ? 15 : region.mood === 'dark' ? 7 : 0)) *
      areaScale,
  )
  for (let index = 0; index < mushroomCount; index += 1) {
    const source = naturalAnchors.length
      ? naturalAnchors[Math.floor(random() * naturalAnchors.length)]
      : undefined
    const angle = random() * Math.PI * 2
    const distance = .9 + random() * 2.5
    const x = source
      ? source.x + Math.cos(angle) * distance
      : region.bounds.minX + 3 + random() * Math.max(1, width - 6)
    const z = source
      ? source.z + Math.sin(angle) * distance
      : region.bounds.minZ + 3 + random() * Math.max(1, depth - 6)
    if (!ambientGroundAllowed(region, x, z, 1.35, .55)) continue
    anchors.push({
      kind: 'mushroom',
      x,
      z,
      scale: .72 + random() * .72,
      rotation: random() * Math.PI * 2,
      variant: Math.floor(random() * 4),
    })
  }

  const fireflyBase =
    region.mood === 'deadwood'
      ? 15
      : region.mood === 'dark'
        ? 12
        : isMarsh
          ? 8
          : isCorrupt
            ? 7
            : isForest
              ? 5
              : isAutumn
                ? 4
                : 2
  for (let index = 0; index < Math.round(fireflyBase * areaScale); index += 1) {
    const source = naturalAnchors.length
      ? naturalAnchors[Math.floor(random() * naturalAnchors.length)]
      : undefined
    const x = source
      ? source.x + (random() - .5) * 5.5
      : region.bounds.minX + 4 + random() * Math.max(1, width - 8)
    const z = source
      ? source.z + (random() - .5) * 5.5
      : region.bounds.minZ + 4 + random() * Math.max(1, depth - 8)
    if (!ambientGroundAllowed(region, x, z, 1.45, .45)) continue
    anchors.push({
      kind: 'firefly',
      x,
      z,
      scale: .8 + random() * .55,
      rotation: random() * Math.PI * 2,
      variant: Math.floor(random() * 4),
    })
  }

  const birdBase =
    region.mood === 'deadwood' ? 3 :
      region.mood === 'dark' ? 4 :
        isHighland ? 5 :
          4
  for (let index = 0; index < Math.round(birdBase * areaScale); index += 1) {
    const source = naturalAnchors.length
      ? naturalAnchors[Math.floor(random() * naturalAnchors.length)]
      : undefined
    const x = source
      ? source.x
      : region.bounds.minX + 8 + random() * Math.max(1, width - 16)
    const z = source
      ? source.z
      : region.bounds.minZ + 8 + random() * Math.max(1, depth - 16)
    anchors.push({
      kind: 'bird',
      x,
      z,
      scale: .72 + random() * .42,
      rotation: random() * Math.PI * 2,
      variant: Math.floor(random() * 4),
    })
  }

  const lightablePoiTypes = new Set([
    'camp',
    'settlement',
    'shrine',
    'ruins',
    'graveyard',
    'dungeon',
    'watchtower',
  ])
  const lightLimit =
    region.mood === 'dark' || region.mood === 'deadwood' ? 10 : 6
  let lightCount = 0
  for (const poi of region.pois) {
    if (!lightablePoiTypes.has(poi.type) || lightCount >= lightLimit) continue
    if (
      region.mood === 'normal' &&
      !['camp', 'settlement', 'shrine'].includes(poi.type)
    ) {
      continue
    }
    const lanternsAtPoi =
      (region.mood === 'dark' || region.mood === 'deadwood') &&
      ['shrine', 'graveyard', 'dungeon', 'ruins'].includes(poi.type)
        ? 2
        : 1
    for (let index = 0; index < lanternsAtPoi && lightCount < lightLimit; index += 1) {
      const angle =
        poi.rotation +
        (index ? Math.PI : 0) +
        (random() - .5) * .8
      const radius = Math.max(2.7, poi.radius * (.46 + random() * .16))
      const x = poi.x + Math.cos(angle) * radius
      const z = poi.z + Math.sin(angle) * radius
      if (!ambientGroundAllowed(region, x, z, .7, 1.05, false)) continue
      anchors.push({
        kind: 'lantern',
        x,
        z,
        scale: .88 + random() * .24,
        rotation: random() * Math.PI * 2,
        variant: Math.floor(random() * 4),
      })
      lightCount += 1
    }
  }

  return anchors
}

function placeGroundAnchors(
  region: GeneratedRegion,
  anchors: AmbientAnchor[],
  kind: AmbientKind,
  count: number,
  random: () => number,
  minPath: number,
  minRiver: number,
  accept: (x: number, z: number) => boolean,
) {
  let placed = 0
  let attempts = 0
  const width = region.bounds.maxX - region.bounds.minX
  const depth = region.bounds.maxZ - region.bounds.minZ
  while (placed < count && attempts < count * 15) {
    attempts += 1
    const x = region.bounds.minX + 2.2 + random() * Math.max(1, width - 4.4)
    const z = region.bounds.minZ + 2.2 + random() * Math.max(1, depth - 4.4)
    if (!ambientGroundAllowed(region, x, z, minPath, minRiver)) continue
    if (!accept(x, z)) continue
    anchors.push({
      kind,
      x,
      z,
      scale: .72 + random() * .72,
      rotation: random() * Math.PI * 2,
      variant: Math.floor(random() * 4),
    })
    placed += 1
  }
}

function ambientGroundAllowed(
  region: GeneratedRegion,
  x: number,
  z: number,
  minPath: number,
  minRiver: number,
  avoidPois = true,
) {
  if (
    x < region.bounds.minX + 1.2 ||
    x > region.bounds.maxX - 1.2 ||
    z < region.bounds.minZ + 1.2 ||
    z > region.bounds.maxZ - 1.2
  ) {
    return false
  }

  if (distanceToPaths(region, x, z) < minPath) return false

  if (region.terrain.stream.length > 1) {
    const mask = buildRiverOccupancyMask(
      region.terrain.stream,
      region.terrain.streamWidths,
    )
    if (
      mask.points.length &&
      riverOccupancySample(mask, x, z).signedDistance < minRiver
    ) {
      return false
    }
  }

  if (avoidPois) {
    for (const poi of region.pois) {
      if (Math.hypot(x - poi.x, z - poi.z) < poi.radius + .8) return false
    }
  }

  return true
}

function distanceToPaths(region: GeneratedRegion, x: number, z: number) {
  let best = Infinity
  for (const path of region.paths) {
    for (let index = 1; index < path.points.length; index += 1) {
      best = Math.min(
        best,
        pointSegmentDistance(
          x,
          z,
          path.points[index - 1].x,
          path.points[index - 1].z,
          path.points[index].x,
          path.points[index].z,
        ),
      )
    }
  }
  return best
}

function pointSegmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
) {
  const dx = bx - ax
  const dz = bz - az
  const lengthSq = dx * dx + dz * dz
  if (lengthSq < .00001) return Math.hypot(px - ax, pz - az)
  const t = THREE.MathUtils.clamp(
    ((px - ax) * dx + (pz - az) * dz) / lengthSq,
    0,
    1,
  )
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
}

function addGrass(
  group: THREE.Group,
  region: GeneratedRegion,
  anchors: AmbientAnchor[],
) {
  if (!anchors.length) return
  const biome = region.biome.toLowerCase()
  const baseColor =
    biome.includes('autumn') ? 0x887548 :
      biome.includes('highland') ? 0x718064 :
        biome.includes('marsh') || biome.includes('swamp') || biome.includes('drowned') ? 0x536b50 :
          biome.includes('corrupt') ? 0x655f52 :
            0x4d7147
  const moodScalar =
    region.mood === 'dark' ? .7 :
      region.mood === 'deadwood' ? .68 :
        region.mood === 'bleak' ? .76 :
          1
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(baseColor).multiplyScalar(moodScalar),
    roughness: 1,
  })
  const geometry = new THREE.ConeGeometry(.065, .62, 4)
  const bladesPerCluster = 4
  const mesh = new THREE.InstancedMesh(
    geometry,
    material,
    anchors.length * bladesPerCluster,
  )
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  let cursor = 0

  anchors.forEach((item) => {
    const y = sampleTerrainHeight(region, item.x, item.z)
    for (let blade = 0; blade < bladesPerCluster; blade += 1) {
      const angle = item.rotation + blade * 1.71
      const radius = blade === 0 ? 0 : .1 + (blade % 2) * .11
      const height = item.scale * (.62 + (blade % 3) * .13)
      quaternion.setFromEuler(
        new THREE.Euler(
          (blade % 2 ? -.08 : .07),
          angle,
          (blade - 1.5) * .035,
        ),
      )
      scale.set(
        item.scale * (.78 + (blade % 2) * .1),
        height,
        item.scale * (.82 + (blade % 3) * .07),
      )
      matrix.compose(
        new THREE.Vector3(
          item.x + Math.cos(angle) * radius,
          y + .28 * height,
          item.z + Math.sin(angle) * radius,
        ),
        quaternion,
        scale,
      )
      mesh.setMatrixAt(cursor++, matrix)
    }
  })
  mesh.castShadow = false
  mesh.receiveShadow = true
  group.add(mesh)
}

function addFlowers(
  group: THREE.Group,
  region: GeneratedRegion,
  anchors: AmbientAnchor[],
) {
  if (!anchors.length) return
  const stemGeometry = new THREE.CylinderGeometry(.018, .026, .38, 5)
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: 0x486b42,
    roughness: 1,
  })
  const headGeometry = new THREE.DodecahedronGeometry(.072, 0)
  const warm = new THREE.MeshStandardMaterial({
    color: region.biome.toLowerCase().includes('autumn') ? 0xc9954d : 0xd7c76e,
    roughness: .92,
  })
  const cool = new THREE.MeshStandardMaterial({
    color: region.biome.toLowerCase().includes('corrupt') ? 0x9d7eb5 : 0x9889c7,
    roughness: .92,
  })
  const flowersPerCluster = 3
  const stems = new THREE.InstancedMesh(
    stemGeometry,
    stemMaterial,
    anchors.length * flowersPerCluster,
  )
  const warmCount = anchors.length * flowersPerCluster
  const heads = new THREE.InstancedMesh(
    headGeometry,
    region.mood === 'deadwood' ? cool : warm,
    warmCount,
  )
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  let cursor = 0

  anchors.forEach((item) => {
    const y = sampleTerrainHeight(region, item.x, item.z)
    for (let flower = 0; flower < flowersPerCluster; flower += 1) {
      const angle = item.rotation + flower * 2.13
      const radius = .08 + flower * .1
      const x = item.x + Math.cos(angle) * radius
      const z = item.z + Math.sin(angle) * radius
      const height = item.scale * (.72 + flower * .12)
      quaternion.setFromEuler(new THREE.Euler(0, angle, 0))
      scale.set(item.scale, height, item.scale)
      matrix.compose(
        new THREE.Vector3(x, y + .18 * height, z),
        quaternion,
        scale,
      )
      stems.setMatrixAt(cursor, matrix)
      scale.setScalar(item.scale * (.88 + flower * .08))
      matrix.compose(
        new THREE.Vector3(x, y + .39 * height, z),
        quaternion,
        scale,
      )
      heads.setMatrixAt(cursor, matrix)
      cursor += 1
    }
  })
  group.add(stems, heads)
}

function addMushrooms(
  group: THREE.Group,
  region: GeneratedRegion,
  anchors: AmbientAnchor[],
) {
  if (!anchors.length) return
  const stemGeometry = new THREE.CylinderGeometry(.045, .07, .28, 6)
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: 0xd0c8aa,
    roughness: 1,
  })
  const capGeometry = new THREE.SphereGeometry(.16, 8, 5)
  const capColor =
    region.mood === 'deadwood'
      ? 0xb8c9b9
      : region.biome.toLowerCase().includes('autumn')
        ? 0xa9643f
        : 0x8d6656
  const capMaterial = new THREE.MeshStandardMaterial({
    color: capColor,
    emissive: region.mood === 'dark' || region.mood === 'deadwood'
      ? new THREE.Color(capColor).multiplyScalar(.08)
      : 0x000000,
    roughness: .96,
  })
  const perCluster = 3
  const stems = new THREE.InstancedMesh(
    stemGeometry,
    stemMaterial,
    anchors.length * perCluster,
  )
  const caps = new THREE.InstancedMesh(
    capGeometry,
    capMaterial,
    anchors.length * perCluster,
  )
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  let cursor = 0

  anchors.forEach((item) => {
    const y = sampleTerrainHeight(region, item.x, item.z)
    for (let mushroom = 0; mushroom < perCluster; mushroom += 1) {
      const angle = item.rotation + mushroom * 2.2
      const radius = mushroom === 0 ? 0 : .14 + mushroom * .07
      const localScale = item.scale * (.62 + mushroom * .16)
      const x = item.x + Math.cos(angle) * radius
      const z = item.z + Math.sin(angle) * radius
      quaternion.setFromEuler(
        new THREE.Euler(
          mushroom % 2 ? .06 : -.04,
          angle,
          mushroom % 2 ? -.05 : .04,
        ),
      )
      scale.setScalar(localScale)
      matrix.compose(
        new THREE.Vector3(x, y + .13 * localScale, z),
        quaternion,
        scale,
      )
      stems.setMatrixAt(cursor, matrix)
      scale.set(localScale, localScale * .42, localScale)
      matrix.compose(
        new THREE.Vector3(x, y + .3 * localScale, z),
        quaternion,
        scale,
      )
      caps.setMatrixAt(cursor, matrix)
      cursor += 1
    }
  })
  group.add(stems, caps)
}

function addLanterns(
  group: THREE.Group,
  actors: THREE.Object3D[],
  region: GeneratedRegion,
  anchors: AmbientAnchor[],
) {
  const darkMood = region.mood === 'dark' || region.mood === 'deadwood'
  for (const item of anchors) {
    const y = sampleTerrainHeight(region, item.x, item.z)
    const root = new THREE.Group()
    root.position.set(item.x, y, item.z)
    root.rotation.y = item.rotation
    root.scale.setScalar(item.scale)
    root.userData.ambientKind = 'lantern'
    root.userData.phase = item.rotation + item.variant
    root.userData.baseIntensity = darkMood ? 1.45 : .92

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(.045, .065, .72, 6),
      new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        roughness: 1,
      }),
    )
    post.position.y = .36

    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(.22, .27, .22),
      new THREE.MeshStandardMaterial({
        color: 0x5b4a35,
        roughness: .9,
        metalness: .1,
      }),
    )
    housing.position.y = .76

    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(.065, 7, 5),
      new THREE.MeshBasicMaterial({
        color: 0xffc46a,
        transparent: true,
        opacity: .94,
      }),
    )
    flame.position.y = .76

    const glow = new THREE.PointLight(
      0xffaa55,
      darkMood ? 1.45 : .92,
      darkMood ? 7.5 : 5.8,
      2,
    )
    glow.name = 'AmbientLanternGlow'
    glow.position.y = .82

    root.add(post, housing, flame, glow)
    group.add(root)
    actors.push(root)
  }
}

function addFireflies(
  group: THREE.Group,
  actors: THREE.Object3D[],
  region: GeneratedRegion,
  anchors: AmbientAnchor[],
) {
  const biome = region.biome.toLowerCase()
  const color =
    biome.includes('corrupt') ? 0xbca0ec :
      biome.includes('marsh') || biome.includes('swamp') || biome.includes('drowned') ? 0xa5e8ad :
        0xf2db78

  for (const item of anchors) {
    const y = sampleTerrainHeight(region, item.x, item.z)
    const root = new THREE.Group()
    root.position.set(item.x, y + .85 + item.variant * .08, item.z)
    root.userData.ambientKind = 'firefly'
    root.userData.phase = item.rotation + item.variant * .73

    for (let dot = 0; dot < 5; dot += 1) {
      const angle = item.rotation + dot * 1.37
      const radius = .28 + (dot % 3) * .22
      const mote = new THREE.Mesh(
        new THREE.SphereGeometry(.035 + (dot % 2) * .01, 5, 4),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: .72,
          depthWrite: false,
        }),
      )
      mote.position.set(
        Math.cos(angle) * radius,
        .2 + (dot % 3) * .22,
        Math.sin(angle) * radius,
      )
      mote.userData.baseX = mote.position.x
      mote.userData.baseY = mote.position.y
      mote.userData.baseZ = mote.position.z
      root.add(mote)
    }

    group.add(root)
    actors.push(root)
  }
}

function addBirds(
  group: THREE.Group,
  actors: THREE.Object3D[],
  region: GeneratedRegion,
  anchors: AmbientAnchor[],
) {
  const deadwood =
    region.mood === 'deadwood' ||
    region.biome.toLowerCase().includes('corrupt')
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: deadwood ? 0x202125 : 0x3a4039,
    roughness: .9,
  })
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: deadwood ? 0x2b2c31 : 0x4a5048,
    roughness: .92,
  })

  for (const item of anchors) {
    const groundY = sampleTerrainHeight(region, item.x, item.z)
    const bird = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(.18, 7, 5),
      bodyMaterial,
    )
    body.scale.set(1.15, .72, 1.55)

    const wingGeometry = new THREE.ConeGeometry(.17, .52, 4)
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial)
    leftWing.name = 'AmbientBirdWingL'
    leftWing.position.set(-.18, .02, 0)
    leftWing.rotation.set(0, 0, .28)
    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial)
    rightWing.name = 'AmbientBirdWingR'
    rightWing.position.set(.18, .02, 0)
    rightWing.rotation.set(0, 0, -.28)

    bird.add(body, leftWing, rightWing)
    bird.scale.setScalar(item.scale)
    bird.userData.ambientKind = 'bird'
    bird.userData.phase = item.rotation + item.variant * .92
    bird.userData.anchorX = item.x
    bird.userData.anchorY = groundY + 4.2 + item.variant * .35
    bird.userData.anchorZ = item.z
    bird.userData.radius = 2.4 + item.variant * .65
    bird.userData.speed = .14 + item.variant * .025
    bird.position.set(item.x, groundY + 4.2, item.z)
    group.add(bird)
    actors.push(bird)
  }
}

function seededAmbientRandom(seed: number) {
  let state = seed || 1
  return () => {
    state |= 0
    state = state + 0x6D2B79F5 | 0
    let value = Math.imul(state ^ state >>> 15, 1 | state)
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}
