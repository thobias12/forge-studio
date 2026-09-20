import type { ForgeItemDefinition } from './forgeProject'
import { getAsset } from '../lib/library'
import { itemVisual, renderItemIconBlob } from './itemPresentation'

// One render at a time avoids creating a GPU context for every inventory cell.
let queue: Promise<unknown> = Promise.resolve()
const thumbnails = new Map<string, Promise<Blob | undefined>>()
export function resolveItemIcon(item: ForgeItemDefinition): Promise<Blob | undefined> {
  const visual = itemVisual(item)
  const key = JSON.stringify([item.id, item.procedural, item.modelAssetId, visual])
  const cached = thumbnails.get(key)
  if (cached) return cached
  const task = queue.then(async () => {
    if (visual.inventory.iconAssetId && !item.procedural) {
      const asset = await getAsset(visual.inventory.iconAssetId)
      if (asset) return asset.blob
    }
    if (!item.procedural && !visual.masterAssetId) return undefined
    return renderItemIconBlob(item, 160)
  }).catch(() => { thumbnails.delete(key); return undefined })
  thumbnails.set(key, task); queue = task
  if (thumbnails.size > 160) thumbnails.delete(thumbnails.keys().next().value!)
  return task
}
