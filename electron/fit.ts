import fs from 'node:fs/promises'
import FitParser from 'fit-file-parser'
import { detectReps } from './rep-detection.js'
import type { Activity, Lap, SeriesPoint } from '../shared/types.js'

const finite = (n: unknown, fallback = 0) => typeof n === 'number' && Number.isFinite(n) ? n : fallback
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export async function parseFit(filePath: string, source = 'file', externalId?: string, hintedName?: string, typeKey?: string): Promise<Activity> {
  const parsed = await new FitParser({ mode: 'list', lengthUnit: 'm', speedUnit: 'm/s' }).parseAsync(await fs.readFile(filePath))
  const session = parsed.sessions?.[0]
  if (!session) throw new Error('No activity session was found in this FIT file.')
  const start = new Date(session.start_time)
  const sport = String(typeKey || session.sport || 'other').toLowerCase()
  const isRunning = sport.includes('running') || sport.includes('run')
  const cadenceMultiplier = isRunning ? 2 : 1
  const rawLaps: Lap[] = (parsed.laps || []).map((lap, idx) => ({
    idx: idx + 1, distance_m: finite(lap.total_distance), duration_s: finite(lap.total_timer_time || lap.total_elapsed_time),
    avg_hr: lap.avg_heart_rate, max_hr: lap.max_heart_rate, elev_gain_m: lap.total_ascent,
    avg_cadence: lap.avg_cadence == null ? undefined : lap.avg_cadence * cadenceMultiplier, intensity: String(lap.intensity || '').toLowerCase(), is_rep: 0,
    metrics: {
      power: lap.avg_power, max_power: lap.max_power, temperature: lap.avg_temperature, max_temperature: lap.max_temperature,
      vertical_oscillation: lap.avg_vertical_oscillation, stance_time: lap.avg_stance_time,
      stance_time_balance: lap.avg_stance_time_balance, vertical_ratio: lap.avg_vertical_ratio, step_length: lap.avg_step_length,
      grade: lap.avg_grade ?? (finite(lap.total_ascent) > 0 && finite(lap.total_distance) > 0 ? finite(lap.total_ascent) / finite(lap.total_distance) * 100 : undefined),
      positive_grade: lap.avg_pos_grade, max_positive_grade: lap.max_pos_grade,
    },
  }))
  const reps = new Set(isRunning ? detectReps(rawLaps) : []); rawLaps.forEach(l => { l.is_rep = reps.has(l.idx) ? 1 : 0 })
  const records = parsed.records || []
  const step = Math.max(1, Math.round(records.length / Math.max(1, finite(session.total_timer_time) / 10)))
  const firstTs = records[0]?.timestamp ? new Date(records[0].timestamp).getTime() : start.getTime()
  const series: SeriesPoint[] = records.filter((_, i) => i % step === 0 || i === records.length - 1).map(r => ({
    time: r.timestamp ? (new Date(r.timestamp).getTime() - firstTs) / 1000 : 0, distance: finite(r.distance), lat:r.position_lat,lon:r.position_long,hr: r.heart_rate,
    speed: r.enhanced_speed ?? r.speed, altitude: r.enhanced_altitude ?? r.altitude, grade: r.grade, cadence: r.cadence == null ? undefined : r.cadence * cadenceMultiplier,
    power: r.power, temperature: r.temperature, vertical_oscillation: r.vertical_oscillation, stance_time: r.stance_time,
    stance_time_balance: r.stance_time_balance, vertical_ratio: r.vertical_ratio, step_length: r.step_length,
  }))
  const alts = series.map(r => r.altitude).filter((n): n is number => typeof n === 'number')
  const sub = String(session.sub_sport || typeKey || '').toLowerCase()
  const surface = sub.includes('track') ? 'track' : sub.includes('trail') ? 'trail' : sub.includes('treadmill') || sub.includes('indoor') ? 'treadmill' : 'road'
  const id = externalId ? `garmin:${externalId}` : `file:${start.toISOString()}`
  return {
    id, source, start_time: start.toISOString(), local_date: localDate(start), name: hintedName || 'Untitled activity', sport,
    distance_m: finite(session.total_distance), duration_s: finite(session.total_timer_time || session.total_elapsed_time), avg_hr: session.avg_heart_rate,
    max_hr: session.max_heart_rate, elev_gain_m: session.total_ascent, elev_loss_m: session.total_descent,
    avg_cadence: session.avg_cadence == null ? undefined : session.avg_cadence * cadenceMultiplier, calories: session.total_calories,
    series, raw_summary: session as unknown as Record<string, unknown>,
    workout_type: isRunning ? (reps.size ? 'Intervals' : finite(session.total_distance) >= 16000 ? 'Long run' : 'Easy') : 'Other', type_source: 'auto', surface,
    altitude_m: alts.length ? alts.reduce((a, b) => a + b, 0) / alts.length : session.avg_altitude, shoes: '', tags: [], ai_summary: '', reps_source: 'auto', laps: rawLaps,
    metrics: {
      power: session.avg_power, max_power: session.max_power, temperature: session.avg_temperature, max_temperature: session.max_temperature,
      vertical_oscillation: session.avg_vertical_oscillation, stance_time: session.avg_stance_time,
      stance_time_balance: session.avg_stance_time_balance, vertical_ratio: session.avg_vertical_ratio, step_length: session.avg_step_length,
      respiration_rate: session.enhanced_avg_respiration_rate,
    },
    raw_fit_json: parsed as unknown as Record<string, unknown>, fit_file_path: filePath,
  }
}
