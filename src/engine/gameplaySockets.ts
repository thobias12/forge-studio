import * as THREE from 'three'

export type GameplaySocketKind =
  | 'interaction'
  | 'loot'
  | 'npc'
  | 'enemy'
  | 'vfx'
  | 'audio'
  | 'light'
  | 'door'
  | 'teleport'
  | 'quest'
  | 'attachment'

export type GameplayInteractionTrigger = 'tap' | 'hold'

export type GameplayInteractionAction =
  | 'message'
  | 'container'
  | 'shrine'
  | 'door'
  | 'teleport'
  | 'quest'
  | 'custom'

export type GameplaySocket = {
  id: string
  name: string
  kind: GameplaySocketKind
  position: [number, number, number]
  rotation: [number, number, number]
  radius: number
  enabled: boolean

  prompt?: string
  trigger?: GameplayInteractionTrigger
  holdSeconds?: number
  cooldown?: number
  oneShot?: boolean
  requiredItemId?: string
  consumeRequiredItem?: boolean
  lockedText?: string
  action?: GameplayInteractionAction
  targetRef?: string
  message?: string
}

export const GAMEPLAY_SOCKET_TYPES: Array<{
  id: GameplaySocketKind
  label: string
  description: string
}> = [
  {
    id: 'interaction',
    label: 'Interaction',
    description: 'Generic E/click interaction point.',
  },
  {
    id: 'loot',
    label: 'Loot',
    description: 'Future Loot Forge/container drop point.',
  },
  {
    id: 'npc',
    label: 'NPC Spawn',
    description: 'Named spawn point for a future NPC binding.',
  },
  {
    id: 'enemy',
    label: 'Enemy Spawn',
    description: 'Named encounter spawn point.',
  },
  {
    id: 'vfx',
    label: 'VFX',
    description: 'Attachment point for a visual effect.',
  },
  {
    id: 'audio',
    label: 'Audio',
    description: 'Positional/ambient audio emitter point.',
  },
  {
    id: 'light',
    label: 'Light',
    description: 'Authored light attachment point.',
  },
  {
    id: 'door',
    label: 'Door',
    description: 'Interactive door/lock point.',
  },
  {
    id: 'teleport',
    label: 'Teleport / Entrance',
    description: 'Travel or dungeon transition point.',
  },
  {
    id: 'quest',
    label: 'Quest',
    description: 'Quest start/advance interaction point.',
  },
  {
    id: 'attachment',
    label: 'Attachment',
    description: 'Generic reusable attachment/socket point.',
  },
]

export function createGameplaySocket(
  kind: GameplaySocketKind = 'interaction',
  patch: Partial<GameplaySocket> = {},
): GameplaySocket {
  const defaults = gameplaySocketDefaults(kind)
  return {
    id: patch.id ?? makeId('socket'),
    name: patch.name ?? defaults.name,
    kind,
    position: patch.position ?? [0, 1, 0],
    rotation: patch.rotation ?? [0, 0, 0],
    radius: clampNumber(
      patch.radius,
      .35,
      12,
      defaults.radius,
    ),
    enabled: patch.enabled ?? true,
    prompt: patch.prompt ?? defaults.prompt,
    trigger: patch.trigger ?? defaults.trigger,
    holdSeconds: clampNumber(
      patch.holdSeconds,
      .15,
      8,
      defaults.holdSeconds,
    ),
    cooldown: clampNumber(
      patch.cooldown,
      0,
      120,
      defaults.cooldown,
    ),
    oneShot: patch.oneShot ?? defaults.oneShot,
    requiredItemId: patch.requiredItemId,
    consumeRequiredItem:
      patch.consumeRequiredItem ?? false,
    lockedText:
      patch.lockedText ?? 'Locked',
    action: patch.action ?? defaults.action,
    targetRef: patch.targetRef,
    message: patch.message ?? defaults.message,
  }
}

