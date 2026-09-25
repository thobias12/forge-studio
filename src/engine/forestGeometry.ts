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

export function forestArtDirectedCrown(radius:number,height:number,variant:number,tier:number) {
const species=((variant%4)+4)%4
const pieces:THREE.BufferGeometry[]=[]
const profiles=[
{count:12,spread:.88,vertical:1.08,depth:.82,drift:.02},
{count:13,spread:1.24,vertical:.66,depth:1.12,drift:-.04},
{count:11,spread:.96,vertical:.92,depth:1.02,drift:.05},
{count:10,spread:1.08,vertical:.78,depth:.74,drift:.34},
] as const
const profile=profiles[species]
for(let clump=0;clump<profile.count;clump++) {
const layer=clump/Math.max(1,profile.count-1)
const angle=clump2.399963+species1.17+tier*.61
const wave=.5+.5Math.sin(clump1.71+species2.13+tier.77)
const signed=layer2-1
let reach=radius(.18+(clump%4).105)
let y=signedheight*.42
let sx=radius*(.31+wave*.13)
let sy=height*(.13+(clump%3).012)
let sz=radius(.31+(1-wave).12)
if(species===0) {
const taper=THREE.MathUtils.lerp(1.08,.24,layer)
reach=taper1.55;sx=taper;sz*=taper;sy*=.84;y=(layer-.47)height
} else if(species===1) {
const dome=Math.sqrt(Math.max(.18,1-Math.pow(signed1.08,2)))
reach*=dome1.48;sx=.9+dome*.36;sz*=.88+dome*.34;sy*=.78
y=signedheight.31+Math.sin(angle1.4)height.045
} else if(species===2) {
const dome=Math.sqrt(Math.max(.2,1-Math.pow(signed.86,2)))
reach*=dome1.2;sx=.82+dome*.24;sz*=.82+dome*.24;sy*=1.04;y=signedheight.43
} else {
const taper=THREE.MathUtils.lerp(1.02,.3,layer)
reach*=taper1.36;sx=taper1.16;sz=taper*.86;sy*=.78;y=(layer-.46)height
}
const g=new THREE.IcosahedronGeometry(1,0).toNonIndexed()
g.scale(sxprofile.spread,syprofile.vertical,szprofile.depth)
g.rotateY(angle*.31+wave*.22)
g.rotateZ((wave-.5)(species===1?.2:.1))
g.translate(
Math.cos(angle)reach+(species===3?THREE.MathUtils.lerp(-radius.12,radius.48,layer):profile.driftradiussigned),
y+Math.sin(angle1.31)height.025,
Math.sin(angle)reach,
)
const p=g.attributes.position,colors:number=[]
for(let i=0;i<p.count;i++) {
const nx=p.getX(i)/Math.max(.001,radius)
const ny=p.getY(i)/Math.max(.001,height)
const nz=p.getZ(i)/Math.max(.001,radius)
const directional=THREE.MathUtils.clamp(nx-.07+ny.17+nz*.045,-.11,.13)
const shade=.78+directional+tier*.018+(clump%3).026
colors.push(shade.76,shade,shade*.69)
}
g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3))
g.computeVertexNormals()
pieces.push(g)
}
const result=mergeGeometries(pieces)!
pieces.forEach(g=>g.dispose())
return result
}

