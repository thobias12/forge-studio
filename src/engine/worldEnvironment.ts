import * as THREE from 'three'
import {
  streamWaterSurfaceRows,
  type GeneratedRegion,
  type WorldMood,
} from './guidedWorld'

export type WorldWeather = 'clear' | 'cloudy' | 'mist' | 'rain' | 'storm'

export type WorldEnvironmentConfig = {
  hour: number
  weather: WorldWeather
  paused: boolean
  speed: number
}

export type WorldEnvironmentSample = {
  hour: number
  weather: WorldWeather
  daylight: number
  night: number
  twilight: number
  wind: number
  rain: number
  wetness: number
  localFog: number
  lightning: number
  birdActivity: number
  fireflyActivity: number
  lanternActivity: number
  fishActivity: number
  background: number
  fog: number
  fogDensity: number
  exposure: number
  hemisphereSky: number
  hemisphereGround: number
  hemisphereIntensity: number
  sunColor: number
  sunIntensity: number
  sunPosition: [number, number, number]
  fillColor: number
  fillIntensity: number
}

export type WorldWeatherVisuals = {
  group: THREE.Group
  rainRoot: THREE.Group
  rain: THREE.Points
  mist: THREE.Group
  mistMaterial?: THREE.SpriteMaterial
}

export const WORLD_DAY_SECONDS = 30 * 60

export const DEFAULT_WORLD_ENVIRONMENT: WorldEnvironmentConfig = {
  hour: 10.5,
  weather: 'clear',
  paused: false,
  speed: 1,
}

type MoodBase = {
  dayBackground: number
  nightBackground: number
  dayFog: number
  nightFog: number
  fogDensity: number
  exposure: number
  daySky: number
  nightSky: number
  ground: number
  daySun: number
  duskSun: number
  nightLight: number
  fill: number
}

const WEATHER_STYLE: Record<
  WorldWeather,
  {
    sun: number
    hemi: number
    fog: number
    exposure: number
    wind: number
    rain: number
    wetness: number
    localFog: number
  }
> = {
  clear: {
    sun: 1,
    hemi: 1,
    fog: 1,
    exposure: 1,
    wind: .2,
    rain: 0,
    wetness: 0,
    localFog: .04,
  },
  cloudy: {
    sun: .68,
    hemi: .94,
    fog: 1.16,
    exposure: .95,
    wind: .32,
    rain: 0,
    wetness: .08,
    localFog: .12,
  },
  mist: {
    sun: .45,
    hemi: .9,
    fog: 1.72,
    exposure: .91,
    wind: .12,
    rain: 0,
    wetness: .12,
    localFog: .72,
  },
  rain: {
    sun: .52,
    hemi: .84,
    fog: 1.34,
    exposure: .88,
    wind: .52,
    rain: .78,
    wetness: .82,
    localFog: .32,
  },
  storm: {
    sun: .28,
    hemi: .72,
    fog: 1.52,
    exposure: .8,
    wind: .96,
    rain: 1,
    wetness: 1,
    localFog: .42,
  },
}

export function advanceWorldHour(
  hour: number,
  deltaSeconds: number,
  speed = 1,
) {
  return wrapHour(
    hour + deltaSeconds * speed * (24 / WORLD_DAY_SECONDS),
  )
}

