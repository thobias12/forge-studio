import { useEffect, useRef } from 'react'
import type { ForgeAnimationActionId } from '../engine/animationBindings'
import type { ForgeAnimationProfileV3 } from '../engine/animationV3'
import type { LibraryAsset } from '../lib/library'
import AnimationCombatTestArenaV3 from './AnimationCombatTestArenaV3'

type Props = {
  target?: LibraryAsset
  animationProfile?: ForgeAnimationProfileV3
  action: ForgeAnimationActionId
  autoPlayToken?: number
}

export default function AnimationCombatTestArenaV2({ target, animationProfile, action, autoPlayToken = 0 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const lastTokenRef = useRef(0)

  useEffect(() => {
    if (!autoPlayToken || autoPlayToken === lastTokenRef.current) return
    lastTokenRef.current = autoPlayToken
    let attempts = 0
    const tryPlay = () => {
      const button = hostRef.current?.querySelector<HTMLButtonElement>('.animation-combat-arena .animation-arena-actions .primary-button:not(:disabled)')
      if (button) {
        button.click()
        return
      }
      attempts += 1
      if (attempts < 20) window.setTimeout(tryPlay, 120)
    }
    window.setTimeout(tryPlay, 80)
  }, [autoPlayToken, target?.id, action, animationProfile])

  return <div className="animation-combat-arena-v2" ref={hostRef}>
    <AnimationCombatTestArenaV3 target={target} animationProfile={animationProfile} action={action}/>
  </div>
}
