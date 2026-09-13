import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ForgeVfxEmitter, ForgeVfxPackage } from '../lib/vfxPackage'

export type VfxPreviewHandle = { restart: () => void; frame: () => void }
type Props = { value: ForgeVfxPackage; playing: boolean; showGrid: boolean; background: 'studio' | 'dark' | 'outdoor' }

type Particle = { position: THREE.Vector3; velocity: THREE.Vector3; age: number; life: number; spin: number }
type EmitterRuntime = { emitter: ForgeVfxEmitter; points: THREE.Points; particles: Particle[]; accumulator: number; elapsed: number; burstDone: boolean; positions: Float32Array; colors: Float32Array; sizes: Float32Array; alphas: Float32Array }

const VfxPreview = forwardRef<VfxPreviewHandle, Props>(function VfxPreview({ value, playing, showGrid, background }, ref) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playingRef = useRef(playing)
  const valueRef = useRef(value)
  const state = useRef<{ renderer?:THREE.WebGLRenderer; scene?:THREE.Scene; camera?:THREE.PerspectiveCamera; orbit?:OrbitControls; grid?:THREE.GridHelper; floor?:THREE.Mesh; runtimes:EmitterRuntime[]; last:number; elapsed:number }>({ runtimes:[], last:0, elapsed:0 })

  useEffect(() => { playingRef.current = playing }, [playing])
  useEffect(() => { valueRef.current = value }, [value])

  const resetRuntimes = () => {
    const s = state.current
    s.elapsed = 0
    for (const runtime of s.runtimes) {
      runtime.particles = []
      runtime.accumulator = 0
      runtime.elapsed = 0
      runtime.burstDone = false
      runtime.points.visible = runtime.emitter.enabled
      clearAttributes(runtime)
    }
  }

  useImperativeHandle(ref, () => ({ restart: resetRuntimes, frame: () => state.current.orbit?.update() }))

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const s = state.current
    const scene = new THREE.Scene(); s.scene = scene
    const camera = new THREE.PerspectiveCamera(45, 1, .01, 100); camera.position.set(4, 2.6, 4.8); s.camera = camera
    const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false }); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; host.appendChild(renderer.domElement); s.renderer = renderer
    const orbit = new OrbitControls(camera, renderer.domElement); orbit.enableDamping = true; orbit.target.set(0,1,0); orbit.update(); s.orbit = orbit
    scene.add(new THREE.HemisphereLight(0xbfd8ff,0x26313c,1.6))
    const key = new THREE.DirectionalLight(0xffffff,2.5); key.position.set(4,6,3); key.castShadow = true; scene.add(key)
    const grid = new THREE.GridHelper(12,24,0x3c5267,0x1a2733); scene.add(grid); s.grid = grid
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.MeshStandardMaterial({ color:0x111922,roughness:1 })); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor); s.floor=floor
    const origin = new THREE.Mesh(new THREE.SphereGeometry(.06,14,10),new THREE.MeshStandardMaterial({ color:0x7fb6de,emissive:0x284d6d,emissiveIntensity:1.2 })); origin.position.y=.06; scene.add(origin)

    const resize = () => { const rect=host.getBoundingClientRect(); if(!rect.width||!rect.height)return; renderer.setSize(rect.width,rect.height,false); camera.aspect=rect.width/rect.height; camera.updateProjectionMatrix() }
    resize(); const ro=new ResizeObserver(resize); ro.observe(host)
    let raf=0
    const tick=(now:number)=>{ const dt=s.last?Math.min(.05,(now-s.last)/1000):0; s.last=now; orbit.update(); if(playingRef.current) updateSimulation(s,dt,valueRef.current); renderer.render(scene,camera); raf=requestAnimationFrame(tick) }
    raf=requestAnimationFrame(tick)
    return()=>{ cancelAnimationFrame(raf); ro.disconnect(); disposeRuntimes(s); orbit.dispose(); renderer.dispose(); renderer.domElement.remove(); s.last=0 }
  }, [])

  useEffect(() => {
    const s=state.current; if(!s.scene)return
    disposeRuntimes(s)
    s.runtimes=value.emitters.map((emitter)=>createRuntime(emitter,s.scene!))
    resetRuntimes()
  }, [JSON.stringify(value.emitters)])

  useEffect(()=>{ const s=state.current; if(s.grid)s.grid.visible=showGrid; if(s.floor)s.floor.visible=showGrid },[showGrid])
  useEffect(()=>{ const scene=state.current.scene; if(!scene)return; scene.background=new THREE.Color(background==='dark'?0x030508:background==='outdoor'?0x263847:0x0a1017) },[background])

  return <div ref={hostRef} className="vfx-preview-canvas" />
})

