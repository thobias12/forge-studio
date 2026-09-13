import type { PosePoint } from '../types'
import { FORGE_VERSION } from '../version'

export const POSE_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
]

export function averageVisibility(points?: PosePoint[]) {
  if (!points?.length) return 0
  const values = points.map((point) => point.visibility ?? 1)
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function downloadJson(filename: string, data: unknown) {
  let payload = data
  if (data && typeof data === 'object' && 'format' in data && (data as { format?: unknown }).format === 'forge-diagnostics') {
    payload = { ...(data as Record<string, unknown>), forgeBuild: FORGE_VERSION }
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, ms) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}