export function cloneGameplaySocket(
  socket: GameplaySocket,
  positionOffset:
    [number, number, number] = [.25, 0, .25],
) {
  return createGameplaySocket(socket.kind, {
    ...socket,
    id: undefined,
    name: `${socket.name} Copy`,
    position: [
      socket.position[0] + positionOffset[0],
      socket.position[1] + positionOffset[1],
      socket.position[2] + positionOffset[2],
    ],
  })
}

export function normalizeGameplaySockets(
  value: unknown,
): GameplaySocket[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (candidate) =>
        Boolean(
          candidate &&
          typeof candidate === 'object',
        ),
    )
    .map((candidate) => {
      const source =
        candidate as Partial<GameplaySocket>
      const kind = isGameplaySocketKind(
        source.kind,
      )
        ? source.kind
        : 'interaction'
      return createGameplaySocket(kind, {
        ...source,
        id:
          typeof source.id === 'string'
            ? source.id
            : undefined,
        name:
          typeof source.name === 'string'
            ? source.name
            : undefined,
        position: tuple3(
          source.position,
          [0, 1, 0],
        ),
        rotation: tuple3(
          source.rotation,
          [0, 0, 0],
        ),
        radius:
          typeof source.radius === 'number'
            ? source.radius
            : undefined,
        enabled:
          typeof source.enabled === 'boolean'
            ? source.enabled
            : true,
        prompt:
          typeof source.prompt === 'string'
            ? source.prompt
            : undefined,
        trigger:
          source.trigger === 'hold'
            ? 'hold'
            : source.trigger === 'tap'
              ? 'tap'
              : undefined,
        holdSeconds:
          typeof source.holdSeconds === 'number'
            ? source.holdSeconds
            : undefined,
        cooldown:
          typeof source.cooldown === 'number'
            ? source.cooldown
            : undefined,
        oneShot:
          typeof source.oneShot === 'boolean'
            ? source.oneShot
            : undefined,
        requiredItemId:
          typeof source.requiredItemId ===
          'string'
            ? source.requiredItemId
            : undefined,
        consumeRequiredItem:
          typeof source.consumeRequiredItem ===
          'boolean'
            ? source.consumeRequiredItem
            : undefined,
        lockedText:
          typeof source.lockedText === 'string'
            ? source.lockedText
            : undefined,
        action:
          isInteractionAction(source.action)
            ? source.action
            : undefined,
        targetRef:
          typeof source.targetRef === 'string'
            ? source.targetRef
            : undefined,
        message:
          typeof source.message === 'string'
            ? source.message
            : undefined,
      })
    })
}

export function gameplaySocketKindLabel(
  kind: GameplaySocketKind,
) {
  return (
    GAMEPLAY_SOCKET_TYPES.find(
      (candidate) => candidate.id === kind,
    )?.label ?? kind
  )
}

export function gameplaySocketKindDescription(
  kind: GameplaySocketKind,
) {
  return (
    GAMEPLAY_SOCKET_TYPES.find(
      (candidate) => candidate.id === kind,
    )?.description ?? ''
  )
}

export function gameplaySocketColor(
  kind: GameplaySocketKind,
) {
  if (kind === 'interaction') return 0x7fe4a1
  if (kind === 'loot') return 0xe4bb62
  if (kind === 'npc') return 0x77b8e8
  if (kind === 'enemy') return 0xe16c67
  if (kind === 'vfx') return 0xc38bf2
  if (kind === 'audio') return 0x8ad6db
  if (kind === 'light') return 0xffd66d
  if (kind === 'door') return 0xd39565
  if (kind === 'teleport') return 0x8d86ff
  if (kind === 'quest') return 0xf0da70
  return 0xa7b6ad
}

