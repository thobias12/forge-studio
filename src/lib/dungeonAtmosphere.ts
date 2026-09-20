import * as THREE from 'three'
import type { DungeonRoomType, DungeonTheme } from './dungeonPackage'

export type DungeonAtmosphere = {
  background: number
  fog: number
  fogMultiplier: number
  sky: number
  ground: number
  ambient: number
  key: number
  keyIntensity: number
  exposure: number
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
  floor: number
  wall: number
  wallDark: number
  corridorFloor: number
  corridorWall: number
  seam: number
  torch: number
  torchIntensity: number
  dust: number
  mist: number
  boss: number
  shrine: number
  treasure: number
}

const THEMES: Record<DungeonTheme, DungeonAtmosphere> = {
  crypt: { background:0x060403,fog:0x160d08,fogMultiplier:0.7,sky:0x443326,ground:0x100a07,ambient:0.62,key:0x8f6848,keyIntensity:0.46,exposure:1.08,bloomStrength:0.48,bloomRadius:0.44,bloomThreshold:0.76,floor:0x4a3422,wall:0x60462f,wallDark:0x26180f,corridorFloor:0x402c1c,corridorWall:0x503923,seam:0x190d07,torch:0xff952f,torchIntensity:5.15,dust:0x8d7055,mist:0x493224,boss:0x672a22,shrine:0x6c6247,treasure:0xb18441 },
  castle: { background:0x0a0d10,fog:0x151b20,fogMultiplier:0.98,sky:0x7e909f,ground:0x141516,ambient:0.98,key:0xd0dbe2,keyIntensity:1.02,exposure:1.08,bloomStrength:0.43,bloomRadius:0.36,bloomThreshold:0.83,floor:0x4d504c,wall:0x606563,wallDark:0x353939,corridorFloor:0x414540,corridorWall:0x4d5350,seam:0x292d2b,torch:0xffaa60,torchIntensity:3.8,dust:0x8b8a83,mist:0x929b9b,boss:0xb64b50,shrine:0x7fb7d8,treasure:0xe9bf5c },
  cave: { background:0x060908,fog:0x0d1312,fogMultiplier:1.02,sky:0x66736e,ground:0x121512,ambient:0.98,key:0xa4aaa0,keyIntensity:0.78,exposure:1.03,bloomStrength:0.45,bloomRadius:0.48,bloomThreshold:0.8,floor:0x363b37,wall:0x454b46,wallDark:0x292d29,corridorFloor:0x303531,corridorWall:0x3d433e,seam:0x1e221f,torch:0xff9252,torchIntensity:3.5,dust:0x6f746c,mist:0x71837c,boss:0xad3b49,shrine:0x61c2b6,treasure:0xd8aa4f },
  cathedral: { background:0x080b12,fog:0x151d2c,fogMultiplier:0.86,sky:0x8499ba,ground:0x13141a,ambient:1.0,key:0xcbd9f2,keyIntensity:1.12,exposure:1.1,bloomStrength:0.62,bloomRadius:0.5,bloomThreshold:0.75,floor:0x464c54,wall:0x5e6672,wallDark:0x333943,corridorFloor:0x3c424a,corridorWall:0x4d5561,seam:0x272d34,torch:0xffc078,torchIntensity:3.4,dust:0x8f9294,mist:0x8e99aa,boss:0xb34f65,shrine:0x8ad4e4,treasure:0xedd07b },
  mine: { background:0x080909,fog:0x17140f,fogMultiplier:1.06,sky:0x7d7462,ground:0x12100d,ambient:0.9,key:0xc0b49b,keyIntensity:0.86,exposure:1.06,bloomStrength:0.41,bloomRadius:0.38,bloomThreshold:0.82,floor:0x403a31,wall:0x534a3f,wallDark:0x302a24,corridorFloor:0x383129,corridorWall:0x463e35,seam:0x221d18,torch:0xffa052,torchIntensity:3.8,dust:0x8d8372,mist:0x81786a,boss:0xb24a40,shrine:0x79bca9,treasure:0xe1b257 },
  sewer: { background:0x050907,fog:0x0e1713,fogMultiplier:1.12,sky:0x64786c,ground:0x111611,ambient:0.94,key:0x96a89d,keyIntensity:0.74,exposure:1.03,bloomStrength:0.47,bloomRadius:0.46,bloomThreshold:0.79,floor:0x343d38,wall:0x435049,wallDark:0x27302b,corridorFloor:0x2e3732,corridorWall:0x39463f,seam:0x1c241f,torch:0xef9852,torchIntensity:3.35,dust:0x69786f,mist:0x6d887c,boss:0x9d4248,shrine:0x68c3a2,treasure:0xd9b257 },
  void: { background:0x06040d,fog:0x160d2b,fogMultiplier:1.2,sky:0x705da4,ground:0x0d0816,ambient:0.75,key:0xa18edb,keyIntensity:0.8,exposure:1.04,bloomStrength:0.86,bloomRadius:0.58,bloomThreshold:0.65,floor:0x302a40,wall:0x44395c,wallDark:0x231b31,corridorFloor:0x2a2339,corridorWall:0x392f50,seam:0x171024,torch:0xbc76ff,torchIntensity:4.1,dust:0x8068a7,mist:0x6f5594,boss:0xee5792,shrine:0x80aaff,treasure:0xd39bff },
}

export function dungeonAtmosphere(theme: DungeonTheme): DungeonAtmosphere {
  const resolved = (theme as string) === 'crypt-interaction' ? 'crypt' : theme
  if (typeof document !== 'undefined') document.documentElement.dataset.forgeDungeonTheme = resolved
  return THEMES[resolved as DungeonTheme] ?? THEMES.crypt
}
export function roomAccent(type: DungeonRoomType, atmosphere: DungeonAtmosphere): number | undefined { if(type==='boss'||type==='elite')return atmosphere.boss;if(type==='shrine')return atmosphere.shrine;if(type==='treasure')return atmosphere.treasure;return undefined }
export function tintRoomFloor(base:number,type:DungeonRoomType,atmosphere:DungeonAtmosphere){const color=new THREE.Color(base);const accent=roomAccent(type,atmosphere);if(accent!==undefined)color.lerp(new THREE.Color(accent),type==='boss'?0.08:0.04);if(type==='entrance')color.offsetHSL(0,-0.02,0.025);return color}
