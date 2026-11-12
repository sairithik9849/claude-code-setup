// Exported so this file stays a module: that's what makes the block below augment 'claude-code' instead of replacing it.
export type Tick = number

declare module 'claude-code' {
  interface PluginState {
    'status-card': { tick: Tick }
  }
}
