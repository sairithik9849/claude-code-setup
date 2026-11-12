export type Menu = 'model' | 'effort'

declare module 'claude-code' {
  interface PluginState {
    switchboard: {
      openMenu: Menu | null
      isWorking: boolean
      tick: number
      sessionEffort: string | null
    }
  }
}
