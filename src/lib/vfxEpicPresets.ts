import type { ForgeVfxEmitter, VfxPreset } from './vfxPackage'

type EpicShape = ForgeVfxEmitter['shape'] | 'ring' | 'shell' | 'arc' | 'line' | 'spiral' | 'vortex' | 'groundCircle'
type EpicStyle = ForgeVfxEmitter['style'] | 'streak' | 'flare' | 'smoke' | 'rune' | 'shockwave' | 'ember' | 'mist'
type EpicEmitter = Omit<Partial<ForgeVfxEmitter>, 'shape' | 'style'> & Pick<ForgeVfxEmitter, 'name'> & {
  shape?: EpicShape
  style?: EpicStyle
  spawnRadius?: number
  innerRadius?: number
  lineLength?: number
  arcDeg?: number
  spiralTurns?: number
  radialAccel?: number
  orbitStrength?: number
  turbulence?: number
  sizeRandom?: number
  alphaRandom?: number
  delay?: number
}
export type EpicVfxPreset = Omit<VfxPreset, 'emitters'> & { emitters: EpicEmitter[] }

export const EPIC_VFX_PRESETS: EpicVfxPreset[] = [
  {id:'epic-void-nova',name:'Void Nova',group:'magic',description:'Massive violet detonation with a screaming shock ring, void shards and lingering black mist.',duration:3.2,emitters:[
    {name:'Void core',shape:'shell',style:'flare',burst:30,maxParticles:120,lifetime:.42,speed:1.2,spreadDeg:180,spawnRadius:.35,radialAccel:7,gravity:[0,0,0],drag:.5,startSize:1.5,endSize:.08,startColor:'#fff1ff',endColor:'#6d20ff'},
    {name:'Nova wall',shape:'ring',style:'shockwave',burst:150,maxParticles:320,lifetime:1.05,speed:5.8,speedRandom:.12,spawnRadius:.8,innerRadius:.78,radialAccel:6.5,gravity:[0,0,0],drag:.08,startSize:.34,endSize:.08,startColor:'#e4b9ff',endColor:'#5b13b8'},
    {name:'Void knives',shape:'shell',style:'streak',burst:90,maxParticles:240,lifetime:1.15,speed:7.8,speedRandom:.35,spawnRadius:.5,spreadDeg:180,radialAccel:2,gravity:[0,-.4,0],drag:.12,startSize:.16,endSize:.025,startColor:'#f3d8ff',endColor:'#50108e'},
    {name:'Aftermist',shape:'groundCircle',style:'smoke',blendMode:'normal',burst:70,maxParticles:260,lifetime:2.8,speed:.7,spawnRadius:2.3,innerRadius:.3,spreadDeg:180,gravity:[0,.25,0],drag:1.2,turbulence:1.1,startSize:.7,endSize:1.8,startAlpha:.34,endAlpha:0,startColor:'#3f215d',endColor:'#08060c',delay:.18}
  ]},
  {id:'epic-meteor-crash',name:'Meteor Crash',group:'magic',description:'Cataclysmic molten impact with a white-hot flash, fire wall, debris fan and towering ash cloud.',duration:4.0,emitters:[
    {name:'Impact sun',style:'flare',burst:24,maxParticles:100,lifetime:.38,speed:1.5,spreadDeg:180,radialAccel:8,startSize:1.9,endSize:.1,startColor:'#ffffff',endColor:'#ff5a0a'},
    {name:'Fire shockwave',shape:'ring',style:'shockwave',burst:180,maxParticles:360,lifetime:1.25,speed:7.8,spawnRadius:.45,innerRadius:.4,radialAccel:7,gravity:[0,0,0],drag:.06,startSize:.4,endSize:.07,startColor:'#fff3a1',endColor:'#e52b08'},
    {name:'Molten ejecta',shape:'groundCircle',style:'ember',burst:120,maxParticles:340,lifetime:1.9,speed:7.4,speedRandom:.55,spawnRadius:.8,direction:[0,1,0],spreadDeg:120,gravity:[0,-8.5,0],drag:.08,startSize:.18,endSize:.025,startColor:'#fff078',endColor:'#ad1705'},
    {name:'Rock shrapnel',shape:'groundCircle',style:'diamond',blendMode:'normal',burst:75,maxParticles:240,lifetime:2.0,speed:6.8,speedRandom:.45,spawnRadius:.7,direction:[0,1,0],spreadDeg:135,gravity:[0,-10,0],drag:.04,startSize:.18,endSize:.06,startColor:'#8d6548',endColor:'#261b17'},
    {name:'Ash tower',shape:'groundCircle',style:'smoke',blendMode:'normal',burst:95,maxParticles:320,lifetime:3.5,speed:2.2,speedRandom:.55,spawnRadius:1.4,direction:[0,1,0],spreadDeg:35,gravity:[0,1.1,0],drag:.75,turbulence:1.3,startSize:.7,endSize:2.1,startAlpha:.5,endAlpha:0,startColor:'#635047',endColor:'#171719',delay:.18}
  ]},
  {id:'epic-celestial-judgment',name:'Celestial Judgment',group:'magic',description:'A towering holy column detonates into radiant rings, stars and descending divine embers.',duration:3.5,emitters:[
    {name:'Heaven beam',shape:'line',style:'flare',burst:110,maxParticles:260,lifetime:.85,speed:.15,lineLength:7,direction:[0,1,0],gravity:[0,0,0],drag:2,startSize:.8,endSize:.25,startColor:'#ffffff',endColor:'#ffd45d'},
    {name:'Holy seal',shape:'ring',style:'rune',burst:100,maxParticles:240,lifetime:1.5,speed:.45,spawnRadius:2.2,innerRadius:2.1,orbitStrength:1.4,gravity:[0,0,0],drag:1.4,startSize:.35,endSize:.2,startColor:'#fffce5',endColor:'#e9aa2b'},
    {name:'Judgment wave',shape:'ring',style:'shockwave',burst:150,maxParticles:320,lifetime:1.1,speed:6.6,spawnRadius:.6,innerRadius:.55,radialAccel:5.5,gravity:[0,0,0],drag:.08,startSize:.34,endSize:.05,startColor:'#ffffff',endColor:'#ffc235',delay:.28},
    {name:'Divine stars',shape:'shell',style:'star',burst:85,maxParticles:220,lifetime:1.6,speed:5,spawnRadius:.4,spreadDeg:180,gravity:[0,-1.2,0],drag:.22,startSize:.2,endSize:.025,startColor:'#ffffff',endColor:'#ffcf42',delay:.2}
  ]},
  {id:'epic-blood-eruption',name:'Blood Eruption',group:'combat',description:'Dark crimson ground rupture with a violent radial spray, black-red smoke and pulsing rings.',duration:3.0,emitters:[
    {name:'Blood flash',style:'flare',burst:20,maxParticles:90,lifetime:.3,speed:1.1,spreadDeg:180,startSize:1.25,endSize:.06,startColor:'#ffb0a6',endColor:'#7c0714'},
    {name:'Crimson nova',shape:'ring',style:'streak',burst:130,maxParticles:300,lifetime:1.0,speed:6.7,spawnRadius:.55,innerRadius:.45,radialAccel:4.5,gravity:[0,-1,0],drag:.12,startSize:.17,endSize:.025,startColor:'#ff4e4a',endColor:'#5e0712'},
    {name:'Upward spray',shape:'groundCircle',style:'soft',blendMode:'normal',burst:90,maxParticles:260,lifetime:1.6,speed:6.5,speedRandom:.5,spawnRadius:1.0,direction:[0,1,0],spreadDeg:80,gravity:[0,-9,0],drag:.06,startSize:.17,endSize:.07,startAlpha:.95,endAlpha:.15,startColor:'#b41224',endColor:'#3c050c'},
    {name:'Blood haze',shape:'groundCircle',style:'smoke',blendMode:'normal',burst:60,maxParticles:220,lifetime:2.5,speed:.65,spawnRadius:2,gravity:[0,.1,0],drag:1.1,turbulence:.8,startSize:.55,endSize:1.4,startAlpha:.28,endAlpha:0,startColor:'#52101a',endColor:'#10070a',delay:.1}
  ]},
  {id:'epic-toxic-detonation',name:'Toxic Detonation',group:'magic',description:'Huge poison implosion followed by a luminous acid ring, toxic globules and rolling plague fog.',duration:3.7,emitters:[
    {name:'Toxic core',shape:'sphere',style:'flare',burst:34,maxParticles:110,lifetime:.5,speed:1.3,spreadDeg:180,radialAccel:4,startSize:1.45,endSize:.08,startColor:'#eaff7d',endColor:'#4ecb11'},
    {name:'Acid wave',shape:'ring',style:'shockwave',burst:170,maxParticles:360,lifetime:1.25,speed:6.3,spawnRadius:.65,innerRadius:.6,radialAccel:4.8,drag:.08,startSize:.38,endSize:.07,startColor:'#e8ff70',endColor:'#3f9e13'},
    {name:'Globules',shape:'shell',style:'soft',blendMode:'normal',burst:95,maxParticles:280,lifetime:1.8,speed:5.5,speedRandom:.5,spawnRadius:.55,spreadDeg:180,gravity:[0,-7,0],drag:.08,startSize:.22,endSize:.09,startColor:'#b8ff42',endColor:'#2f6e18'},
    {name:'Plague fog',shape:'groundCircle',style:'smoke',blendMode:'normal',burst:100,maxParticles:340,lifetime:3.2,speed:.75,spawnRadius:2.7,innerRadius:.3,gravity:[0,.2,0],drag:1.1,turbulence:1.5,startSize:.7,endSize:2.0,startAlpha:.42,endAlpha:0,startColor:'#6a8e25',endColor:'#16210c',delay:.15}
  ]},
  {id:'epic-abyssal-vortex',name:'Abyssal Vortex',group:'magic',description:'A violent rotating void storm that drags dark motes inward around a blazing purple singularity.',looping:true,duration:4,emitters:[
    {name:'Singularity',shape:'sphere',style:'flare',looping:true,duration:4,spawnRate:36,burst:30,maxParticles:180,lifetime:1.2,speed:.25,spawnRadius:.25,gravity:[0,0,0],drag:1.7,startSize:.8,endSize:.18,startColor:'#ffffff',endColor:'#6a24ff'},
    {name:'Vortex arms',shape:'vortex',style:'streak',looping:true,duration:4,spawnRate:105,burst:80,maxParticles:700,lifetime:2.2,speed:.6,spawnRadius:3.2,innerRadius:.8,radialAccel:-2.5,orbitStrength:7.5,turbulence:.25,gravity:[0,0,0],drag:.2,startSize:.2,endSize:.025,startColor:'#d4a8ff',endColor:'#30105a'},
    {name:'Void mist',shape:'groundCircle',style:'mist',blendMode:'normal',looping:true,duration:4,spawnRate:34,burst:45,maxParticles:360,lifetime:3.0,speed:.3,spawnRadius:3.3,innerRadius:.4,radialAccel:-.6,orbitStrength:1.8,turbulence:.7,gravity:[0,.05,0],drag:.7,startSize:.8,endSize:1.7,startAlpha:.24,endAlpha:0,startColor:'#392150',endColor:'#06050a'}
  ]},
  {id:'epic-frost-cataclysm',name:'Frost Cataclysm',group:'magic',description:'White-blue ice nova with giant shard spray, freezing ring and heavy rolling frost mist.',duration:3.4,emitters:[
    {name:'Freeze flash',style:'flare',burst:26,maxParticles:90,lifetime:.38,speed:1.0,spreadDeg:180,startSize:1.6,endSize:.06,startColor:'#ffffff',endColor:'#6ed9ff'},
    {name:'Frozen wave',shape:'ring',style:'shockwave',burst:170,maxParticles:350,lifetime:1.35,speed:6.2,spawnRadius:.65,innerRadius:.6,radialAccel:5.2,gravity:[0,0,0],drag:.08,startSize:.42,endSize:.07,startColor:'#efffff',endColor:'#45a9ff'},
    {name:'Ice lances',shape:'shell',style:'streak',burst:110,maxParticles:300,lifetime:1.5,speed:7.3,speedRandom:.3,spawnRadius:.55,spreadDeg:180,gravity:[0,-1.8,0],drag:.12,startSize:.22,endSize:.035,startColor:'#ffffff',endColor:'#42a4e8'},
    {name:'Frost fog',shape:'groundCircle',style:'mist',blendMode:'normal',burst:90,maxParticles:300,lifetime:2.7,speed:.55,spawnRadius:2.8,gravity:[0,.08,0],drag:1.3,turbulence:.65,startSize:.8,endSize:1.9,startAlpha:.4,endAlpha:0,startColor:'#d5f8ff',endColor:'#6f9fb3',delay:.12}
  ]},
  {id:'epic-storm-spear',name:'Storm Spear',group:'magic',description:'A concentrated lightning lance hits and explodes into electric branches, rings and crackling sparks.',duration:2.5,emitters:[
    {name:'Lightning lance',shape:'line',style:'streak',burst:120,maxParticles:260,lifetime:.42,speed:.25,lineLength:6.5,direction:[0,1,0],gravity:[0,0,0],drag:2,startSize:.3,endSize:.08,startColor:'#ffffff',endColor:'#58b8ff'},
    {name:'Impact flare',style:'flare',burst:24,maxParticles:80,lifetime:.3,speed:1.2,spreadDeg:180,startSize:1.3,endSize:.05,startColor:'#ffffff',endColor:'#3d8dff',delay:.08},
    {name:'Electric nova',shape:'ring',style:'shockwave',burst:120,maxParticles:260,lifetime:.8,speed:7.4,spawnRadius:.45,innerRadius:.4,radialAccel:5.5,drag:.08,startSize:.25,endSize:.03,startColor:'#dff9ff',endColor:'#3979ff',delay:.08},
    {name:'Branches',shape:'shell',style:'streak',burst:115,maxParticles:300,lifetime:.75,speed:9.5,speedRandom:.6,spawnRadius:.35,spreadDeg:180,turbulence:2.2,gravity:[0,0,0],drag:.25,startSize:.12,endSize:.015,startColor:'#ffffff',endColor:'#405cff',delay:.08}
  ]},
  {id:'epic-infernal-pillar',name:'Infernal Pillar',group:'magic',description:'Towering column of infernal fire wrapped in spiraling embers and black smoke.',looping:true,duration:3.8,emitters:[
    {name:'Fire column',shape:'line',style:'flare',looping:true,duration:3.8,spawnRate:78,burst:70,maxParticles:500,lifetime:1.25,speed:1.2,lineLength:5.5,direction:[0,1,0],gravity:[0,1.2,0],drag:.5,turbulence:1.0,startSize:.55,endSize:.18,startColor:'#fff5a0',endColor:'#e52a09'},
    {name:'Ember spiral',shape:'spiral',style:'ember',looping:true,duration:3.8,spawnRate:70,burst:55,maxParticles:520,lifetime:1.8,speed:1.7,spawnRadius:1.6,innerRadius:.2,spiralTurns:3.5,orbitStrength:4.2,gravity:[0,1.1,0],drag:.3,startSize:.14,endSize:.025,startColor:'#fff0a0',endColor:'#b51608'},
    {name:'Black smoke',shape:'groundCircle',style:'smoke',blendMode:'normal',looping:true,duration:3.8,spawnRate:42,burst:45,maxParticles:360,lifetime:2.8,speed:1.3,spawnRadius:1.2,direction:[0,1,0],spreadDeg:30,gravity:[0,.8,0],drag:.75,turbulence:1.1,startSize:.7,endSize:1.8,startAlpha:.42,endAlpha:0,startColor:'#59413b',endColor:'#141316'}
  ]},
  {id:'epic-chaos-rift',name:'Chaos Rift',group:'magic',description:'Unstable magenta tear with rotating runes, chaotic streaks and pulsing reality waves.',looping:true,duration:4,emitters:[
    {name:'Rift core',shape:'line',style:'flare',looping:true,duration:4,spawnRate:42,burst:36,maxParticles:260,lifetime:1.1,speed:.25,lineLength:4.2,direction:[0,1,0],gravity:[0,0,0],drag:1.4,turbulence:.8,startSize:.5,endSize:.13,startColor:'#ffffff',endColor:'#e22bff'},
    {name:'Chaos runes',shape:'ring',style:'rune',looping:true,duration:4,spawnRate:55,burst:70,maxParticles:480,lifetime:2.0,speed:.25,spawnRadius:2.1,innerRadius:2.0,orbitStrength:4.5,turbulence:.4,gravity:[0,0,0],drag:.7,startSize:.28,endSize:.1,startColor:'#ffbcff',endColor:'#7f20b9'},
    {name:'Reality cuts',shape:'arc',style:'streak',looping:true,duration:4,spawnRate:65,burst:60,maxParticles:450,lifetime:1.1,speed:4.8,spawnRadius:2.4,innerRadius:.6,arcDeg:300,orbitStrength:1.8,turbulence:1.6,gravity:[0,0,0],drag:.25,startSize:.17,endSize:.02,startColor:'#ffd2ff',endColor:'#7211a7'},
    {name:'Pulse rings',shape:'ring',style:'shockwave',looping:true,duration:4,spawnRate:18,burst:26,maxParticles:220,lifetime:1.0,speed:3.4,spawnRadius:.7,innerRadius:.65,radialAccel:2.5,gravity:[0,0,0],drag:.18,startSize:.24,endSize:.06,startColor:'#ffffff',endColor:'#bf38ff'}
  ]},
  {id:'epic-volcanic-slam',name:'Volcanic Slam',group:'combat',description:'Magma ground-slam with a huge fiery ring, stone chunks, lava arcs and smoke.',duration:3.3,emitters:[
    {name:'Slam flash',style:'flare',burst:22,maxParticles:80,lifetime:.28,speed:1.1,spreadDeg:180,startSize:1.45,endSize:.06,startColor:'#ffffff',endColor:'#ff5a0a'},
    {name:'Magma ring',shape:'ring',style:'shockwave',burst:165,maxParticles:340,lifetime:1.2,speed:6.8,spawnRadius:.6,innerRadius:.55,radialAccel:5.5,gravity:[0,0,0],drag:.06,startSize:.38,endSize:.06,startColor:'#fff08a',endColor:'#d93406'},
    {name:'Lava arcs',shape:'groundCircle',style:'ember',burst:95,maxParticles:280,lifetime:1.7,speed:6.0,speedRandom:.45,spawnRadius:1.1,direction:[0,1,0],spreadDeg:100,gravity:[0,-8,0],drag:.06,startSize:.2,endSize:.04,startColor:'#fff16a',endColor:'#a71805'},
    {name:'Stone chunks',shape:'groundCircle',style:'square',blendMode:'normal',burst:80,maxParticles:260,lifetime:1.9,speed:5.2,speedRandom:.55,spawnRadius:1.0,direction:[0,1,0],spreadDeg:125,gravity:[0,-9,0],drag:.05,startSize:.2,endSize:.08,startColor:'#776153',endColor:'#241c18'},
    {name:'Ground smoke',shape:'groundCircle',style:'smoke',blendMode:'normal',burst:70,maxParticles:260,lifetime:2.5,speed:.55,spawnRadius:2.4,gravity:[0,.18,0],drag:1.1,turbulence:.9,startSize:.65,endSize:1.6,startAlpha:.38,endAlpha:0,startColor:'#5e4b43',endColor:'#161417',delay:.12}
  ]},
  {id:'epic-soul-drain',name:'Soul Drain Ritual',group:'magic',description:'Ghostly souls spiral inward through rune rings into a pulsing green-black core.',looping:true,duration:4.2,emitters:[
    {name:'Soul core',shape:'sphere',style:'flare',looping:true,duration:4.2,spawnRate:28,burst:28,maxParticles:190,lifetime:1.15,speed:.25,spawnRadius:.3,drag:1.7,startSize:.75,endSize:.16,startColor:'#eaffee',endColor:'#1ca86a'},
    {name:'Soul stream',shape:'vortex',style:'mist',looping:true,duration:4.2,spawnRate:90,burst:75,maxParticles:650,lifetime:2.6,speed:.45,spawnRadius:3.1,innerRadius:.9,radialAccel:-2.0,orbitStrength:5.8,turbulence:.55,gravity:[0,.08,0],drag:.35,startSize:.28,endSize:.08,startAlpha:.75,endAlpha:0,startColor:'#b6ffd4',endColor:'#126144'},
    {name:'Necro runes',shape:'ring',style:'rune',looping:true,duration:4.2,spawnRate:32,burst:48,maxParticles:300,lifetime:2.2,speed:.18,spawnRadius:2.3,innerRadius:2.2,orbitStrength:-2.5,gravity:[0,0,0],drag:1.0,startSize:.26,endSize:.1,startColor:'#d7ffe7',endColor:'#1f8b5d'}
  ]},
  {id:'epic-plague-bloom',name:'Plague Bloom',group:'magic',description:'A toxic flower-like burst expands in layered green arcs before flooding the floor with poisonous mist.',duration:3.5,emitters:[
    {name:'Bloom heart',style:'flare',burst:22,maxParticles:80,lifetime:.36,speed:1.0,spreadDeg:180,startSize:1.25,endSize:.07,startColor:'#f0ff9b',endColor:'#56c71e'},
    {name:'Petal arcs',shape:'arc',style:'streak',burst:145,maxParticles:340,lifetime:1.25,speed:6.1,spawnRadius:.55,innerRadius:.2,arcDeg:340,radialAccel:4.0,orbitStrength:1.8,turbulence:.5,gravity:[0,-.6,0],drag:.15,startSize:.17,endSize:.025,startColor:'#d9ff65',endColor:'#47850f'},
    {name:'Spore stars',shape:'shell',style:'star',burst:95,maxParticles:260,lifetime:1.6,speed:4.2,speedRandom:.55,spawnRadius:.7,spreadDeg:180,gravity:[0,-1.4,0],drag:.24,startSize:.13,endSize:.025,startColor:'#efffb1',endColor:'#65a923'},
    {name:'Floor poison',shape:'groundCircle',style:'mist',blendMode:'normal',burst:100,maxParticles:340,lifetime:3.0,speed:.45,spawnRadius:3.0,gravity:[0,.05,0],drag:1.1,turbulence:1.1,startSize:.75,endSize:1.7,startAlpha:.4,endAlpha:0,startColor:'#7cab35',endColor:'#1c2c0e',delay:.16}
  ]},
  {id:'epic-bone-tempest',name:'Bone Tempest',group:'magic',description:'A whirling cyclone of pale shards, dust and necrotic rings built for a dark summoner ultimate.',looping:true,duration:4,emitters:[
    {name:'Bone cyclone',shape:'vortex',style:'diamond',blendMode:'normal',looping:true,duration:4,spawnRate:105,burst:90,maxParticles:720,lifetime:2.1,speed:1.1,spawnRadius:2.8,innerRadius:.5,radialAccel:-.25,orbitStrength:8.0,turbulence:.6,gravity:[0,.3,0],drag:.18,startSize:.18,endSize:.07,startColor:'#eee4cc',endColor:'#8e8068'},
    {name:'Necrotic streaks',shape:'spiral',style:'streak',looping:true,duration:4,spawnRate:55,burst:50,maxParticles:420,lifetime:1.4,speed:2.2,spawnRadius:2.0,innerRadius:.3,spiralTurns:4,orbitStrength:5,gravity:[0,.2,0],drag:.3,startSize:.13,endSize:.02,startColor:'#d9ffc8',endColor:'#4d8a3f'},
    {name:'Dust skirt',shape:'groundCircle',style:'smoke',blendMode:'normal',looping:true,duration:4,spawnRate:38,burst:40,maxParticles:320,lifetime:2.4,speed:.45,spawnRadius:2.5,orbitStrength:1.3,turbulence:.8,gravity:[0,.08,0],drag:.8,startSize:.6,endSize:1.5,startAlpha:.26,endAlpha:0,startColor:'#776f62',endColor:'#1b1918'}
  ]},
  {id:'epic-arcane-cataclysm',name:'Arcane Cataclysm',group:'magic',description:'Overloaded blue-violet magic erupts in multiple expanding shells, runes and needle-fast energy shards.',duration:3.2,emitters:[
    {name:'Arcane flash',style:'flare',burst:28,maxParticles:100,lifetime:.42,speed:1.4,startSize:1.65,endSize:.08,startColor:'#ffffff',endColor:'#5570ff'},
    {name:'First shell',shape:'shell',style:'shockwave',burst:100,maxParticles:260,lifetime:.9,speed:5.8,spawnRadius:.55,radialAccel:4.4,gravity:[0,0,0],drag:.1,startSize:.29,endSize:.05,startColor:'#cfe8ff',endColor:'#5d55ff'},
    {name:'Second shell',shape:'ring',style:'rune',burst:120,maxParticles:290,lifetime:1.25,speed:4.2,spawnRadius:.9,innerRadius:.85,radialAccel:2.5,orbitStrength:2.8,gravity:[0,0,0],drag:.16,startSize:.25,endSize:.06,startColor:'#e8dbff',endColor:'#7a36e8',delay:.12},
    {name:'Arcane needles',shape:'shell',style:'streak',burst:130,maxParticles:340,lifetime:1.15,speed:8.2,speedRandom:.38,spawnRadius:.5,spreadDeg:180,turbulence:.45,gravity:[0,-.3,0],drag:.12,startSize:.14,endSize:.018,startColor:'#ffffff',endColor:'#4a72ff',delay:.08}
  ]},
  {id:'epic-death-burst',name:'Death Burst',group:'stylized',description:'Black-purple death pulse with spectral stars, ash, dark shockwaves and disappearing soul wisps.',duration:3.0,emitters:[
    {name:'Death flash',style:'flare',burst:20,maxParticles:80,lifetime:.32,speed:1.0,startSize:1.3,endSize:.05,startColor:'#d9bcff',endColor:'#3f145f'},
    {name:'Dark pulse',shape:'ring',style:'shockwave',burst:145,maxParticles:300,lifetime:1.15,speed:6.0,spawnRadius:.5,innerRadius:.45,radialAccel:4.4,gravity:[0,0,0],drag:.1,startSize:.34,endSize:.05,startColor:'#aa70d8',endColor:'#25102e'},
    {name:'Soul wisps',shape:'shell',style:'mist',burst:80,maxParticles:260,lifetime:2.1,speed:2.2,speedRandom:.6,spawnRadius:.55,spreadDeg:180,gravity:[0,.8,0],drag:.6,turbulence:.8,startSize:.28,endSize:.06,startAlpha:.8,endAlpha:0,startColor:'#d9c6ff',endColor:'#4b2467'},
    {name:'Ash fall',shape:'shell',style:'ember',blendMode:'normal',burst:100,maxParticles:280,lifetime:2.4,speed:2.1,speedRandom:.5,spawnRadius:.8,spreadDeg:180,gravity:[0,-2.2,0],drag:.35,startSize:.08,endSize:.025,startAlpha:.6,endAlpha:0,startColor:'#62586b',endColor:'#171319'}
  ]},
  {id:'epic-rift-beam',name:'Rift Beam',group:'magic',description:'A colossal horizontal void beam with hot core particles, edge streaks and dimensional fallout.',duration:2.8,emitters:[
    {name:'Beam core',shape:'line',style:'flare',burst:180,maxParticles:380,lifetime:.75,speed:.08,lineLength:9,direction:[1,0,0],gravity:[0,0,0],drag:2,startSize:.55,endSize:.18,startColor:'#ffffff',endColor:'#9a45ff'},
    {name:'Beam edge',shape:'line',style:'streak',burst:220,maxParticles:480,lifetime:.9,speed:.5,lineLength:9,direction:[1,0,0],spreadDeg:18,turbulence:1.4,gravity:[0,0,0],drag:.6,startSize:.17,endSize:.02,startColor:'#e4baff',endColor:'#5c1ab2'},
    {name:'Exit shock',shape:'ring',style:'shockwave',burst:100,maxParticles:230,lifetime:.8,speed:5.7,spawnRadius:.45,innerRadius:.4,position:[4.5,.08,0],radialAccel:3.6,gravity:[0,0,0],drag:.1,startSize:.28,endSize:.04,startColor:'#ffffff',endColor:'#812de1'},
    {name:'Void fallout',shape:'line',style:'smoke',blendMode:'normal',burst:80,maxParticles:260,lifetime:2.2,speed:.5,lineLength:8.5,direction:[1,0,0],gravity:[0,.2,0],drag:.8,turbulence:1.0,startSize:.45,endSize:1.0,startAlpha:.3,endAlpha:0,startColor:'#432558',endColor:'#0a070e',delay:.18}
  ]},
  {id:'epic-ember-cyclone',name:'Ember Cyclone',group:'combat',description:'A roaring melee fire cyclone with orbiting sparks, expanding fire arcs and dense smoke skirt.',looping:true,duration:3.6,emitters:[
    {name:'Flame spiral',shape:'spiral',style:'ember',looping:true,duration:3.6,spawnRate:110,burst:80,maxParticles:700,lifetime:1.7,speed:2.0,spawnRadius:2.3,innerRadius:.25,spiralTurns:4.5,orbitStrength:7.2,gravity:[0,.7,0],drag:.2,turbulence:.4,startSize:.16,endSize:.025,startColor:'#fff19a',endColor:'#d52b08'},
    {name:'Outer arcs',shape:'ring',style:'streak',looping:true,duration:3.6,spawnRate:62,burst:55,maxParticles:480,lifetime:1.1,speed:3.8,spawnRadius:2.2,innerRadius:2.0,orbitStrength:5.8,radialAccel:.6,gravity:[0,.1,0],drag:.18,startSize:.16,endSize:.02,startColor:'#ffd86c',endColor:'#a91808'},
    {name:'Smoke skirt',shape:'groundCircle',style:'smoke',blendMode:'normal',looping:true,duration:3.6,spawnRate:38,burst:40,maxParticles:320,lifetime:2.3,speed:.45,spawnRadius:2.5,orbitStrength:1.5,turbulence:.9,gravity:[0,.12,0],drag:.8,startSize:.6,endSize:1.5,startAlpha:.28,endAlpha:0,startColor:'#5a443c',endColor:'#171417'}
  ]},
  {id:'epic-astral-supernova',name:'Astral Supernova',group:'stylized',description:'Screen-filling cosmic supernova with white core, blue-gold shells, star debris and glowing nebula mist.',duration:4.0,emitters:[
    {name:'Supernova core',shape:'shell',style:'flare',burst:42,maxParticles:150,lifetime:.48,speed:1.4,spawnRadius:.3,radialAccel:9,startSize:2.1,endSize:.08,startColor:'#ffffff',endColor:'#7ac7ff'},
    {name:'Blue shell',shape:'ring',style:'shockwave',burst:190,maxParticles:390,lifetime:1.3,speed:7.1,spawnRadius:.6,innerRadius:.55,radialAccel:6.2,startSize:.43,endSize:.06,startColor:'#e8f8ff',endColor:'#3c7dff'},
    {name:'Gold shell',shape:'ring',style:'rune',burst:145,maxParticles:320,lifetime:1.6,speed:5.2,spawnRadius:.85,innerRadius:.8,radialAccel:3.6,orbitStrength:1.5,startSize:.28,endSize:.05,startColor:'#fff1a6',endColor:'#d98928',delay:.12},
    {name:'Star debris',shape:'shell',style:'star',burst:150,maxParticles:360,lifetime:1.8,speed:7.0,speedRandom:.5,spawnRadius:.55,spreadDeg:180,gravity:[0,-.35,0],drag:.14,startSize:.19,endSize:.025,startColor:'#ffffff',endColor:'#77a7ff'},
    {name:'Nebula',shape:'groundCircle',style:'mist',blendMode:'normal',burst:100,maxParticles:340,lifetime:3.4,speed:.55,spawnRadius:3.5,turbulence:1.0,gravity:[0,.12,0],drag:1.0,startSize:.85,endSize:2.2,startAlpha:.32,endAlpha:0,startColor:'#5554a8',endColor:'#0c0d1a',delay:.2}
  ]}
]
