import * as THREE from 'three'
import type { ForgeItemGeneratorRecipe } from './itemGeneratorTypes'
import { buildProceduralItemGroup as buildLegacyProceduralItemGroup } from './proceduralItemGeometry'

export function buildProceduralItemGroupV2(recipe: ForgeItemGeneratorRecipe) {
  if (recipe.generatorId === 'weapon.sword') return buildLegacyProceduralItemGroup(recipe)
  if (recipe.generatorId === 'weapon.dagger') return buildDagger(recipe)
  if (recipe.generatorId === 'weapon.axe') return buildAxe(recipe)
  if (recipe.generatorId === 'weapon.mace') return buildMace(recipe)
  if (recipe.generatorId === 'weapon.staff') return buildStaff(recipe)
  if (recipe.generatorId === 'weapon.spear') return buildSpear(recipe)
  if (recipe.generatorId === 'weapon.bow') return buildBow(recipe)
  if (recipe.generatorId === 'armor.helmet') return buildHelmet(recipe)
  if (recipe.generatorId === 'armor.chest') return buildChest(recipe)
  if (recipe.generatorId === 'armor.gloves') return buildGloves(recipe)
  if (recipe.generatorId === 'armor.legs') return buildLegs(recipe)
  if (recipe.generatorId === 'armor.boots') return buildBoots(recipe)
  throw new Error(`Unsupported Item Forge generator: ${recipe.generatorId}`)
}

function buildDagger(recipe: ForgeItemGeneratorRecipe) {
  const p = recipe.params
  const root = group(recipe, 'Dagger')
  const bladeLength = n(p.bladeLength, 0.72)
  const bladeWidth = n(p.bladeWidth, 0.14)
  const thickness = n(p.bladeThickness, 0.045)
  const gripLength = n(p.gripLength, 0.34)
  const gripThickness = n(p.gripThickness, 0.065)
  const guardWidth = n(p.guardWidth, 0.28)
  const bladeStyle = s(p.bladeStyle, 'broad')
  const guardStyle = s(p.guardStyle, 'straight')
  const pommel = s(p.pommelStyle, 'cap')
  add(root, extrudedBlade(bladeLength, bladeWidth, thickness, bladeStyle), mat(recipe.materials.blade, recipe), 'Blade', [0, 0, -thickness / 2])
  if (guardStyle !== 'none') {
    if (guardStyle === 'ring') add(root, new THREE.TorusGeometry(guardWidth * 0.32, Math.max(0.012, gripThickness * 0.18), 5, 12), mat(recipe.materials.guard, recipe), 'Ring Guard', [0, -0.025, 0], [Math.PI / 2, 0, 0])
    else add(root, new THREE.BoxGeometry(guardWidth, 0.045, 0.08), mat(recipe.materials.guard, recipe), 'Guard', [0, -0.025, 0], [0, 0, guardStyle === 'hooked' ? 0.22 : 0])
  }
  add(root, new THREE.CylinderGeometry(gripThickness * 0.88, gripThickness, gripLength, 8), mat(recipe.materials.grip, recipe), 'Grip', [0, -gripLength / 2 - 0.06, 0])
  wrapBands(root, -gripLength / 2 - 0.06, gripLength, gripThickness, mat(recipe.materials.accent, recipe), 5)
  const py = -gripLength - 0.1
  if (pommel === 'ring') add(root, new THREE.TorusGeometry(gripThickness * 0.72, gripThickness * 0.2, 5, 10), mat(recipe.materials.accent, recipe), 'Pommel', [0, py, 0], [Math.PI / 2, 0, 0])
  else if (pommel === 'spike') add(root, new THREE.ConeGeometry(gripThickness * 0.8, gripThickness * 1.8, 6), mat(recipe.materials.accent, recipe), 'Pommel', [0, py - gripThickness * 0.65, 0], [0,0,Math.PI])
  else add(root, pommel === 'diamond' ? new THREE.OctahedronGeometry(gripThickness * 0.95, 0) : new THREE.SphereGeometry(gripThickness * 0.82, 7, 5), mat(recipe.materials.accent, recipe), 'Pommel', [0, py, 0])
  return finish(root, recipe, bladeStyle)
}

