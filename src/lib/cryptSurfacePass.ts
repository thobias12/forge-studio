import * as THREE from 'three'
import type { DungeonConnection, DungeonRoom } from './dungeonPackage'
import type { DungeonAtmosphere } from './dungeonAtmosphere'
import type { CryptFlickerLight, CryptOpening } from './cryptEnvironmentLegacy'
import { createCryptMaterialSet } from './cryptMaterials'

type Side = CryptOpening['side']

type Context = {
  group: THREE.Group
  room: DungeonRoom
  openings: CryptOpening[]
  thickness: number
  atmosphere: DungeonAtmosphere
  materials: ReturnType<typeof createCryptMaterialSet>
  random: () => number
}

export function addCryptRoomSurfacePass(
  parent: THREE.Group,
  room: DungeonRoom,
  openings: CryptOpening[],
  wallThickness: number,
  atmosphere: DungeonAtmosphere,
  _flickerLights: CryptFlickerLight[],
  immersive: boolean,
) {
  const group = new THREE.Group()
  group.position.set(room.x, room.floorLevel, room.z)
  group.rotation.y = THREE.MathUtils.degToRad(room.rotation)
  group.userData.roomId = room.id
  parent.add(group)

  const ctx: Context = {
    group,
    room,
    openings,
    thickness: Math.max(0.16, wallThickness),
    atmosphere,
    materials: createCryptMaterialSet(atmosphere),
    random: seededRandom(hash(`surface-${room.id}`)),
  }

  addFloorSkin(ctx)
  addWallSkin(ctx)
  addHeavyPillars(ctx)
  addOpeningFrames(ctx)
  addDamage(ctx)
  if (room.type === 'boss') addBossFloor(ctx)
  addReadabilityFill(ctx, immersive)
}

export function addCryptCorridorSurfacePass(
  parent: THREE.Group,
  from: DungeonConnection,
  to: DungeonConnection,
  width: number,
  atmosphere: DungeonAtmosphere,
  seedKey: string,
) {
  const materials = createCryptMaterialSet(atmosphere)
  const mid = { x: to.x, z: from.z }
  addCorridorSegment(parent, from.x, from.z, mid.x, mid.z, width, materials, `${seedKey}-skin-a`)
  addCorridorSegment(parent, mid.x, mid.z, to.x, to.z, width, materials, `${seedKey}-skin-b`)
}

function addFloorSkin(ctx: Context) {
  const { room, group, materials, random } = ctx
  const underlay = new THREE.Mesh(new THREE.BoxGeometry(room.width - 0.12, 0.035, room.depth - 0.12), materials.floorDark)
  underlay.position.y = 0.248
  underlay.receiveShadow = true
  underlay.userData.roomId = room.id
  group.add(underlay)

  const slabs: Array<{ x:number; z:number; w:number; d:number; r:number; shade:number }> = []
  let z = -room.depth / 2 + 0.58
  let row = 0
  while (z < room.depth / 2 - 0.34) {
    const depth = 0.9 + random() * 0.65
    let x = -room.width / 2 + (row % 2 ? -0.7 : 0.1) + random() * 0.24
    while (x < room.width / 2 - 0.25) {
      const width = 1.15 + random() * 1.9
      if (random() > (room.type === 'secret' ? 0.09 : 0.035)) slabs.push({
        x: x + width / 2,
        z: z + depth / 2,
        w: width * (0.945 + random() * 0.025),
        d: depth * (0.94 + random() * 0.025),
        r: (random() - 0.5) * 0.025,
        shade: 0.8 + random() * 0.2,
      })
      x += width + 0.045 + random() * 0.055
    }
    z += depth + 0.045 + random() * 0.055
    row ++
  }

  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.055, 1), materials.floor, slabs.length)
  const dummy = new THREE.Object3D()
  const white = new THREE.Color(0xffffff)
  slabs.forEach((slab, index) => {
    dummy.position.set(slab.x, 0.284 + (random() - 0.5) * 0.012, slab.z)
    dummy.rotation.set(0, slab.r, 0)
    dummy.scale.set(slab.w, 1, slab.d)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    mesh.setColorAt(index, white.clone().multiplyScalar(slab.shade))
  })
  mesh.receiveShadow = true
  mesh.userData.roomId = room.id
  group.add(mesh)

  const puddles = room.type === 'boss' ? 5 : room.type === 'entrance' ? 1 : 2 + Math.floor(random() * 2)
  for (let i = 0; i < puddles; i++) {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.7 + random() * 1.15, 28), materials.wet.clone())
    puddle.rotation.x = -Math.PI / 2
    puddle.rotation.z = random() * Math.PI
    puddle.scale.set(1.2 + random() * 0.9, 0.42 + random() * 0.42, 1)
    puddle.position.set((random() - 0.5) * room.width * 0.68, 0.316, (random() - 0.5) * room.depth * 0.68)
    puddle.userData.roomId = room.id
    group.add(puddle)
  }
}