function createRuntime(emitter:ForgeVfxEmitter,scene:THREE.Scene):EmitterRuntime{
  const max=Math.max(8,Math.min(1000,Math.round(emitter.maxParticles)))
  const positions=new Float32Array(max*3),colors=new Float32Array(max*3),sizes=new Float32Array(max),alphas=new Float32Array(max)
  const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage)); geometry.setAttribute('aColor',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage)); geometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1).setUsage(THREE.DynamicDrawUsage)); geometry.setAttribute('aAlpha',new THREE.BufferAttribute(alphas,1).setUsage(THREE.DynamicDrawUsage)); geometry.setDrawRange(0,0)
  const material=new THREE.ShaderMaterial({ transparent:true,depthWrite:false,blending:emitter.blendMode==='additive'?THREE.AdditiveBlending:THREE.NormalBlending,vertexColors:true,uniforms:{ uPixelRatio:{value:Math.min(devicePixelRatio,2)},uStyle:{value:emitter.style==='soft'?0:emitter.style==='spark'?1:2}},vertexShader:`attribute vec3 aColor;attribute float aSize;attribute float aAlpha;varying vec3 vColor;varying float vAlpha;uniform float uPixelRatio;void main(){vColor=aColor;vAlpha=aAlpha;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=max(1.0,aSize*uPixelRatio*(320.0/max(0.2,-mv.z)));gl_Position=projectionMatrix*mv;}`,fragmentShader:`varying vec3 vColor;varying float vAlpha;uniform float uStyle;void main(){vec2 p=gl_PointCoord*2.0-1.0;float a=1.0;if(uStyle<0.5){a=smoothstep(1.0,0.15,length(p));}else if(uStyle<1.5){a=smoothstep(1.0,0.0,abs(p.x)+abs(p.y)*0.32);}else{a=step(max(abs(p.x),abs(p.y)),1.0);}if(a<0.01)discard;gl_FragColor=vec4(vColor,vAlpha*a);}` })
  const points=new THREE.Points(geometry,material); points.frustumCulled=false; scene.add(points)
  return { emitter,points,particles:[],accumulator:0,elapsed:0,burstDone:false,positions,colors,sizes,alphas }
}

function updateSimulation(s:{runtimes:EmitterRuntime[];elapsed:number},dt:number,pkg:ForgeVfxPackage){
  s.elapsed+=dt
  if(!pkg.looping&&s.elapsed>pkg.duration+.25)return
  if(pkg.looping&&s.elapsed>Math.max(.1,pkg.duration)) { s.elapsed=0; for(const r of s.runtimes){r.burstDone=false;r.elapsed=0} }
  for(const runtime of s.runtimes){ const e=runtime.emitter; if(!e.enabled){runtime.points.visible=false;continue} runtime.points.visible=true; runtime.elapsed+=dt
    const canEmit=e.looping||runtime.elapsed<=Math.max(.05,e.duration)
    if(canEmit&&!runtime.burstDone&&e.burst>0){for(let i=0;i<e.burst;i++)spawn(runtime);runtime.burstDone=true}
    if(canEmit&&e.spawnRate>0){runtime.accumulator+=dt*e.spawnRate; while(runtime.accumulator>=1){spawn(runtime);runtime.accumulator-=1}}
    for(let i=runtime.particles.length-1;i>=0;i--){const p=runtime.particles[i];p.age+=dt;if(p.age>=p.life){runtime.particles.splice(i,1);continue}const drag=Math.max(0,1-e.drag*dt);p.velocity.x=(p.velocity.x+e.gravity[0]*dt)*drag;p.velocity.y=(p.velocity.y+e.gravity[1]*dt)*drag;p.velocity.z=(p.velocity.z+e.gravity[2]*dt)*drag;p.position.addScaledVector(p.velocity,dt)}
    writeAttributes(runtime)
  }
}

