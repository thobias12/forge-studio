export type SkillboundRuntimeCommandTarget = {
  equipItem?: (itemId: string) => void
  getSnapshot?: () => unknown
  saveGame?: (manual?: boolean) => void
  setPaused?: (paused: boolean) => void
}

let activeRuntime: SkillboundRuntimeCommandTarget | undefined

export function registerSkillboundRuntime(runtime: SkillboundRuntimeCommandTarget) {
  activeRuntime = runtime
  window.dispatchEvent(new CustomEvent('skillbound-runtime-ready'))
}

export function unregisterSkillboundRuntime(runtime: SkillboundRuntimeCommandTarget) {
  if (activeRuntime !== runtime) return
  activeRuntime = undefined
  window.dispatchEvent(new CustomEvent('skillbound-runtime-cleared'))
}

export function equipActiveSkillboundItem(itemId: string) {
  if (!activeRuntime?.equipItem) return false
  activeRuntime.equipItem(itemId)
  return true
}

export function saveActiveSkillboundRuntime() {
  if (!activeRuntime?.saveGame) return false
  activeRuntime.saveGame(true)
  return true
}

export function getActiveSkillboundRuntime() {
  return activeRuntime
}
