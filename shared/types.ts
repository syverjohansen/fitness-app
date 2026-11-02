export const WORKOUT_TYPES = ['Easy', 'Recovery', 'Long run', 'Tempo', 'Threshold', 'Intervals', 'Fartlek', 'Hills', 'Progression', 'Race', 'Strides', 'Strength', 'Cross training', 'Mobility', 'Other'] as const
export type WorkoutType = typeof WORKOUT_TYPES[number]
export type Source = 'auto' | 'ai' | 'user'

export const INTERVAL_CATEGORIES = [
  ['sprint', 'Sprint'],
  ['speed', 'Speed'],
  ['vo2', 'VO₂'],
  ['sub_threshold', 'Sub-threshold'],
  ['aerobic_race_pace', 'Aerobic race pace'],
  ['hills', 'Hills'],
  ['mixed', 'Mixed / unclassified'],
] as const
export type IntervalCategory = typeof INTERVAL_CATEGORIES[number][0]

export interface SeriesPoint { time: number; distance: number; lat?: number; lon?: number; hr?: number; speed?: number; altitude?: number; grade?: number; cadence?: number; power?: number; temperature?: number; vertical_oscillation?: number; stance_time?: number; stance_time_balance?: number; vertical_ratio?: number; step_length?: number; respiration_rate?: number }
export interface GarminMetrics { power?: number; max_power?: number; temperature?: number; max_temperature?: number; vertical_oscillation?: number; stance_time?: number; stance_time_balance?: number; vertical_ratio?: number; step_length?: number; respiration_rate?: number; [key: string]: unknown }
export interface Lap { activity_id?: string; idx: number; distance_m: number; duration_s: number; avg_hr?: number; max_hr?: number; elev_gain_m?: number; avg_cadence?: number; intensity?: string; is_rep: number; metrics?: GarminMetrics }
export interface JournalEntry { id: number; activity_id?: string; cycle_id?: number; entry_date: string; body: string; created_at: string; updated_at: string }
export interface WorkoutChatMessage { id: number; activity_id: string; role: 'user' | 'assistant'; body: string; model?: string; created_at: string }
export interface StrengthExercise { id?:number; activity_id?:string; idx:number; exercise:string; tracking_type:'reps'|'timed'; sets?:number; reps?:number; duration_s?:number; weight_value?:number; weight_unit?:'lb'|'kg'; band_color?:string; notes?:string }
export interface Activity {
  id: string; source: string; start_time: string; local_date: string; name: string; sport: string
  name_source?: Source
  description?: string
  distance_m: number; duration_s: number; avg_hr?: number; max_hr?: number; elev_gain_m?: number; elev_loss_m?: number
  avg_cadence?: number; calories?: number; series: SeriesPoint[]; raw_summary: Record<string, unknown>
  workout_type: WorkoutType; type_source: Source; surface: string; altitude_m?: number; shoes: string; legs_feel?: number
  /** @deprecated Retained only to read older local databases. */ effort_rpe?: number
  tags: string[]; ai_summary: string; ai_json?: Record<string, unknown>; ai_model?: string; ai_at?: string
  reps_source: Source; interval_category?: IntervalCategory; interval_category_source?: Source; laps?: Lap[]; journal?: JournalEntry[]; rep_count?: number; has_journal?: number
  metrics?: GarminMetrics; raw_fit_json?: Record<string, unknown>; fit_file_path?: string; exercises?:StrengthExercise[]
}
export type ActivitySummary = Pick<Activity,
  'id' | 'source' | 'start_time' | 'local_date' | 'name' | 'name_source' | 'sport' | 'distance_m' | 'duration_s' |
  'avg_hr' | 'max_hr' | 'elev_gain_m' | 'elev_loss_m' | 'avg_cadence' | 'calories' | 'workout_type' |
  'type_source' | 'surface' | 'altitude_m' | 'shoes' | 'legs_feel' | 'ai_summary' | 'ai_model' | 'ai_at' |
  'reps_source' | 'interval_category' | 'interval_category_source' | 'rep_count' | 'has_journal'
>
export interface Cycle { id: number; name: string; kind: string; start_date: string; end_date?: string; goal: string; summary: string }
export interface PlannedWorkoutBlock { id?:number; planned_workout_id?:number; idx:number; reps:number; rep_type:'distance'|'time'; distance_m?:number; duration_s?:number; pace_anchor:'mile'|'3k'|'5k'|'8k'|'sub_threshold'|'marathon'|'easy'|'custom'; pace_offset_min_s_per_mile?:number; pace_offset_max_s_per_mile?:number; recovery_type:'time'|'distance'; recovery_s?:number; recovery_s_max?:number; recovery_m?:number; notes?:string }
export interface PlannedWorkout { id?:number; cycle_id:number; planned_date:string; name:string; purpose:string; notes:string; status:'planned'|'adjusted'|'completed'; adjustment_note?:string; completed_activity_id?:string; original_json?:string; created_at?:string; updated_at?:string; blocks:PlannedWorkoutBlock[] }
export interface DashboardData { activities: ActivitySummary[]; activityCount?: number; cycles: Cycle[]; settings: Record<string, string> }

export const CHANNELS = [
  'dashboard:get', 'activity:get', 'activity:update', 'activity:delete', 'lap:toggle',
  'journal:add', 'journal:update', 'journal:delete', 'cycles:list', 'cycle:save', 'cycle:delete', 'cycle:detail',
  'progress:get', 'similar:get', 'athlete-profile:get', 'recovery:get', 'settings:get', 'settings:set', 'settings:api-key', 'settings:has-api-key',
  'demo:load', 'demo:clear', 'import:files', 'import:paths', 'dialog:import', 'backup:export',
  'ai:analyze', 'garmin:sync', 'garmin:mfa', 'manual:create', 'manual:exercises-save',
  'planner:list', 'planner:save', 'planner:delete', 'planner:parse',
  'workout-chat:list', 'workout-chat:send', 'workout-chat:clear',
] as const
export type Channel = typeof CHANNELS[number]