function buildAxe(recipe: ForgeItemGeneratorRecipe) {
  const p = recipe.params, root = group(recipe, 'Axe')
  const handleLength = n(p.handleLength, 1.15), handleThickness = n(p.handleThickness, 0.065), headWidth = n(p.headWidth, 0.55), headHeight = n(p.headHeight, 0.36), headThickness = n(p.headThickness, 0.085)
  const headStyle = s(p.headStyle, 'bearded'), backStyle = s(p.backStyle, 'none')
  add(root, new THREE.CylinderGeometry(handleThickness * 0.8, handleThickness, handleLength, 8), mat(recipe.materials.handle, recipe), 'Handle', [0, handleLength / 2 - 0.1, 0])
  const headY = handleLength - 0.08
  add(root, extrude(axeShape(headWidth, headHeight, headStyle), headThickness), mat(recipe.materials.head, recipe), 'Axe Head', [0, headY - headHeight * 0.15, -headThickness / 2])
  add(root, new THREE.BoxGeometry(handleThickness * 2.1, headHeight * 0.62, headThickness * 1.25), mat(recipe.materials.accent, recipe), 'Eye', [0, headY, 0])
  if (backStyle === 'spike' || headStyle === 'pick') add(root, new THREE.ConeGeometry(headThickness * 0.6, headWidth * 0.46, 5), mat(recipe.materials.head, recipe), 'Back Spike', [-headWidth * 0.27, headY, 0], [0,0,Math.PI / 2])
  if (backStyle === 'hammer') add(root, new THREE.BoxGeometry(headWidth * 0.3, headHeight * 0.32, headThickness * 1.1), mat(recipe.materials.head, recipe), 'Hammer Back', [-headWidth * 0.3, headY, 0])
  if (backStyle === 'second-blade' && headStyle !== 'double') { const mesh = add(root, extrude(axeShape(headWidth * 0.72, headHeight * 0.9, 'crescent'), headThickness), mat(recipe.materials.head, recipe), 'Rear Blade', [0, headY - headHeight * 0.14, -headThickness / 2]); mesh.scale.x = -1 }
  const wrapLength = n(p.wrapLength, 0.28); if (wrapLength > 0.02) wrapBands(root, wrapLength * 0.5 + 0.02, wrapLength, handleThickness * 1.05, mat(recipe.materials.grip, recipe), 7)
  return finish(root, recipe, headStyle)
}

function buildMace(recipe: ForgeItemGeneratorRecipe) {
  const p = recipe.params, root = group(recipe, 'Mace')
  const length = n(p.shaftLength, 0.95), thickness = n(p.shaftThickness, 0.06), radius = n(p.headRadius, 0.21), headHeight = n(p.headHeight, 0.28), count = Math.max(4, Math.round(n(p.flangeCount, 6))), spike = n(p.spikeSize, 0.08), style = s(p.headStyle, 'flanged')
  add(root, new THREE.CylinderGeometry(thickness * 0.78, thickness, length, 8), mat(recipe.materials.shaft, recipe), 'Shaft', [0, length / 2, 0])
  const y = length + headHeight * 0.42, headMat = mat(recipe.materials.head, recipe)
  if (style === 'hammer') {
    add(root, new THREE.BoxGeometry(radius * 1.9, headHeight * 0.72, radius * 1.05), headMat, 'Hammer Head', [0, y, 0])
    add(root, new THREE.ConeGeometry(radius * 0.34, radius * 1.2, 5), headMat, 'Rear Pick', [-radius * 1.25, y, 0], [0,0,Math.PI / 2])
  } else {
    add(root, style === 'bulb' ? new THREE.SphereGeometry(radius * 0.82, 7, 5) : new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, headHeight, 8), headMat, 'Head Core', [0, y, 0])
    for (let i = 0; i < count; i += 1) {
      const angle = i / count * Math.PI * 2
      if (style === 'spiked' || style === 'star') { const size = Math.max(radius * 0.42, spike); const mesh = add(root, new THREE.ConeGeometry(radius * 0.18, size, 5), headMat, `Spike ${i + 1}`, [Math.cos(angle) * radius * 0.74, y, Math.sin(angle) * radius * 0.74]); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize()) }
      else { const flange = add(root, new THREE.BoxGeometry(radius * 0.1, headHeight * 0.88, radius * 1.65), headMat, `Flange ${i + 1}`, [0, y, 0], [0, angle, 0]); flange.position.x = Math.cos(angle) * radius * 0.38; flange.position.z = Math.sin(angle) * radius * 0.38 }
    }
  }
  add(root, new THREE.CylinderGeometry(radius * 0.58, radius * 0.5, 0.06, 8), mat(recipe.materials.accent, recipe), 'Head Collar', [0, length - 0.01, 0])
  const gripLength = n(p.gripLength, 0.3); wrapBands(root, gripLength * 0.5 + 0.015, gripLength, thickness * 1.05, mat(recipe.materials.grip, recipe), 7)
  return finish(root, recipe, style)
}

