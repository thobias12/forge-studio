import { useEffect, useRef, type CSSProperties } from 'react'
import { anchorPoint, type SkillboundHudLayout, type SkillboundHudModuleId } from '../lib/hudForge'
import {
  playLevelUpFeedbackSound,
  playPickupFeedbackSound,
  primePickupFeedbackAudio,
} from '../lib/pickupFeedbackAudio'
import '../hud-motion-preview.css'

export type HudPickupFlightEvent = {
  id: number
  kind: 'gold' | 'xp'
  amount: number
  screenX: number
  screenY: number
  levelUp?: boolean
}

const FLIGHT = {
  gold: { duration: 720, delayStep: 42, count: 3, impactLead: 24 },
  xp: { duration: 780, delayStep: 48, count: 3, impactLead: 28 },
} as const

export function HudPickupFlights({
  events,
  layout,
}: {
  events: HudPickupFlightEvent[]
  layout: SkillboundHudLayout
}) {
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
      const recipe = FLIGHT[event.kind]
      const impactDelay =
        (recipe.duration + recipe.delayStep * (recipe.count - 1) - recipe.impactLead) / 1000
      playPickupFeedbackSound(
        event.kind,
        event.amount,
        impactDelay + index * .016,
      )
      if (event.levelUp) {
        playLevelUpFeedbackSound(impactDelay + .07 + index * .016)
      }
    })
  }, [events])

  return <div className="hud-runtime-flight-layer">
    {events.slice(-8).map((event) => (
      <RuntimeFlight key={event.id} event={event} layout={layout}/>
    ))}
  </div>
}

function RuntimeFlight({
  event,
  layout,
}: {
  event: HudPickupFlightEvent
  layout: SkillboundHudLayout
}) {
  const targetId: SkillboundHudModuleId = event.kind === 'gold' ? 'gold' : 'xp'
  const target = layout.modules[targetId]
  if (!target?.visible) return null

  const [anchorX, anchorY] = anchorPoint(target.anchor)
  const targetX = clamp(anchorX + target.offsetX, 2, 98)
  const targetY = clamp(anchorY + target.offsetY, 2, 98)
  const sourceX = clamp(event.screenX, 2, 98)
  const sourceY = clamp(event.screenY, 2, 98)
  const recipe = FLIGHT[event.kind]
  const impactDelay =
    recipe.duration + recipe.delayStep * (recipe.count - 1) - recipe.impactLead

  const layerStyle = {
    '--impact-delay': `${impactDelay}ms`,
  } as CSSProperties

  return <div
    className={`hud-motion-layer hud-runtime-flight motion-${event.kind}`}
    style={layerStyle}
  >
    {Array.from({ length: recipe.count }).map((_, index) => {
      const lane = index - 1
      const arcHeight =
        event.kind === 'gold'
          ? 5.8 + index * .72
          : 6.7 + index * .82
      const arcX = lane * (event.kind === 'gold' ? 1.35 : 1.7)
      const style = {
        '--source-x': `${sourceX + lane * .34}%`,
        '--source-y': `${sourceY + Math.abs(lane) * .18}%`,
        '--target-x': `${targetX}%`,
        '--target-y': `${targetY}%`,
        '--arc-x': `${arcX}vw`,
        '--arc-y': `-${arcHeight}vh`,
        '--tail-x': `${arcX * .34}vw`,
        '--tail-y': `-${arcHeight * .34}vh`,
        '--flight-delay': `${index * recipe.delayStep}ms`,
        '--flight-duration': `${recipe.duration}ms`,
      } as CSSProperties
      return <i
        className={`hud-motion-particle ${event.kind}`}
        style={style}
        key={index}
      />
    })}
    <div
      className={`hud-motion-impact ${event.kind}`}
      style={{
        '--target-x': `${targetX}%`,
        '--target-y': `${targetY}%`,
      } as CSSProperties}
    />
    <b
      className={`hud-motion-gain ${event.kind}`}
      style={{
        '--target-x': `${targetX}%`,
        '--target-y': `${targetY}%`,
      } as CSSProperties}
    >
      +{event.amount}{event.kind === 'xp' ? ' XP' : ''}
    </b>
  </div>
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
