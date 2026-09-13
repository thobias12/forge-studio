export type VfxBlendMode = 'normal' | 'additive'
export type VfxShape = 'point' | 'cone' | 'sphere' | 'box'
export type VfxParticleStyle = 'soft' | 'spark' | 'square'

export type ForgeVfxEmitter = {
  id: string
  name: string
  enabled: boolean
  shape: VfxShape
  style: VfxParticleStyle
  blendMode: VfxBlendMode
  looping: boolean
  duration: number
  spawnRate: number
  burst: number
  maxParticles: number
  lifetime: number
  lifetimeRandom: number
  speed: number
  speedRandom: number
  spreadDeg: number
  direction: [number, number, number]
  gravity: [number, number, number]
  drag: number
  startSize: number
  endSize: number
  startAlpha: number
  endAlpha: number
  startColor: string
  endColor: string
  spin: number
  position: [number, number, number]
  boxSize: [number, number, number]
}

export type ForgeVfxPackage = {
  format: 'forge-vfx-package'
  version: 1
  name: string
  createdAt: string
  looping: boolean
  duration: number
  emitters: ForgeVfxEmitter[]
}

export type VfxPreset = {
  id: string
  name: string
  group: 'combat' | 'magic' | 'environment' | 'stylized'
  description: string
  looping?: boolean
  duration?: number
  emitters: Array<Partial<ForgeVfxEmitter> & Pick<ForgeVfxEmitter, 'name'>>
}

const base = (): ForgeVfxEmitter => ({
  id: crypto.randomUUID(), name: 'Emitter', enabled: true,
  shape: 'point', style: 'soft', blendMode: 'additive', looping: false,
  duration: 1, spawnRate: 0, burst: 28, maxParticles: 220,
  lifetime: 0.7, lifetimeRandom: 0.25, speed: 2.8, speedRandom: 0.6,
  spreadDeg: 80, direction: [0, 1, 0], gravity: [0, -2.5, 0], drag: 0.7,
  startSize: 0.14, endSize: 0.025, startAlpha: 1, endAlpha: 0,
  startColor: '#ffd66b', endColor: '#ff5a24', spin: 0,
  position: [0, 0.08, 0], boxSize: [1, 1, 1],
})

