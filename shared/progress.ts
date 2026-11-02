import type { IntervalCategory, Lap } from './types.js'

const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Conservative fallback classification. A user-selected category always takes priority. */
export function inferIntervalCategory(name: string, workoutType: string, reps: Lap[]): IntervalCategory {
  const text = `${name} ${workoutType}`.toLowerCase()
  if (/\bhill(?:s|y)?\b|\buphill\b|\bincline\b/.test(text)) return 'hills'
  if (/sub[ -]?threshold|threshold|cruise interval|tempo interval/.test(text)) return 'sub_threshold'
  if (/marathon|half[ -]?marathon|\bhm\b|aerobic race/.test(text)) return 'aerobic_race_pace'
  const durations = reps.map(rep => rep.duration_s).filter(value => value > 0)
  if (!durations.length) return 'mixed'
  const shortest = Math.min(...durations), longest = Math.max(...durations), typical = median(durations)
  if (shortest <= 20 && longest > 120) return 'mixed'
  if (typical <= 20) return 'sprint'
  if (typical < 120) return 'speed'
  if (typical <= 360) return 'vo2'
  return 'aerobic_race_pace'
}

/** Categorize one work rep without losing an explicit session intent. */
export function inferRepCategory(sessionCategory: IntervalCategory, workoutType: string, rep: Lap): IntervalCategory {
  if (sessionCategory === 'hills' || workoutType === 'Hills') return 'hills'
  if (rep.duration_s <= 20) return 'sprint'
  if (rep.duration_s < 120) return 'speed'
  if (sessionCategory === 'vo2') return 'vo2'
  if (sessionCategory === 'sub_threshold') return 'sub_threshold'
  if (sessionCategory === 'aerobic_race_pace') return 'aerobic_race_pace'
  if (rep.duration_s <= 360) return 'vo2'
  return 'aerobic_race_pace'
}

export const metricNumber = (lap: Lap, ...keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = lap.metrics?.[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
}