export function buildGameplaySocketMarker(
  socket: GameplaySocket,
  options: {
    selected?: boolean
    runtime?: boolean
  } = {},
) {
  const root = new THREE.Group()
  root.name = `GameplaySocket_${socket.kind}`
  root.userData.gameplaySocketId = socket.id
  root.userData.gameplaySocketKind = socket.kind
  root.position.set(...socket.position)
  root.rotation.set(...socket.rotation)

  const color = gameplaySocketColor(socket.kind)
  const opacity = options.runtime
    ? .72
    : options.selected
      ? 1
      : .82

  const ringMaterial =
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(
      options.runtime ? .28 : .34,
      options.runtime ? .025 : .035,
      6,
      22,
    ),
    ringMaterial,
  )
  ring.name = 'SocketRing'
  ring.rotation.x = Math.PI / 2
  ring.renderOrder = 97
  ring.userData.gameplaySocketId = socket.id
  root.add(ring)

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(
      .016,
      .016,
      options.runtime ? .48 : .68,
      5,
    ),
    ringMaterial,
  )
  stem.position.y =
    options.runtime ? .25 : .35
  stem.renderOrder = 97
  stem.userData.gameplaySocketId = socket.id
  root.add(stem)

  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(
      options.runtime ? .1 : .145,
      0,
    ),
    ringMaterial,
  )
  diamond.position.y =
    options.runtime ? .52 : .72
  diamond.rotation.y = Math.PI / 4
  diamond.renderOrder = 98
  diamond.userData.gameplaySocketId = socket.id
  root.add(diamond)

  if (!options.runtime) {
    const radiusMaterial =
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: options.selected ? .12 : .055,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    const radiusDisc = new THREE.Mesh(
      new THREE.RingGeometry(
        Math.max(.02, socket.radius - .035),
        socket.radius,
        42,
      ),
      radiusMaterial,
    )
    radiusDisc.name = 'SocketRadius'
    radiusDisc.rotation.x = -Math.PI / 2
    radiusDisc.position.y = .012
    radiusDisc.renderOrder = 91
    radiusDisc.userData.gameplaySocketId =
      socket.id
    root.add(radiusDisc)
  }

  root.visible = socket.enabled
  return root
}

export function isRuntimeInteractableSocket(
  socket: GameplaySocket,
) {
  return (
    socket.enabled &&
    [
      'interaction',
      'loot',
      'door',
      'teleport',
      'quest',
    ].includes(socket.kind)
  )
}

export function socketPrompt(
  socket: GameplaySocket,
) {
  if (socket.prompt?.trim()) {
    return socket.prompt.trim()
  }
  return gameplaySocketDefaults(socket.kind).prompt
}

export function socketActionLabel(
  socket: GameplaySocket,
) {
  const action =
    socket.action ??
    gameplaySocketDefaults(socket.kind).action
  if (action === 'container') return 'Container'
  if (action === 'shrine') return 'Shrine'
  if (action === 'door') return 'Door'
  if (action === 'teleport') return 'Travel'
  if (action === 'quest') return 'Quest'
  if (action === 'custom') return 'Custom'
  return 'Interaction'
}