export function formatWorldHour(hour: number) {
  const wrapped = wrapHour(hour)
  const hours = Math.floor(wrapped)
  const minutes = Math.floor((wrapped - hours) * 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function sampleWorldEnvironment(
  mood: WorldMood,
  hour: number,
  weather: WorldWeather,
  elapsedSeconds = 0,
  seed = 1,
): WorldEnvironmentSample {
  const wrapped = wrapHour(hour)
  const base = moodBase(mood)
  const weatherStyle = WEATHER_STYLE[weather]

  const solarAngle = (wrapped - 6) / 24 * Math.PI * 2
  const altitude = Math.sin(solarAngle)
  const daylight = smoothstep(-.14, .24, altitude)
  const night = 1 - daylight
  const twilight =
    (1 - smoothstep(.08, .58, Math.abs(altitude))) *
    (.45 + daylight * .55)

  const cloudDarkness =
    weather === 'storm' ? .18 :
      weather === 'rain' ? .1 :
        weather === 'mist' ? .08 :
          weather === 'cloudy' ? .045 :
            0

  const duskBackground = mixHex(
    base.nightBackground,
    base.dayBackground,
    .46,
  )
  let background = mixHex(
    base.nightBackground,
    base.dayBackground,
    daylight,
  )
  background = mixHex(background, duskBackground, twilight * .22)
  background = scaleHex(background, 1 - cloudDarkness)

  const fog = mixHex(base.nightFog, base.dayFog, daylight)
  const fogDensity =
    base.fogDensity *
    weatherStyle.fog *
    (1 + night * .12)

  const seedPhase = (seed % 997) * .0137
  const lightningWave =
    weather === 'storm'
      ? Math.sin(elapsedSeconds * .72 + seedPhase)
      : -1
  const lightning =
    weather === 'storm'
      ? Math.pow(
          smoothstep(.986, 1, (lightningWave + 1) * .5),
          2.2,
        )
      : 0

  if (lightning > .001) {
    background = mixHex(background, 0xb9c6c8, lightning * .42)
  }

  const daySky = mixHex(base.nightSky, base.daySky, daylight)
  const hemisphereIntensity =
    (.62 + daylight * 1.18) *
    weatherStyle.hemi +
    lightning * 1.6

  const daylightSunColor = mixHex(
    base.duskSun,
    base.daySun,
    smoothstep(.18, .72, daylight),
  )
  const sunColor = mixHex(
    base.nightLight,
    daylightSunColor,
    smoothstep(.04, .34, daylight),
  )
  const sunIntensity =
    (.14 + daylight * 2.6) *
      weatherStyle.sun +
    twilight * .34 +
    lightning * 4.5

  const azimuth = wrapped / 24 * Math.PI * 2 + .6
  const nightLightHeight =
    Math.max(16, -altitude * 44)
  const sunPosition: [number, number, number] = [
    Math.cos(azimuth) * 58,
    daylight > .08
      ? Math.max(10, altitude * 72)
      : nightLightHeight,
    Math.sin(azimuth) * 58,
  ]

  const exposure =
    base.exposure *
      (.86 + daylight * .14) *
      weatherStyle.exposure +
    lightning * .18

  const rain = weatherStyle.rain
  const wind =
    THREE.MathUtils.clamp(
      weatherStyle.wind *
        (.88 + Math.sin(elapsedSeconds * .11 + seedPhase) * .12),
      0,
      1,
    )

  const precipitationPenalty =
    weather === 'storm' ? .12 :
      weather === 'rain' ? .28 :
        weather === 'mist' ? .48 :
          weather === 'cloudy' ? .8 :
            1

  const birdActivity =
    THREE.MathUtils.clamp(
      daylight * precipitationPenalty,
      0,
      1,
    )
  const fireflyActivity =
    THREE.MathUtils.clamp(
      (.12 + night * .98 + twilight * .35) *
        (weather === 'rain' ? .7 : weather === 'storm' ? .45 : 1),
      0,
      1,
    )
  const lanternActivity =
    THREE.MathUtils.clamp(.18 + night * 1.08 + twilight * .42, .18, 1.2)
  const fishActivity =
    THREE.MathUtils.clamp(
      weather === 'storm' ? .48 :
        weather === 'rain' ? .68 :
          weather === 'mist' ? .82 :
            .95,
      .35,
      1,
    )

  return {
    hour: wrapped,
    weather,
    daylight,
    night,
    twilight,
    wind,
    rain,
    wetness: weatherStyle.wetness,
    localFog:
      THREE.MathUtils.clamp(
        weatherStyle.localFog +
        night * .05 +
        (mood === 'deadwood' ? .08 : mood === 'dark' ? .04 : 0),
        0,
        1,
      ),
    lightning,
    birdActivity,
    fireflyActivity,
    lanternActivity,
    fishActivity,
    background,
    fog,
    fogDensity,
    exposure,
    hemisphereSky: daySky,
    hemisphereGround: base.ground,
    hemisphereIntensity,
    sunColor,
    sunIntensity,
    sunPosition,
    fillColor: base.fill,
    fillIntensity:
      (.42 + daylight * .38) *
      weatherStyle.hemi +
      lightning * 1.4,
  }
}

export function createWorldWeatherVisuals(
  region: GeneratedRegion,
): WorldWeatherVisuals {
  const group = new THREE.Group()
  group.name = 'WorldEnvironmentVisuals'

  const rainRoot = new THREE.Group()
  rainRoot.name = 'WorldRainVolume'
  group.add(rainRoot)

  const random = seededEnvironmentRandom(region.seed ^ 0x62a0f1)
  const dropCount = 720
  const positions = new Float32Array(dropCount * 3)
  for (let index = 0; index < dropCount; index += 1) {
    const cursor = index * 3
    positions[cursor] = (random() - .5) * 36
    positions[cursor + 1] = -5 + random() * 22
    positions[cursor + 2] = (random() - .5) * 36
  }

  const rainGeometry = new THREE.BufferGeometry()
  rainGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3),
  )
  const rainMaterial = new THREE.PointsMaterial({
    color: 0xb9cdd1,
    size: .065,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const rain = new THREE.Points(rainGeometry, rainMaterial)
  rain.frustumCulled = false
  rain.visible = false
  rainRoot.add(rain)

  const mist = new THREE.Group()
  mist.name = 'WorldLocalMist'
  group.add(mist)

  const mistTexture = makeSoftMistTexture()
  const mistMaterial = mistTexture
    ? new THREE.SpriteMaterial({
        map: mistTexture,
        color: 0xd1ddd7,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
      })
    : undefined

  if (mistMaterial) {
    const rows = streamWaterSurfaceRows(region, 5, .065).rows.filter(
      (row) =>
        row.x > region.bounds.minX + 2 &&
        row.x < region.bounds.maxX - 2 &&
        row.z > region.bounds.minZ + 2 &&
        row.z < region.bounds.maxZ - 2,
    )
    const pocketCount = Math.min(10, Math.max(4, Math.floor(rows.length / 26)))
    for (let index = 0; index < pocketCount; index += 1) {
      const row =
        rows[Math.min(
          rows.length - 1,
          Math.max(
            0,
            Math.floor(
              ((index + .55) / pocketCount) * rows.length +
              (random() - .5) * 10,
            ),
          ),
        )]
      if (!row) continue
      const sprite = new THREE.Sprite(mistMaterial)
      sprite.position.set(
        row.x + (random() - .5) * 2.4,
        row.y + .48 + random() * .35,
        row.z + (random() - .5) * 2.4,
      )
      const width = 5.5 + random() * 4.5
      sprite.scale.set(width, 2 + random() * 1.3, 1)
      sprite.userData.baseOpacity = .62 + random() * .28
      mist.add(sprite)
    }
  }

  return {
    group,
    rainRoot,
    rain,
    mist,
    mistMaterial,
  }
}

export function updateWorldWeatherVisuals(
  visuals: WorldWeatherVisuals,
  camera: THREE.Camera,
  sample: WorldEnvironmentSample,
  elapsedSeconds: number,
  deltaSeconds: number,
) {
  const rainMaterial = visuals.rain.material
  if (rainMaterial instanceof THREE.PointsMaterial) {
    visuals.rain.visible = sample.rain > .02
    rainMaterial.opacity = sample.rain * (.38 + sample.night * .18)
    rainMaterial.size = .055 + sample.rain * .025
  }

  if (visuals.rain.visible) {
    visuals.rainRoot.position.set(
      camera.position.x,
      camera.position.y - 4.5,
      camera.position.z,
    )
    const attribute = visuals.rain.geometry.getAttribute('position')
    if (attribute instanceof THREE.BufferAttribute) {
      const fallSpeed = 11 + sample.rain * 9
      const windPush = sample.wind * 2.8
      for (let index = 0; index < attribute.count; index += 1) {
        let x = attribute.getX(index)
        let y = attribute.getY(index)
        let z = attribute.getZ(index)
        y -= fallSpeed * deltaSeconds
        x += windPush * deltaSeconds
        z += Math.sin(elapsedSeconds * .18 + index * .37) *
          sample.wind *
          deltaSeconds *
          .45
        if (y < -6) y += 22
        if (x > 18) x -= 36
        if (x < -18) x += 36
        if (z > 18) z -= 36
        if (z < -18) z += 36
        attribute.setXYZ(index, x, y, z)
      }
      attribute.needsUpdate = true
    }
  }

  if (visuals.mistMaterial) {
    visuals.mist.visible = sample.localFog > .025
    visuals.mistMaterial.opacity =
      sample.localFog *
      (.08 + sample.night * .035)
    visuals.mist.children.forEach((child, index) => {
      if (!(child instanceof THREE.Sprite)) return
      const base = Number(child.userData.baseOpacity ?? .75)
      child.material.opacity =
        visuals.mistMaterial!.opacity *
        base *
        (.9 + Math.sin(elapsedSeconds * .18 + index) * .1)
      child.position.x +=
        Math.sin(elapsedSeconds * .08 + index * 1.3) *
        sample.wind *
        deltaSeconds *
        .06
    })
  }
}

export function applyWorldEnvironmentToScene(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  sample: WorldEnvironmentSample,
  elapsedSeconds: number,
) {
  if (scene.background instanceof THREE.Color) {
    scene.background.set(sample.background)
  } else {
    scene.background = new THREE.Color(sample.background)
  }

  if (scene.fog instanceof THREE.FogExp2) {
    scene.fog.color.set(sample.fog)
    scene.fog.density = sample.fogDensity
  } else {
    scene.fog = new THREE.FogExp2(sample.fog, sample.fogDensity)
  }

  renderer.toneMappingExposure = sample.exposure

  const refs = environmentSceneRefs(scene)
  if (refs.hemisphere) {
    refs.hemisphere.color.set(sample.hemisphereSky)
    refs.hemisphere.groundColor.set(sample.hemisphereGround)
    refs.hemisphere.intensity = sample.hemisphereIntensity
  }
  if (refs.sun) {
    refs.sun.color.set(sample.sunColor)
    refs.sun.intensity = sample.sunIntensity
    refs.sun.position.set(...sample.sunPosition)
  }
  if (refs.fill) {
    refs.fill.color.set(sample.fillColor)
    refs.fill.intensity = sample.fillIntensity
  }

  const terrainDarken = 1 - sample.wetness * .09
  for (const mesh of refs.wetMeshes) {
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]
    materials.forEach((material) => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return
      if (material.userData.forgeBaseRoughness === undefined) {
        material.userData.forgeBaseRoughness = material.roughness
        material.userData.forgeBaseColor = material.color.clone()
      }
      const baseRoughness = Number(material.userData.forgeBaseRoughness)
      const baseColor = material.userData.forgeBaseColor as THREE.Color
      material.roughness = THREE.MathUtils.clamp(
        baseRoughness - sample.wetness * .16,
        .28,
        1,
      )
      material.color.copy(baseColor).multiplyScalar(terrainDarken)
    })
  }

  if (refs.waterMaterial) {
    refs.waterMaterial.roughness =
      THREE.MathUtils.clamp(.44 + sample.rain * .12 - sample.night * .04, .32, .7)
    refs.waterMaterial.emissiveIntensity =
      .08 + sample.night * .12 + sample.rain * .03
    installWaterMotion(refs.waterMaterial)
    const shader = refs.waterMaterial.userData.forgeWaterShader as
      | any
      | undefined
    if (shader) {
      if (shader.uniforms.uForgeWaterTime) {
        shader.uniforms.uForgeWaterTime.value = elapsedSeconds
      }
      if (shader.uniforms.uForgeWaterMotion) {
        shader.uniforms.uForgeWaterMotion.value =
          .7 + sample.wind * .48 + sample.rain * .7
      }
    }
  }

  for (const material of refs.windMaterials) {
    installWindMotion(material)
    const shader = material.userData.forgeWindShader as
      | any
      | undefined
    if (!shader) continue
    shader.uniforms.uForgeWindTime.value = elapsedSeconds
    shader.uniforms.uForgeWindStrength.value = sample.wind
  }

  for (const light of refs.environmentLights) {
    const base = Number(light.userData.forgeEnvironmentLightBase ?? light.intensity)
    light.intensity =
      base *
      sample.lanternActivity *
      (.92 + Math.sin(elapsedSeconds * 6.7 + light.id) * .045)
  }
}

