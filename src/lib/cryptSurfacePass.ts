import * as THREE from 'three'
import type { DungeonConnection, DungeonRoom } from './dungeonPackage'
import type { DungeonAtmosphere } from './dungeonAtmosphere'
import type { CryptFlickerLight, CryptOpening } from './cryptEnvironmentLegacy'
import { createCryptMaterialSet } from './cryptMaterials'

type Side = CryptOpening['side']
type Mats = ReturnType<typeof createCryptMaterialSet>

export function addCryptRoomSurfacePass(
  parent: THREE.Group,
  room: DungeonRoom,
  openings: CryptOpening[],
  wallThickness: number,
  atmosphere: DungeonAtmosphere,
  _lights: CryptFlickerLight[],
  immersive: boolean,
) {
  const group = new THREE.Group()
  group.position.set(room.x, room.floorLevel, room.z)
  group.rotation.y = THREE.MathUtils.degToRad(room.rotation)
  group.userData.roomId = room.id
  parent.add(group)

  const mats = createCryptMaterialSet(atmosphere)
  const random = rng(hash(`crypt-surface-${room.id}`))
  addFloor(group, room, mats, random)
  addWalls(group, room, openings, Math.max(.16, wallThickness), mats, random)
  addPillars(group, room, mats)
  if (room.type === 'boss') addBossFloor(group, room, mats, random)

  const strength = (room.type === 'boss' ? .5 : .32) * (immersive ? 1 : .92)
  const range = Math.max(room.width, room.depth) * .72
  for (const [x,z,f] of [[-.24,-.16,1],[.24,.18,.78]] as Array<[number,number,number]>) {
    const light = new THREE.PointLight(atmosphere.sky, strength * f, range, 1.35)
    light.position.set(room.width*x, Math.min(2.6, room.height*.52), room.depth*z)
    group.add(light)
  }
}

export function addCryptCorridorSurfacePass(
  parent: THREE.Group,
  from: DungeonConnection,
  to: DungeonConnection,
  width: number,
  atmosphere: DungeonAtmosphere,
  seedKey: string,
) {
  const mats = createCryptMaterialSet(atmosphere)
  const mid = { x: to.x, z: from.z }
  addCorridor(parent, from.x, from.z, mid.x, mid.z, width, mats, `${seedKey}-a`)
  addCorridor(parent, mid.x, mid.z, to.x, to.z, width, mats, `${seedKey}-b`)
}

function addFloor(group: THREE.Group, room: DungeonRoom, mats: Mats, random: () => number) {
  const base = new THREE.Mesh(new THREE.BoxGeometry(room.width-.12,.035,room.depth-.12),mats.floorDark)
  base.position.y=.248; base.receiveShadow=true; base.userData.roomId=room.id; group.add(base)

  const slabs:Array<{x:number;z:number;w:number;d:number;r:number;s:number}>=[]
  let z=-room.depth/2+.58,row=0
  while(z<room.depth/2-.34){
    const d=.9+random()*.65
    let x=-room.width/2+(row%2?-.7:.1)+random()*.24
    while(x<room.width/2-.25){
      const w=1.15+random()*1.9
      if(random()>(room.type==='secret'?.09:.035)) slabs.push({x:x+w/2,z:z+d/2,w:w*(.945+random()*.025),d:d*(.94+random()*.025),r:(random()-.5)*.025,s:.8+random()*.2})
      x+=w+.045+random()*.055
    }
    z+=d+.045+random()*.055; row++
  }
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.055,1),mats.floor,slabs.length)
  const dummy=new THREE.Object3D(), white=new THREE.Color(0xffffff)
  slabs.forEach((slab,i)=>{dummy.position.set(slab.x,.284+(random()-.5)*.012,slab.z);dummy.rotation.set(0,slab.r,0);dummy.scale.set(slab.w,1,slab.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,white.clone().multiplyScalar(slab.s))})
  mesh.receiveShadow=true; mesh.userData.roomId=room.id; group.add(mesh)

  const puddles=room.type==='boss'?5:room.type==='entrance'?1:2+Math.floor(random()*2)
  for(let i=0;i<puddles;i++){
    const wet=new THREE.Mesh(new THREE.CircleGeometry(.7+random()*1.15,28),mats.wet.clone())
    wet.rotation.x=-Math.PI/2; wet.rotation.z=random()*Math.PI; wet.scale.set(1.2+random()*.9,.42+random()*.42,1)
    wet.position.set((random()-.5)*room.width*.68,.316,(random()-.5)*room.depth*.68); wet.userData.roomId=room.id; group.add(wet)
  }
}

function addWalls(group:THREE.Group,room:DungeonRoom,openings:CryptOpening[],thickness:number,mats:Mats,random:()=>number){
  for(const side of ['north','south','west','east'] as Side[]){
    const total=side==='north'||side==='south'?room.width:room.depth
    const sideOpenings=openings.filter(o=>o.side===side)
    const rows=Math.max(6,Math.floor(room.height/.62)), rowH=room.height/rows
    const blocks:Array<{a:number;y:number;w:number;h:number;s:number}>=[]
    for(let row=0;row<rows;row++){
      let a=-total/2-(row%2?.65:.05)
      while(a<total/2){
        const w=1+random()*1.35, center=a+w/2
        const open=sideOpenings.some(o=>Math.abs(center-o.offset)<o.openingWidth/2+.18)
        const chipped=row>rows-3&&random()<.08
        if(!open&&!chipped&&center>-total/2&&center<total/2) blocks.push({a:center,y:row*rowH+rowH/2,w:w*.95,h:rowH*(.84+random()*.08),s:.82+random()*.19})
        a+=w+.045+random()*.055
      }
    }
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mats.wall,blocks.length)
    const dummy=new THREE.Object3D(), white=new THREE.Color(0xffffff)
    blocks.forEach((b,i)=>{place(dummy,room,side,b.a,b.y,thickness/2+.105);dummy.scale.set(b.w,b.h,.115);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,white.clone().multiplyScalar(b.s))})
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.roomId=room.id;mesh.userData.arpgOccluder=true;group.add(mesh)
  }
}

