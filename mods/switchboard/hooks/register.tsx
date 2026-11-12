import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Settings, SettingsSource } from 'claude-code'

import type { Menu } from '../types'

const openMenu = atom({ plugin: 'switchboard', key: 'openMenu' } as const, null)
// A level picked or typed this session, which settings can't show: max is never written, and the engine keeps a
// session level until the model changes. null: show what settings hold for the running model.
// ponytail: --effort, CLAUDE_CODE_EFFORT_LEVEL and maxEffortLevel clamps aren't mirrored; the exact level sent is
// only seen by a streaming turn.step hook, worth adding if the dial must match those too.
const sessionEffort = atom({ plugin: 'switchboard', key: 'sessionEffort' } as const, null)
const isWorking = atom({ plugin: 'switchboard', key: 'isWorking' } as const, false)
const tick = atom({ plugin: 'switchboard', key: 'tick' } as const, 0)

const MODELS = [
  { alias: 'opus', label: 'Opus' },
  { alias: 'sonnet', label: 'Sonnet' },
  { alias: 'haiku', label: 'Haiku' },
  { alias: 'fable', label: 'Fable' },
  { alias: 'opusplan', label: 'OpusPlan' },
] as const
const EFFORTS = [
  { level: 'low', label: 'low' },
  { level: 'medium', label: 'med' },
  { level: 'high', label: 'high' },
  { level: 'xhigh', label: 'xhigh' },
  { level: 'max', label: 'max' },
] as const
const SOURCES_HIGH_FIRST: readonly SettingsSource[] = ['policy', 'flag', 'local', 'project', 'user']

export function modelAlias(sessionModel: string, settingsModel: unknown): string {
  // opusplan resolves to an Opus or Sonnet id per turn, so only the setting still says it was chosen.
  if (settingsModel === 'opusplan') return 'opusplan'
  return MODELS.find(m => m.alias !== 'opusplan' && sessionModel.includes(m.alias))?.alias ?? sessionModel
}

// /effort saves per model (modelSettings, keyed by the canonical id), so the top-level effortLevel it leaves in user
// settings goes stale; the engine reads that one only for older models. This is the engine's lookup: highest source
// first, and within a source its per-model entry before its top-level key.
export function savedEffort(layers: ReadonlyArray<{ source: SettingsSource; settings: Settings }>, sessionModel: string): string {
  const id = sessionModel.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '')
  const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)
  for (const { source, settings } of layers) {
    const entry = (settings.modelSettings as Record<string, unknown> | undefined)?.[id] as { effortLevel?: unknown } | undefined
    const level = str(entry?.effortLevel) ?? (source === 'user' ? undefined : str(settings.effortLevel))
    if (level) return level
  }
  return str(layers.find(l => l.source === 'user')?.settings.effortLevel) ?? 'auto'
}

function effortFromArgs(args: string): string | null {
  const arg = args.trim().toLowerCase()
  if (EFFORTS.some(x => x.level === arg)) return arg
  if (arg === 'auto' || arg === 'unset') return 'auto'
  // No argument opens /effort's own picker, which saves per model: settings will say what was chosen.
  return null
}

async function pickModel($: EngineInterface, alias: string) {
  // The /config row writes settings.json, which is the "save as default" Sai asked for.
  const r = await $.config.set({ key: 'model', value: alias })
  if (r.deny) $.ui.toast(`Model unchanged: ${r.deny}`)
  // The engine drops a session level when the model changes; the new model starts at its own saved one.
  else await update($, sessionEffort, () => null)
  await update($, openMenu, () => null)
  await update($, tick, n => n + 1)
}

async function pickEffort($: EngineInterface, level: string) {
  // Effort has no /config row; the command is the only way in.
  await $.command.run({ command: 'effort', args: level })
  await update($, sessionEffort, () => level)
  await update($, openMenu, () => null)
  await update($, tick, n => n + 1)
}

export const register: Register = on => {
  on('prompt.submit', ($, e, next) => {
    void update($, openMenu, () => null)
    return next(e)
  })

  on('command.run', async ($, e, next) => {
    const ran = await next(e)
    // A /model or /effort typed by hand changes what the footer buttons should say.
    if (e.command === 'effort') await update($, sessionEffort, () => effortFromArgs(e.args))
    if (e.command === 'model') await update($, sessionEffort, () => null)
    if (e.command === 'model' || e.command === 'effort') await update($, tick, n => n + 1)
    return ran
  })

  // SessionMode's props don't say whether a turn runs, and the footer must not switch models mid-turn.
  on('turn.start', async ($, e, next) => {
    await update($, isWorking, () => true)
    await update($, openMenu, () => null)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // A subagent's turn ending says nothing about the main turn the footer guards.
    if (e.agentId === undefined) await update($, isWorking, () => false)
    return next(e)
  })

  // The footer's right-hand slot: the engine's own mode labels, then switchboard's buttons. There is no popup
  // element, so an open menu is drawn as rows above the buttons in the same tree, which reads as opening upward.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)

    await read($, tick)
    const [sessionModel, settings, layers, menu, working, picked] = await Promise.all([
      $.session.model(),
      $.settings.read(),
      Promise.all(SOURCES_HIGH_FIRST.map(async source => ({ source, settings: await $.settings.read({ source }) }))),
      read($, openMenu),
      read($, isWorking),
      read($, sessionEffort),
    ])
    const alias = modelAlias(sessionModel, settings.model)
    const modelText = MODELS.find(m => m.alias === alias)?.label ?? alias
    const effort = picked ?? savedEffort(layers, sessionModel)
    const isHaiku = alias === 'haiku'
    const effortText = isHaiku ? 'n/a' : (EFFORTS.find(x => x.level === effort)?.label ?? effort)
    const { Box, Button, Text } = $.ui.resolve(e)
    const modes = e.props.modes.join(' & ')

    const toggle = (which: Menu) => () => update($, openMenu, m => (m === which ? null : which))

    const row = (
      <Box key="switchboard-row" columnGap={1} justifyContent="flex-end">
        {modes && <Text dimColor>{modes}</Text>}
        {working ? (
          <Text dimColor>
            {modelText} · {effortText}
          </Text>
        ) : (
          [
            <Button key="model" label={`${modelText} ${menu === 'model' ? '▾' : '▴'}`} onPress={toggle('model')} />,
            isHaiku ? (
              <Text key="effort" dimColor>
                effort n/a
              </Text>
            ) : (
              <Button key="effort" label={`${effortText} ${menu === 'effort' ? '▾' : '▴'}`} onPress={toggle('effort')} />
            ),
          ]
        )}
      </Box>
    )

    const options =
      working || menu === null
        ? []
        : menu === 'model'
          ? MODELS.map(m => ({ key: `model-${m.alias}`, label: m.label, isCurrent: m.alias === alias, pick: () => pickModel($, m.alias) }))
          : EFFORTS.map(x => ({ key: `effort-${x.level}`, label: x.label, isCurrent: x.level === effort, pick: () => pickEffort($, x.level) }))
    if (options.length === 0) return row

    const width = Math.max(...options.map(o => o.label.length)) + 2
    return (
      <Box key="switchboard" flexDirection="column" alignItems="flex-end">
        <Box key="switchboard-menu" flexDirection="column" borderStyle="round" paddingX={1}>
          {options.map(o => (
            <Button key={o.key} plain label={`${o.label.padEnd(width)}${o.isCurrent ? '✓' : ' '}`} onPress={o.pick} />
          ))}
        </Box>
        {row}
      </Box>
    )
  })
}
