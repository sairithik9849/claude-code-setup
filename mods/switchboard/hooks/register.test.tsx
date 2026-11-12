import type { On, Settings, SettingsSource } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { modelAlias, savedEffort } from './register'

const MODEL_IDS: Record<string, string> = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', fable: 'claude-fable-5-2' }
// The shape /effort leaves behind: a stale top-level key, and the live level per model.
const SETTINGS: Partial<Record<SettingsSource, Settings>> = {
  user: { model: 'opus', effortLevel: 'xhigh', modelSettings: { 'claude-opus-5-5': { effortLevel: 'xhigh' } } },
}

const footer = (modes: string[] = []) =>
  ({ plugin: 'switchboard', component: 'SessionMode', surface: 'terminal', props: { modes } }) as const

// Stands in for the engine beneath the plugin: the model and settings the footer reads.
type Host = {
  // Each source as loaded; the merged read folds them lowest precedence first.
  settings?: Partial<Record<SettingsSource, Settings>>
  // The running model id; a model pick changes it, as the engine does.
  model?: string
}

function engine(on: On, configSets: unknown[], commands: unknown[], host: Host = {}) {
  const layers = host.settings ?? SETTINGS
  on('session.model', () => ({ value: host.model ?? 'claude-opus-5-5' }))
  on('settings.read', (_$, e) => ({
    value: e.source
      ? (layers[e.source] ?? {})
      : { ...layers.user, ...layers.project, ...layers.local, ...layers.flag, ...layers.policy },
  }))
  on('config.set', (_$, e) => {
    configSets.push({ key: e.key, value: e.value })
    if (e.key === 'model') host.model = MODEL_IDS[String(e.value)] ?? host.model
    return { value: e.value }
  })
  on('command.run', (_$, e) => {
    commands.push({ command: e.command, args: e.args })
    return { text: '' }
  })
}