function addWallSkin(ctx: Context) {
  const { room, openings, materials, group, random, thickness } = ctx
  for (const side of ['north','south','west','east'] as Side[]) {
    const total = side === 'north' || side === 'south' ? room.width : room.depth
    const sideOpenings = openings.filter(o => o.side === side)
    const blocks: Array<{ along:number; y:number; w:number; h:number; shade:number }> = []
    const rows = Math.max(6, Math.floor(room.height / 0.62))
    const rowH = room.height / rows
    for (let row = 0; row < rows; row++) {
      let along = -total / 2 - (row % 2 ? 0.65 : 0.05)
      while (along < total / 2) {
        const w = 1 + random() * 1.35
        const center = along + w / 2
        const opening = sideOpenings.some(o => Math.abs(center - o.offset) < o.openingWidth / 2 + 0.18)
        const chipped = row > rows - 3 && random() < 0.08
        if (!opening && !chipped && center > -total / 2 && center < total / 2) blocks.push({
          along: center, y: row * rowH + rowH / 2, w: w * 0.95, h: rowH * (0.84 + random() * 0.08), shade: 0.82 + random() * 0.19,
        })
        along += w + 0.045 + random() * 0.055
      }
    }
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1), materials.wall, blocks.length)
    const dummy = new THREE.Object3D(); const white = new THREE.Color(0xffffff)
    blocks.forEach((b, i) => {
      placeWall(dummy, room, side, b.along, b.y, thickness / 2 + 0.105)
      dummy.scale.set(b.w, b.h, 0.115)
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, white.clone().multiplyScalar(b.shade))
    })
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.roomId = room.id; mesh.userData.arpgOccluder = true
    group.add(mesh)
  }
}

function addHeavyPillars(ctx: Context) {
  const { room, group, materials } = ctx
  const inset = 0.62
  const points: Array<[number,number]> = [[-room.width/2+inset,-room.depth/2+inset],[room.width/2-inset,-room.depth/2+inset],[-room.width/2+inset,room.depth/2-inset],[room.width/2-inset,room.depth/2-inset]]
  for (const [x,z] of points) {
    const root = new THREE.Group(); root.position.set(x,0,z); root.userData.roomId = room.id; root.userData.arpgOccluder = true
    const base1 = box(1.3,.24,1.3,materials.wallDark,0,.12,0)
    const base2 = box(1.02,.23,1.02,materials.wall,0,.345,0)
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(.55,.64,.28,8),materials.wallLight); foot.position.y=.59; foot.rotation.y=Math.PI/8
    const shaftH = Math.max(1.7,room.height-1.48)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.36,.43,shaftH,8),materials.wallLight); shaft.position.y=.73+shaftH/2; shaft.rotation.y=Math.PI/8
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(.51,.42,.22,8),materials.wallDark); collar.position.y=room.height-.54; collar.rotation.y=Math.PI/8
    const cap1 = box(1.0,.2,1.0,materials.wall,0,room.height-.34,0)
    const cap2 = box(1.28,.2,1.28,materials.wallDark,0,room.height-.14,0)
    root.add(base1,base2,foot,shaft,collar,cap1,cap2)
    root.traverse(c => { const m=c as THREE.Mesh; if(m.isMesh){m.castShadow=true;m.receiveShadow=true;m.userData.roomId=room.id;m.userData.arpgOccluder=true} })
    group.add(root)
  }
}

