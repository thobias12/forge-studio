import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { ForgeItemDefinition } from './forgeProject'
import type { ForgeItemGeneratorRecipe } from './itemGeneratorTypes'
import { buildProceduralItemGroupV2 } from './proceduralItemGeometryV2'
import { saveAsset, type LibraryAsset } from '../lib/library'

export async function generateProceduralItemMaster(item: Pick<ForgeItemDefinition, 'id' | 'name'>, recipe: ForgeItemGeneratorRecipe): Promise<LibraryAsset> {
  const root = buildProceduralItemGroupV2(recipe)
  root.name = `${item.name} Procedural Master`
  const blob = await exportGroupGlb(root)
  disposeGroup(root)

  return await saveAsset({
    id: `skillbound:item-master:${item.id}`,
    name: `${item.name} Master Model`,
    category: 'props',
    kind: 'glb',
    mime: 'model/gltf-binary',
    tags: ['skillbound', 'item-master', 'procedural', recipe.generatorId, `seed-${recipe.seed}`, item.id],
    source: `Item Forge generator · ${recipe.generatorId} · seed ${recipe.seed}`,
    blob,
  })
}

async function exportGroupGlb(root: THREE.Group) {
  const exporter = new GLTFExporter()
  const result = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(root, (value) => {
      if (value instanceof ArrayBuffer) resolve(value)
      else reject(new Error('Forge expected binary GLB output.'))
    }, reject, { binary: true, trs: true, onlyVisible: false })
  })
  return new Blob([result], { type: 'model/gltf-binary' })
}

function disposeGroup(root: THREE.Group) {
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const entries = Array.isArray(object.material) ? object.material : [object.material]
    entries.forEach((material) => materials.add(material))
  })
  materials.forEach((material) => material.dispose())
}