describe('footer', () => {
  test('keeps the engine mode labels and adds model and effort buttons', async ($, on) => {
    engine(on, [], [])

    const ui = await $.ui.mount(footer(['focus', 'memory paused']))
    expect((await ui.find({ key: 'switchboard-row' }))?.text).toMatch(/focus & memory paused/)
    expect((await ui.find({ key: 'model' }))?.text).toMatch(/Opus ▴/)
    expect((await ui.find({ key: 'effort' }))?.text).toMatch(/xhigh ▴/)
    expect(await ui.find({ key: 'switchboard-menu' })).toBeUndefined()
    await ui.unmount()
  })

  test('model menu opens above the buttons; a pick saves and closes it', async ($, on) => {
    const configSets: unknown[] = []
    engine(on, configSets, [])

    const ui = await $.ui.mount(footer())
    await $.ui.press({ plugin: 'switchboard', key: 'model' })
    const menu = await ui.find({ key: 'switchboard-menu' })
    expect(menu?.text).toMatch(/Opus\s+✓.*Sonnet.*Haiku.*Fable.*OpusPlan/s)
    // Upward: the menu is drawn before (above) the row of buttons.
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn.indexOf('switchboard-menu')).toBeLessThan(drawn.indexOf('switchboard-row'))

    await $.ui.press({ plugin: 'switchboard', key: 'model-sonnet' })
    expect(configSets).toEqual([{ key: 'model', value: 'sonnet' }])
    expect(await ui.find({ key: 'switchboard-menu' })).toBeUndefined()
    await ui.unmount()
  })

  test('effort menu runs /effort; pressing the open button again closes it', async ($, on) => {
    const commands: unknown[] = []
    engine(on, [], commands)

    const ui = await $.ui.mount(footer())
    await $.ui.press({ plugin: 'switchboard', key: 'effort' })
    expect(await ui.find({ key: 'effort-high' })).toBeDefined()
    await $.ui.press({ plugin: 'switchboard', key: 'effort' })
    expect(await ui.find({ key: 'switchboard-menu' })).toBeUndefined()

    await $.ui.press({ plugin: 'switchboard', key: 'effort' })
    await $.ui.press({ plugin: 'switchboard', key: 'effort-high' })
    expect(commands).toContainEqual({ command: 'effort', args: 'high' })
    expect(await ui.find({ key: 'switchboard-menu' })).toBeUndefined()
    await ui.unmount()
  })

  test('effort shows the level /effort saved for the running model, not the stale top-level key', async ($, on) => {
    engine(on, [], [], {
      settings: { user: { model: 'opus', effortLevel: 'xhigh', modelSettings: { 'claude-opus-5-5': { effortLevel: 'medium' } } } },
    })

    const ui = await $.ui.mount(footer())
    expect((await ui.find({ key: 'effort' }))?.text).toMatch(/med ▴/)
    await $.ui.press({ plugin: 'switchboard', key: 'effort' })
    expect((await ui.find({ key: 'effort-medium' }))?.text).toMatch(/✓/)
    expect((await ui.find({ key: 'effort-xhigh' }))?.text).not.toMatch(/✓/)
    await ui.unmount()
  })

  test('max is session-only: a pick shows it though settings never change; a typed /effort replaces it', async ($, on) => {
    engine(on, [], [])

    const ui = await $.ui.mount(footer())
    await $.ui.press({ plugin: 'switchboard', key: 'effort' })
    await $.ui.press({ plugin: 'switchboard', key: 'effort-max' })
    expect((await ui.find({ key: 'effort' }))?.text).toMatch(/max ▴/)
    await $.ui.press({ plugin: 'switchboard', key: 'effort' })
    expect((await ui.find({ key: 'effort-max' }))?.text).toMatch(/✓/)
    await $.ui.press({ plugin: 'switchboard', key: 'effort' })

    // Typed at the prompt, as the engine stamps it.
    await $.command.run({
      command: 'effort',
      args: 'low',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 120 },
    })
    expect((await ui.find({ key: 'effort' }))?.text).toMatch(/low ▴/)
    await ui.unmount()
  })

  test('a model pick drops a session-only level; the new model shows its own saved level', async ($, on) => {
    engine(on, [], [], {
      settings: {
        user: {
          model: 'opus',
          effortLevel: 'xhigh',
          modelSettings: { 'claude-opus-5-5': { effortLevel: 'xhigh' }, 'claude-fable-5-2': { effortLevel: 'low' } },
        },
      },
    })

    const ui = await $.ui.mount(footer())
    await $.ui.press({ plugin: 'switchboard', key: 'effort' })
    await $.ui.press({ plugin: 'switchboard', key: 'effort-max' })
    await $.ui.press({ plugin: 'switchboard', key: 'model' })
    await $.ui.press({ plugin: 'switchboard', key: 'model-fable' })
    expect((await ui.find({ key: 'model' }))?.text).toMatch(/Fable ▴/)
    expect((await ui.find({ key: 'effort' }))?.text).toMatch(/low ▴/)
    await ui.unmount()
  })

  test('while a main turn runs: text instead of buttons, open menu closed; a subagent ending changes nothing', async ($, on) => {
    engine(on, [], [])
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))

    const ui = await $.ui.mount(footer())
    await $.ui.press({ plugin: 'switchboard', key: 'model' })
    await $.turn.start({ text: 'go', turnId: 't1' })
    expect(await ui.find({ key: 'model' })).toBeUndefined()
    expect(await ui.find({ key: 'switchboard-menu' })).toBeUndefined()
    expect((await ui.find({ key: 'switchboard-row' }))?.text).toMatch(/Opus · xhigh/)

    const done = { answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
    await $.turn.complete({ ...done, agentId: 'sub' })
    expect(await ui.find({ key: 'model' })).toBeUndefined()
    await $.turn.complete(done)
    expect(await ui.find({ key: 'model' })).toBeDefined()
    await ui.unmount()
  })

  test('no sessions button in the footer', async ($, on) => {
    engine(on, [], [])

    const ui = await $.ui.mount(footer())
    expect(await ui.find({ key: 'sessions' })).toBeUndefined()
    await ui.unmount()
  })
})

describe('helpers', () => {
  test('modelAlias keeps opusplan, else reads the running model', () => {
    expect(modelAlias('claude-opus-5-5', 'opusplan')).toBe('opusplan')
    expect(modelAlias('claude-sonnet-5-5', 'opus')).toBe('sonnet')
    expect(modelAlias('claude-haiku-4-5-20251001', undefined)).toBe('haiku')
    expect(modelAlias('some-gateway-model', undefined)).toBe('some-gateway-model')
  })

  test('savedEffort walks sources high to low: per-model entry, then top-level; user top-level is the last resort', () => {
    const opus = { modelSettings: { 'claude-opus-5-5': { effortLevel: 'medium' } } }
    expect(savedEffort([{ source: 'user', settings: { effortLevel: 'xhigh', ...opus } }], 'claude-opus-5-5[1m]')).toBe('medium')
    expect(savedEffort([{ source: 'user', settings: opus }], 'claude-opus-5-5-20261001')).toBe('medium')
    expect(
      savedEffort([{ source: 'project', settings: { effortLevel: 'low' } }, { source: 'user', settings: opus }], 'claude-opus-5-5'),
    ).toBe('low')
    expect(savedEffort([{ source: 'user', settings: { effortLevel: 'xhigh', ...opus } }], 'claude-fable-5-2')).toBe('xhigh')
    expect(savedEffort([{ source: 'user', settings: { modelSettings: 'junk' } }], 'claude-opus-5-5')).toBe('auto')
    expect(savedEffort([], 'claude-opus-5-5')).toBe('auto')
  })
})