function buildStaff(recipe: ForgeItemGeneratorRecipe) {
  const p = recipe.params, root = group(recipe, 'Staff')
  const length = n(p.shaftLength, 2.1), thickness = n(p.shaftThickness, 0.055), crooked = n(p.crookedness, 0.1), scale = n(p.headScale, 0.28), style = s(p.headStyle, 'orb')
  const points: THREE.Vector3[] = [], segments = 7
  for (let i = 0; i <= segments; i += 1) { const t = i / segments; points.push(new THREE.Vector3(Math.sin(t * Math.PI * 1.7 + recipe.seed * 0.01) * crooked * 0.12 * t, t * length, Math.cos(t * Math.PI * 1.3) * crooked * 0.05 * t)) }
  for (let i = 0; i < points.length - 1; i += 1) addCylinderBetween(root, points[i], points[i+1], thickness * (1 - i / segments * 0.18), mat(recipe.materials.shaft, recipe), `Shaft ${i + 1}`, 7)
  const top = points[points.length - 1], headMat = mat(recipe.materials.head, recipe), accent = mat(recipe.materials.accent, recipe, true)
  if (style === 'crystal') add(root, new THREE.OctahedronGeometry(scale, 0), accent, 'Crystal', [top.x, top.y + scale * 0.85, top.z], [0,0,Math.PI / 4])
  else if (style === 'orb') { add(root, new THREE.SphereGeometry(scale * 0.66, 8, 6), accent, 'Orb', [top.x, top.y + scale * 0.75, top.z]); add(root, new THREE.TorusGeometry(scale * 0.78, scale * 0.09, 5, 12), headMat, 'Orb Cage', [top.x, top.y + scale * 0.75, top.z], [Math.PI / 2,0,0]) }
  else if (style === 'fork') { for (const side of [-1,1]) addCylinderBetween(root, top, top.clone().add(new THREE.Vector3(side * scale * 0.55, scale * 1.45, 0)), thickness * 0.72, headMat, 'Fork', 6); add(root, new THREE.OctahedronGeometry(scale * 0.42, 0), accent, 'Fork Focus', [top.x, top.y + scale * 0.82, top.z]) }
  else if (style === 'cage') { add(root, new THREE.SphereGeometry(scale * 0.38, 7, 5), accent, 'Caged Orb', [top.x, top.y + scale * 0.75, top.z]); for (const side of [-1,1]) addCylinderBetween(root, top.clone().add(new THREE.Vector3(side*scale*0.45,0,0)), top.clone().add(new THREE.Vector3(side*scale*0.28,scale*1.35,0)), thickness*0.65, headMat, 'Cage Arm', 6) }
  else if (style === 'crook') { const curve = new THREE.CatmullRomCurve3([top, top.clone().add(new THREE.Vector3(0,scale*0.8,0)), top.clone().add(new THREE.Vector3(scale*0.75,scale*1.0,0)), top.clone().add(new THREE.Vector3(scale*0.9,scale*0.45,0))]); add(root, new THREE.TubeGeometry(curve, 10, thickness*0.72, 6, false), headMat, 'Crook') }
  else { add(root, new THREE.SphereGeometry(scale * 0.62, 7, 5), mat('bone', recipe), 'Skull', [top.x, top.y + scale * 0.7, top.z], [0,0,0], [1,0.86,0.78]); add(root, new THREE.BoxGeometry(scale * 0.72, scale * 0.22, scale * 0.34), mat('bone', recipe), 'Jaw', [top.x, top.y + scale * 0.25, top.z]) }
  const rings = Math.round(n(p.ringCount, 2)); for (let i = 0; i < rings; i += 1) add(root, new THREE.TorusGeometry(thickness * 1.3, thickness * 0.22, 5, 9), headMat, `Ring ${i+1}`, [0, length * (0.68 + i * 0.055), 0], [Math.PI / 2,0,0])
  wrapBands(root, n(p.wrapLength,0.36)*0.5 + length*0.22, n(p.wrapLength,0.36), thickness*1.05, mat(recipe.materials.grip, recipe), 8)
  return finish(root, recipe, style)
}