export const VFX_PRESETS: VfxPreset[] = [
  { id:'hit-spark', name:'Hit Sparks', group:'combat', description:'Fast bright contact sparks for melee impacts.', duration:0.8, emitters:[{ name:'Sparks', style:'spark', burst:34, lifetime:.45, speed:4.8, speedRandom:.8, spreadDeg:120, gravity:[0,-4,0], drag:.35, startSize:.075, endSize:.012, startColor:'#fff2a6', endColor:'#ff5a1f' }] },
  { id:'sword-slash', name:'Sword Slash', group:'combat', description:'Directional streak burst for sword swings.', duration:.7, emitters:[{ name:'Slash streaks', style:'spark', burst:42, lifetime:.34, speed:5.6, spreadDeg:28, direction:[1,.25,0], gravity:[0,-.7,0], drag:.25, startSize:.11, endSize:.02, startColor:'#dff6ff', endColor:'#4da8ff' }] },
  { id:'shield-block', name:'Shield Block', group:'combat', description:'Warm contact flash plus short metal sparks.', duration:.85, emitters:[{ name:'Block flash', style:'soft', burst:10, lifetime:.22, speed:1.2, spreadDeg:180, startSize:.28, endSize:.04, startColor:'#fff8cf', endColor:'#ffba45' },{ name:'Metal sparks', style:'spark', burst:24, lifetime:.55, speed:3.8, spreadDeg:120, gravity:[0,-4,0], startSize:.06, endSize:.01, startColor:'#fff0a8', endColor:'#ff642f' }] },
  { id:'arrow-hit', name:'Arrow Hit', group:'combat', description:'Tight impact puff and fragments for projectile hits.', duration:.8, emitters:[{ name:'Impact fragments', style:'square', burst:18, lifetime:.65, speed:2.7, spreadDeg:75, direction:[0,.6,1], gravity:[0,-5,0], startSize:.07, endSize:.035, startColor:'#bfa27b', endColor:'#5b4632', blendMode:'normal' }] },
  { id:'fire-burst', name:'Fire Burst', group:'magic', description:'Layered orange flame burst for spells and impacts.', duration:1.4, emitters:[{ name:'Flame core', shape:'sphere', style:'soft', burst:42, lifetime:.9, speed:2.2, spreadDeg:180, gravity:[0,1.4,0], startSize:.24, endSize:.04, startColor:'#fff09a', endColor:'#e52f0c' },{ name:'Embers', style:'spark', burst:28, lifetime:1.2, speed:3.2, spreadDeg:150, gravity:[0,-1.5,0], startSize:.05, endSize:.01, startColor:'#ffd15a', endColor:'#c72a0c' }] },
  { id:'frost-burst', name:'Frost Burst', group:'magic', description:'Cold radial burst with icy shards.', duration:1.2, emitters:[{ name:'Frost mist', shape:'sphere', style:'soft', burst:32, lifetime:1.05, speed:1.3, spreadDeg:180, gravity:[0,.2,0], drag:1.1, startSize:.28, endSize:.5, startAlpha:.65, endAlpha:0, startColor:'#dffcff', endColor:'#6cbcff' },{ name:'Ice shards', style:'spark', burst:20, lifetime:.8, speed:3.4, spreadDeg:180, gravity:[0,-1.2,0], startSize:.065, endSize:.02, startColor:'#ffffff', endColor:'#69c7ff' }] },
  { id:'arcane-orb', name:'Arcane Orb', group:'magic', description:'Continuous violet energy particles around a point.', looping:true, duration:2, emitters:[{ name:'Orb energy', shape:'sphere', style:'soft', looping:true, duration:2, spawnRate:42, burst:0, lifetime:.9, speed:.7, spreadDeg:180, gravity:[0,0,0], drag:1.3, startSize:.13, endSize:.03, startColor:'#f0b6ff', endColor:'#713cff' }] },
  { id:'heal-aura', name:'Healing Aura', group:'magic', description:'Soft rising green motes for healing and buffs.', looping:true, duration:2.5, emitters:[{ name:'Healing motes', shape:'box', boxSize:[1.4,.15,1.4], style:'soft', looping:true, duration:2.5, spawnRate:24, burst:0, lifetime:1.5, speed:.65, spreadDeg:18, direction:[0,1,0], gravity:[0,.2,0], drag:.4, startSize:.12, endSize:.035, startColor:'#c5ffb2', endColor:'#3de38a' }] },
  { id:'poison-cloud', name:'Poison Cloud', group:'magic', description:'Dense drifting toxic mist.', looping:true, duration:3, emitters:[{ name:'Poison mist', shape:'sphere', style:'soft', looping:true, duration:3, spawnRate:34, burst:10, lifetime:2.2, speed:.45, spreadDeg:180, gravity:[0,.08,0], drag:.8, startSize:.3, endSize:.7, startAlpha:.5, endAlpha:0, startColor:'#b8f86c', endColor:'#527b22', blendMode:'normal' }] },
  { id:'campfire', name:'Campfire Embers', group:'environment', description:'Looping embers rising from a fire source.', looping:true, duration:3, emitters:[{ name:'Embers', shape:'cone', style:'spark', looping:true, duration:3, spawnRate:18, burst:4, lifetime:1.6, speed:1.2, speedRandom:.7, spreadDeg:26, direction:[0,1,0], gravity:[0,.35,0], drag:.25, startSize:.05, endSize:.012, startColor:'#ffe06b', endColor:'#e53a0c' }] },
  { id:'rain', name:'Rain', group:'environment', description:'Continuous falling rain streaks over a box area.', looping:true, duration:4, emitters:[{ name:'Rain drops', shape:'box', boxSize:[6,.2,6], style:'spark', looping:true, duration:4, spawnRate:150, burst:0, maxParticles:500, lifetime:1.35, lifetimeRandom:.15, speed:8, speedRandom:.12, spreadDeg:3, direction:[0,-1,0], gravity:[0,-4,0], drag:0, startSize:.04, endSize:.03, startAlpha:.65, endAlpha:.25, startColor:'#bfe4ff', endColor:'#5b8fac', blendMode:'normal', position:[0,4,0] }] },
  { id:'snow', name:'Snow', group:'environment', description:'Slow drifting snow over a broad area.', looping:true, duration:5, emitters:[{ name:'Snow flakes', shape:'box', boxSize:[6,.2,6], style:'soft', looping:true, duration:5, spawnRate:60, burst:0, maxParticles:400, lifetime:4.5, lifetimeRandom:.5, speed:.7, speedRandom:.45, spreadDeg:22, direction:[0,-1,0], gravity:[0,-.08,0], drag:.2, startSize:.09, endSize:.07, startAlpha:.9, endAlpha:.35, startColor:'#ffffff', endColor:'#cfe8ff', blendMode:'normal', position:[0,3,0] }] },
  { id:'dust', name:'Dust Motes', group:'environment', description:'Subtle floating particles for rooms and ruins.', looping:true, duration:5, emitters:[{ name:'Dust', shape:'box', boxSize:[4,2.5,4], style:'soft', looping:true, duration:5, spawnRate:18, burst:12, maxParticles:180, lifetime:4.2, speed:.08, speedRandom:.8, spreadDeg:180, gravity:[0,.015,0], drag:.3, startSize:.035, endSize:.02, startAlpha:.35, endAlpha:.05, startColor:'#e6d5b1', endColor:'#b99d73', blendMode:'normal', position:[0,1.2,0] }] },
  { id:'loot-pop', name:'Loot Pop', group:'stylized', description:'Bright celebratory pickup burst.', duration:1.1, emitters:[{ name:'Loot sparkle', shape:'sphere', style:'spark', burst:38, lifetime:.85, speed:2.4, spreadDeg:180, gravity:[0,-1.2,0], drag:.4, startSize:.08, endSize:.015, startColor:'#fff8aa', endColor:'#49d7ff' }] },
]

