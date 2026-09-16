import { useEffect, useRef, useState, type CSSProperties } from 'react'
import '../skillbound-orbs.css'

type Props = {
  kind: 'health' | 'mana'
  value: number
  max: number
  style?: CSSProperties
  label?: string
}

export default function SkillboundOrb({ kind, value, max, style, label }: Props) {
  const previous = useRef(value)
  const [impact, setImpact] = useState<'gain' | 'spend' | ''>('')
  const ratio = Math.max(0, Math.min(1, value / Math.max(1, max)))

  useEffect(() => {
    const delta = value - previous.current
    previous.current = value
    if (Math.abs(delta) < 0.01) return
    setImpact(delta > 0 ? 'gain' : 'spend')
    const timer = window.setTimeout(() => setImpact(''), 520)
    return () => window.clearTimeout(timer)
  }, [value])

  return <div
    className={`skillbound-liquid-orb ${kind} ${impact ? `impact-${impact}` : ''}`}
    style={{ ...style, '--orb-fill': `${ratio * 100}%` } as CSSProperties}
    aria-label={`${label ?? (kind === 'health' ? 'Health' : 'Mana')} ${Math.round(value)} of ${Math.round(max)}`}
  >
    <div className="skillbound-orb-frame">
      <div className="skillbound-orb-glass">
        <div className="skillbound-orb-liquid">
          <i className="wave wave-a"/>
          <i className="wave wave-b"/>
          <i className="orb-current current-a"/>
          <i className="orb-current current-b"/>
          <i className="orb-bubble bubble-a"/>
          <i className="orb-bubble bubble-b"/>
          <i className="orb-bubble bubble-c"/>
        </div>
        <span className="skillbound-orb-highlight"/>
        <span className="skillbound-orb-rim-glow"/>
      </div>
      <div className="skillbound-orb-value">
        <strong>{Math.ceil(value)}</strong>
        <span>/{Math.ceil(max)}</span>
        <small>{label ?? (kind === 'health' ? 'Health' : 'Mana')}</small>
      </div>
    </div>
  </div>
}