function buildSpear(recipe: ForgeItemGeneratorRecipe) {
  const p = recipe.params, root = group(recipe, 'Spear')
  const shaftLength = n(p.shaftLength, 2.25), shaftThickness = n(p.shaftThickness, 0.05), headLength = n(p.headLength, 0.4), headWidth = n(p.headWidth, 0.17), style = s(p.headStyle, 'leaf')
  add(root, new THREE.CylinderGeometry(shaftThickness*0.88, shaftThickness, shaftLength, 8), mat(recipe.materials.shaft, recipe), 'Shaft', [0, shaftLength/2, 0])
  const top = shaftLength, headMat = mat(recipe.materials.head, recipe)
  if (style === 'trident') { for (const x of [-headWidth*0.55,0,headWidth*0.55]) add(root, extrudedBlade(headLength * (x === 0 ? 1 : .78), headWidth * .35, Math.max(.035, shaftThickness*.75), 'stiletto'), headMat, 'Tine', [x, top, -shaftThickness*.38]); add(root, new THREE.BoxGeometry(headWidth*1.5, 0.06, shaftThickness*1.5), mat(recipe.materials.accent,recipe), 'Trident Bar', [0,top+0.03,0]) }
  else add(root, spearHead(headLength, headWidth, Math.max(0.035, shaftThickness*0.8), style), headMat, 'Spear Head', [0, top, -shaftThickness*0.4])
  const lug = s(p.lugStyle,'none'); if (lug !== 'none') { const w = lug === 'wide' ? headWidth*1.7 : headWidth*1.05; for (const side of [-1,1]) { const h = lug === 'hooked' ? 0.16 : 0.08; add(root, new THREE.BoxGeometry(w*0.5, h, shaftThickness*1.2), mat(recipe.materials.accent,recipe), 'Lug', [side*w*0.25, top+0.04,0], [0,0,lug==='hooked' ? side*.35 : 0]) } }
  const wrap = n(p.wrapLength,0.3); wrapBands(root, shaftLength*0.36, wrap, shaftThickness*1.06, mat(recipe.materials.grip,recipe), 8)
  const butt = s(p.buttStyle,'metal-cap'); if (butt === 'spike') add(root,new THREE.ConeGeometry(shaftThickness*1.15,0.18,6),mat(recipe.materials.accent,recipe),'Butt Spike',[0,-0.09,0],[0,0,Math.PI]); else if (butt === 'counterweight') add(root,new THREE.SphereGeometry(shaftThickness*1.7,7,5),mat(recipe.materials.accent,recipe),'Counterweight',[0,-shaftThickness*1.25,0]); else if (butt === 'metal-cap') add(root,new THREE.CylinderGeometry(shaftThickness*1.15,shaftThickness*1.05,0.12,7),mat(recipe.materials.accent,recipe),'Butt Cap',[0,0.03,0])
  return finish(root,recipe,style)
}

function buildBow(recipe: ForgeItemGeneratorRecipe) {
  const p = recipe.params, root = group(recipe,'Bow')
  const length = n(p.bowLength,1.7), thick = n(p.limbThickness,0.045), curve = n(p.curve,0.24), recurve = n(p.recurve,0.08), gripLength = n(p.gripLength,0.24), gripThickness = n(p.gripThickness,0.065), style = s(p.bowStyle,'longbow')
  const limbMat = mat(recipe.materials.limb,recipe), points: THREE.Vector3[] = [], steps = 12
  for (let i=0;i<=steps;i+=1) { const t=i/steps, y=(t-.5)*length, abs=Math.abs(t-.5)*2; let x=Math.sin(abs*Math.PI)*curve; if (style==='recurve') x -= Math.pow(abs,5)*recurve; if (style==='tribal') x += Math.sin(t*Math.PI*3+recipe.seed)*0.025; if (style==='shortbow') x*=.8; points.push(new THREE.Vector3(x,y,0)) }
  for (let i=0;i<points.length-1;i+=1) addCylinderBetween(root,points[i],points[i+1],thick*(1-Math.abs((i+.5)/steps-.5)*.38),limbMat,`Limb ${i+1}`,7)
  add(root,new THREE.CylinderGeometry(gripThickness*.9,gripThickness,gripLength,8),mat(recipe.materials.grip,recipe),'Grip',[curve*.02,0,0])
  const top=points[points.length-1], bottom=points[0]; addCylinderBetween(root,top,bottom,0.008,mat(recipe.materials.string,recipe),'String',5)
  const tipStyle=s(p.tipStyle,'plain'); if (tipStyle!=='plain') { const tipMat=mat(recipe.materials.accent,recipe); add(root,tipStyle==='horn'?new THREE.ConeGeometry(thick*1.5,0.11,5):new THREE.SphereGeometry(thick*1.4,6,4),tipMat,'Top Tip',[top.x,top.y,0]); add(root,tipStyle==='horn'?new THREE.ConeGeometry(thick*1.5,0.11,5):new THREE.SphereGeometry(thick*1.4,6,4),tipMat,'Bottom Tip',[bottom.x,bottom.y,0],[0,0,Math.PI]) }
  root.rotation.y=.18
  return finish(root,recipe,style)
}

