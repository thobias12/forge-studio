import { useMemo } from 'react'
import ArpgDungeonViewportCombat from './ArpgDungeonViewportCombat'
import type { DungeonWithProps } from '../lib/dungeonProps'
import { withCryptRuntimeCollision } from '../lib/cryptCollision'

type Props = { value: DungeonWithProps }

export default function ArpgDungeonViewport({ value }: Props) {
  const runtimeValue = useMemo(() => withCryptRuntimeCollision(value), [value])
  return <ArpgDungeonViewportCombat value={runtimeValue} />
}
