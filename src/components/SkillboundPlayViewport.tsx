import { useEffect, useRef } from 'react'
import type { GeneratedRegion } from '../engine/guidedWorld'
import { ForgePlayRuntime } from '../engine/runtime/ForgePlayRuntime'

type Props = { region: GeneratedRegion }

export default function SkillboundPlayViewport({ region }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hostRef.current) return
    const runtime = new ForgePlayRuntime(hostRef.current, region)
    return () => runtime.dispose()
  }, [region])

  return <div className="skillbound-runtime-host" ref={hostRef}><div className="skillbound-runtime-hint"><strong>FORGE PLAY MODE</strong><span>WASD move · mouse aims · wheel zoom</span></div></div>
}