export function resetWorldEnvironmentSceneCache(scene: THREE.Scene) {
  delete scene.userData.forgeEnvironmentRefs
}

export function markWorldWindMaterial<T extends THREE.Material>(
  material: T,
  amount = 1,
): T {
  material.userData.forgeWindAmount = amount
  return material
}

function environmentSceneRefs(scene: THREE.Scene) {
  const cached = scene.userData.forgeEnvironmentRefs as
    | {
        hemisphere?: THREE.HemisphereLight
        sun?: THREE.DirectionalLight
        fill?: THREE.DirectionalLight
        wetMeshes: THREE.Mesh[]
        waterMaterial?: THREE.MeshStandardMaterial
        windMaterials: THREE.MeshStandardMaterial[]
        environmentLights: THREE.PointLight[]
      }
    | undefined
  if (cached) return cached

  const wetMeshes: THREE.Mesh[] = []
  const windMaterials = new Set<THREE.MeshStandardMaterial>()
  const environmentLights: THREE.PointLight[] = []
  let waterMaterial: THREE.MeshStandardMaterial | undefined

  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      if (
        object.name === 'GeneratedTerrain' ||
        object.name === 'MainRoad' ||
        object.name === 'SideTrail'
      ) {
        wetMeshes.push(object)
      }
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material]
      materials.forEach((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return
        if (material.userData.forgeWindAmount !== undefined) {
          windMaterials.add(material)
        }
        if (object.name === 'GeneratedWaterSurface') {
          waterMaterial = material
        }
      })
    }
    if (
      object instanceof THREE.PointLight &&
      object.userData.forgeEnvironmentLightBase !== undefined
    ) {
      environmentLights.push(object)
    }
  })

  const refs = {
    hemisphere: scene.getObjectByName('WorldMoodHemisphere') instanceof THREE.HemisphereLight
      ? scene.getObjectByName('WorldMoodHemisphere') as THREE.HemisphereLight
      : undefined,
    sun: scene.getObjectByName('WorldMoodSun') instanceof THREE.DirectionalLight
      ? scene.getObjectByName('WorldMoodSun') as THREE.DirectionalLight
      : undefined,
    fill: scene.getObjectByName('WorldMoodFill') instanceof THREE.DirectionalLight
      ? scene.getObjectByName('WorldMoodFill') as THREE.DirectionalLight
      : undefined,
    wetMeshes,
    waterMaterial,
    windMaterials: [...windMaterials],
    environmentLights,
  }
  scene.userData.forgeEnvironmentRefs = refs
  return refs
}