function addOpeningFrames(ctx: Context) {
  for (const opening of ctx.openings) {
    const { side, offset, openingWidth } = opening
    const spring = Math.min(ctx.room.height - 1, Math.max(2.5, ctx.room.height * .58))
    const half = openingWidth / 2 + .34
    for (const sign of [-1,1]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(.48,spring,ctx.thickness+.48),ctx.materials.wallLight)
      placeWall(jamb,ctx.room,side,offset+sign*half,spring/2,-.2); jamb.castShadow=true; jamb.userData.roomId=ctx.room.id; jamb.userData.arpgOccluder=true; ctx.group.add(jamb)
      const foot = new THREE.Mesh(new THREE.BoxGeometry(.72,.3,ctx.thickness+.58),ctx.materials.wallDark)
      placeWall(foot,ctx.room,side,offset+sign*half,.15,-.24); foot.userData.roomId=ctx.room.id; ctx.group.add(foot)
    }
    const radius = Math.max(1.2, openingWidth*.55)
    for let i=0;i<13;i++) {
      const angle=Math.PI*i/12; const stone=new THREE.Mesh(new THREE.BoxGeometry(i===6?.64:.45,i===6?.4:.3,ctx.thickness+.5),i===6?ctx.materials.wallDark:ctx.materials.wallLight)
      placeWall(stone,ctx.room,side,offset+Math.cos(angle)*radius,spring+Math.sin(angle)*radius*.52,-.23)
      if(side==='north'||side==='south') stone.rotation.z=(Math.PI/2-angle)*.5; else stone.rotation.x=-(Math.PI/2-angle)*.5
      stone.castShadow=true; stone.userData.roomId=ctx.room.id; stone.userData.arpgOccluder=true; ctx.group.add(stone)
    }
  }
}

function addDamage(ctx: Context) {
  const { room, group, materials, random }=ctx
  const count=room.type==='boss'?18:8+Math.floor(random()*7)
  for(let i=0;i<count;i++){
    const side=i%4; const w=.25+random()*.7; const h=.16+random()*.45; const d=.25+random()*.35
    const chunk=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),i%3?materials.wall:materials.wallDark)
    const ex=room.width/2-.25-random()*.8, ez=room.depth/2-.25-random()*.8
    if(side===0) chunk.position.set((random()-.5)*room.width*.78,h/2,-ez)
    if(side===1) chunk.position.set(ex,h/2,(random()-.5)*room.depth*.78)
    if(side===2) chunk.position.set((random()-.5)*room.width*.78,h/2,ez)
    if(side===3) chunk.position.set(-ex,h/2,(random()-.5)*room.depth*.78)
    chunk.rotation.set((random()-.5)*.2,random()*Math.PI,(random()-.5)*.2); chunk.castShadow=true; chunk.receiveShadow=true; chunk.userData.roomId=room.id; group.add(chunk)
  }
}