export function emitterFromPreset(partial?: Partial<ForgeVfxEmitter> & { name?: string }): ForgeVfxEmitter {
  return { ...base(), ...partial, id: crypto.randomUUID(), name: partial?.name ?? 'Emitter', direction: partial?.direction ?? [0,1,0], gravity: partial?.gravity ?? [0,-2.5,0], position: partial?.position ?? [0,.08,0], boxSize: partial?.boxSize ?? [1,1,1] }
}

export function packageFromPreset(preset: VfxPreset): ForgeVfxPackage {
  return { format:'forge-vfx-package', version:1, name:preset.name, createdAt:new Date().toISOString(), looping:!!preset.looping, duration:preset.duration ?? 1, emitters:preset.emitters.map((item) => emitterFromPreset(item)) }
}

export function newVfxPackage(name = 'New VFX'): ForgeVfxPackage {
  return { format:'forge-vfx-package', version:1, name, createdAt:new Date().toISOString(), looping:false, duration:1, emitters:[emitterFromPreset({ name:'Emitter' })] }
}

export function vfxPackageBlob(value: ForgeVfxPackage) {
  return new Blob([JSON.stringify({ ...value, createdAt:new Date().toISOString() }, null, 2)], { type:'application/x-forge-vfx+json' })
}

export async function parseVfxPackage(blob: Blob) {
  try {
    const parsed = JSON.parse(await blob.text()) as ForgeVfxPackage
    if (parsed?.format !== 'forge-vfx-package' || parsed.version !== 1 || !Array.isArray(parsed.emitters)) return undefined
    return parsed
  } catch { return undefined }
}
