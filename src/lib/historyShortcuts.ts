export type HistoryScope = {
  undo: () => void
  redo: () => void
  label?: string
}

let activeScope: HistoryScope | undefined
let installed = false

export function registerHistoryScope(scope: HistoryScope) {
  activeScope = scope
  return () => {
    if (activeScope === scope) activeScope = undefined
  }
}

export function installHistoryShortcuts() {
  if (installed) return () => undefined
  installed = true

  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return
    if (isEditableTarget(event.target)) return

    const key = event.key.toLowerCase()
    const wantsUndo = key === 'z' && !event.shiftKey
    const wantsRedo = key === 'y' || (key === 'z' && event.shiftKey)
    if (!activeScope || (!wantsUndo && !wantsRedo)) return

    event.preventDefault()
    if (wantsUndo) activeScope.undo()
    else activeScope.redo()
  }

  window.addEventListener('keydown', onKeyDown)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    installed = false
  }
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return false
  if (element.isContentEditable) return true
  const tag = element.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}