export function forestArtDirectedTrunk(variant=0) {
const species=((variant%4)+4)%4
const pieces:THREE.BufferGeometry[]=[]
const height=[3.8,3.55,3.95,3.9][species]
const baseRadius=[.32,.46,.285,.33][species]
const lean=[
new THREE.Vector2(.12,-.04),
new THREE.Vector2(-.1,.08),
new THREE.Vector2(.04,.025),
new THREE.Vector2(.34,-.09),
][species]
const segment=(a:THREE.Vector3,b:THREE.Vector3,br:number,tr:number,sides=7)=>{
const d=b.clone().sub(a)
const g=new THREE.CylinderGeometry(tr,br,d.length(),sides,1,false)
g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize()))
g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2)
pieces.push(g.toNonIndexed())
g.dispose()
}
const joints=[
new THREE.Vector3(0,-1.7,0),
new THREE.Vector3(lean.x*.1,-1.7+height*.24,lean.y*.08),
new THREE.Vector3(lean.x*.31,-1.7+height*.5,lean.y*.34),
new THREE.Vector3(lean.x*.62,-1.7+height*.74,lean.y*.63),
new THREE.Vector3(lean.x,-1.7+height,lean.y),
]
const radii=[baseRadius,baseRadius*.76,baseRadius*.52,baseRadius*.3,baseRadius*.16]
for(let i=0;i<joints.length-1;i++) segment(joints[i],joints[i+1],radii[i],radii[i+1],8)
const rootCount=species===1?7:5
for(let root=0;root<rootCount;root++) {
const angle=root*(Math.PI2/rootCount)+species.41
const length=(.48+(root%3).115)(species===1?1.24:species===3?1.08:1)
const a=new THREE.Vector3(Math.cos(angle)baseRadius.38,-1.48,Math.sin(angle)baseRadius.38)
const b=new THREE.Vector3(Math.cos(angle)length.58,-1.65,Math.sin(angle)length.58)
const c=new THREE.Vector3(Math.cos(angle)length,-1.725+(root%2).018,Math.sin(angle)length)
segment(a,b,baseRadius.28,baseRadius*.12,6)
segment(b,c,baseRadius*.12,.02,5)
}
const patterns:Array<Array<[number,number,number,number]>>=[
[[.43,.15,.98,.08],[.52,2.34,1.08,.09],[.61,4.56,.95,.14],[.69,1.28,.84,.18],[.77,3.63,.72,.22]],
[[.4,.18,1.32,.22],[.46,2.12,1.48,.18],[.54,4.18,1.4,.26],[.62,1.1,1.26,.32],[.69,3.08,1.12,.38],[.76,5.18,.94,.44]],
[[.46,.3,.88,.24],[.55,2.55,.92,.3],[.64,4.76,.84,.34],[.72,1.54,.75,.4],[.8,3.8,.64,.46]],
[[.42,-.18,1.26,.08],[.5,.38,1.34,.12],[.58,-.45,1.18,.16],[.66,.2,1.05,.2],[.74,-.28,.9,.24]],
]
patterns[species].forEach(([t,angle,reach,rise],branch)=>{
const start=new THREE.Vector3(lean.xt,-1.7+heightt,lean.yt)
const a=species===3?angle.42:angle
const sweep=species===3?reach*.55:0
const mid=start.clone().add(new THREE.Vector3(Math.cos(a)reach.58+sweep,rise,Math.sin(a)reach.58))
const tip=mid.clone().add(new THREE.Vector3(Math.cos(a+.18)reach.5+sweep*.3,rise*.82+.1,Math.sin(a+.18)reach.5))
const r=baseRadius*(species===1?.28:.23)(1-t.28)
segment(start,mid,r,r*.48,6)
segment(mid,tip,r*.5,.018,5)
if(species===1&&branch%2===1) {
const fork=mid.clone().add(new THREE.Vector3(Math.cos(a-.8)reach.4,.34,Math.sin(a-.8)reach.4))
segment(mid,fork,r*.34,.014,5)
}
})
const result=mergeGeometries(pieces)!
pieces.forEach(g=>g.dispose())
const p=result.attributes.position,colors:number=[]
const bark=new THREE.Color([0x493326,0x5b3d27,0x574333,0x3d2d25][species])
for(let i=0;i<p.count;i++) {
const y=p.getY(i)
const angle=Math.atan2(p.getZ(i),p.getX(i))
const ny=THREE.MathUtils.clamp((y+1.7)/height,0,1)
const grain=Math.sin(angle4+ny7+species).045+Math.sin(ny27+angle1.7).025
const c=bark.clone().multiplyScalar(.69+ny*.16+grain)
colors.push(c.r,c.g,c.b)
}
result.setAttribute('color',new THREE.Float32BufferAttribute(colors,3))
result.computeVertexNormals()
return result
}