function installWaterMotion(material: THREE.MeshStandardMaterial) {
  if (material.userData.forgeWaterMotionInstalled) return
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer)
    shader.uniforms.uForgeWaterTime = { value: 0 }
    shader.uniforms.uForgeWaterMotion = { value: 1 }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uForgeWaterTime;\nuniform float uForgeWaterMotion;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float forgeWaterWave =
          sin(position.x * 0.72 + uForgeWaterTime * 1.55) * 0.012 +
          cos(position.z * 0.61 - uForgeWaterTime * 1.16) * 0.009;
        transformed.y += forgeWaterWave * uForgeWaterMotion;`,
      )
    material.userData.forgeWaterShader = shader
  }
  material.customProgramCacheKey = () => 'forge-water-motion-v1'
  material.userData.forgeWaterMotionInstalled = true
  material.needsUpdate = true
}

function installWindMotion(material: THREE.MeshStandardMaterial) {
  if (material.userData.forgeWindMotionInstalled) return
  const amount = Number(material.userData.forgeWindAmount ?? 1)
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer)
    shader.uniforms.uForgeWindTime = { value: 0 }
    shader.uniforms.uForgeWindStrength = { value: 0 }
    shader.uniforms.uForgeWindAmount = { value: amount }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uForgeWindTime;\nuniform float uForgeWindStrength;\nuniform float uForgeWindAmount;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float forgeWindPhase =
          modelMatrix[3].x * 0.17 +
          modelMatrix[3].z * 0.13;
        #ifdef USE_INSTANCING
          forgeWindPhase +=
            instanceMatrix[3].x * 0.11 +
            instanceMatrix[3].z * 0.09;
        #endif
        float forgeWindHeight = clamp(position.y, 0.0, 6.0);
        float forgeWindWave =
          sin(uForgeWindTime * 1.55 + forgeWindPhase) * 0.65 +
          sin(uForgeWindTime * 0.73 + forgeWindPhase * 1.7) * 0.35;
        transformed.x +=
          forgeWindWave *
          uForgeWindStrength *
          uForgeWindAmount *
          forgeWindHeight *
          0.035;
        transformed.z +=
          cos(uForgeWindTime * 1.21 + forgeWindPhase) *
          uForgeWindStrength *
          uForgeWindAmount *
          forgeWindHeight *
          0.017;`,
      )
    material.userData.forgeWindShader = shader
  }
  material.customProgramCacheKey = () =>
    `forge-wind-motion-v1-${amount.toFixed(2)}`
  material.userData.forgeWindMotionInstalled = true
  material.needsUpdate = true
}