function spawn(runtime:EmitterRuntime){const e=runtime.emitter,max=(runtime.positions.length/3)|0;if(runtime.particles.length>=max)runtime.particles.shift();const p=new THREE.Vector3(...e.position);if(e.shape==='sphere'){const r=Math.cbrt(Math.random())*.45;p.add(randomUnit().multiplyScalar(r))}else if(e.shape==='box'){p.x+=(Math.random()-.5)*e.boxSize[0];p.y+=(Math.random()-.5)*e.boxSize[1];p.z+=(Math.random()-.5)*e.boxSize[2]}
  const direction=new THREE.Vector3(...e.direction);if(direction.lengthSq()<.0001)direction.set(0,1,0);direction.normalize();const spread=Math.sin(THREE.MathUtils.degToRad(e.spreadDeg*.5));direction.addScaledVector(randomUnit(),spread*Math.random()).normalize();const speed=e.speed*(1+(Math.random()*2-1)*e.speedRandom);runtime.particles.push({position:p,velocity:direction.multiplyScalar(speed),age:0,life:Math.max(.04,e.lifetime*(1+(Math.random()*2-1)*e.lifetimeRandom)),spin:Math.random()*Math.PI*2})}

function writeAttributes(r:EmitterRuntime){const e=r.emitter,start=new THREE.Color(e.startColor),end=new THREE.Color(e.endColor),temp=new THREE.Color();const count=Math.min(r.particles.length,r.positions.length/3);for(let i=0;i<count;i++){const p=r.particles[i],t=Math.min(1,p.age/p.life),idx=i*3;r.positions[idx]=p.position.x;r.positions[idx+1]=p.position.y;r.positions[idx+2]=p.position.z;temp.copy(start).lerp(end,t);r.colors[idx]=temp.r;r.colors[idx+1]=temp.g;r.colors[idx+2]=temp.b;r.sizes[i]=THREE.MathUtils.lerp(e.startSize,e.endSize,t);r.alphas[i]=THREE.MathUtils.lerp(e.startAlpha,e.endAlpha,t)}r.points.geometry.setDrawRange(0,count);for(const key of ['position','aColor','aSize','aAlpha']){const attr=r.points.geometry.getAttribute(key) as THREE.BufferAttribute;attr.needsUpdate=true}}
function clearAttributes(r:EmitterRuntime){r.points.geometry.setDrawRange(0,0);for(const key of ['position','aColor','aSize','aAlpha']){const attr=r.points.geometry.getAttribute(key) as THREE.BufferAttribute;attr.needsUpdate=true}}
function randomUnit(){const z=Math.random()*2-1,a=Math.random()*Math.PI*2,r=Math.sqrt(Math.max(0,1-z*z));return new THREE.Vector3(r*Math.cos(a),z,r*Math.sin(a))}
function disposeRuntimes(s:{scene?:THREE.Scene;runtimes:EmitterRuntime[]}){for(const r of s.runtimes){s.scene?.remove(r.points);r.points.geometry.dispose();(r.points.material as THREE.Material).dispose()}s.runtimes=[]}

export default VfxPreview
