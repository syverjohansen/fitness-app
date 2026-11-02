import type { Lap } from '../shared/types.js'

export function repBucket(distance: number): number {
  return Math.round(distance / (distance < 1000 ? 50 : 100)) * (distance < 1000 ? 50 : 100)
}

export function detectReps(laps: Lap[]): number[] {
  const structured = laps.some(l => ['warmup', 'cooldown', 'rest', 'recovery'].includes((l.intensity || '').toLowerCase()))
  if (structured) return laps.filter(l => ['active', 'interval'].includes((l.intensity || '').toLowerCase())).map(l => l.idx)
  const usable = laps.filter(l => l.distance_m >= 50 && l.duration_s > 0)
  if (laps.length < 5 || usable.length < 5) return []
  const values = usable.map(l => l.duration_s / l.distance_m)
  let a = Math.min(...values), b = Math.max(...values)
  for (let n = 0; n < 20; n++) {
    const ga: number[] = [], gb: number[] = []
    values.forEach(v => (Math.abs(v - a) <= Math.abs(v - b) ? ga : gb).push(v))
    if (!ga.length || !gb.length) return []
    const na = ga.reduce((x, y) => x + y, 0) / ga.length
    const nb = gb.reduce((x, y) => x + y, 0) / gb.length
    if (Math.abs(na - a) + Math.abs(nb - b) < 0.000001) break
    a = na; b = nb
  }
  const fast = Math.min(a, b), slow = Math.max(a, b)
  if (fast > slow * .85) return []
  const reps = usable.filter((_, i) => Math.abs(values[i] - fast) <= Math.abs(values[i] - slow)).map(l => l.idx)
  return reps.length >= 3 ? reps : []
}