function moodBase(mood: WorldMood): MoodBase {
  if (mood === 'dark') {
    return {
      dayBackground: 0x18231b,
      nightBackground: 0x0d1410,
      dayFog: 0x17241b,
      nightFog: 0x121a15,
      fogDensity: .0084,
      exposure: .98,
      daySky: 0xb8c9bd,
      nightSky: 0x35483f,
      ground: 0x202b24,
      daySun: 0xdfcaa8,
      duskSun: 0xe58d55,
      nightLight: 0x8fa8b8,
      fill: 0x6f8c79,
    }
  }
  if (mood === 'deadwood') {
    return {
      dayBackground: 0x20231d,
      nightBackground: 0x111610,
      dayFog: 0x25291f,
      nightFog: 0x181d16,
      fogDensity: .0082,
      exposure: 1,
      daySky: 0xc4c7b8,
      nightSky: 0x474b40,
      ground: 0x2d2a23,
      daySun: 0xd8c3a4,
      duskSun: 0xd77f49,
      nightLight: 0xa4acb6,
      fill: 0x7b806c,
    }
  }
  if (mood === 'bleak') {
    return {
      dayBackground: 0x252c29,
      nightBackground: 0x121917,
      dayFog: 0x2b3430,
      nightFog: 0x1b2421,
      fogDensity: .0078,
      exposure: 1.02,
      daySky: 0xc5ceca,
      nightSky: 0x46554f,
      ground: 0x303733,
      daySun: 0xd6d2c5,
      duskSun: 0xc49b7a,
      nightLight: 0x9eb1bd,
      fill: 0x82908a,
    }
  }
  return {
    dayBackground: 0x1a291f,
    nightBackground: 0x0d1812,
    dayFog: 0x1d2e22,
    nightFog: 0x132219,
    fogDensity: .0073,
    exposure: 1.16,
    daySky: 0xc6d8c8,
    nightSky: 0x3b5748,
    ground: 0x27362c,
    daySun: 0xffe3bd,
    duskSun: 0xff9d5f,
    nightLight: 0x93b4c3,
    fill: 0x86a891,
  }
}

function makeSoftMistTexture() {
  if (typeof document === 'undefined') return undefined
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) return undefined
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(255,255,255,.72)')
  gradient.addColorStop(.42, 'rgba(255,255,255,.34)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function mixHex(a: number, b: number, t: number) {
  return new THREE.Color(a)
    .lerp(new THREE.Color(b), THREE.MathUtils.clamp(t, 0, 1))
    .getHex()
}

function scaleHex(value: number, scalar: number) {
  return new THREE.Color(value)
    .multiplyScalar(scalar)
    .getHex()
}

function smoothstep(min: number, max: number, value: number) {
  if (max <= min) return value >= max ? 1 : 0
  const t = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1)
  return t * t * (3 - 2 * t)
}

function wrapHour(hour: number) {
  const wrapped = hour % 24
  return wrapped < 0 ? wrapped + 24 : wrapped
}

function seededEnvironmentRandom(seed: number) {
  let state = seed || 1
  return () => {
    state |= 0
    state = state + 0x6D2B79F5 | 0
    let value = Math.imul(state ^ state >>> 15, 1 | state)
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}
