import {
  Copy,
  Trash2,
} from 'lucide-react'
import {
  GAMEPLAY_SOCKET_TYPES,
  gameplaySocketKindDescription,
  type GameplayInteractionAction,
  type GameplaySocket,
  type GameplaySocketKind,
} from '../engine/gameplaySockets'

type Props = {
  socket: GameplaySocket
  onChange: (patch: Partial<GameplaySocket>) => void
  onDuplicate: () => void
  onDelete: () => void
}

const ACTIONS: Array<{
  id: GameplayInteractionAction
  label: string
}> = [
  { id: 'message', label: 'Message / Inspect' },
  { id: 'container', label: 'Open Container' },
  { id: 'shrine', label: 'Activate Shrine' },
  { id: 'door', label: 'Door' },
  { id: 'teleport', label: 'Travel / Teleport' },
  { id: 'quest', label: 'Quest Hook' },
  { id: 'custom', label: 'Custom Hook' },
]

export default function GameplaySocketInspector({
  socket,
  onChange,
  onDuplicate,
  onDelete,
}: Props) {
  const interactive = [
    'interaction',
    'loot',
    'door',
    'teleport',
    'quest',
  ].includes(socket.kind)

  return (
    <>
      <section className="gameplay-socket-inspector">
        <div className="gameplay-socket-heading">
          <span>GAMEPLAY SOCKET</span>
          <div>
            <button
              title="Duplicate socket"
              onClick={onDuplicate}
            >
              <Copy size={13}/>
            </button>
            <button
              title="Delete socket"
              className="danger"
              onClick={onDelete}
            >
              <Trash2 size={13}/>
            </button>
          </div>
        </div>

        <label className="gameplay-socket-field">
          <span>Name</span>
          <input
            value={socket.name}
            onChange={(event) =>
              onChange({ name: event.target.value })
            }
          />
        </label>

        <label className="gameplay-socket-field">
          <span>Socket type</span>
          <select
            value={socket.kind}
            onChange={(event) =>
              onChange({
                kind: event.target
                  .value as GameplaySocketKind,
              })
            }
          >
            {GAMEPLAY_SOCKET_TYPES.map((type) => (
              <option
                key={type.id}
                value={type.id}
              >
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <p className="gameplay-socket-description">
          {gameplaySocketKindDescription(
            socket.kind,
          )}
        </p>

        <label className="gameplay-socket-check">
          <input
            type="checkbox"
            checked={socket.enabled}
            onChange={(event) =>
              onChange({
                enabled: event.target.checked,
              })
            }
          />
          <span>
            <strong>Socket enabled</strong>
            <small>
              Disabled sockets stay authored but are ignored
              by runtime systems.
            </small>
          </span>
        </label>

        <label className="gameplay-socket-field">
          <span>Radius</span>
          <input
            type="number"
            min={.35}
            max={12}
            step={.1}
            value={socket.radius}
            onChange={(event) => {
              const radius = Number(
                event.target.value,
              )
              if (Number.isFinite(radius)) {
                onChange({
                  radius: Math.max(
                    .35,
                    Math.min(12, radius),
                  ),
                })
              }
            }}
          />
        </label>
      </section>

      {interactive && (
        <section className="gameplay-socket-inspector">
          <span className="gameplay-socket-section-title">
            INTERACTION BEHAVIOUR
          </span>

          <label className="gameplay-socket-field">
            <span>Prompt</span>
            <input
              value={socket.prompt ?? ''}
              placeholder="Interact"
              onChange={(event) =>
                onChange({
                  prompt: event.target.value,
                })
              }
            />
          </label>

          <label className="gameplay-socket-field">
            <span>Action</span>
            <select
              value={socket.action ?? 'message'}
              onChange={(event) =>
                onChange({
                  action: event.target
                    .value as GameplayInteractionAction,
                })
              }
            >
              {ACTIONS.map((action) => (
                <option
                  key={action.id}
                  value={action.id}
                >
                  {action.label}
                </option>
              ))}
            </select>
          </label>

          <label className="gameplay-socket-field">
            <span>Trigger</span>
            <select
              value={socket.trigger ?? 'tap'}
              onChange={(event) =>
                onChange({
                  trigger:
                    event.target.value === 'hold'
                      ? 'hold'
                      : 'tap',
                })
              }
            >
              <option value="tap">Tap E</option>
              <option value="hold">Hold E</option>
            </select>
          </label>

          {(socket.trigger ?? 'tap') === 'hold' && (
            <label className="gameplay-socket-field">
              <span>Hold time</span>
              <input
                type="number"
                min={.15}
                max={8}
                step={.1}
                value={socket.holdSeconds ?? .6}
                onChange={(event) => {
                  const value = Number(
                    event.target.value,
                  )
                  if (Number.isFinite(value)) {
                    onChange({
                      holdSeconds: Math.max(
                        .15,
                        Math.min(8, value),
                      ),
                    })
                  }
                }}
              />
            </label>
          )}

          <label className="gameplay-socket-field">
            <span>Cooldown</span>
            <input
              type="number"
              min={0}
              max={120}
              step={.1}
              value={socket.cooldown ?? 0}
              onChange={(event) => {
                const value = Number(
                  event.target.value,
                )
                if (Number.isFinite(value)) {
                  onChange({
                    cooldown: Math.max(
                      0,
                      Math.min(120, value),
                    ),
                  })
                }
              }}
            />
          </label>

          <label className="gameplay-socket-check">
            <input
              type="checkbox"
              checked={socket.oneShot ?? false}
              onChange={(event) =>
                onChange({
                  oneShot: event.target.checked,
                })
              }
            />
            <span>
              <strong>One-time interaction</strong>
              <small>
                Runtime remembers completion in the save.
              </small>
            </span>
          </label>
        </section>
      )}

      <section className="gameplay-socket-inspector">
        <span className="gameplay-socket-section-title">
          BINDING / CONDITIONS
        </span>

        <label className="gameplay-socket-field">
          <span>Target ref</span>
          <input
            value={socket.targetRef ?? ''}
            placeholder="Optional future asset / quest / table id"
            onChange={(event) =>
              onChange({
                targetRef:
                  event.target.value || undefined,
              })
            }
          />
        </label>

        {interactive && (
          <>
            <label className="gameplay-socket-field">
              <span>Required item</span>
              <input
                value={
                  socket.requiredItemId ?? ''
                }
                placeholder="Optional item id"
                onChange={(event) =>
                  onChange({
                    requiredItemId:
                      event.target.value ||
                      undefined,
                  })
                }
              />
            </label>

            <label className="gameplay-socket-check">
              <input
                type="checkbox"
                checked={
                  socket.consumeRequiredItem ??
                  false
                }
                disabled={
                  !socket.requiredItemId?.trim()
                }
                onChange={(event) =>
                  onChange({
                    consumeRequiredItem:
                      event.target.checked,
                  })
                }
              />
              <span>
                <strong>Consume required item</strong>
                <small>
                  Removes one matching inventory item on
                  successful interaction.
                </small>
              </span>
            </label>

            <label className="gameplay-socket-field">
              <span>Locked text</span>
              <input
                value={
                  socket.lockedText ?? 'Locked'
                }
                onChange={(event) =>
                  onChange({
                    lockedText:
                      event.target.value,
                  })
                }
              />
            </label>

            <label className="gameplay-socket-field vertical">
              <span>Result message</span>
              <textarea
                rows={3}
                value={socket.message ?? ''}
                onChange={(event) =>
                  onChange({
                    message: event.target.value,
                  })
                }
              />
            </label>
          </>
        )}
      </section>

      <SocketTransformSection
        label="Socket Position"
        value={socket.position}
        step={.1}
        onChange={(position) =>
          onChange({ position })
        }
      />
      <SocketTransformSection
        label="Socket Rotation"
        value={
          socket.rotation.map(
            radiansToDegrees,
          ) as [number, number, number]
        }
        step={15}
        suffix="°"
        onChange={(rotation) =>
          onChange({
            rotation: rotation.map(
              degreesToRadians,
            ) as [number, number, number],
          })
        }
      />
    </>
  )
}

function SocketTransformSection({
  label,
  value,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: [number, number, number]
  step: number
  suffix?: string
  onChange: (
    value: [number, number, number],
  ) => void
}) {
  const axes = ['X', 'Y', 'Z'] as const
  return (
    <section className="gameplay-socket-transform">
      <span className="gameplay-socket-section-title">
        {label}
      </span>
      <div className="gameplay-socket-vector">
        {axes.map((axis, index) => (
          <label key={axis}>
            <span>{axis}</span>
            <input
              type="number"
              step={step}
              value={round(
                value[index],
                suffix ? 1 : 3,
              )}
              onChange={(event) => {
                const next = [...value] as [
                  number,
                  number,
                  number,
                ]
                const number = Number(
                  event.target.value,
                )
                if (!Number.isFinite(number)) {
                  return
                }
                next[index] = number
                onChange(next)
              }}
            />
            {suffix && <em>{suffix}</em>}
          </label>
        ))}
      </div>
    </section>
  )
}

function degreesToRadians(value: number) {
  return value * Math.PI / 180
}

function radiansToDegrees(value: number) {
  return value * 180 / Math.PI
}

function round(
  value: number,
  digits: number,
) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