function addBossFloor(ctx: Context) {
  const radius=Math.min(ctx.room.width,ctx.room.depth)*.18
  const cover=new THREE.Mesh(new THREE.CylinderGeometry(radius*.82,radius*.88,.13,40),ctx.materials.floor); cover.position.y=.515; cover.receiveShadow=true; cover.userData.roomId=ctx.room.id; ctx.group.add(cover)
  const runeMat=new THREE.MeshStandardMaterial({color:0x5b3134,emissive:0x321316,emissiveIntensity:.42,roughness:.78,transparent:true,opacity:.62})
  for(let i=0;i<12;i++){
    if(i===2||i===7) continue
    const a=i/12*Math.PI*2
    const seg=new THREE.Mesh(new THREE.BoxGeometry(.12,.018,radius*.48),runeMat)
    seg.position.set(Math.cos(a)*radius*.48,.588,Math.sin(a)*radius*.48); seg.rotation.y=-a+(ctx.random()-.5)*.08; seg.userData.roomId=ctx.room.id; ctx.group.add(seg)
  }
  for(let i=0;i<7;i++){
    const crack=new THREE.Mesh(new THREE.BoxGeometry(.035,.012,.55+ctx.random()*.9),new THREE.MeshBasicMaterial({color:0x111216,transparent:true,opacity:.7}))
    crack.position.set((ctx.random()-.5)*radius*.7,.592,(ctx.random()-.5)*radius*.7); crack.rotation.y=ctx.random()*Math.PI; ctx.group.add(crack)
  }
}

function addReadabilityFill(ctx: Context, immersive:boolean) {
  const strength=(ctx.room.type==='boss'?.52:.34)*(immersive?1:.92); const range=Math.max(ctx.room.width,ctx.room.depth)*.7
  for(const [x,z,f] of [[-.25,-.18,1],[.25,.2,.78]] as Array<[number,number,number]>){const l=new THREE.PointLight(ctx.atmosphere.sky,strength*f,range,1.35);l.position.set(ctx.room.width*x,Math.min(2.6,ctx.room.height*.52),ctx.room.depth*z);ctx.group.add(l)}
}

function addCorridorSegment(parent:THREE.Group,x1:number,z1:number,x2:number,z2:number,width:number,materials:ReturnType<typeof createCryptMaterialSet>,seed:string){
  const dx=x2-x1,dz=z2-z1,length=Math.hypot(dx,dz);if(length<.3)return;const angle=Math.atan2(dx,dz),cx=(x1+x2)/2,cz=(z1+z2)/2,random=seededRandom(hash(seed))
  const under=new THREE.Mesh(new THREE.BoxGeometry(width-.08,.035,length),materials.floorDark);under.position.set(cx,.245,cz);under.rotation.y=angle;under.receiveShadow=true;parent.add(under)
  const cols=Math.max(2,Math.floor(width/1.35)),rows=Math.max(1,Math.floor(length/1.2)),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.055,1),materials.floor,cols*rows),dummy=new THREE.Object3D();let idx=0
  for(let a=0;a<cols;a++)for(let r=0;r<rows;r++){const lx=(a-(cols-1)/2)*(width/cols),lz=(r-(rows-1)/2)*(length/rows);dummy.position.set(cx+Math.cos(angle)*lx+Math.sin(angle)*lz,.282,cz-Math.sin(angle)*lx+Math.cos(angle)*lz);dummy.rotation.set(0,angle+(random()-.5)*.025,0);dummy.scale.set(width/cols*.94,1,length/rows*.94);dummy.updateMatrix();mesh.setMatrixAt(idx++,dummy.matrix)}mesh.receiveShadow=true;parent.add(mesh)
}

function box(w:number,h:number,d:number,mat:THREE.Material,x:number,y:number,z:number){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);return m}
function placeWall(object:THREE.Object3D,room:DungeonRoom,side:Side,along:number,y:number,inset:number){if(side==='north'){object.position.set(along,y,-room.depth/2+inset);object.rotation.y=0}else if(side==='south'){object.position.set(along,y,room.depth/2-inset);object.rotation.y=0}else if(side==='west'){object.position.set(-room.width/2+inset,y,along);object.rotation.y=Math.PI/2}else{object.position.set(room.width/2-inset,y,along);object.rotation.y=Math.PI/2}}
function seededRandom(seed:number){let state=seed>>>0;return()=>{state+=0x6D2B79F5;let v=state;v=Math.imul(v^v>>>15,v|1);v^=v+Math.imul(v^v>>>7,v|61);return((v^v>>>14)>>>0)/4294967296}}
function hash(value:string){let seed=2166136261;for(let i=0;i<value.length;i++)seed=Math.imul(seed^value.charCodeAt(i),16777619);return seed>>>0}
