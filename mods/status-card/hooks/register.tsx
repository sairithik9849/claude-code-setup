import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const tick = atom({ plugin: 'status-card', key: 'tick' } as const, 0)

// Narrower than this, two 10-cell bars plus labels, `100%` and `(6d23h)` no longer fit on one row.
const MINI_BAR_MIN_COLUMNS = 56
const MINI_BAR_CELLS = 10
const LIMIT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

// Same 50/80 cut-offs as ~/.claude/statusline-command.sh, so both surfaces turn the same color at the same moment.
export function thresholdColor(pct: number): string {
  if (pct >= 80) return 'error'
  if (pct >= 50) return 'warning'
  return 'success'
}

// Port of the bash script's time_until: "XdYh", "XhYm" or "Xm"; empty once the reset has passed.
export function untilLabel(resetsAt: string | undefined, nowMs: number): string {
  if (!resetsAt) return ''
  const secs = Math.floor((Date.parse(resetsAt) - nowMs) / 1000)
  if (!(secs > 0)) return ''
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return `${d}d${h}h`
  if (h > 0) return `${h}h${m}m`
  return `${m}m`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // Countdowns change with time alone, and nothing else redraws the band while the session sits idle.
    // The same tick picks up new percentages after a turn, within a minute: plenty for 5h/7d windows.
    $.clock.every(60_000, () => void update($, tick, n => n + 1))
    return started
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // The terminal keeps the bash status line; drawing here too would show everything twice.
    if (e.surface !== 'desktop' || e.props.hasSurvey) return next(e)

    // Read only to subscribe: a bump redraws the band.
    await read($, tick)
    const [{ rateLimits }, now] = await Promise.all([$.session.usage(), $.clock.now()])
    if (rateLimits.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const showMiniBars = e.props.bodyColumns >= MINI_BAR_MIN_COLUMNS

    return (
      <Box key="limits" columnGap={3}>
        {rateLimits.map(limit => {
          const used = Math.round(limit.percentUsed)
          const color = thresholdColor(used)
          const filled = Math.min(MINI_BAR_CELLS, Math.max(0, Math.round(used / 10)))
          const left = untilLabel(limit.resetsAt, now)
          return (
            <Text>
              <Text dimColor>{LIMIT_LABELS[limit.kind] ?? limit.kind} </Text>
              {showMiniBars && (
                <Text color={color}>
                  {'█'.repeat(filled)}
                  <Text dimColor>{'░'.repeat(MINI_BAR_CELLS - filled)}</Text>{' '}
                </Text>
              )}
              <Text color={color}>{used}%</Text>
              {left && <Text dimColor> ({left})</Text>}
            </Text>
          )
        })}
      </Box>
    )
  })
}
