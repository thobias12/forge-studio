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
  crypt: { background:0x05090a,fog:0x0b1517,fogMultiplier:1.18,sky:0x718990,ground:0x101415,ambient:0.98,key:0xb5c8ce,keyIntensity:0.92,exposure:1.08,bloomStrength:0.55,bloomRadius:0.44,bloomThreshold:0.8,floor:0x39413f,wall:0x4b5552,wallDark:0x2d3432,corridorFloor:0x333a38,corridorWall:0x3f4946,seam:0x1c2220,torch:0xff9852,torchIntensity:4.0,dust:0xb1b6ac,mist:0x91aaaa,boss:0xa83a4d,shrine:0x64c2ae,treasure:0xe0b45b },
  castle: { background:0x0a0d10,fog:0x151b20,fogMultiplier:0.98,sky:0x7e909f,ground:0x141516,ambient:0.98,key:0xd0dbe2,keyIntensity:1.02,exposure:1.08,bloomStrength:0.43,bloomRadius:0.36,bloomThreshold:0.83,floor:0x4d504c,wall:0x606563,wallDark:0x353939,corridorFloor:0x414540,corridorWall:0x4d5350,seam:0x292d2b,torch:0xffaa60,torchIntensity:3.8,dust:0xc0beb4,mist:0xa8b2b3,boss:0xb64b50,shrine:0x7fb7d8,treasure:0xe9bf5c },
  cave: { background:0x05090a,fog:0x0a1415,fogMultiplier:1.12,sky:0x5b7b81,ground:0x0d1110,ambient:0.86,key:0x8baeb2,keyIntensity:0.72,exposure:1.04,bloomStrength:0.48,bloomRadius:0.48,bloomThreshold:0.78,floor:0x323936,wall:0x414945,wallDark:0x252b28,corridorFloor:0x2d3330,corridorWall:0x39413d,seam:0x191e1c,torch:0xff8d4d,torchIntensity:3.8,dust:0x999f96,mist:0x78999b,boss:0xad3b49,shrine:0x5bcfc6,treasure:0xd8aa4f },
  cathedral: { background:0x080b12,fog:0x151d2c,fogMultiplier:0.86,sky:0x8499ba,ground:0x13141a,ambient:1.0,key:0xcbd9f2,keyIntensity:1.12,exposure:1.1,bloomStrength:0.62,bloomRadius:0.5,bloomThreshold:0.75,floor:0x464c54,wall:0x5e6672,wallDark:0x333943,corridorFloor:0x3c424a,corridorWall:0x4d5561,seam:0x272d34,torch:0xffc078,torchIntensity:3.4,dust:0xcbd0d3,mist:0xaab8cf,boss:0xb34f65,shrine:0x8ad4e4,treasure:0xedd07b },
  mine: { background:0x080909,fog:0x17140f,fogMultiplier:1.06,sky:0x7d7462,ground:0x12100d,ambient:0.9,key:0xc0b49b,keyIntensity:0.86,exposure:1.06,bloomStrength:0.41,bloomRadius:0.38,bloomThreshold:0.82,floor:0x403a31,wall:0x534a3f,wallDark:0x302a24,corridorFloor:0x383129,corridorWall:0x463e35,seam:0x221d18,torch:0xffa052,torchIntensity:3.8,dust:0xc0b197,mist:0x9b8f7d,boss:0xb24a40,shrine:0x79bca9,treasure:0xe1b257 },
  sewer: { background:0x040a08,fog:0x0b1914,fogMultiplier:1.28,sky:0x597e70,ground:0x0b100d,ambient:0.82,key:0x8aaf9e,keyIntensity:0.68,exposure:1.04,bloomStrength:0.5,bloomRadius:0.48,bloomThreshold:0.77,floor:0x303d37,wall:0x3e5148,wallDark:0x213029,corridorFloor:0x2a3832,corridorWall:0x35483f,seam:0x17221d,torch:0xef9852,torchIntensity:3.5,dust:0x8ea997,mist:0x76a594,boss:0x9d4248,shrine:0x68c3a2,treasure:0xd9b257 },
  void: { background:0x06040d,fog:0x160d2b,fogMultiplier:1.2,sky:0x705da4,ground:0x0d0816,ambient:0.75,key:0xa18edb,keyIntensity:0.8,exposure:1.04,bloomStrength:0.86,bloomRadius:0.58,bloomThreshold:0.65,floor:0x302a40,wall:0x44395c,wallDark:0x231b31,corridorFloor:0x2a2339,corridorWall:0x392f50,seam:0x171024,torch:0xbc76ff,torchIntensity:4.1,dust:0xaa89e3,mist:0x7d5ebc,boss:0xee5792,shrine:0x80aaff,treasure:0xd39bff },
}

export function dungeonAtmosphere(theme: DungeonTheme): DungeonAtmosphere { return THEMES[theme] ?? THEMES.crypt }
export function roomAccent(type: DungeonRoomType, atmosphere: DungeonAtmosphere): number | undefined { if(type==='boss'||type==='elite')return atmosphere.boss;if(type==='shrine')return atmosphere.shrine;if(type==='treasure')return atmosphere.treasure;return undefined }
export function tintRoomFloor(base:number,type:DungeonRoomType,atmosphere:DungeonAtmosphere){const color=new THREE.Color(base);const accent=roomAccent(type,atmosphere);if(accent!==undefined)color.lerp(new THREE.Color(accent),type==='boss'?0.2:0.1);if(type==='entrance')color.offsetHSL(0,-0.04,0.055);return color}
