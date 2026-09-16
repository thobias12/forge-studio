import type { CSSProperties } from 'react'
import { anchorPoint, type SkillboundHudLayout, type SkillboundHudModuleId } from '../lib/hudForge'
import '../hud-motion-preview.css'

export type HudPickupFlightEvent = {
  id: number
  kind: 'gold' | 'xp'
  amount: number
  screenX: number
  screenY: number
}

export function HudPickupFlights({ events, layout }: { events: HudPickupFlightEvent[]; layout: SkillboundHudLayout }) {
  return <div className="hud-runtime-flight-layer">
    {events.slice(-8).map((event) => <RuntimeFlight key={event.id} event={event} layout={layout}/>)}
  </div>
}

function RuntimeFlight({ event, layout }: { event: HudPickupFlightEvent; layout: SkillboundHudLayout }) {
  const targetId: SkillboundHudModuleId = event.kind === 'gold' ? 'gold' : 'xp'
  const target = layout.modules[targetId]
  if (!target?.visible) return null
  const [anchorX, anchorY] = anchorPoint(target.anchor)
  const targetX = clamp(anchorX + target.offsetX, 2, 98)
  const targetY = clamp(anchorY + target.offsetY, 2, 98)
  const sourceX = clamp(event.screenX, 2, 98)
  const sourceY = clamp(event.screenY, 2, 98)

  return <div className={`hud-motion-layer hud-runtime-flight motion-${event.kind}`}>
    {Array.from({ length: event.kind === 'gold' ? 6 : 5 }).map((_, index) => {
      const midX = sourceX + (targetX - sourceX) * .45 + ((index % 3) - 1) * 1.6
      const midY = Math.min(sourceY, targetY) - 8 - (index % 2) * 2.5
      const style = {
        '--source-x': `${sourceX + ((index % 3) - 1) * .65}%`,
        '--source-y': `${sourceY + (index % 2) * .55}%`,
        '--mid-x': `${midX}%`,
        '--mid-y': `${midY}%`,
        '--target-x': `${targetX}%`,
        '--target-y': `${targetY}%`,
        '--flight-delay': `${index * 44}ms`,
      } as CSSProperties
      return <i className={`hud-motion-particle ${event.kind}`} style={style} key={index}/>
    })}
    <div className={`hud-motion-impact ${event.kind}`} style={{ '--target-x': `${targetX}%`, '--target-y': `${targetY}%` } as CSSProperties}/>
    <b className={`hud-motion-gain ${event.kind}`} style={{ '--target-x': `${targetX}%`, '--target-y': `${targetY}%` } as CSSProperties}>+{event.amount}{event.kind === 'xp' ? ' XP' : ''}</b>
  </div>
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
