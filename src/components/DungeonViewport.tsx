import type { ComponentProps } from 'react'
import DungeonViewportCore, {
  type DungeonTool,
  type ResizeSide,
} from './DungeonViewportCore'

export type { DungeonTool, ResizeSide }

type CoreProps = ComponentProps<typeof DungeonViewportCore>

export default function DungeonViewport(props: CoreProps) {
  return <DungeonViewportCore {...props} />
}
