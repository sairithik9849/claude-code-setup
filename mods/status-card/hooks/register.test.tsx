import type { On, SessionUsage } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { untilLabel } from './register'

const NOW = Date.parse('2026-10-05T18:00:00Z')
const at = (secondsFromNow: number) => new Date(NOW + secondsFromNow * 1000).toISOString()

const USAGE: SessionUsage = {
  startedAt: NOW - 60_000,
  context: { tokens: 90_000, window: 1_000_000, percent: 9 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 30, resetsAt: at(2 * 3600 + 14 * 60 + 30) },
    { kind: 'seven_day', percentUsed: 12, resetsAt: at(4 * 86400 + 3 * 3600) },
  ],
}

const band = (bodyColumns: number) =>
  ({
    plugin: 'status-card',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 12,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 11 },
      view: {},
    },
  }) as const

// Stands in for the engine beneath the plugin: its own band (an empty keyed Box), session start, and usage figures.
function engine(on: On, usage: SessionUsage) {
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: usage }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
}

describe('band', () => {
  test('passes on the terminal, where the bash status line already shows this', async ($, on) => {
    mock.clock(on, { now: NOW })
    engine(on, USAGE)
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ ...band(80), surface: 'terminal' })
    expect(await ui.find({ key: 'engine' })).toBeDefined()
    expect(await ui.find({ key: 'limits' })).toBeUndefined()
    await ui.unmount()
  })

  test('desktop: one row of limits with bars and countdowns', async ($, on) => {
    mock.clock(on, { now: NOW })
    engine(on, USAGE)
    await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })

    const ui = await $.ui.mount({ ...band(80), surface: 'desktop' })
    expect((await ui.find({ key: 'limits' }))?.text).toMatch(/5h ███░{7} 30% \(2h14m\).*7d █░{9} 12% \(4d3h\)/)
    await ui.unmount()
  })

  test('narrow: drops the bars, keeps the figures', async ($, on) => {
    mock.clock(on, { now: NOW })
    engine(on, USAGE)
    await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })

    const ui = await $.ui.mount({ ...band(50), surface: 'desktop' })
    const text = (await ui.find({ key: 'limits' }))?.text
    expect(text).toMatch(/5h 30% \(2h14m\)/)
    expect(text).not.toMatch(/█/)
    await ui.unmount()
  })

  test('countdowns advance while idle', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    engine(on, USAGE)
    await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })

    const ui = await $.ui.mount({ ...band(80), surface: 'desktop' })
    await clock.advance(60_000)
    expect((await ui.find({ key: 'limits' }))?.text).toMatch(/\(2h13m\)/)
    await ui.unmount()
  })

  test('draws nothing without rate limits', async ($, on) => {
    mock.clock(on, { now: NOW })
    engine(on, { ...USAGE, rateLimits: [] })
    await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })

    const ui = await $.ui.mount({ ...band(80), surface: 'desktop' })
    expect(await ui.find({ key: 'engine' })).toBeDefined()
    expect(await ui.find({ key: 'limits' })).toBeUndefined()
    await ui.unmount()
  })
})

describe('untilLabel', () => {
  test('formats like the bash time_until', () => {
    expect(untilLabel(at(4 * 86400 + 3 * 3600 + 59), NOW)).toBe('4d3h')
    expect(untilLabel(at(2 * 3600 + 14 * 60), NOW)).toBe('2h14m')
    expect(untilLabel(at(59 * 60), NOW)).toBe('59m')
    expect(untilLabel(at(-1), NOW)).toBe('')
    expect(untilLabel(undefined, NOW)).toBe('')
    expect(untilLabel('not a date', NOW)).toBe('')
  })
})