function buildHelmet(recipe: ForgeItemGeneratorRecipe) {
  const p=recipe.params, root=group(recipe,'Helmet'), w=n(p.width,.5), h=n(p.height,.42), d=n(p.depth,.48), style=s(p.armorStyle,'nasal')
  const base=mat(recipe.materials.base,recipe), trim=mat(recipe.materials.trim,recipe), soft=mat(recipe.materials.soft,recipe)
  if (style==='hooded') add(root,new THREE.SphereGeometry(w*.52,10,6,0,Math.PI*2,0,Math.PI*.68),soft,'Hood',[0,h*.1,0],[0,0,0],[1,h/w,d/w])
  else { const panelCount=7; for(let i=0;i<panelCount;i+=1){ const angle=(-.82+i/(panelCount-1)*1.64)*Math.PI, x=Math.sin(angle)*w*.4, z=Math.cos(angle)*d*.4; add(root,new THREE.BoxGeometry(w*.18,h*.72,.045),base,`Crown ${i+1}`,[x,h*.1,z],[0,angle,0]) } add(root,new THREE.SphereGeometry(w*.43,8,4,0,Math.PI*2,0,Math.PI*.48),base,'Crown Cap',[0,h*.43,0],[0,0,0],[1,h/w,d/w]) }
  add(root,new THREE.TorusGeometry(w*.4,Math.max(.018,n(p.rimSize,.055)*.35),5,14),trim,'Rim',[0,-h*.14,0],[Math.PI/2,0,0],[1,1,d/w])
  const guard=s(p.faceGuard,'open'); if(guard==='nasal'||style==='nasal') add(root,new THREE.BoxGeometry(.055,h*.62,.045),trim,'Nasal',[0,-h*.03,-d*.43]); if(guard==='brow') add(root,new THREE.BoxGeometry(w*.7,.055,.05),trim,'Brow',[0,h*.08,-d*.43]); if(guard==='visor'||style==='greathelm'){ add(root,new THREE.BoxGeometry(w*.78,h*.34,.055),base,'Visor',[0,-h*.02,-d*.43]); for(let i=-2;i<=2;i+=1)add(root,new THREE.BoxGeometry(w*.09,.018,.012),soft,'Visor Slot',[i*w*.12,0,-d*.465]) }
  root.userData.forgeWearable={slot:'Head',bodyMask:['head','hair'],fitMode:'rigid'}
  return finish(root,recipe,style,false)
}

function buildChest(recipe: ForgeItemGeneratorRecipe) {
  const p=recipe.params, root=group(recipe,'Chest Armor'), w=n(p.width,.7), h=n(p.height,.76), d=n(p.depth,.4), taper=n(p.waistTaper,.2), style=s(p.armorStyle,'plate')
  const base=mat(recipe.materials.base,recipe), trim=mat(recipe.materials.trim,recipe), soft=mat(recipe.materials.soft,recipe), topW=w, bottomW=w*(1-taper*.48)
  add(root,trapezoidPlate(topW,bottomW,h,.055),base,'Breastplate',[0,0,-d*.5]); add(root,trapezoidPlate(topW*.94,bottomW*.96,h*.94,.045),style==='leather'||style==='reinforced-cloth'?soft:base,'Backplate',[0,0,d*.5],[0,Math.PI,0])
  for(const side of [-1,1]) add(root,new THREE.BoxGeometry(.055,h*.78,d*.82),base,'Side Plate',[side*w*.48,-h*.02,0],[0,0,side*.04])
  if(style==='brigandine'||style==='reinforced-cloth') for(let y=-2;y<=2;y+=1)for(let x=-2;x<=2;x+=1)add(root,new THREE.SphereGeometry(.018,5,3),trim,'Rivet',[x*w*.15,y*h*.13,-d*.54])
  if(style==='bone') for(const side of [-1,1]) add(root,new THREE.BoxGeometry(w*.44,.065,.08),mat('bone',recipe),'Bone Rib',[side*w*.19,h*.12,-d*.56],[0,0,side*.15])
  const shoulder=s(p.shoulderStyle,'small'), shoulderScale=n(p.shoulderScale,.9); if(shoulder!=='none') for(const side of [-1,1]){ if(shoulder==='asymmetric'&&side>0)continue; const sw=w*.3*shoulderScale, sh=.12*shoulderScale, layers=shoulder==='layered'?3:shoulder==='large'?2:1; for(let i=0;i<layers;i+=1)add(root,new THREE.BoxGeometry(sw-i*.035,sh,.22+i*.025),i===0?base:trim,'Pauldron',[side*(w*.54+i*.025),h*.37-i*.07,0],[0,0,side*(.18+i*.08)]) }
  const collar=s(p.collarStyle,'low'); if(collar!=='none'){ const ch=collar==='raised'?.18:collar==='gorget'?.14:.08; add(root,new THREE.CylinderGeometry(w*.23,w*.26,ch,10,1,true),trim,'Collar',[0,h*.48,0]) }
  const belt=n(p.beltSize,.07); if(belt>.015)add(root,new THREE.BoxGeometry(bottomW*1.05,belt,d*1.08),soft,'Belt',[0,-h*.48,0])
  root.userData.forgeWearable={slot:'Chest',bodyMask:['torso','upper-arms'],fitMode:'skinned',clothReady:style==='reinforced-cloth'||style==='leather'}
  return finish(root,recipe,style,false)
}

