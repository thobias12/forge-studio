import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ForgeItemDefinition } from '../engine/forgeProject'
import { attachGeneratedArmor, buildGeneratedItemModel, disposeGeneratedModel, isGeneratedArmor, loadEquipmentFoundation } from '../engine/skillboundItemModels'
import { bindEquipmentVisualModel } from '../engine/runtime/ForgeEquipmentVisuals'
import { itemEquipmentSlot } from '../engine/equipment'
import type { SkillboundBodyType } from '../lib/characterAssetRegistry'

export default function SkillboundItemPreview({ item, bodyType, mode }: { item: ForgeItemDefinition; bodyType: SkillboundBodyType; mode: 'item' | 'equipped' | 'drop' }) {
  const hostRef=useRef<HTMLDivElement>(null);const [error,setError]=useState('')
  useEffect(()=>{
    const host=hostRef.current;if(!host)return
    let cancelled=false;let frame=0;let root:THREE.Object3D|undefined
    const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping
    host.appendChild(renderer.domElement)
    const scene=new THREE.Scene();scene.background=new THREE.Color('#151c1b');const camera=new THREE.PerspectiveCamera(34,1,.01,100)
    scene.add(new THREE.HemisphereLight('#e9e5d6','#354237',2));const key=new THREE.DirectionalLight('#ffe5c2',3);key.position.set(3,5,4);scene.add(key);const rim=new THREE.DirectionalLight('#91c7c3',1.6);rim.position.set(-3,3,-3);scene.add(rim)
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true
    const resize=()=>{const width=Math.max(160,host.clientWidth),height=Math.max(260,host.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix()};const observer=new ResizeObserver(resize);observer.observe(host);resize();setError('')
    void (async()=>{
      if(mode==='equipped'){
        root=await loadEquipmentFoundation(bodyType)
        const slot = itemEquipmentSlot(item)
        if (slot) await bindEquipmentVisualModel({ characterRoot: root, fallbackParent: root, anchors: new Map() }, item, slot)
      } else {
        root=await buildGeneratedItemModel(item,bodyType)
        if(mode==='drop'&&root){root.rotation.set(Math.PI/2,.15,-.15);root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root);root.position.y-=box.min.y}
      }
      if(!root)return
      if(cancelled){disposeGeneratedModel(root);root=undefined;return}
      scene.add(root);root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root);const center=box.getCenter(new THREE.Vector3());const span=Math.max(...box.getSize(new THREE.Vector3()).toArray(),.2)
      controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(span*1.2,span*.55,span*1.7));camera.lookAt(center)
    })().catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Preview could not be created.');else if(root){disposeGeneratedModel(root);root=undefined}})
    const tick=()=>{controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(tick)};tick()
    return()=>{cancelled=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();if(root)disposeGeneratedModel(root);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove()}
  },[item,bodyType,mode])
  return <div><div className="item-generator-live-preview" style={{height:380}} ref={hostRef}/>{error&&<p role="alert">{error}</p>}</div>
}
