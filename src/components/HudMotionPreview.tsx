import type { CSSProperties } from 'react'
import { anchorPoint, type SkillboundHudLayout, type SkillboundHudModuleId } from '../lib/hudForge'

export type HudMotionKind = 'gold' | 'xp' | 'health' | 'mana' | 'cooldown' | 'loot'
export type HudMotionEvent = { id: number; kind: HudMotionKind }

export const HUD_MOTION_OPTIONS: Array<{ id: HudMotionKind; label: string; detail: string }> = [
  { id: 'gold', label: 'Gold pickup', detail: 'Coins arc from the ground into the gold pouch.' },
  { id: 'xp', label: 'XP gain', detail: 'XP wisps stream into the experience bar.' },
  { id: 'health', label: 'Heal', detail: 'Health motes land in the red orb and pulse it.' },
  { id: 'mana', label: 'Mana gain', detail: 'Mana motes land in the blue orb and ripple it.' },
  { id: 'cooldown', label: 'Cooldown', detail: 'Preview a skill cooldown sweep and ready pulse.' },
  { id: 'loot', label: 'Loot pickup', detail: 'Preview the pickup feed slide and impact.' },
]

export function motionTarget(kind: HudMotionKind): SkillboundHudModuleId {
  if (kind === 'gold') return 'gold'
  if (kind === 'xp') return 'xp'
  if (kind === 'health') return 'health'
  if (kind === 'mana') return 'resource'
  if (kind === 'cooldown') return 'hotbar'
  return 'loot'
}

export function HudMotionPreviewLayer({ layout, motion }: { layout: SkillboundHudLayout; motion?: HudMotionEvent }) {
  if (!motion) return null
  const targetId = motionTarget(motion.kind)
  const target = layout.modules[targetId]
  if (!target?.visible) return null
  const [anchorX, anchorY] = anchorPoint(target.anchor)
  const targetX = clamp(anchorX + target.offsetX, 2, 98)
  const targetY = clamp(anchorY + target.offsetY, 2, 98)
  const sourceX = motion.kind === 'loot' ? 54 : 49
  const sourceY = motion.kind === 'loot' ? 59 : 55
  const particles = motion.kind === 'gold' ? 9 : motion.kind === 'xp' ? 8 : motion.kind === 'health' || motion.kind === 'mana' ? 6 : 0
  const fastPickup = motion.kind === 'gold' || motion.kind === 'xp'
  const duration = motion.kind === 'gold' ? 410 : motion.kind === 'xp' ? 470 : 650
  const delayStep = motion.kind === 'gold' ? 22 : motion.kind === 'xp' ? 26 : 36
  const impactDelay = motion.kind === 'gold' ? 330 : motion.kind === 'xp' ? 385 : 510

  return <div className={`hud-motion-layer motion-${motion.kind}`} key={`${motion.kind}-${motion.id}`} style={{ '--impact-delay': `${impactDelay}ms` } as CSSProperties}>
    {Array.from({ length: particles }).map((_, index) => {
      const spread = ((index % 5) - 2) * (fastPickup ? .85 : 1.15)
      const sourceSpread = ((index % 3) - 1) * (fastPickup ? .75 : 1.25)
      const midX = sourceX + (targetX - sourceX) * (fastPickup ? .38 : .46) + spread
      const midY = Math.min(sourceY, targetY) - (fastPickup ? 5.8 : 9) - (index % 3) * (fastPickup ? 1.35 : 2.2)
      const style = {
        '--source-x': `${sourceX + sourceSpread}%`,
        '--source-y': `${sourceY + (index % 2) * (fastPickup ? .65 : 1.2)}%`,
        '--mid-x': `${midX}%`,
        '--mid-y': `${midY}%`,
        '--target-x': `${targetX}%`,
        '--target-y': `${targetY}%`,
        '--flight-delay': `${index * delayStep}ms`,
        '--flight-duration': `${duration}ms`,
      } as CSSProperties
      return <i className={`hud-motion-particle ${motion.kind}`} style={style} key={index}/>
    })}
    <div className={`hud-motion-impact ${motion.kind}`} style={{ '--target-x': `${targetX}%`, '--target-y': `${targetY}%` } as CSSProperties}/>
    {(motion.kind === 'gold' || motion.kind === 'xp' || motion.kind === 'health' || motion.kind === 'mana') && <b className={`hud-motion-gain ${motion.kind}`} style={{ '--target-x': `${targetX}%`, '--target-y': `${targetY}%` } as CSSProperties}>{gainLabel(motion.kind)}</b>}
  </div>
}

function gainLabel(kind: HudMotionKind) {
  if (kind === 'gold') return '+42'
  if (kind === 'xp') return '+186 XP'
  if (kind === 'health') return '+186'
  if (kind === 'mana') return '+75'
  return ''
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