function buildGloves(recipe: ForgeItemGeneratorRecipe) {
  const p=recipe.params, root=group(recipe,'Gauntlets'), span=n(p.span,1), cuff=n(p.cuffLength,.3), hand=n(p.handScale,.2), layers=Math.round(n(p.plateCount,3)), base=mat(recipe.materials.base,recipe), trim=mat(recipe.materials.trim,recipe), soft=mat(recipe.materials.soft,recipe), style=s(p.armorStyle,'plate')
  for(const side of [-1,1]){ const x=side*span*.42; add(root,new THREE.CylinderGeometry(hand*.5,hand*.62,cuff,7),style==='bracer'||style==='leather'?soft:base,`Cuff ${side}`,[x,cuff*.38,0]); add(root,new THREE.BoxGeometry(hand*1.05,hand*.58,hand*.75),base,`Hand ${side}`,[x,-hand*.08,-hand*.08]); for(let i=0;i<layers;i+=1)add(root,new THREE.BoxGeometry(hand*(.92-i*.08),.035,hand*.72),i%2?trim:base,'Hand Plate',[x,hand*.08+i*.038,-hand*.1]); const knuckle=s(p.knuckleStyle,'plain'); if(knuckle!=='plain')for(let i=-1;i<=1;i+=1){ const geo=knuckle==='spikes'?new THREE.ConeGeometry(.025,.09,5):new THREE.SphereGeometry(.026,5,3); add(root,geo,trim,'Knuckle',[x+i*hand*.26,hand*.1,-hand*.48],[knuckle==='spikes'?Math.PI/2:0,0,0]) } }
  root.userData.forgeWearable={slot:'Hands',bodyMask:['hands','forearms'],fitMode:'skinned'}
  return finish(root,recipe,style,false)
}

function buildLegs(recipe: ForgeItemGeneratorRecipe) {
  const p=recipe.params, root=group(recipe,'Leg Armor'), hip=n(p.hipWidth,.48), thigh=n(p.thighLength,.46), shin=n(p.shinLength,.44), scale=n(p.plateScale,1), base=mat(recipe.materials.base,recipe), trim=mat(recipe.materials.trim,recipe), soft=mat(recipe.materials.soft,recipe), style=s(p.armorStyle,'plate')
  add(root,new THREE.BoxGeometry(hip*1.25,.1,.28),soft,'Waist',[0,thigh*.62,0])
  for(const side of [-1,1]){ const x=side*hip*.38; add(root,new THREE.BoxGeometry(.2*scale,thigh,.12),style==='leather'||style==='reinforced-cloth'?soft:base,'Thigh Plate',[x,thigh*.25,-.08]); add(root,new THREE.BoxGeometry(.18*scale,shin,.105),base,'Greave',[x,-shin*.43,-.09]); const knee=s(p.kneeStyle,'cap'); if(knee!=='none'){ add(root,new THREE.SphereGeometry(.1*scale,6,4),trim,'Knee',[x,-.03,-.12],[0,0,0],[1,knee==='winged'?.7:1,.55]); if(knee==='spiked')add(root,new THREE.ConeGeometry(.035,.12,5),trim,'Knee Spike',[x,-.03,-.21],[Math.PI/2,0,0]) } if(style==='tassets'||style==='bone')add(root,new THREE.BoxGeometry(.22*scale,thigh*.42,.1),style==='bone'?mat('bone',recipe):base,'Tasset',[x,thigh*.5,-.08],[0,0,side*.08]) }
  root.userData.forgeWearable={slot:'Legs',bodyMask:['hips','thighs','shins'],fitMode:'skinned'}
  return finish(root,recipe,style,false)
}

