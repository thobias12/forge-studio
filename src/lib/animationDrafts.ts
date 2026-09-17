import type { ForgeAnimationActionId } from '../engine/animationBindings'
import type { ForgeMotion } from '../types'
import type { AnimationAuthoringEdit } from './animationAuthoring'
import { deleteAsset, listAssets, saveAsset, type LibraryAsset } from './library'
import type { MotionCleanupOptions } from './motionCleanup'

const DRAFT_MIME = 'application/x-forge-animation-draft+json'
const DRAFT_TAG = 'animation-studio-draft-v1'

export type AnimationDraftSettings = {
  purpose: ForgeAnimationActionId
  edit: AnimationAuthoringEdit
  smoothing: number
  mirrorX: boolean
  cleanup: MotionCleanupOptions
  characterAssetId?: string
  characterName?: string
  publishedAnimationAssetId?: string
  publishedAt?: string
}

export type AnimationDraftPayload = {
  format: 'forge-animation-draft'
  version: 1
  motion: ForgeMotion
  settings: AnimationDraftSettings
}

export type AnimationStudioDraft = {
  id: string
  asset: LibraryAsset
  motion: ForgeMotion
  settings: AnimationDraftSettings
}

export async function listAnimationDrafts() {
  const assets = await listAssets()
  const drafts = await Promise.all(assets
    .filter((asset) => asset.category === 'animations' && asset.kind === 'motion' && (asset.mime === DRAFT_MIME || asset.tags.includes(DRAFT_TAG)))
    .map(async (asset) => {
      try {
        const payload = JSON.parse(await asset.blob.text()) as AnimationDraftPayload
        if (payload.format !== 'forge-animation-draft' || payload.version !== 1 || payload.motion?.format !== 'forge-motion') return undefined
        return { id: asset.id, asset, motion: payload.motion, settings: payload.settings } satisfies AnimationStudioDraft
      } catch {
        return undefined
      }
    }))
  return drafts.filter((draft): draft is AnimationStudioDraft => !!draft)
    .sort((a, b) => b.asset.updatedAt.localeCompare(a.asset.updatedAt))
}

export async function saveAnimationDraft(input: {
  id?: string
  motion: ForgeMotion
  settings: AnimationDraftSettings
}) {
  const payload: AnimationDraftPayload = {
    format: 'forge-animation-draft',
    version: 1,
    motion: input.motion,
    settings: input.settings,
  }
  const asset = await saveAsset({
    id: input.id,
    name: `${input.settings.edit.name || input.motion.name || 'Animation'} · Draft`,
    category: 'animations',
    kind: 'motion',
    mime: DRAFT_MIME,
    tags: [
      DRAFT_TAG,
      'mocap',
      `action:${input.settings.purpose}`,
      ...(input.settings.characterAssetId ? [`character:${input.settings.characterAssetId}`] : []),
      ...(input.settings.publishedAnimationAssetId ? ['published'] : []),
    ],
    source: 'Forge Animation Studio · autosave',
    blob: new Blob([JSON.stringify(payload)], { type: DRAFT_MIME }),
  })
  return { id: asset.id, asset, motion: input.motion, settings: input.settings } satisfies AnimationStudioDraft
}

export async function deleteAnimationDraft(id: string) {
  await deleteAsset(id)
}