export function gameplaySocketDefaults(
  kind: GameplaySocketKind,
) {
  if (kind === 'loot') {
    return {
      name: 'Loot Socket',
      radius: 2.2,
      prompt: 'Open Container',
      trigger: 'tap' as const,
      holdSeconds: .6,
      cooldown: 0,
      oneShot: true,
      action: 'container' as const,
      message:
        'Container opened. Loot Forge can bind rewards here.',
    }
  }
  if (kind === 'npc') {
    return {
      name: 'NPC Spawn',
      radius: 1,
      prompt: 'Talk',
      trigger: 'tap' as const,
      holdSeconds: .6,
      cooldown: 0,
      oneShot: false,
      action: 'custom' as const,
      message: 'NPC socket',
    }
  }
  if (kind === 'enemy') {
    return {
      name: 'Enemy Spawn',
      radius: 1,
      prompt: 'Enemy Spawn',
      trigger: 'tap' as const,
      holdSeconds: .6,
      cooldown: 0,
      oneShot: false,
      action: 'custom' as const,
      message: 'Enemy socket',
    }
  }
  if (kind === 'vfx') {
    return {
      name: 'VFX Socket',
      radius: .6,
      prompt: 'VFX',
      trigger: 'tap' as const,
      holdSeconds: .6,
      cooldown: 0,
      oneShot: false,
      action: 'custom' as const,
      message: 'VFX socket',
    }
  }
  if (kind === 'audio') {
    return {
      name: 'Audio Socket',
      radius: .6,
      prompt: 'Audio',
      trigger: 'tap' as const,
      holdSeconds: .6,
      cooldown: 0,
      oneShot: false,
      action: 'custom' as const,
      message: 'Audio socket',
    }
  }
  if (kind === 'light') {
    return {
      name: 'Light Socket',
      radius: .6,
      prompt: 'Light',
      trigger: 'tap' as const,
      holdSeconds: .6,
      cooldown: 0,
      oneShot: false,
      action: 'custom' as const,
      message: 'Light socket',
    }
  }
  if (kind === 'door') {
    return {
      name: 'Door Socket',
      radius: 2.4,
      prompt: 'Open Door',
      trigger: 'tap' as const,
      holdSeconds: .6,
      cooldown: .3,
      oneShot: false,
      action: 'door' as const,
      message: 'Door interaction triggered.',
    }
  }
  if (kind === 'teleport') {
    return {
      name: 'Teleport Socket',
      radius: 2.6,
      prompt: 'Travel',
      trigger: 'hold' as const,
      holdSeconds: .8,
      cooldown: 1,
      oneShot: false,
      action: 'teleport' as const,
      message: 'Travel socket triggered.',
    }
  }
  if (kind === 'quest') {
    return {
      name: 'Quest Socket',
      radius: 2.5,
      prompt: 'Interact',
      trigger: 'tap' as const,
      holdSeconds: .6,
      cooldown: .5,
      oneShot: false,
      action: 'quest' as const,
      message: 'Quest interaction triggered.',
    }
  }
  if (kind === 'attachment') {
    return {
      name: 'Attachment Socket',
      radius: .5,
      prompt: 'Attachment',
      trigger: 'tap' as const,
      holdSeconds: .6,
      cooldown: 0,
      oneShot: false,
      action: 'custom' as const,
      message: 'Attachment socket',
    }
  }
  return {
    name: 'Interaction Socket',
    radius: 2.35,
    prompt: 'Interact',
    trigger: 'tap' as const,
    holdSeconds: .6,
    cooldown: .25,
    oneShot: false,
    action: 'message' as const,
    message: 'Interaction triggered.',
  }
}

export function isGameplaySocketKind(
  value: unknown,
): value is GameplaySocketKind {
  return [
    'interaction',
    'loot',
    'npc',
    'enemy',
    'vfx',
    'audio',
    'light',
    'door',
    'teleport',
    'quest',
    'attachment',
  ].includes(String(value))
}

function isInteractionAction(
  value: unknown,
): value is GameplayInteractionAction {
  return [
    'message',
    'container',
    'shrine',
    'door',
    'teleport',
    'quest',
    'custom',
  ].includes(String(value))
}

function tuple3(
  value: unknown,
  fallback: [number, number, number],
): [number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length < 3
  ) {
    return [...fallback]
  }
  return [
    finiteNumber(value[0], fallback[0]),
    finiteNumber(value[1], fallback[1]),
    finiteNumber(value[2], fallback[2]),
  ]
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  return Math.min(
    max,
    Math.max(
      min,
      finiteNumber(value, fallback),
    ),
  )
}

function finiteNumber(
  value: unknown,
  fallback: number,
) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value)
  )
    ? value
    : fallback
}

function makeId(prefix: string) {
  if (
    typeof crypto !== 'undefined' &&
    'randomUUID' in crypto
  ) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
