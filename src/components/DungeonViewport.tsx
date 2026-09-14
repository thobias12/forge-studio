import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import DungeonViewportCore, { type DungeonTool, type ResizeSide } from './DungeonViewportCore'
import type { DungeonTheme } from '../lib/dungeonPackage'
import type { DungeonWithProps } from '../lib/dungeonProps'
import { withCryptRuntimeCollision } from '../lib/cryptCollision'

export type { DungeonTool, ResizeSide }

type CoreProps = ComponentProps<typeof DungeonViewportCore>

const INTERACTION_RESTORE_MS = 110

export default function DungeonViewport(props: CoreProps) {
  const [interactionLod, setInteractionLod] = useState(false)
  const interactionRef = useRef(false)
  const restoreTimer = useRef<number | undefined>(undefined)

  const beginInteraction = () => {
    if (!interactionRef.current) {
      interactionRef.current = true
      setInteractionLod(true)
    }
    if (restoreTimer.current !== undefined) window.clearTimeout(restoreTimer.current)
    restoreTimer.current = window.setTimeout(() => {
      interactionRef.current = false
      setInteractionLod(false)
      restoreTimer.current = undefined
    }, INTERACTION_RESTORE_MS)
  }

  useEffect(() => () => {
    if (restoreTimer.current !== undefined) window.clearTimeout(restoreTimer.current)
  }, [])

  const value = useMemo(() => {
    let next = props.value
    if (interactionLod && props.value.theme === 'crypt' && !props.playtest) {
      // During editor manipulation, keep real geometry and the Crypt palette but
      // skip expensive procedural dressing. Full detail returns after the drag.
      next = { ...props.value, theme: 'crypt-interaction' as DungeonTheme } as DungeonWithProps
    }
    // Runtime-only hidden collision proxies mirror major Crypt architecture/dressing.
    // They never touch the authored package and sit far below the rendered floor.
    if (props.playtest && props.value.theme === 'crypt') next = withCryptRuntimeCollision(next)
    return next
  }, [interactionLod, props.value, props.playtest])

  const wrapped: CoreProps = {
    ...props,
    value,
    onRoomMove: (...args) => { beginInteraction(); props.onRoomMove(...args) },
    onRoomResize: (...args) => { beginInteraction(); props.onRoomResize(...args) },
    onPropMove: (...args) => { beginInteraction(); props.onPropMove(...args) },
  }

  return <DungeonViewportCore {...wrapped} />
}
