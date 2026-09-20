import { useEffect, useRef, type CSSProperties } from 'react'
import {
  anchorPoint,
  type SkillboundHudLayout,
  type SkillboundHudModuleId,
} from '../lib/hudForge'
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
  gold: { duration: 320, delayStep: 24, count: 3, impactLead: 18 },
  xp: { duration: 350, delayStep: 26, count: 2, impactLead: 18 },
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
        (recipe.duration +
          recipe.delayStep * (recipe.count - 1) -
          recipe.impactLead) /
        1000

      if (event.kind === 'xp') {
        playPickupFeedbackSound('xp', event.amount, .015 + index * .012)
      } else {
        playPickupFeedbackSound(
          'gold',
          event.amount,
          impactDelay + index * .01,
        )
      }

      if (event.levelUp) {
        playLevelUpFeedbackSound(.08 + index * .012)
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
  const targetId: SkillboundHudModuleId =
    event.kind === 'gold' ? 'gold' : 'xp'
  const target = layout.modules[targetId]
  if (!target?.visible) return null

  const [anchorX, anchorY] = anchorPoint(target.anchor)
  const targetX = clamp(anchorX + target.offsetX, 2, 98)
  const targetY = clamp(anchorY + target.offsetY, 2, 98)
  const sourceX = clamp(event.screenX, 2, 98)
  const sourceY = clamp(event.screenY, 2, 98)
  const recipe = FLIGHT[event.kind]
  const impactDelay =
    recipe.duration +
    recipe.delayStep * (recipe.count - 1) -
    recipe.impactLead

  return <div
    className={`hud-motion-layer hud-runtime-flight motion-${event.kind}`}
    style={{ '--impact-delay': `${impactDelay}ms` } as CSSProperties}
  >
    {Array.from({ length: recipe.count }).map((_, index) => {
      const lane = index - (recipe.count - 1) / 2
      const arcHeight =
        event.kind === 'gold'
          ? 3.3 + index * .36
          : 3.7 + index * .44
      const arcX = lane * (event.kind === 'gold' ? .72 : .92)
      return <i
        className={`hud-motion-particle ${event.kind}`}
        style={{
          '--source-x': `${sourceX + lane * .24}%`,
          '--source-y': `${sourceY}%`,
          '--target-x': `${targetX}%`,
          '--target-y': `${targetY}%`,
          '--arc-x': `${arcX}vw`,
          '--arc-y': `-${arcHeight}vh`,
          '--tail-x': `${arcX * .2}vw`,
          '--tail-y': `-${arcHeight * .18}vh`,
          '--flight-delay': `${index * recipe.delayStep}ms`,
          '--flight-duration': `${recipe.duration}ms`,
        } as CSSProperties}
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
        '--target-x': event.kind === 'xp' ? `${sourceX}%` : `${targetX}%`,
        '--target-y': event.kind === 'xp' ? `${sourceY}%` : `${targetY}%`,
        animationDelay: event.kind === 'xp' ? '35ms' : `${impactDelay}ms`,
      } as CSSProperties}
    >
      +{event.amount}{event.kind === 'xp' ? ' XP' : ''}
    </b>
  </div>
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
