import * as THREE from 'three'
import { ITEM_PALETTES, type SkillboundItemRecipe } from './skillboundItems'

export function equipmentMaterials(recipe: SkillboundItemRecipe) {
  const palette = ITEM_PALETTES[recipe.palette]
  return Object.fromEntries(Object.entries(palette).map(([key, color]) => [key, new THREE.MeshStandardMaterial({ color, roughness: key === 'metal' || key === 'edge' ? .43 + recipe.wear * .4 : .88, metalness: key === 'metal' || key === 'edge' ? .65 : 0, emissive: key === 'magic' ? color : '#000000', emissiveIntensity: key === 'magic' ? .45 : 0 })])) as Record<keyof typeof palette, THREE.MeshStandardMaterial>
}

/** All dimensions in metres; hand-held items share a grip origin and point along +Y. */
export function buildSkillboundProp(recipe: SkillboundItemRecipe) {
  const root = new THREE.Group(); root.name = `Skillbound_${recipe.family}_${recipe.seed}`
  const m = equipmentMaterials(recipe); const v = recipe.variant; const f = recipe.family
  const add = (g: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => { const mesh = new THREE.Mesh(g, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh }
  const cylinder = (radius: number, length: number, y: number, material = m.wood, x = 0) => add(new THREE.CylinderGeometry(radius * .88, radius, length, 10), material, x, y)
  const shape = (points: number[][], depth: number, material: THREE.Material, y = 0, x = 0) => {
    const s = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], p[1])))
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .007, bevelThickness: .006, curveSegments: 8 }); g.translate(0, 0, -depth / 2)
    return add(g, material, x, y)
  }
  const gem = (x: number, y: number, z = .04, size = .045) => { const mesh = add(new THREE.IcosahedronGeometry(size, 0), m.magic, x, y, z); mesh.scale.y = 1.3; return mesh }
  const grip = (length = .22) => {
    cylinder(.028, length, 0, m.leather)
    for (let i = 0; i < 7; i++) cylinder(.03, .009, -length / 2 + i * length / 6, m.edge)
    cylinder(.043, .035, -length / 2 - .012, m.metal)
  }
  const blade = (length: number, width: number, y: number) => {
    shape([[-width * .42, 0], [-width / 2, length * .62], [-width * .3, length * .84], [0, length], [width * .3, length * .84], [width / 2, length * .62], [width * .42, 0]], .025, m.metal, y)
    shape([[-.008, .03], [-.01, length * .7], [0, length * .93], [.01, length * .7], [.008, .03]], .028, m.edge, y)
  }
  if (f === 'sword' || f === 'dagger') {
    grip(f === 'dagger' ? .17 : .23); blade((f === 'dagger' ? .35 : .77) * recipe.length, (f === 'dagger' ? .095 : .12) * recipe.width, .15)
    shape([[-.19, -.025], [-.21, .025 + v * .009], [-.08, .012], [0, .032], [.08, .012], [.21, .025 + v * .009], [.19, -.025], [0, -.008]], .043, m.edge, .13)
    gem(0, .13, .035, .027)
  } else if (['axe', 'hatchet', 'pickaxe', 'sickle', 'mace'].includes(f)) {
    const length = (f === 'hatchet' || f === 'sickle' ? .48 : .77) * recipe.length
    cylinder(.026, length, length / 2 - .13); grip(.21)
    cylinder(.04, .14, length - .2, m.edge)
    if (f === 'mace') {
      cylinder(.068, .22, length - .16, m.metal)
      for (let i = 0; i < 5 + v; i++) { const fin = shape([[.045, -.12], [.12, -.07], [.135, .06], [.07, .14], [.04, .11]], .027, m.edge, length - .16); fin.rotation.y = i * Math.PI * 2 / (5 + v) }
    } else if (f === 'pickaxe') {
      shape([[-.34, -.11], [-.19, .065], [0, .10], [.24, .055], [.35, -.10], [.16, -.012], [0, .012], [-.17, -.02]], .045, m.metal, length - .18)
    } else if (f === 'sickle') {
      shape([[0, -.1], [.08, .02], [.10, .19], [.03, .27], [-.10, .27], [-.23, .16], [-.12, .33], [.08, .34], [.18, .2], [.13, .015], [.025, -.1]], .026, m.metal, length - .15)
    } else {
      shape([[0, -.07], [.12, -.09], [.23, -.18], [.29, -.06], [.29, .18], [.19, .25], [.1, .1], [0, .085]], .043, m.metal, length - .18)
      shape([[.245, -.145], [.29, -.06], [.29, .18], [.255, .208], [.235, .05]], .047, m.edge, length - .18)
      if (v === 3 && f === 'axe') { const back = shape([[0, -.07], [-.12, -.09], [-.23, -.15], [-.27, .12], [-.12, .1], [0, .085]], .043, m.metal, length - .18); back.name = 'CounterBlade' }
    }
  } else if (f === 'staff' || f === 'spear') {
    cylinder(.028, 1.55 * recipe.length, .18); grip(.24)
    cylinder(.038, .08, 1.0 * recipe.length, m.edge)
    if (f === 'spear') blade(.38, .14, .98 * recipe.length)
    else {
      const fork = shape([[-.055, -.07], [-.17, .1], [-.11, .3], [-.065, .34], [-.09, .13], [0, .03], [.09, .13], [.065, .34], [.11, .3], [.17, .1], [.055, -.07]], .05, m.wood, 1.0 * recipe.length)
      fork.name = 'CarvedFocusCage'; gem(0, 1.18 * recipe.length, 0, .085)
    }
  } else if (f === 'bow') {
    const points = [new THREE.Vector3(0, -.68, 0), new THREE.Vector3(.23, -.48, 0), new THREE.Vector3(.17, -.17, 0), new THREE.Vector3(.1, 0, 0), new THREE.Vector3(.17, .17, 0), new THREE.Vector3(.23, .48, 0), new THREE.Vector3(0, .68, 0)]
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 26, .026, 8, false), m.wood)
    cylinder(.003, 1.36, 0, m.cloth); cylinder(.031, .20, 0, m.leather, .1)
    for (const y of [-.55, .55]) cylinder(.03, .055, y, m.edge, .18)
    root.position.x = -.1
  } else if (f === 'shield') {
    const s = v === 2 ? [[-.25,.4],[.25,.4],[.28,-.28],[.18,-.42],[-.18,-.42],[-.28,-.28]] : v === 0 ? [[-.26, .3], [0, .37], [.26, .3], [.28, -.03], [.16, -.28], [0, -.43], [-.16, -.28], [-.28, -.03]] : Array.from({ length: 16 }, (_, i) => [Math.sin(i * Math.PI / 8) * .32, Math.cos(i * Math.PI / 8) * .32])
    shape(s, .065, m.edge); shape(s.map(([x,y])=>[x * .88, y * .88]), .073, m.wood)
    const boss = add(new THREE.SphereGeometry(.085, 12, 6), m.metal, 0, 0, .055); boss.scale.z = .5
    for (const x of [-.16, .16]) for (const y of [-.16, .16]) add(new THREE.SphereGeometry(.012, 6, 4), m.edge, x, y, .048)
    shape([[-.013,-.28],[-.013,.27],[.013,.27],[.013,-.28]], .08, m.metal)
  } else if (f === 'grimoire') {
    add(new THREE.BoxGeometry(.24, .31, .065), m.cloth)
    for (const z of [-.045, .045]) add(new THREE.BoxGeometry(.27, .34, .021), m.leather, 0, 0, z)
    add(new THREE.BoxGeometry(.035, .34, .09), m.edge, -.12)
    gem(0, 0, .069, .042)
    for (const x of [-.10, .10]) for (const y of [-.13, .13]) add(new THREE.BoxGeometry(.045, .04, .018), m.edge, x, y, .063)
  } else if (f === 'orb') {
    gem(0, .1, 0, .13)
    add(new THREE.TorusGeometry(.15, .013, 6, 24), m.edge, 0, .1).rotation.x = .6
    cylinder(.055, .10, -.08, m.metal)
  } else if (f === 'ring') {
    add(new THREE.TorusGeometry(.045, .01, 8, 20), m.edge); gem(0, .048, 0, .024)
  } else if (f === 'amulet' || f === 'charm') {
    if (f === 'amulet') { const loop = add(new THREE.TorusGeometry(.14, .005, 5, 24), m.edge, 0, .13); loop.scale.y = 1.3 }
    shape([[0,-.075],[-.045,-.01],[0,.055],[.045,-.01]], .022, m.edge, -.03); gem(0, -.04, .018, .024)
  }
  // Release unused palette materials; each returned object owns all of its resources.
  const used = new Set<THREE.Material>(); root.traverse(o => { if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mat => used.add(mat)) })
  Object.values(m).forEach(mat => { if (!used.has(mat)) mat.dispose() })
  return root
}
