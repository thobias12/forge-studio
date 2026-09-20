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