function buildBoots(recipe: ForgeItemGeneratorRecipe) {
  const p=recipe.params, root=group(recipe,'Boots'), span=n(p.span,.46), length=n(p.footLength,.4), shaft=n(p.shaftHeight,.3), width=n(p.width,.18), base=mat(recipe.materials.base,recipe), trim=mat(recipe.materials.trim,recipe), soft=mat(recipe.materials.soft,recipe), style=s(p.armorStyle,'leather')
  for(const side of [-1,1]){ const x=side*span*.42; add(root,new THREE.BoxGeometry(width,shaft,.19),style==='leather'||style==='fur'?soft:base,'Boot Shaft',[x,shaft*.45,.02]); add(root,new THREE.BoxGeometry(width*1.08,.14,length),base,'Foot',[x,-.04,-length*.3]); const toe=s(p.toeStyle,'round'); if(toe==='pointed')add(root,new THREE.ConeGeometry(width*.54,length*.48,5),base,'Pointed Toe',[x,-.04,-length*.72],[Math.PI/2,0,0]); if(toe==='layered')for(let i=0;i<3;i+=1)add(root,new THREE.BoxGeometry(width*(1-i*.08),.045,length*.3),i%2?trim:base,'Toe Plate',[x,.035+i*.035,-length*(.35+i*.18)]); const cuff=s(p.cuffStyle,'plain'); if(cuff!=='plain')add(root,new THREE.TorusGeometry(width*.58,cuff==='fur'?.035:.022,5,10),cuff==='fur'?soft:trim,'Cuff',[x,shaft*.95,.02],[Math.PI/2,0,0],[1,1,.8]) }
  root.userData.forgeWearable={slot:'Feet',bodyMask:['feet','shins'],fitMode:'skinned'}
  return finish(root,recipe,style,false)
}

