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
  crypt: { background:0x030607,fog:0x081113,fogMultiplier:1.45,sky:0x577077,ground:0x07090a,ambient:0.72,key:0x9bb5bd,keyIntensity:0.72,exposure:0.92,bloomStrength:0.58,bloomRadius:0.46,bloomThreshold:0.78,floor:0x303735,wall:0x414a47,wallDark:0x252b2a,corridorFloor:0x292f2e,corridorWall:0x343c3a,seam:0x151a19,torch:0xff934d,torchIntensity:3.1,dust:0xa7aaa1,mist:0x8aa2a2,boss:0x9b3144,shrine:0x57b7a5,treasure:0xd5a84e },
  castle: { background:0x07090b,fog:0x11161a,fogMultiplier:1.05,sky:0x687987,ground:0x0c0c0d,ambient:0.82,key:0xc0ced7,keyIntensity:0.9,exposure:0.98,bloomStrength:0.45,bloomRadius:0.38,bloomThreshold:0.82,floor:0x454744,wall:0x555957,wallDark:0x2d3030,corridorFloor:0x393c39,corridorWall:0x444947,seam:0x232625,torch:0xffa65a,torchIntensity:3.0,dust:0xb4b3a9,mist:0x9aa4a5,boss:0xa93e45,shrine:0x73a7c9,treasure:0xe0b350 },
  cave: { background:0x030607,fog:0x071011,fogMultiplier:1.3,sky:0x44646a,ground:0x050706,ambient:0.62,key:0x75999d,keyIntensity:0.55,exposure:0.9,bloomStrength:0.5,bloomRadius:0.5,bloomThreshold:0.76,floor:0x292e2c,wall:0x363c39,wallDark:0x1d211f,corridorFloor:0x242826,corridorWall:0x303633,seam:0x131716,torch:0xff8747,torchIntensity:3.0,dust:0x8b9088,mist:0x6e8f91,boss:0xa13342,shrine:0x4ec2ba,treasure:0xcb9e43 },
  cathedral: { background:0x05070c,fog:0x101725,fogMultiplier:0.9,sky:0x7187a9,ground:0x0b0b0f,ambient:0.88,key:0xb9c9e7,keyIntensity:1.05,exposure:1.02,bloomStrength:0.66,bloomRadius:0.52,bloomThreshold:0.73,floor:0x3c4148,wall:0x535965,wallDark:0x2b3039,corridorFloor:0x333840,corridorWall:0x444b57,seam:0x20252c,torch:0xffbd72,torchIntensity:2.7,dust:0xc0c3c7,mist:0x9eacc4,boss:0xa8445a,shrine:0x7cc7d8,treasure:0xe4c36e },
  mine: { background:0x050606,fog:0x12100c,fogMultiplier:1.2,sky:0x6e6655,ground:0x090806,ambient:0.68,key:0xb0a58d,keyIntensity:0.72,exposure:0.93,bloomStrength:0.43,bloomRadius:0.4,bloomThreshold:0.8,floor:0x37322b,wall:0x494137,wallDark:0x28231e,corridorFloor:0x2f2a24,corridorWall:0x3c362e,seam:0x1b1714,torch:0xff9b4e,torchIntensity:3.0,dust:0xb2a58d,mist:0x8e8372,boss:0xa74238,shrine:0x6cae9e,treasure:0xd7a54b },
  sewer: { background:0x020706,fog:0x071511,fogMultiplier:1.55,sky:0x456a5d,ground:0x040806,ambient:0.62,key:0x769d8d,keyIntensity:0.54,exposure:0.88,bloomStrength:0.52,bloomRadius:0.5,bloomThreshold:0.75,floor:0x27342f,wall:0x34473f,wallDark:0x192721,corridorFloor:0x22302b,corridorWall:0x2c3e37,seam:0x101a16,torch:0xe9914c,torchIntensity:2.7,dust:0x7f9a88,mist:0x6a9989,boss:0x8d3940,shrine:0x5cb495,treasure:0xcda54c },
  void: { background:0x030208,fog:0x100922,fogMultiplier:1.38,sky:0x59488d,ground:0x05030b,ambient:0.55,key:0x8d78c9,keyIntensity:0.62,exposure:0.9,bloomStrength:0.92,bloomRadius:0.62,bloomThreshold:0.62,floor:0x272236,wall:0x38304f,wallDark:0x191425,corridorFloor:0x211c2f,corridorWall:0x302744,seam:0x110c1d,torch:0xb468ff,torchIntensity:3.2,dust:0x9a79d5,mist:0x6e4faf,boss:0xe24885,shrine:0x6f9dff,treasure:0xc990ff },
}

export function dungeonAtmosphere(theme: DungeonTheme): DungeonAtmosphere { return THEMES[theme] ?? THEMES.crypt }
export function roomAccent(type: DungeonRoomType, atmosphere: DungeonAtmosphere): number | undefined { if(type==='boss'||type==='elite')return atmosphere.boss;if(type==='shrine')return atmosphere.shrine;if(type==='treasure')return atmosphere.treasure;return undefined }
export function tintRoomFloor(base:number,type:DungeonRoomType,atmosphere:DungeonAtmosphere){const color=new THREE.Color(base);const accent=roomAccent(type,atmosphere);if(accent!==undefined)color.lerp(new THREE.Color(accent),type==='boss'?0.2:0.1);if(type==='entrance')color.offsetHSL(0,-0.04,0.055);return color}
