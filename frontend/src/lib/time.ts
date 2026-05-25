// ─────────────────────────────────────────────────────────────────────────────
// time.ts — Day 12: app-wide ET (America/New_York) clock helpers.
//
// All user-visible timestamps in this app render in Eastern Time. Browser-
// local formatting (`toLocaleTimeString()` with no options) and `toUTCString()`
// are forbidden in UI code — use these helpers instead.
//
// Helpers automatically emit the live tz abbrev ("EST" or "EDT") so DST flips
// don't require redeploys.
// ─────────────────────────────────────────────────────────────────────────────

export const ET_TZ = 'America/New_York'

/** Live tz abbreviation for the given moment ("EST" in winter, "EDT" in summer). */
export function etAbbr(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: ET_TZ, timeZoneName: 'short' })
      .formatToParts(d)
      .find(p => p.type === 'timeZoneName')?.value ?? 'ET'
  } catch { return 'ET' }
}

/** "14:32:07 EDT" — 24h time + tz abbrev. */
export function fmtETTime(input: Date | string | number | null | undefined, opts?: { seconds?: boolean; tz?: boolean }): string {
  if (input == null || input === '') return '—'
  const seconds = opts?.seconds ?? true
  const tz      = opts?.tz      ?? true
  try {
    const d = input instanceof Date ? input : new Date(input)
    if (isNaN(d.getTime())) return '—'
    const t = d.toLocaleTimeString('en-US', {
      timeZone: ET_TZ,
      hour:   '2-digit',
      minute: '2-digit',
      ...(seconds ? { second: '2-digit' } : {}),
      hour12: false,
    })
    return tz ? `${t} ${etAbbr(d)}` : t
  } catch { return '—' }
}

/** "May 25, 14:32 EDT" — date + 24h time + tz abbrev. */
export function fmtETDateTime(input: Date | string | number | null | undefined, opts?: { seconds?: boolean; tz?: boolean; year?: boolean }): string {
  if (input == null || input === '') return '—'
  const seconds = opts?.seconds ?? false
  const tz      = opts?.tz      ?? true
  const year    = opts?.year    ?? false
  try {
    const d = input instanceof Date ? input : new Date(input)
    if (isNaN(d.getTime())) return '—'
    const date = d.toLocaleDateString('en-US', {
      timeZone: ET_TZ, month: 'short', day: 'numeric',
      ...(year ? { year: 'numeric' } : {}),
    })
    const time = d.toLocaleTimeString('en-US', {
      timeZone: ET_TZ, hour: '2-digit', minute: '2-digit',
      ...(seconds ? { second: '2-digit' } : {}),
      hour12: false,
    })
    return tz ? `${date} ${time} ${etAbbr(d)}` : `${date} ${time}`
  } catch { return '—' }
}

/** "May 25" or "May 25, 2026" — date only in ET. */
export function fmtETDate(input: Date | string | number | null | undefined, opts?: { year?: boolean }): string {
  if (input == null || input === '') return '—'
  const year = opts?.year ?? false
  try {
    const d = input instanceof Date ? input : new Date(input)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-US', {
      timeZone: ET_TZ, month: 'short', day: 'numeric',
      ...(year ? { year: 'numeric' } : {}),
    })
  } catch { return '—' }
}