import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export function forestFloorMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 forestPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nforestPosition = position;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 forestPosition;
      float forestHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float forestNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(forestHash(i),forestHash(i+vec2(1,0)),f.x),
          mix(forestHash(i+vec2(0,1)),forestHash(i+vec2(1,1)),f.x),f.y);
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float broad = forestNoise(forestPosition.xz*.65);
        float grain = forestNoise(forestPosition.xz*7.0);
        float fade = 1.0-smoothstep(.12,.65,length(fwidth(forestPosition.xz)));
        diffuseColor.rgb *= .85 + broad*.3 + (grain-.5)*.22*fade;`)
  }
  material.customProgramCacheKey = () => 'skillbound-forest-floor-v1'
  return material
}

// Original, deterministic silhouettes shared by the editor and playable world.
// Folded leaf clusters, not spheres: closed leaf volumes work with shadow maps
// and camera fading without alpha-sorted cards or downloaded textures.
function leafCanopy(radius: number, height: number, seed: number, pine: boolean) {
  const p: number[]=[], colors: number[]=[]
  const add=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,tone:number)=>{
    p.push(...a.toArray(),...b.toArray(),...c.toArray())
    for(let i=0;i<3;i++) colors.push(tone*.86,tone,tone*.78)
  }
  for(let leaf=0;leaf<80;leaf++) {
    const angle=leaf*2.399+seed
    const layer=(leaf%8)/7
    const reach=radius*(pine ? (.88-layer*.66) : Math.sqrt(1-Math.pow(layer*1.7-.85,2)))*(.48+(leaf%5)*.105)
    const center=new THREE.Vector3(Math.cos(angle)*reach,(layer-.5)*height*.9,Math.sin(angle)*reach)
    const length=radius*(pine?.36:.30)*( .8+(leaf%3)*.15 )
    const width=length*(pine?.44:.65)
    const forward=new THREE.Vector3(Math.cos(angle),.15+Math.sin(leaf)*.25,Math.sin(angle)).normalize()
    const side=new THREE.Vector3(-Math.sin(angle),0,Math.cos(angle))
    const base=center.clone().addScaledVector(forward,-length*.65)
    const tip=center.clone().addScaledVector(forward,length)
    const left=center.clone().addScaledVector(side,width)
    const right=center.clone().addScaledVector(side,-width)
    const ridge=center.clone().add(new THREE.Vector3(0,length*.24,0))
    const underside=center.clone().add(new THREE.Vector3(0,-length*.08,0))
    const tone=.92+layer*.28+(leaf%4)*.055
    const rim=[base,base.clone().lerp(left,.68),left.clone().lerp(tip,.25),tip,tip.clone().lerp(right,.7),right.clone().lerp(base,.3)]
    for(let j=0;j<rim.length;j++) {
      add(rim[j],rim[(j+1)%rim.length],ridge,tone*(j%2?1:.94))
      add(rim[(j+1)%rim.length],rim[j],underside,tone*.78)
    }
  }
  const g=new THREE.BufferGeometry()
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3))
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3))
  g.computeVertexNormals();return g
}
export function forestCrown(radius:number,height:number,seed=0) {
  return leafCanopy(radius,height,seed,true)
}

export function forestSpeciesCrown(radius:number,height:number,variant:number,tier:number) {
  const broad = variant === 1 || variant === 2
  const g = leafCanopy(radius,height,variant*1.73+tier*.49,!broad)
  if (variant === 0) g.scale(.84,1.12,.84) // slender fir
  if (variant === 1) g.scale(1.24,.57,1.16) // spreading oak
  if (variant === 2) g.scale(.94,.88,1.04) // upright leafy crown
  if (variant === 3) {
    g.scale(1.08,.75,.78) // windswept pine
    const p=g.attributes.position
    for(let i=0;i<p.count;i++) p.setX(i,p.getX(i)+Math.max(0,p.getY(i)+height*.5)*.23)
    g.computeVertexNormals()
  }
  return g
}

export function forestStylizedSpeciesCrown(radius:number,height:number,variant:number,tier:number) {
const pine = variant === 0 || variant === 3
const pieces: THREE.BufferGeometry[] = []
const count = pine ? 15 : 17

for (let clump = 0; clump < count; clump++) {
const layer = clump / Math.max(1, count - 1)
const angle = clump * 2.399963 + variant * 1.27 + tier * .43
const wave = .5 + .5 * Math.sin(clump * 1.731 + variant * 2.17 + tier)
let reach = radius * (.18 + (clump % 4) * .1)
let y = (layer - .5) * height
let sx = radius * (.34 + wave * .12)
let sy = height * (.12 + (clump % 3) * .016)
let sz = radius * (.32 + (1 - wave) * .13)

if (pine) {
  const taper = Math.max(.2, 1 - layer * .76)
  reach *= taper * 1.55
  sx *= taper
  sz *= taper
  y = (layer - .48) * height
} else {
  const vertical = (layer - .5) * 1.72
  const dome = Math.sqrt(Math.max(.12, 1 - vertical * vertical))
  reach *= dome * 1.25
  sx *= .76 + dome * .32
  sz *= .76 + dome * .32
  y = vertical * height * .47
}

const geometry = new THREE.IcosahedronGeometry(1, 0).toNonIndexed()
geometry.scale(sx, sy, sz)
geometry.rotateY(angle * .37)
geometry.translate(
  Math.cos(angle) * reach + Math.sin(angle * 1.9) * radius * .045,
  y + Math.sin(angle * 1.3) * height * .025,
  Math.sin(angle) * reach,
)

const position = geometry.attributes.position
const colors: number[] = []
const tone = .8 + layer * .17 + (clump % 3) * .03
for (let vertex = 0; vertex < position.count; vertex++) {
  const localLight = tone + Math.max(-.07, position.getY(vertex) / Math.max(.001, height) * .08)
  colors.push(localLight * .8, localLight, localLight * .72)
}
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
geometry.computeVertexNormals()
pieces.push(geometry)

}

const result = mergeGeometries(pieces)!
pieces.forEach((geometry) => geometry.dispose())
if (variant === 0) result.scale(.86, 1.12, .86)
if (variant === 1) result.scale(1.26, .62, 1.14)
if (variant === 2) result.scale(.98, .9, 1.06)
if (variant === 3) {
result.scale(1.08, .78, .8)
const position = result.attributes.position
for (let index = 0; index < position.count; index++) {
position.setX(
index,
position.getX(index) + Math.max(0, position.getY(index) + height * .5) * .22,
)
}
result.computeVertexNormals()
}
return result
}

// One connected trunk and attached limbs, all expressed in the same local frame.
// Four deterministic silhouettes avoid repeating identical smooth gray poles.
export function forestDeadTree(variant:number) {
  const pieces:THREE.BufferGeometry[]=[]
  const bark = new THREE.Color([0x4a3b30,0x39342e,0x665749,0x302b28][variant%4])
  const tube=(points:THREE.Vector3[],radii:number[],broken=false)=>{
    const p:number[]=[], c:number[]=[], indices:number[]=[], sides=7
    points.forEach((point,row)=>{
      for(let j=0;j<sides;j++) {
        const a=j/sides*Math.PI*2
        const groove=1+.10*Math.sin(j*2.7+variant)
        const jagged=broken && row===points.length-1 ? Math.sin(j*2.4+variant)*.08 : 0
        p.push(point.x+Math.cos(a)*radii[row]*groove,point.y+jagged,point.z+Math.sin(a)*radii[row]*groove)
        const col=bark.clone().multiplyScalar(.78+(j%3)*.15)
        c.push(col.r,col.g,col.b)
        if(row<points.length-1) {
          const k=row*sides+j,next=row*sides+(j+1)%sides
          indices.push(k,k+sides,next,next,k+sides,next+sides)
        }
      }
    })
    for(let j=1;j<sides-1;j++) {
      indices.push(0,j,j+1)
      const k=(points.length-1)*sides
      indices.push(k,k+j+1,k+j)
    }
    const g=new THREE.BufferGeometry()
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3))
    g.setAttribute('color',new THREE.Float32BufferAttribute(c,3))
    g.setIndex(indices);g.computeVertexNormals();pieces.push(g.toNonIndexed());g.dispose()
  }
  const lean=variant%2?-.22:.2
  const h=[4.5,3.65,4.85,3.95][variant%4]
  const trunk=[new THREE.Vector3(0,0,0),new THREE.Vector3(.04,.7,.04),
    new THREE.Vector3(lean,h*.42,-.04),new THREE.Vector3(lean*.6,h*.7,.12),new THREE.Vector3(lean*2,h,.18)]
  tube(trunk,[.34,.23,.16,.10,.035],true)
  for(let i=0;i<6;i++) {
    const t=.28+i*.105, a=i*2.399+variant*.8
    const levels=[0,.7/h,.42,.7,1]
    const row=t<.42?1:t<.7?2:3
    const start=trunk[row].clone().lerp(trunk[row+1],(t-levels[row])/(levels[row+1]-levels[row]))
    const length=.62+(i%3)*.2, mid=start.clone().add(new THREE.Vector3(Math.cos(a)*length*.65,.17,Math.sin(a)*length*.65))
    const tip=mid.clone().add(new THREE.Vector3(Math.cos(a+.3)*length*.45,.45,Math.sin(a+.3)*length*.45))
    tube([start,mid,tip],[.07-i*.006,.035,.009])
    if(i%2===0) tube([mid,mid.clone().add(new THREE.Vector3(Math.cos(a-1)*.32,.44,Math.sin(a-1)*.32))],[.026,.005])
  }
  const result=mergeGeometries(pieces)!;pieces.forEach(g=>g.dispose());return result
}

export function forestTrunk() {
  const pieces:THREE.BufferGeometry[]=[]
  const trunk=new THREE.CylinderGeometry(.11,.31,3.45,9,6)
  const p=trunk.attributes.position
  for(let i=0;i<p.count;i++) {
    const y=p.getY(i),x=p.getX(i),z=p.getZ(i),t=(y+1.725)/3.45
    const a=Math.atan2(z,x),root=1+Math.pow(1-t,6)*.8
    p.setXYZ(i,x*root+Math.sin(t*3)*.12,y,z*root+Math.sin(t*5)*.06)
    if(t<.1) p.setXYZ(i,p.getX(i)*(1+.2*Math.cos(a*5)),y,p.getZ(i)*(1+.2*Math.cos(a*5)))
  }
  trunk.computeVertexNormals();pieces.push(trunk.toNonIndexed());trunk.dispose()
  for(let i=0;i<6;i++) {
    const a=i*2.399,base=new THREE.Vector3(.07,.1+i*.23,0)
    const tip=new THREE.Vector3(Math.cos(a)*(.7-i*.055),1.05+i*.18,Math.sin(a)*(.7-i*.055))
    const d=tip.clone().sub(base)
    const g=new THREE.CylinderGeometry(.018,.07,d.length(),6)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()))
    g.translate((base.x+tip.x)/2,(base.y+tip.y)/2,(base.z+tip.z)/2)
    pieces.push(g.toNonIndexed());g.dispose()
  }
  const result=mergeGeometries(pieces)!;pieces.forEach(g=>g.dispose());return result
}

export function forestStylizedTrunk(variant = 0) {
const species = ((variant % 4) + 4) % 4
const pieces: THREE.BufferGeometry[] = []
const rootY = -1.7
const height = [3.65, 3.5, 3.72, 3.82][species]
const baseRadius = [.34, .42, .31, .32][species]
const lean = [
new THREE.Vector2(.16, -.04),
new THREE.Vector2(-.08, .11),
new THREE.Vector2(.05, .04),
new THREE.Vector2(.28, -.07),
][species]

const segment = (
a: THREE.Vector3,
b: THREE.Vector3,
bottomRadius: number,
topRadius: number,
sides = 7,
) => {
const direction = b.clone().sub(a)
const geometry = new THREE.CylinderGeometry(
topRadius,
bottomRadius,
direction.length(),
sides,
1,
false,
)
geometry.applyQuaternion(
new THREE.Quaternion().setFromUnitVectors(
new THREE.Vector3(0, 1, 0),
direction.clone().normalize(),
),
)
geometry.translate(
(a.x + b.x) / 2,
(a.y + b.y) / 2,
(a.z + b.z) / 2,
)
pieces.push(geometry.toNonIndexed())
geometry.dispose()
}

const joints = [
new THREE.Vector3(0, rootY, 0),
new THREE.Vector3(lean.x * .12, rootY + height * .29, lean.y * .12),
new THREE.Vector3(lean.x * .38, rootY + height * .58, lean.y * .42),
new THREE.Vector3(lean.x * .72, rootY + height * .8, lean.y * .7),
new THREE.Vector3(lean.x, rootY + height, lean.y),
]
const radii = [
baseRadius,
baseRadius * .72,
baseRadius * .49,
baseRadius * .3,
[.085, .115, .09, .075][species],
]
for (let index = 0; index < joints.length - 1; index++) {
segment(joints[index], joints[index + 1], radii[index], radii[index + 1], 8)
}

const rootCount = species === 1 ? 6 : 5
for (let root = 0; root < rootCount; root++) {
const angle = root * (Math.PI * 2 / rootCount) + species * .43
const length = (.48 + (root % 3) * .12) * (species === 1 ? 1.18 : 1)
segment(
new THREE.Vector3(
Math.cos(angle) * baseRadius * .46,
rootY + .12,
Math.sin(angle) * baseRadius * .46,
),
new THREE.Vector3(
Math.cos(angle) * length,
rootY - .035 + (root % 2) * .025,
Math.sin(angle) * length,
),
baseRadius * .24,
.025,
5,
)
}

const branchCount = [5, 7, 5, 6][species]
for (let branch = 0; branch < branchCount; branch++) {
const t = .48 + branch / Math.max(1, branchCount - 1) * .34
const angle = branch * 2.399963 + species * .71 + (species === 3 ? -.42 : 0)
const reach =
[1.03, 1.42, .92, 1.16][species] *
(1 - (t - .48) * .48) *
(.88 + (branch % 3) * .08)
const start = new THREE.Vector3(
lean.x * t,
rootY + height * t,
lean.y * t,
)
const swept = species === 3 ? .42 : 0
const mid = start.clone().add(
new THREE.Vector3(
Math.cos(angle) * reach * .58 + swept,
.18 + (branch % 2) * .09,
Math.sin(angle) * reach * .58,
),
)
const tip = mid.clone().add(
new THREE.Vector3(
Math.cos(angle + .18) * reach * .48 + swept * .35,
.24 + (branch % 3) * .07,
Math.sin(angle + .18) * reach * .48,
),
)
segment(start, mid, radii[2] * .42, radii[2] * .2, 6)
segment(mid, tip, radii[2] * .22, .018, 5)
}

const result = mergeGeometries(pieces)!
pieces.forEach((geometry) => geometry.dispose())
const position = result.attributes.position
const colors: number[] = []
const bark = new THREE.Color(
[0x4b3628, 0x59402c, 0x4b3b2d, 0x403128][species],
)
for (let index = 0; index < position.count; index++) {
const y = position.getY(index)
const angle = Math.atan2(position.getZ(index), position.getX(index))
const normalizedY = THREE.MathUtils.clamp(
(y - rootY) / Math.max(.001, height),
0,
1,
)
const shade =
.7 +
normalizedY * .18 +
(Math.sin(angle * 3 + species) * .5 + .5) * .1
const color = bark.clone().multiplyScalar(shade)
colors.push(color.r, color.g, color.b)
}
result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
result.computeVertexNormals()
return result
}

export function forestBranch() {
  const pieces: THREE.BufferGeometry[]=[]
  const segment=(a: THREE.Vector3,b: THREE.Vector3,r:number)=>{
    const d=b.clone().sub(a)
    const g=new THREE.CylinderGeometry(r*.22,r,d.length(),5)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()))
    g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2)
    pieces.push(g.toNonIndexed());g.dispose()
  }
  segment(new THREE.Vector3(0,-.58,0),new THREE.Vector3(.08,.58,0),.11)
  for(let i=0;i<5;i++) {
    const y=-.2+i*.15,side=i%2?1:-1
    const end=new THREE.Vector3(side*(.26+i*.03),y+.3,Math.sin(i*2)*.14)
    segment(new THREE.Vector3(.03,y,0),end,.036)
    segment(end.clone().lerp(new THREE.Vector3(.03,y,0),.35),end.clone().add(new THREE.Vector3(-side*.13,.2,.1)),.018)
  }
  const result=mergeGeometries(pieces)!;pieces.forEach(g=>g.dispose());return result
}

export function forestRock(radius = .7) {
  const g = new THREE.IcosahedronGeometry(radius, 1)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const warp = 1 + .16 * Math.sin(x * 9 + z * 5) + .09 * Math.cos(y * 13 - z * 7)
    p.setXYZ(i, x * warp, Math.max(-radius * .58, y * warp), z * warp)
  }
  g.computeVertexNormals()
  return g
}

export function forestBroadleaf(radius:number) {
  return leafCanopy(radius,radius*1.3,2.17,false)
}

export function forestFern() {
  const p: number[] = []
  for (let frond = 0; frond < 7; frond++) {
    const a = frond * 2.399
    for (let leaf = 0; leaf < 5; leaf++) {
      const t = (leaf + 1)/6, r = t*.52, y = Math.sin(t*Math.PI)*.24
      const width = .13*(1-t*.7)
      for (const side of [-1,1]) {
        const x = Math.cos(a)*r, z = Math.sin(a)*r
        p.push(x,y,z, x+Math.cos(a+.9*side)*width,y+.03,z+Math.sin(a+.9*side)*width,
          Math.cos(a)*(r+.12),Math.sin((t+.1)*Math.PI)*.24,Math.sin(a)*(r+.12))
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3))
  g.computeVertexNormals()
  return g
}

export function forestLog(length = 2.4) {
  const g = new THREE.CylinderGeometry(.25, .32, length, 12, 5).toNonIndexed()
  const p = g.attributes.position, n = g.attributes.normal
  const colors: number[] = []
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const angle = Math.atan2(z, x)
    const bark = 1 + .07 * Math.sin(angle * 6) + .035 * Math.cos(y * 8 + angle * 3)
    p.setXYZ(i, x * bark, y, z * bark)
    const end = Math.abs(n.getY(i)) > .9
    const color = new THREE.Color(end ? 0xb99a6b : 0x574535)
    color.multiplyScalar(end ? .85 + .15 * Math.cos(Math.hypot(x,z) * 85) : .82 + .18 * Math.sin(angle * 7 + y))
    colors.push(color.r, color.g, color.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

export function forestGrass() {
  const positions: number[] = [], colors: number[] = []
  for (let blade = 0; blade < 9; blade++) {
    const a = blade * 2.399, r = .08 + (blade % 3) * .11
    const h = .34 + (blade % 4) * .08, w = .038
    const x = Math.cos(a)*r, z = Math.sin(a)*r
    const dx = Math.cos(a)*w, dz = Math.sin(a)*w
    const bendX = Math.cos(a)*.14, bendZ = Math.sin(a)*.14
    const verts = [[x-dx,0,z-dz],[x+dx,0,z+dz],[x+dx+bendX*.4,h*.55,z+dz+bendZ*.4],
      [x-dx,0,z-dz],[x+dx+bendX*.4,h*.55,z+dz+bendZ*.4],[x-dx+bendX*.4,h*.55,z-dz+bendZ*.4],
      [x-dx+bendX*.4,h*.55,z-dz+bendZ*.4],[x+dx+bendX*.4,h*.55,z+dz+bendZ*.4],[x+bendX,h,z+bendZ]]
    for (const v of verts) {
      positions.push(...v)
      const t = v[1]/h
      colors.push(.48+t*.52,.58+t*.42,.42+t*.4)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions,3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors,3))
  g.computeVertexNormals()
  return g
}