function group(recipe: ForgeItemGeneratorRecipe, label: string) { const root=new THREE.Group(); root.name=`Procedural ${label} · ${recipe.seed}`; root.userData.forgeGenerator=recipe.generatorId; root.userData.forgeGeneratorVersion=2; root.userData.forgeSeed=recipe.seed; return root }
function finish(root: THREE.Group, recipe: ForgeItemGeneratorRecipe, family: string, tilt=true) { root.userData.forgeFamily=family; root.userData.forgeWear=s(recipe.params.wearStyle,'clean'); if(tilt){ const wear=n(recipe.params.wearAmount,0), style=s(recipe.params.wearStyle,'clean'); if(style==='crude'||style==='undead')root.rotation.z=signed(recipe.seed)*wear*.035 } root.traverse((obj)=>{if(obj instanceof THREE.Mesh){obj.castShadow=true;obj.receiveShadow=true}}); return root }
function add(root:THREE.Group, geometry:THREE.BufferGeometry, material:THREE.Material, name:string, position:[number,number,number]=[0,0,0], rotation:[number,number,number]=[0,0,0], scale:[number,number,number]=[1,1,1]){ const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(...position);mesh.rotation.set(...rotation);mesh.scale.set(...scale);root.add(mesh);return mesh }
function addCylinderBetween(root:THREE.Group,start:THREE.Vector3,end:THREE.Vector3,radius:number,material:THREE.Material,name:string,sides=7){ const dir=end.clone().sub(start), len=Math.max(.001,dir.length()); const mesh=add(root,new THREE.CylinderGeometry(radius,radius*.94,len,sides),material,name); mesh.position.copy(start).add(end).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()); return mesh }
function wrapBands(root:THREE.Group,centerY:number,length:number,radius:number,material:THREE.Material,count:number){ if(length<=.02)return; for(let i=0;i<count;i+=1){ const y=centerY-length*.5+(i+.5)/count*length; add(root,new THREE.TorusGeometry(radius*1.04,Math.max(.006,radius*.11),4,8),material,`Wrap ${i+1}`,[0,y,0],[Math.PI/2,0,0]) } }
function extrudedBlade(length:number,width:number,depth:number,style:string){ const shape=new THREE.Shape(), half=width*.5; shape.moveTo(-half,0); if(style==='stiletto'){shape.lineTo(-half*.55,length*.72);shape.lineTo(0,length);shape.lineTo(half*.55,length*.72);shape.lineTo(half,0)} else if(style==='leaf'){shape.lineTo(-half*.75,length*.35);shape.lineTo(-half*1.15,length*.68);shape.lineTo(0,length);shape.lineTo(half*1.15,length*.68);shape.lineTo(half*.75,length*.35);shape.lineTo(half,0)} else if(style==='hooked'){shape.lineTo(-half*.8,length*.72);shape.lineTo(-half*.2,length);shape.lineTo(half*.82,length*.82);shape.lineTo(half*.75,length*.28);shape.lineTo(half,0)} else if(style==='serrated'){shape.lineTo(-half*.92,length*.28);shape.lineTo(-half*.68,length*.45);shape.lineTo(-half*.94,length*.58);shape.lineTo(-half*.58,length*.72);shape.lineTo(0,length);shape.lineTo(half*.7,length*.68);shape.lineTo(half*.9,length*.34);shape.lineTo(half,0)} else{shape.lineTo(-half*.86,length*.78);shape.lineTo(0,length);shape.lineTo(half*.86,length*.78);shape.lineTo(half,0)} shape.closePath(); return extrude(shape,depth) }
function spearHead(length:number,width:number,depth:number,style:string){ const shape=new THREE.Shape(),half=width*.5; shape.moveTo(-half,0); if(style==='barbed'){shape.lineTo(-half*.5,length*.48);shape.lineTo(-half*.9,length*.38);shape.lineTo(0,length);shape.lineTo(half*.9,length*.38);shape.lineTo(half*.5,length*.48);shape.lineTo(half,0)} else if(style==='pike'){shape.lineTo(-half*.25,length*.8);shape.lineTo(0,length);shape.lineTo(half*.25,length*.8);shape.lineTo(half,0)} else if(style==='diamond'){shape.lineTo(0,length);shape.lineTo(half,0)} else{shape.lineTo(-half*.72,length*.5);shape.lineTo(0,length);shape.lineTo(half*.72,length*.5);shape.lineTo(half,0)} shape.closePath();return extrude(shape,depth) }
function axeShape(width:number,height:number,style:string){ const sh=new THREE.Shape(); if(style==='double'){sh.moveTo(-width*.5,-height*.15);sh.lineTo(-width*.36,height*.42);sh.lineTo(-width*.1,height*.28);sh.lineTo(0,height*.12);sh.lineTo(width*.1,height*.28);sh.lineTo(width*.36,height*.42);sh.lineTo(width*.5,-height*.15);sh.lineTo(width*.18,-height*.48);sh.lineTo(0,-height*.18);sh.lineTo(-width*.18,-height*.48)} else if(style==='cleaver'){sh.moveTo(-width*.05,-height*.4);sh.lineTo(width*.48,-height*.48);sh.lineTo(width*.5,height*.42);sh.lineTo(width*.08,height*.36);sh.lineTo(-width*.1,height*.12)} else if(style==='pick'){sh.moveTo(-width*.42,-height*.06);sh.lineTo(-width*.08,height*.12);sh.lineTo(width*.48,height*.16);sh.lineTo(width*.08,-height*.12)} else { const beard=style==='bearded'?.48:style==='crescent'?.28:.12; sh.moveTo(-width*.05,-height*.22);sh.lineTo(width*(.34+beard*.2),-height*(.4+beard*.1));sh.lineTo(width*.5,height*.32);sh.lineTo(width*.12,height*.46);sh.lineTo(-width*.08,height*.18)} sh.closePath();return sh }
function trapezoidPlate(top:number,bottom:number,height:number,depth:number){ const sh=new THREE.Shape();sh.moveTo(-bottom/2,-height/2);sh.lineTo(-top/2,height/2);sh.lineTo(top/2,height/2);sh.lineTo(bottom/2,-height/2);sh.closePath();return extrude(sh,depth) }
function extrude(shape:THREE.Shape,depth:number){ const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:1,bevelSize:Math.min(.015,depth*.18),bevelThickness:Math.min(.01,depth*.15),curveSegments:1,steps:1});g.computeVertexNormals();return g }
function mat(name:string|undefined,recipe:ForgeItemGeneratorRecipe,emissive=false){ const key=name||'iron', base=new THREE.Color(colorFor(key)), wear=n(recipe.params.wearAmount,0), style=s(recipe.params.wearStyle,'clean'); if(style==='rusted'||style==='undead')base.lerp(new THREE.Color('#493128'),wear*.22); if(style==='crude')base.multiplyScalar(1-wear*.12); const metal=/iron|steel|bronze/.test(key); const material=new THREE.MeshStandardMaterial({color:base,roughness:metal ? .56 : .88,metalness:metal ? .58 : .03,flatShading:true}); if(emissive||/arcane|blood-red|poison-green/.test(key)){material.emissive=base.clone().multiplyScalar(.55);material.emissiveIntensity=.9} return material }
function colorFor(key:string){ const colors:Record<string,string>={iron:'#666a69','dark-iron':'#34393b',steel:'#899092','weathered-steel':'#687172','rusted-iron':'#725044','blackened-steel':'#292e33','silvered-steel':'#a9b1b5',bronze:'#8a653c',bone:'#b4ad96','brown-leather':'#5c4030','black-leather':'#202326','red-leather':'#63363a','tan-leather':'#80664b',cloth:'#31343c','red-cloth':'#552b31','blue-cloth':'#273b55',wood:'#745536','dark-wood':'#3d3027','arcane-blue':'#4f8fc9','blood-red':'#8e3540','poison-green':'#6c9850','string-light':'#a39b83','string-dark':'#282a2a'};return colors[key]??'#6f7373' }
function n(value:unknown,fallback:number){const x=Number(value);return Number.isFinite(x)?x:fallback}
function s(value:unknown,fallback:string){return typeof value==='string'&&value?value:fallback}
function signed(seed:number){const x=Math.sin(seed*12.9898+78.233)*43758.5453;return((x-Math.floor(x))*2-1)}
