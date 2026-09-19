import * as THREE from 'three'
import {
  buildRiverOccupancyMask,
  riverOccupancySample,
  sampleTerrainHeight,
  sampleTerrainSurface,
  streamWaterSurfaceRows,
  type GeneratedRegion,
} from './guidedWorld'
import {
  markWorldWindMaterial,
  type WorldEnvironmentSample,
} from './worldEnvironment'

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

const ambientRiverMasks = new WeakMap<
  GeneratedRegion,
  ReturnType<typeof buildRiverOccupancyMask>
>()

function ambientRiverMask(region: GeneratedRegion) {
  const cached = ambientRiverMasks.get(region)
  if (cached) return cached
  const mask = buildRiverOccupancyMask(
    region.terrain.stream,
    region.terrain.streamWidths,
  )
  ambientRiverMasks.set(region, mask)
  return mask
}

function addShelteredMist(group: THREE.Group, actors: THREE.Object3D[], region: GeneratedRegion) {
  // Small terrain-following patches; no full-screen veil over combat silhouettes.
  const sites = region.terrain.microBiomes
    .filter(p => p.type === 'moss' || p.type === 'forest-floor')
    .filter(p => !region.terrain.clearings.some(c => Math.hypot(c.x-p.x,c.z-p.z) < c.radius + 5))
    .sort((a,b) => sampleTerrainHeight(region,a.x,a.z)-sampleTerrainHeight(region,b.x,b.z))
    .slice(0,12)
  for (const site of sites) {
    const radius = Math.min(8, site.radius * .5)
    const geometry = new THREE.PlaneGeometry(radius*2,radius*2,6,6)
    geometry.rotateX(-Math.PI/2)
    const positions = geometry.attributes.position
    for (let i=0;i<positions.count;i++) {
      const x=positions.getX(i)+site.x,z=positions.getZ(i)+site.z
      positions.setXYZ(i,x,sampleTerrainHeight(region,x,z)+.32,z)
    }
    geometry.computeBoundingSphere()
    const material = new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,side:THREE.DoubleSide,
      uniforms:{time:{value:0},strength:{value:.055}},
      vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec2 vUv; uniform float time; uniform float strength;
        void main(){vec2 p=vUv*2.0-1.0;float edge=1.0-smoothstep(.2,1.0,length(p));
        float folds=.65+.2*sin(p.x*7.0+p.y*3.0+time*.12)+.15*sin(p.y*11.0-time*.09);
        gl_FragColor=vec4(.48,.59,.55,edge*folds*strength);}`,
    })
    const patch=new THREE.Mesh(geometry,material)
    patch.name='Sheltered ground mist';patch.userData.ambientKind='ground-mist'
    group.add(patch);actors.push(patch)
  }
}

export function buildWorldAmbientVisuals(
  region: GeneratedRegion,
): WorldAmbientVisuals {
  const group = new THREE.Group()
  group.name = 'WorldAmbientLife'
  const actors: THREE.Object3D[] = []
  const anchors = buildAmbientAnchors(region)
  if (region.layout === 'journey-v1') {
    const sanctuary = region.pois.find(p => p.type === 'ruins')
    if (sanctuary) for (const side of [-1, 1]) anchors.push({
      kind: 'lantern', x: sanctuary.x + side * 3, z: sanctuary.z + sanctuary.radius * .55,
      scale: .85, rotation: 0, variant: 0,
    })
    addShelteredMist(group, actors, region)
  }

  addGrass(group, region, anchors.filter((item) => item.kind === 'grass'))
  addFlowers(group, region, anchors.filter((item) => item.kind === 'flower'))
  addMushrooms(group, region, anchors.filter((item) => item.kind === 'mushroom'))
  addLanterns(group, actors, region, anchors.filter((item) => item.kind === 'lantern'))
  addFireflies(group, actors, region, anchors.filter((item) => item.kind === 'firefly'))
  addBirds(group, actors, region, anchors.filter((item) => item.kind === 'bird'))

  // v1.61 living-world presentation layers. These are deterministic visual
  // systems only: they do not alter roads, hydrology, crossings or navigation.
  addEnvironmentalMicroScenes(group, region)
  addRiverbankLife(group, region)
  addFishSchools(group, actors, region)
  addBoundaryTreeline(group, region)

  return { group, actors }
}

export function updateWorldAmbientVisuals(
  visuals: WorldAmbientVisuals,
  time: number,
  environment?: WorldEnvironmentSample,
) {
  for (const actor of visuals.actors) {
    const kind = actor.userData.ambientKind as string | undefined
    const phase = Number(actor.userData.phase ?? 0)

    if (kind === 'ground-mist' && actor instanceof THREE.Mesh && actor.material instanceof THREE.ShaderMaterial) {
      actor.material.uniforms.time.value = time
      actor.material.uniforms.strength.value = environment?.weather === 'mist' ? .16 : .055 + (environment?.night ?? 0) * .025
      continue
    }

    if (kind === 'firefly') {
      const activity = environment?.fireflyActivity ?? 1
      actor.visible = activity > .025
      if (!actor.visible) continue
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
          material.opacity =
            THREE.MathUtils.clamp(
              (.68 + Math.sin(time * 2.6 + phase + index) * .24) *
              activity *
              (.95 + (environment?.night ?? 0) * .15),
              0,
              1,
            )
        }
      })
      continue
    }

    if (kind === 'fish') {
      const anchorX = Number(actor.userData.anchorX ?? actor.position.x)
      const anchorY = Number(actor.userData.anchorY ?? actor.position.y)
      const anchorZ = Number(actor.userData.anchorZ ?? actor.position.z)
      const tangentX = Number(actor.userData.tangentX ?? 0)
      const tangentZ = Number(actor.userData.tangentZ ?? 1)
      const normalX = -tangentZ
      const normalZ = tangentX
      const range = Number(actor.userData.range ?? .8)
      const activity = environment?.fishActivity ?? 1
      actor.visible = activity > .08
      if (!actor.visible) continue
      const speed = Number(actor.userData.speed ?? .55) * (.55 + activity * .45)
      const swim = time * speed + phase
      const travel = Math.sin(swim) * range
      const side = Math.sin(swim * 1.63 + phase * .7) * .12
      const direction = Math.cos(swim) >= 0 ? 1 : -1

      actor.position.set(
        anchorX + tangentX * travel + normalX * side,
        anchorY + Math.sin(swim * 2.1) * .012,
        anchorZ + tangentZ * travel + normalZ * side,
      )
      actor.rotation.y = Math.atan2(
        tangentX * direction,
        tangentZ * direction,
      )

      actor.children.forEach((fish, index) => {
        const baseX = Number(fish.userData.baseX ?? fish.position.x)
        const baseZ = Number(fish.userData.baseZ ?? fish.position.z)
        fish.position.x =
          baseX + Math.sin(time * 1.8 + phase + index * .9) * .025
        fish.position.z =
          baseZ + Math.cos(time * 1.35 + phase + index) * .02
        fish.rotation.y =
          Math.sin(time * 2.35 + phase + index * .7) * .08
      })
      continue
    }

    if (kind === 'bird') {
      const activity = environment?.birdActivity ?? 1
      actor.visible = activity > .06
      if (!actor.visible) continue
      const anchorX = Number(actor.userData.anchorX ?? actor.position.x)
      const anchorY = Number(actor.userData.anchorY ?? actor.position.y)
      const anchorZ = Number(actor.userData.anchorZ ?? actor.position.z)
      const radius = Number(actor.userData.radius ?? 3.2)
      const speed = Number(actor.userData.speed ?? .19) * (.72 + activity * .28)
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
        const activity = environment?.lanternActivity ?? 1
        glow.intensity =
          base *
          activity *
          (.94 +
            Math.sin(time * 7.2 + phase) * .06 +
            Math.sin(time * 3.1 + phase * 2) * .04)
        const baseDistance = Number(
          actor.userData.baseDistance ?? glow.distance,
        )
        glow.distance =
          baseDistance *
          (1 + (environment?.night ?? 0) * .16)
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
        surface.forestFloor > .065 ||
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
        (isForest && surface.forestFloor > .08) ||
        (isAutumn && surface.forestFloor > .06) ||
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
      ? 18
      : region.mood === 'dark'
        ? 15
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
    const mask = ambientRiverMask(region)
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
  const material = markWorldWindMaterial(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(baseColor).multiplyScalar(moodScalar),
      roughness: 1,
    }),
    .92,
  )
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
  const stemMaterial = markWorldWindMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x486b42,
      roughness: 1,
    }),
    .82,
  )
  const headGeometry = new THREE.DodecahedronGeometry(.072, 0)
  const warm = markWorldWindMaterial(
    new THREE.MeshStandardMaterial({
      color: region.biome.toLowerCase().includes('autumn') ? 0xc9954d : 0xd7c76e,
      roughness: .92,
    }),
    .55,
  )
  const cool = markWorldWindMaterial(
    new THREE.MeshStandardMaterial({
      color: region.biome.toLowerCase().includes('corrupt') ? 0x9d7eb5 : 0x9889c7,
      roughness: .92,
    }),
    .55,
  )
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
    root.userData.baseIntensity = darkMood ? 1.8 : 1.12
    root.userData.baseDistance = darkMood ? 10.5 : 7.3

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
      darkMood ? 1.8 : 1.12,
      darkMood ? 10.5 : 7.3,
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

function addEnvironmentalMicroScenes(
  group: THREE.Group,
  region: GeneratedRegion,
) {
  const random = seededAmbientRandom(region.seed ^ 0x61a0b17)
  const width = region.bounds.maxX - region.bounds.minX
  const depth = region.bounds.maxZ - region.bounds.minZ
  const area = Math.max(1, width * depth)
  const targetCount = THREE.MathUtils.clamp(
    Math.round(Math.sqrt(area) / 8.5),
    7,
    15,
  )

  const root = new THREE.Group()
  root.name = 'AmbientMicroScenes'

  const rockMaterial = new THREE.MeshStandardMaterial({
    color: region.mood === 'deadwood' ? 0x555247 : 0x5b6258,
    roughness: 1,
  })
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: region.mood === 'bleak' ? 0x443d36 : 0x4a3628,
    roughness: 1,
  })
  const greenMaterial = new THREE.MeshStandardMaterial({
    color: region.mood === 'dark' || region.mood === 'deadwood'
      ? 0x29402f
      : 0x385b3c,
    roughness: 1,
  })
  const flowerMaterial = new THREE.MeshStandardMaterial({
    color: region.mood === 'deadwood' ? 0x9b966d : 0xc9b968,
    roughness: 1,
  })
  const boneMaterial = new THREE.MeshStandardMaterial({
    color: 0xa8a28d,
    roughness: 1,
  })

  let placed = 0
  let attempts = 0
  while (placed < targetCount && attempts < targetCount * 36) {
    attempts += 1
    const x =
      region.bounds.minX +
      5 +
      random() * Math.max(1, width - 10)
    const z =
      region.bounds.minZ +
      5 +
      random() * Math.max(1, depth - 10)

    if (!ambientGroundAllowed(region, x, z, 2.4, 2.5)) continue

    const pathDistance = distanceToPaths(region, x, z)
    if (pathDistance > 17 && random() < .55) continue

    const scene = new THREE.Group()
    scene.position.set(x, sampleTerrainHeight(region, x, z), z)
    scene.rotation.y = random() * Math.PI * 2
    const variant = Math.floor(random() * 5)

    if (variant === 0) {
      // Mossy stone pocket.
      for (let index = 0; index < 4; index += 1) {
        const angle = index * 1.47 + random() * .35
        const radius = .45 + index * .18
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(.22 + random() * .18, 0),
          rockMaterial,
        )
        rock.position.set(
          Math.cos(angle) * radius,
          .13 + random() * .07,
          Math.sin(angle) * radius,
        )
        rock.scale.y = .55 + random() * .22
        rock.rotation.y = random() * Math.PI
        scene.add(rock)
      }
      const shrub = new THREE.Mesh(
        new THREE.DodecahedronGeometry(.42, 0),
        greenMaterial,
      )
      shrub.position.set(-.52, .3, .35)
      shrub.scale.set(1, .68, 1)
      scene.add(shrub)
    } else if (variant === 1) {
      // Old stump with a few chopped pieces.
      const stump = new THREE.Mesh(
        new THREE.CylinderGeometry(.29, .38, .48, 7),
        woodMaterial,
      )
      stump.position.y = .24
      scene.add(stump)
      for (let index = 0; index < 3; index += 1) {
        const log = new THREE.Mesh(
          new THREE.CylinderGeometry(.09, .12, .72 + index * .08, 6),
          woodMaterial,
        )
        log.position.set(.55 + index * .2, .11, -.2 + index * .18)
        log.rotation.set(Math.PI / 2, .25 + index * .34, 0)
        scene.add(log)
      }
    } else if (variant === 2) {
      // Mushroom/root pocket.
      for (let index = 0; index < 5; index += 1) {
        const angle = index * 1.22
        const radius = .25 + (index % 3) * .2
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(.035, .05, .22, 5),
          new THREE.MeshStandardMaterial({
            color: 0xc6bea2,
            roughness: 1,
          }),
        )
        stem.position.set(
          Math.cos(angle) * radius,
          .11,
          Math.sin(angle) * radius,
        )
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(.11 + (index % 2) * .03, 7, 4),
          new THREE.MeshStandardMaterial({
            color: region.mood === 'deadwood' ? 0xa9b9a9 : 0x8d6656,
            roughness: 1,
          }),
        )
        cap.scale.y = .42
        cap.position.set(stem.position.x, .24, stem.position.z)
        scene.add(stem, cap)
      }
      const rootPiece = new THREE.Mesh(
        new THREE.CylinderGeometry(.055, .09, 1.35, 5),
        woodMaterial,
      )
      rootPiece.position.set(.1, .08, -.5)
      rootPiece.rotation.set(Math.PI / 2, .62, 0)
      scene.add(rootPiece)
    } else if (variant === 3) {
      // Small flower clearing.
      for (let index = 0; index < 10; index += 1) {
        const angle = index * 2.31
        const radius = .2 + (index % 5) * .2
        const flower = new THREE.Mesh(
          new THREE.DodecahedronGeometry(.055 + (index % 2) * .015, 0),
          flowerMaterial,
        )
        flower.position.set(
          Math.cos(angle) * radius,
          .12 + (index % 3) * .02,
          Math.sin(angle) * radius,
        )
        scene.add(flower)
      }
    } else {
      // Trail-side remains: a broken marker and tiny bone fragments.
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(.055, .085, .95, 6),
        woodMaterial,
      )
      post.position.set(-.35, .42, 0)
      post.rotation.z = -.13
      scene.add(post)
      const cross = new THREE.Mesh(
        new THREE.BoxGeometry(.68, .07, .08),
        woodMaterial,
      )
      cross.position.set(-.3, .68, 0)
      cross.rotation.z = .12
      scene.add(cross)
      for (let index = 0; index < 2; index += 1) {
        const bone = new THREE.Mesh(
          new THREE.CylinderGeometry(.025, .035, .52, 5),
          boneMaterial,
        )
        bone.position.set(.25 + index * .28, .045, .18 - index * .24)
        bone.rotation.set(Math.PI / 2, .55 + index * .8, 0)
        scene.add(bone)
      }
    }

    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = false
        object.receiveShadow = true
      }
    })
    root.add(scene)
    placed += 1
  }

  group.add(root)
}

function addRiverbankLife(
  group: THREE.Group,
  region: GeneratedRegion,
) {
  if (region.terrain.stream.length < 2) return

  const rows = streamWaterSurfaceRows(region, 5, .065).rows.filter(
    (row) =>
      row.x > region.bounds.minX + 1.2 &&
      row.x < region.bounds.maxX - 1.2 &&
      row.z > region.bounds.minZ + 1.2 &&
      row.z < region.bounds.maxZ - 1.2,
  )
  if (rows.length < 4) return

  const random = seededAmbientRandom(region.seed ^ 0x41b4a3)
  const root = new THREE.Group()
  root.name = 'AmbientRiverbankLife'

  const reedMaterial = markWorldWindMaterial(
    new THREE.MeshStandardMaterial({
      color: region.mood === 'bleak' ? 0x59634d : 0x607653,
      roughness: 1,
    }),
    1,
  )
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: region.mood === 'dark' ? 0x48534c : 0x5b655d,
    roughness: 1,
  })
  const mudMaterial = new THREE.MeshStandardMaterial({
    color: region.mood === 'deadwood' ? 0x4b4232 : 0x4a4937,
    roughness: 1,
    transparent: true,
    opacity: .42,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x443329,
    roughness: 1,
  })

  const count = THREE.MathUtils.clamp(
    Math.round(rows.length / 28),
    8,
    18,
  )

  for (let site = 0; site < count; site += 1) {
    const target =
      ((site + .45) / count) * (rows.length - 1) +
      (random() - .5) * Math.min(18, rows.length / count)
    const index = THREE.MathUtils.clamp(
      Math.round(target),
      1,
      rows.length - 2,
    )
    const row = rows[index]
    if (nearAmbientCrossing(region, row.x, row.z, 4.4)) continue

    const previous = rows[index - 1]
    const next = rows[index + 1]
    const dx = next.x - previous.x
    const dz = next.z - previous.z
    const length = Math.hypot(dx, dz) || 1
    const tangentX = dx / length
    const tangentZ = dz / length
    const normalX = -tangentZ
    const normalZ = tangentX
    const side = random() < .5 ? -1 : 1
    const offset = row.width * .5 + .52 + random() * .65
    const x = row.x + normalX * offset * side
    const z = row.z + normalZ * offset * side

    if (
      x < region.bounds.minX + .7 ||
      x > region.bounds.maxX - .7 ||
      z < region.bounds.minZ + .7 ||
      z > region.bounds.maxZ - .7
    ) {
      continue
    }

    const y = sampleTerrainHeight(region, x, z)

    const patch = new THREE.Mesh(
      new THREE.CircleGeometry(.72 + random() * .38, 9),
      mudMaterial,
    )
    patch.rotation.x = -Math.PI / 2
    patch.rotation.z = random() * Math.PI
    patch.scale.set(1.25, .7, 1)
    patch.position.set(x, y + .018, z)
    patch.renderOrder = 2
    root.add(patch)

    const reedCount = 4 + Math.floor(random() * 4)
    for (let blade = 0; blade < reedCount; blade += 1) {
      const angle = random() * Math.PI * 2
      const radius = .12 + random() * .38
      const reed = new THREE.Mesh(
        new THREE.CylinderGeometry(
          .022,
          .04,
          .62 + random() * .48,
          5,
        ),
        reedMaterial,
      )
      reed.position.set(
        x + Math.cos(angle) * radius,
        y + .34,
        z + Math.sin(angle) * radius,
      )
      reed.rotation.z = (random() - .5) * .08
      root.add(reed)
    }

    for (let rockIndex = 0; rockIndex < 2; rockIndex += 1) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(.16 + random() * .15, 0),
        rockMaterial,
      )
      rock.position.set(
        x + (random() - .5) * 1.1,
        y + .11,
        z + (random() - .5) * .85,
      )
      rock.scale.y = .55 + random() * .2
      rock.rotation.y = random() * Math.PI
      root.add(rock)
    }

    if (site % 4 === 1) {
      const driftwood = new THREE.Mesh(
        new THREE.CylinderGeometry(.07, .1, 1.25 + random() * .55, 6),
        woodMaterial,
      )
      driftwood.position.set(
        x + tangentX * .45,
        y + .1,
        z + tangentZ * .45,
      )
      driftwood.rotation.set(Math.PI / 2, Math.atan2(tangentX, tangentZ), 0)
      root.add(driftwood)
    }
  }

  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = false
      object.receiveShadow = true
    }
  })
  group.add(root)
}

function addFishSchools(
  group: THREE.Group,
  actors: THREE.Object3D[],
  region: GeneratedRegion,
) {
  if (region.terrain.stream.length < 2) return

  const rows = streamWaterSurfaceRows(region, 5, .065).rows.filter(
    (row) =>
      row.width >= 1.35 &&
      row.x > region.bounds.minX + 1 &&
      row.x < region.bounds.maxX - 1 &&
      row.z > region.bounds.minZ + 1 &&
      row.z < region.bounds.maxZ - 1 &&
      !nearAmbientCrossing(region, row.x, row.z, 4.8),
  )
  if (rows.length < 6) return

  const random = seededAmbientRandom(region.seed ^ 0xf15c4e)
  const moodBase =
    region.mood === 'deadwood' ? 2 :
      region.mood === 'bleak' ? 2 :
        region.mood === 'dark' ? 3 :
          5
  const schoolCount = Math.min(
    moodBase,
    Math.max(1, Math.floor(rows.length / 36)),
  )

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color:
      region.mood === 'deadwood' || region.mood === 'bleak'
        ? 0x48534d
        : 0x5d7168,
    roughness: .58,
    metalness: .04,
  })
  const tailMaterial = new THREE.MeshStandardMaterial({
    color:
      region.mood === 'deadwood' || region.mood === 'bleak'
        ? 0x3e4742
        : 0x4d6259,
    roughness: .7,
  })

  for (let school = 0; school < schoolCount; school += 1) {
    const target =
      ((school + 1) / (schoolCount + 1)) * (rows.length - 1) +
      (random() - .5) * Math.min(24, rows.length / schoolCount)
    const index = THREE.MathUtils.clamp(
      Math.round(target),
      1,
      rows.length - 2,
    )
    const row = rows[index]
    const previous = rows[index - 1]
    const next = rows[index + 1]
    const dx = next.x - previous.x
    const dz = next.z - previous.z
    const length = Math.hypot(dx, dz) || 1
    const tangentX = dx / length
    const tangentZ = dz / length

    const root = new THREE.Group()
    root.userData.ambientKind = 'fish'
    root.userData.phase = random() * Math.PI * 2
    root.userData.anchorX = row.x
    root.userData.anchorY = row.y + .035
    root.userData.anchorZ = row.z
    root.userData.tangentX = tangentX
    root.userData.tangentZ = tangentZ
    root.userData.range = Math.min(1.15, Math.max(.48, row.width * .28))
    root.userData.speed = .42 + random() * .18

    const fishCount = 3 + Math.floor(random() * 3)
    for (let fishIndex = 0; fishIndex < fishCount; fishIndex += 1) {
      const fish = new THREE.Group()
      const body = new THREE.Mesh(
        new THREE.DodecahedronGeometry(.13, 0),
        bodyMaterial,
      )
      body.scale.set(1, .48, 1.65)
      body.castShadow = false

      const tail = new THREE.Mesh(
        new THREE.ConeGeometry(.085, .2, 3),
        tailMaterial,
      )
      tail.rotation.x = Math.PI / 2
      tail.position.z = -.23

      fish.add(body, tail)
      const localX = (random() - .5) * Math.min(.62, row.width * .28)
      const localZ = (fishIndex - (fishCount - 1) * .5) * .22
      fish.position.set(localX, (random() - .5) * .025, localZ)
      fish.userData.baseX = localX
      fish.userData.baseZ = localZ
      fish.scale.setScalar(.78 + random() * .34)
      root.add(fish)
    }

    root.position.set(
      row.x,
      row.y + .035,
      row.z,
    )
    group.add(root)
    actors.push(root)
  }
}

function addBoundaryTreeline(
  group: THREE.Group,
  region: GeneratedRegion,
) {
  const random = seededAmbientRandom(region.seed ^ 0xb0a4d4)
  const root = new THREE.Group()
  root.name = 'WorldBoundaryTreeline'

  const darkMood =
    region.mood === 'dark' ||
    region.mood === 'deadwood' ||
    region.mood === 'bleak'
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: darkMood ? 0x30291f : 0x3c3025,
    roughness: 1,
  })
  const canopyMaterial = markWorldWindMaterial(
    new THREE.MeshStandardMaterial({
      color:
        region.mood === 'deadwood'
          ? 0x343a30
          : region.mood === 'bleak'
            ? 0x34413a
            : region.mood === 'dark'
              ? 0x203b2a
              : 0x294b31,
      roughness: 1,
    }),
    .4,
  )

  const trunkGeometry = new THREE.CylinderGeometry(.18, .3, 3.4, 6)
  const canopyGeometry = new THREE.ConeGeometry(1.45, 3.15, 7)
  const width = region.bounds.maxX - region.bounds.minX
  const depth = region.bounds.maxZ - region.bounds.minZ
  const count = THREE.MathUtils.clamp(
    Math.round((width + depth) / 3.6),
    48,
    78,
  )

  for (let index = 0; index < count; index += 1) {
    const side = index % 4
    const t = random()
    const outward = 5 + random() * 9
    let x = 0
    let z = 0
    let sampleX = 0
    let sampleZ = 0

    if (side === 0) {
      x = THREE.MathUtils.lerp(region.bounds.minX, region.bounds.maxX, t)
      z = region.bounds.minZ - outward
      sampleX = x
      sampleZ = region.bounds.minZ
    } else if (side === 1) {
      x = region.bounds.maxX + outward
      z = THREE.MathUtils.lerp(region.bounds.minZ, region.bounds.maxZ, t)
      sampleX = region.bounds.maxX
      sampleZ = z
    } else if (side === 2) {
      x = THREE.MathUtils.lerp(region.bounds.minX, region.bounds.maxX, t)
      z = region.bounds.maxZ + outward
      sampleX = x
      sampleZ = region.bounds.maxZ
    } else {
      x = region.bounds.minX - outward
      z = THREE.MathUtils.lerp(region.bounds.minZ, region.bounds.maxZ, t)
      sampleX = region.bounds.minX
      sampleZ = z
    }

    const y = sampleTerrainHeight(region, sampleX, sampleZ)
    const tree = new THREE.Group()
    tree.position.set(x, y, z)
    tree.rotation.y = random() * Math.PI * 2
    const scale = 1.1 + random() * .85
    tree.scale.setScalar(scale)

    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial)
    trunk.position.y = 1.7
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial)
    canopy.position.y = 4.1
    canopy.rotation.y = random() * .5

    tree.add(trunk, canopy)
    root.add(tree)
  }

  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = false
      object.receiveShadow = false
    }
  })
  group.add(root)
}

function nearAmbientCrossing(
  region: GeneratedRegion,
  x: number,
  z: number,
  extra: number,
) {
  return region.crossings.some(
    (crossing) =>
      Math.hypot(x - crossing.x, z - crossing.z) <
      Math.max(extra, crossing.width * 1.7 + 1.2),
  )
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