function addPillars(group:THREE.Group,room:DungeonRoom,mats:Mats){
  const inset=.62
  for(const [x,z] of [[-room.width/2+inset,-room.depth/2+inset],[room.width/2-inset,-room.depth/2+inset],[-room.width/2+inset,room.depth/2-inset],[room.width/2-inset,room.depth/2-inset]] as Array<[number,number]>){
    const root=new THREE.Group();root.position.set(x,0,z);root.userData.roomId=room.id;root.userData.arpgOccluder=true
    const shaftH=Math.max(1.7,room.height-1.48)
    root.add(box(1.3,.24,1.3,mats.wallDark,.12),box(1.02,.23,1.02,mats.wall,.345))
    const foot=new THREE.Mesh(new THREE.CylinderGeometry(.55,.64,.28,8),mats.wallLight);foot.position.y=.59;foot.rotation.y=Math.PI/8
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.36,.43,shaftH,8),mats.wallLight);shaft.position.y=.73+shaftH/2;shaft.rotation.y=Math.PI/8
    const collar=new THREE.Mesh(new THREE.CylinderGeometry(.51,.42,.22,8),mats.wallDark);collar.position.y=room.height-.54;collar.rotation.y=Math.PI/8
    root.add(foot,shaft,collar,box(1,.2,1,mats.wall,room.height-.34),box(1.28,.2,1.28,mats.wallDark,room.height-.14))
    root.traverse(c=>{const m=c as THREE.Mesh;if(m.isMesh){m.castShadow=true;m.receiveShadow=true;m.userData.roomId=room.id;m.userData.arpgOccluder=true}});group.add(root)
  }
}

function addBossFloor(group:THREE.Group,room:DungeonRoom,mats:Mats,random:()=>number){
  const radius=Math.min(room.width,room.depth)*.18
  const cover=new THREE.Mesh(new THREE.CylinderGeometry(radius*.82,radius*.88,.13,40),mats.floor);cover.position.y=.515;cover.receiveShadow=true;cover.userData.roomId=room.id;group.add(cover)
  const rune=new THREE.MeshStandardMaterial({color:0x563034,emissive:0x2b1114,emissiveIntensity:.32,roughness:.82,transparent:true,opacity:.52})
  for(let i=0;i<12;i++){if(i===2||i===7)continue;const a=i/12*Math.PI*2;const seg=new THREE.Mesh(new THREE.BoxGeometry(.1,.014,radius*.42),rune);seg.position.set(Math.cos(a)*radius*.46,.588,Math.sin(a)*radius*.46);seg.rotation.y=-a+(random()-.5)*.08;group.add(seg)}
}

function addCorridor(parent:THREE.Group,x1:number,z1:number,x2:number,z2:number,width:number,mats:Mats,seed:string){
  const dx=x2-x1,dz=z2-z1,length=Math.hypot(dx,dz);if(length<.3)return
  const angle=Math.atan2(dx,dz),cx=(x1+x2)/2,cz=(z1+z2)/2,random=rng(hash(seed))
  const base=new THREE.Mesh(new THREE.BoxGeometry(width-.08,.035,length),mats.floorDark);base.position.set(cx,.245,cz);base.rotation.y=angle;base.receiveShadow=true;parent.add(base)
  const cols=Math.max(2,Math.floor(width/1.35)),rows=Math.max(1,Math.floor(length/1.2)),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.055,1),mats.floor,cols*rows),dummy=new THREE.Object3D();let i=0
  for(let a=0;a<cols;a++)for(let r=0;r<rows;r++){const lx=(a-(cols-1)/2)*(width/cols),lz=(r-(rows-1)/2)*(length/rows);dummy.position.set(cx+Math.cos(angle)*lx+Math.sin(angle)*lz,.282,cz-Math.sin(angle)*lx+Math.cos(angle)*lz);dummy.rotation.set(0,angle+(random()-.5)*.025,0);dummy.scale.set(width/cols*.94,1,length/rows*.94);dummy.updateMatrix();mesh.setMatrixAt(i++,dummy.matrix)}mesh.receiveShadow=true;parent.add(mesh)
}

function box(w:number,h:number,d:number,mat:THREE.Material,y:number){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.y=y;return m}
function place(o:THREE.Object3D,room:DungeonRoom,side:Side,a:number,y:number,inset:number){if(side==='north'){o.position.set(a,y,-room.depth/2+inset);o.rotation.y=0}else if(side==='south'){o.position.set(a,y,room.depth/2-inset);o.rotation.y=0}else if(side==='west'){o.position.set(-room.width/2+inset,y,a);o.rotation.y=Math.PI/2}else{o.position.set(room.width/2-inset,y,a);o.rotation.y=Math.PI/2}}
function rng(seed:number){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let v=s;v=Math.imul(v^v>>>15,v|1);v^=v+Math.imul(v^v>>>7,v|61);return((v^v>>>14)>>>0)/4294967296}}
function hash(v:string){let s=2166136261;for(let i=0;i<v.length;i++)s=Math.imul(s^v.charCodeAt(i),16777619);return s>>>0}
