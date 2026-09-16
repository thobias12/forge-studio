import { useEffect, useRef, type CSSProperties } from 'react'
import { anchorPoint, type SkillboundHudLayout, type SkillboundHudModuleId } from '../lib/hudForge'
import { playPickupFeedbackSound, primePickupFeedbackAudio } from '../lib/pickupFeedbackAudio'
import '../hud-motion-preview.css'

export type HudPickupFlightEvent = {
  id: number
  kind: 'gold' | 'xp'
  amount: number
  screenX: number
  screenY: number
}

export function HudPickupFlights({ events, layout }: { events: HudPickupFlightEvent[]; layout: SkillboundHudLayout }) {
  const initialized = useRef(false)
  const lastSeenId = useRef(0)

  useEffect(() => primePickupFeedbackAudio(), [])

  useEffect(() => {
    const latestId = events.reduce((max, event) => Math.max(max, event.id), 0)
    if (!initialized.current) {
      initialized.current = true
      lastSeenId.current = latestId
      return
    }

    const fresh = events.filter((event) => event.id > lastSeenId.current)
    lastSeenId.current = Math.max(lastSeenId.current, latestId)
    if (!fresh.length) return

    fresh.slice(-8).forEach((event, index) => {
      const impactDelay = event.kind === 'gold' ? 0.31 : 0.35
      playPickupFeedbackSound(event.kind, event.amount, impactDelay + index * 0.014)
    })
  }, [events])

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
  const duration = event.kind === 'gold' ? 410 : 470
  const delayStep = event.kind === 'gold' ? 22 : 26
  const impactDelay = event.kind === 'gold' ? 330 : 385

  const layerStyle = {
    '--impact-delay': `${impactDelay}ms`,
  } as CSSProperties

  return <div className={`hud-motion-layer hud-runtime-flight motion-${event.kind}`} style={layerStyle}>
    {Array.from({ length: event.kind === 'gold' ? 6 : 5 }).map((_, index) => {
      const lane = (index % 3) - 1
      const midX = sourceX + (targetX - sourceX) * .38 + lane * 1.15
      const midY = Math.min(sourceY, targetY) - 5.5 - (index % 2) * 1.6
      const style = {
        '--source-x': `${sourceX + lane * .48}%`,
        '--source-y': `${sourceY + (index % 2) * .38}%`,
        '--mid-x': `${midX}%`,
        '--mid-y': `${midY}%`,
        '--target-x': `${targetX}%`,
        '--target-y': `${targetY}%`,
        '--flight-delay': `${index * delayStep}ms`,
        '--flight-duration': `${duration}ms`,
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