export function forestBarkTexture(variant=0) {
const width=32,height=64,data=new Uint8Array(widthheight4)
for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
const i=(ywidth+x)4
const ridge=Math.sin(x.78+variant1.7).5+.5
const grain=Math.sin(y.31+x*.17+variant2.1).5+.5
const knot=Math.sin(Math.hypot(x-9-variant3,y-29).72).5+.5
const value=THREE.MathUtils.clamp(Math.round(150+ridge54+grain26+knot16),105,246)
data[i]=value;data[i+1]=value;data[i+2]=value;data[i+3]=255
}
const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat)
texture.colorSpace=THREE.SRGBColorSpace
texture.wrapS=texture.wrapT=THREE.RepeatWrapping
texture.repeat.set(2.4,3.8)
texture.needsUpdate=true
return texture
}

export function forestFoliageTexture(variant=0) {
const size=32,data=new Uint8Array(sizesize4)
for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
const i=(ysize+x)4
const broad=Math.sin(x.39+y.23+variant1.9).5+.5
const clusters=Math.sin(x*.83-y*.61+variant*.73).5+.5
const value=THREE.MathUtils.clamp(Math.round(158+broad52+clusters*30),118,240)
data[i]=value;data[i+1]=value;data[i+2]=value;data[i+3]=255
}
const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat)
texture.colorSpace=THREE.SRGBColorSpace
texture.wrapS=texture.wrapT=THREE.RepeatWrapping
texture.repeat.set(2.2,2.2)
texture.needsUpdate=true
return texture
}

export function forestShrub(variant = 0) {
const pieces: THREE.BufferGeometry[] = []
const base = new THREE.Color([0x456742, 0x365b3c, 0x596846, 0x46553f][variant % 4])

for (let clump = 0; clump < 4; clump++) {
const angle = clump * 2.18 + variant * .57
const geometry = new THREE.IcosahedronGeometry(1, 0).toNonIndexed()
const scale = .34 + (clump % 2) * .1
geometry.scale(scale * 1.18, scale * .72, scale)
geometry.translate(
Math.cos(angle) * (.18 + clump * .035),
.25 + (clump % 3) * .07,
Math.sin(angle) * (.18 + clump * .035),
)

const colors: number[] = []
for (let vertex = 0; vertex < geometry.attributes.position.count; vertex++) {
  const color = base.clone().multiplyScalar(
    .72 + (clump % 3) * .09 + geometry.attributes.position.getY(vertex) * .14,
  )
  colors.push(color.r, color.g, color.b)
}
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
pieces.push(geometry)

}

const result = mergeGeometries(pieces)!
pieces.forEach((geometry) => geometry.dispose())
result.computeVertexNormals()
return result
}

export function forestSapling(variant = 0) {
const pieces: THREE.BufferGeometry[] = []
const trunk = new THREE.CylinderGeometry(.035, .07, 1.42, 6).toNonIndexed()
trunk.translate(0, .71, 0)

const trunkColors: number[] = []
const bark = new THREE.Color(0x58412f)
for (let vertex = 0; vertex < trunk.attributes.position.count; vertex++) {
const color = bark.clone().multiplyScalar(
.72 + trunk.attributes.position.getY(vertex) * .09,
)
trunkColors.push(color.r, color.g, color.b)
}
trunk.setAttribute('color', new THREE.Float32BufferAttribute(trunkColors, 3))
pieces.push(trunk)

const leafColor = new THREE.Color([0x50794b, 0x3f7047, 0x668153, 0x4f6846][variant % 4])
for (let clump = 0; clump < 3; clump++) {
const geometry = new THREE.IcosahedronGeometry(.34 - clump * .045, 0).toNonIndexed()
geometry.scale(1.12, .72, .94)
geometry.translate(
(clump - 1) * .16,
1.05 + clump * .24,
Math.sin(clump * 2.2 + variant) * .12,
)

const colors: number[] = []
for (let vertex = 0; vertex < geometry.attributes.position.count; vertex++) {
  const color = leafColor.clone().multiplyScalar(
    .78 + geometry.attributes.position.getY(vertex) * .1,
  )
  colors.push(color.r, color.g, color.b)
}
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
pieces.push(geometry)

}

const result = mergeGeometries(pieces)!
pieces.forEach((geometry) => geometry.dispose())
result.computeVertexNormals()
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
