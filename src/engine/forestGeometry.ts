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
export function forestCrown(radius: number, height: number, seed = 0) {
  const pieces: THREE.BufferGeometry[] = []
  for (let tier = 0; tier < 3; tier++) {
    const r = radius * (1 - tier * .24)
    const g = new THREE.ConeGeometry(r, height * .58, 11, 2)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const angle = Math.atan2(z, x)
      const ripple = 1 + .13 * Math.sin(angle * 5 + seed) + .07 * Math.cos(angle * 3 + tier)
      p.setXYZ(i, x * ripple, y + .07 * height * Math.sin(angle * 4 + seed) * Math.hypot(x,z) / radius, z * ripple)
    }
    g.translate(Math.sin(seed + tier) * radius * .08, height * (-.21 + tier * .25), 0)
    pieces.push(g.toNonIndexed())
    g.dispose()
  }
  const result = mergeGeometries(pieces)!
  pieces.forEach(g => g.dispose())
  result.computeVertexNormals()
  return result
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

export function forestBroadleaf(radius: number) {
  const pieces: THREE.BufferGeometry[] = []
  for (let lobe = 0; lobe < 5; lobe++) {
    const a = lobe * 2.399
    const g = new THREE.IcosahedronGeometry(radius * .67, 1)
    g.scale(1, .82, 1)
    g.translate(Math.cos(a)*radius*.4, Math.sin(a*2)*radius*.17, Math.sin(a)*radius*.4)
    pieces.push(g)
  }
  const result = mergeGeometries(pieces)!
  pieces.forEach(g => g.dispose())
  return result
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
