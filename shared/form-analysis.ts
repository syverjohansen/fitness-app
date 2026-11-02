export interface FormSignal {
  key: string
  label: string
  family: 'contact' | 'gait' | 'vertical' | 'cost'
  changePercent: number
  thresholdPercent: number
}

export interface FormBreakdownResult {
  lapIndex: number
  repNumber: number
  durationS: number
  paceSecPerM: number
  breakdownAtS?: number
  driftAtS?: number
  changePercentOfRep?: number
  status: 'insufficient' | 'too_short' | 'stable' | 'drift' | 'breakdown'
  startStatus: 'reference' | 'insufficient' | 'fresh' | 'drift' | 'degraded'
  startSignals: FormSignal[]
  freshReferenceReps: number[]
  confidence: 'low' | 'medium' | 'high'
  signals: FormSignal[]
  availableMetrics: number
  availableFamilies: number
  sustainedSeconds: number
  paceAdjusted: boolean
  repGroup: 'short' | 'medium' | 'long'
  repSet: number
  terrainWindowsExcluded: number
}

type RawRecord = {
  timestamp?: string
  enhanced_speed?: number
  speed?: number
  heart_rate?: number
  cadence?: number
  power?: number
  stance_time?: number
  stance_time_balance?: number
  step_length?: number
  vertical_oscillation?: number
  vertical_ratio?: number
  temperature?: number
  enhanced_respiration_rate?: number
  respiration_rate?: number
  distance?: number
  enhanced_altitude?: number
  altitude?: number
}
type MetricKey = 'stance_time' | 'cadence' | 'step_length' | 'vertical_ratio' | 'vertical_oscillation' | 'power_cost'
type Window = { start: number; grade?: number; values: Record<MetricKey | 'speed', number> }
type RepGroup = FormBreakdownResult['repGroup']
type RepContext = { lap: { idx: number; is_rep: number; distance_m: number; duration_s: number }; repNumber: number; group: RepGroup; set: number; durationS: number; startMs: number; endMs: number; windows: Window[]; baseline: Window[] }
type ReferenceModel = { predict: (speed: number) => number; threshold: number; paceAdjusted: boolean }

export interface RepMetricWindow {
  start_s: number
  end_s: number
  percent_of_rep: number
  distance_into_rep_m?: number
  pace_s_per_km?: number
  speed_m_s?: number
  heart_rate_bpm?: number
  cadence_spm?: number
  power_w?: number
  ground_contact_ms?: number
  ground_contact_balance_percent?: number
  stride_length_mm?: number
  vertical_oscillation_mm?: number
  vertical_ratio_percent?: number
  altitude_m?: number
  grade_percent?: number
  temperature_c?: number
  respiration_rate_bpm?: number
}

export interface RepMetricTimeline { rep_number?: number; lap_index: number; duration_s: number; distance_m: number; windows: RepMetricWindow[] }

const definitions: ReadonlyArray<{ key: MetricKey; label: string; family: FormSignal['family']; direction: 'up' | 'down'; threshold: number }> = [
  { key: 'stance_time', label: 'Ground contact time', family: 'contact', direction: 'up', threshold: .05 },
  { key: 'cadence', label: 'Cadence', family: 'gait', direction: 'down', threshold: .02 },
  { key: 'step_length', label: 'Stride length', family: 'gait', direction: 'down', threshold: .04 },
  { key: 'vertical_ratio', label: 'Vertical ratio', family: 'vertical', direction: 'up', threshold: .05 },
  { key: 'vertical_oscillation', label: 'Vertical oscillation', family: 'vertical', direction: 'up', threshold: .05 },
  { key: 'power_cost', label: 'Power cost at pace', family: 'cost', direction: 'up', threshold: .05 },
]
const STEEP_GRADE_PERCENT = 2.5

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return NaN
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const mad = (values: number[]) => {
  const center = median(values)
  return Number.isFinite(center) ? median(values.map(value => Math.abs(value - center))) : NaN
}

function recordValue(record: RawRecord, key: MetricKey | 'speed') {
  const speed = record.enhanced_speed ?? record.speed
  if (key === 'speed') return finite(speed) && speed > 0 ? speed : undefined
  if (key === 'power_cost') return finite(record.power) && finite(speed) && speed > 0 ? record.power / speed : undefined
  const value = record[key]
  return finite(value) ? value : undefined
}

function makeWindows(records: RawRecord[], startMs: number, endMs: number): Window[] {
  const buckets = new Map<number, RawRecord[]>()
  for (const record of records) {
    const timestamp = record.timestamp ? new Date(record.timestamp).getTime() : NaN
    if (!Number.isFinite(timestamp) || timestamp < startMs || timestamp > endMs) continue
    const bucket = Math.floor((timestamp - startMs) / 10000)
    if (!buckets.has(bucket)) buckets.set(bucket, [])
    buckets.get(bucket)!.push(record)
  }
  const keys: Array<MetricKey | 'speed'> = ['speed', ...definitions.map(definition => definition.key)]
  return [...buckets].sort((a, b) => a[0] - b[0]).map(([bucket, items]) => {
    const withTerrain = items.filter(item => finite(item.distance) && finite(item.enhanced_altitude ?? item.altitude))
    const first = withTerrain[0], last = withTerrain[withTerrain.length - 1]
    const distanceChange = first && last ? last.distance! - first.distance! : NaN
    const altitudeChange = first && last ? (last.enhanced_altitude ?? last.altitude)! - (first.enhanced_altitude ?? first.altitude)! : NaN
    const grade = Number.isFinite(distanceChange) && distanceChange > 20 ? 100 * altitudeChange / distanceChange : undefined
    return { start: bucket * 10, grade, values: Object.fromEntries(keys.map(key => [key, median(items.map(item => recordValue(item, key)).filter(finite))])) as Window['values'] }
  })
}

function buildMetricTimelines(raw:any,selected:Array<{lap:{idx:number;is_rep:number;distance_m:number;duration_s:number};repNumber?:number}>,cadenceMultiplier:number):RepMetricTimeline[]{
  const records=(raw?.records||[]) as RawRecord[],rawLaps=raw?.laps||[]
  return selected.map(({lap,repNumber})=>{
    const rawLap=rawLaps[lap.idx-1]||{},startMs=new Date(rawLap.start_time||'').getTime(),durationS=Number(rawLap.total_timer_time)||lap.duration_s,endMs=startMs+durationS*1000
    const repRecords=records.filter(record=>{const timestamp=record.timestamp?new Date(record.timestamp).getTime():NaN;return Number.isFinite(timestamp)&&timestamp>=startMs&&timestamp<endMs})
    const firstDistance=repRecords.find(record=>finite(record.distance))?.distance
    const buckets=new Map<number,RawRecord[]>();for(const record of repRecords){const timestamp=new Date(record.timestamp!).getTime(),bucket=Math.floor((timestamp-startMs)/10000);if(!buckets.has(bucket))buckets.set(bucket,[]);buckets.get(bucket)!.push(record)}
    const value=(items:RawRecord[],get:(record:RawRecord)=>unknown)=>{const result=median(items.map(get).filter(finite));return finite(result)?result:undefined}
    const windows=[...buckets].sort((a,b)=>a[0]-b[0]).map(([bucket,items])=>{
      const speed=value(items,item=>item.enhanced_speed??item.speed),distance=value(items,item=>item.distance),terrain=items.filter(item=>finite(item.distance)&&finite(item.enhanced_altitude??item.altitude)),first=terrain[0],last=terrain[terrain.length-1],distanceChange=first&&last?last.distance!-first.distance!:NaN,altitudeChange=first&&last?(last.enhanced_altitude??last.altitude)!-(first.enhanced_altitude??first.altitude)!:NaN,grade=Number.isFinite(distanceChange)&&distanceChange>20?100*altitudeChange/distanceChange:value(items,item=>(item as any).grade)
      const window:RepMetricWindow={start_s:bucket*10,end_s:Math.min(durationS,(bucket+1)*10),percent_of_rep:Number((100*bucket*10/durationS).toFixed(1)),distance_into_rep_m:finite(distance)&&finite(firstDistance)?Number((distance-firstDistance).toFixed(1)):undefined,pace_s_per_km:finite(speed)&&speed>0?Number((1000/speed).toFixed(1)):undefined,speed_m_s:finite(speed)?Number(speed.toFixed(3)):undefined,heart_rate_bpm:value(items,item=>item.heart_rate),cadence_spm:(()=>{const cadence=value(items,item=>item.cadence);return finite(cadence)?Number((cadence*cadenceMultiplier).toFixed(1)):undefined})(),power_w:value(items,item=>item.power),ground_contact_ms:value(items,item=>item.stance_time),ground_contact_balance_percent:value(items,item=>item.stance_time_balance),stride_length_mm:value(items,item=>item.step_length),vertical_oscillation_mm:value(items,item=>item.vertical_oscillation),vertical_ratio_percent:value(items,item=>item.vertical_ratio),altitude_m:value(items,item=>item.enhanced_altitude??item.altitude),grade_percent:finite(grade)?Number(grade.toFixed(2)):undefined,temperature_c:value(items,item=>item.temperature),respiration_rate_bpm:value(items,item=>item.enhanced_respiration_rate??item.respiration_rate)}
      return window
    })
    return{rep_number:repNumber,lap_index:lap.idx,duration_s:durationS,distance_m:lap.distance_m,windows}
  })
}

/** Compact 10-second evidence for explaining what happened inside an individual rep. */
export function buildRepMetricTimelines(raw:any,laps:Array<{idx:number;is_rep:number;distance_m:number;duration_s:number}>,cadenceMultiplier=1):RepMetricTimeline[]{
  return buildMetricTimelines(raw,laps.filter(lap=>lap.is_rep).map((lap,index)=>({lap,repNumber:index+1})),cadenceMultiplier)
}

/** Compact 10-second evidence for an ordinary Garmin lap, including a race-length lap. */
export function buildLapMetricTimelines(raw:any,laps:Array<{idx:number;is_rep:number;distance_m:number;duration_s:number}>,lapIndexes:number[],cadenceMultiplier=1):RepMetricTimeline[]{
  const wanted=new Set(lapIndexes)
  return buildMetricTimelines(raw,laps.filter(lap=>wanted.has(lap.idx)).map(lap=>({lap})),cadenceMultiplier)
}

const terrainComparable = (window: Window) => !finite(window.grade) || Math.abs(window.grade) < STEEP_GRADE_PERCENT

function fitReference(reference: Window[], key: MetricKey, fixedThreshold: number): ReferenceModel | undefined {
  const points = reference.map(window => ({ x: window.values.speed, y: window.values[key] })).filter(point => finite(point.x) && finite(point.y) && point.x > 0 && point.y > 0)
  if (points.length < 2) return undefined
  const center = median(points.map(point => point.y))
  const speedCenter = median(points.map(point => point.x))
  const speedRange = Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x))
  const canAdjust = points.length >= 6 && speedRange / speedCenter >= .06
  let slope = 0
  if (canAdjust) {
    const denominator = points.reduce((sum, point) => sum + (point.x - speedCenter) ** 2, 0)
    slope = denominator ? points.reduce((sum, point) => sum + (point.x - speedCenter) * (point.y - center), 0) / denominator : 0
  }
  const predict = (speed: number) => Math.max(Number.EPSILON, center + slope * (speed - speedCenter))
  const residuals = points.map(point => (point.y - predict(point.x)) / predict(point.x))
  const variabilityThreshold = 3 * 1.4826 * mad(residuals)
  return { predict, threshold: Math.max(fixedThreshold, Number.isFinite(variabilityThreshold) ? variabilityThreshold : 0), paceAdjusted: canAdjust }
}

function strongestByFamily(signals: FormSignal[]) {
  const strongest = new Map<FormSignal['family'], FormSignal>()
  for (const signal of signals) {
    const severity = Math.abs(signal.changePercent) / signal.thresholdPercent
    const existing = strongest.get(signal.family)
    if (!existing || severity > Math.abs(existing.changePercent) / existing.thresholdPercent) strongest.set(signal.family, signal)
  }
  return [...strongest.values()]
}

const repGroup = (durationS: number): RepGroup => durationS < 60 ? 'short' : durationS < 180 ? 'medium' : 'long'

function sustainedChange(evaluated: Array<{ window: Window; signals: FormSignal[] }>, requiredWindows: number, minimumFamilies: number) {
  for (let index = 0; index <= evaluated.length - requiredWindows; index++) {
    const run = evaluated.slice(index, index + requiredWindows)
    if (!run.every((item, runIndex) => runIndex === 0 || item.window.start - run[runIndex - 1].window.start === 10)) continue
    const sustainedFamilies = run[0].signals.map(signal => signal.family).filter(family => run.every(item => item.signals.some(signal => signal.family === family)))
    if (new Set(sustainedFamilies).size < minimumFamilies) continue
    return { window: run[0].window, signals: run[0].signals.filter(signal => sustainedFamilies.includes(signal.family)) }
  }
}

export function analyzeFormBreakdown(raw: any, laps: Array<{ idx: number; is_rep: number; distance_m: number; duration_s: number }>): FormBreakdownResult[] {
  const rawLaps = raw?.laps || []
  const records = (raw?.records || []) as RawRecord[]
  const contexts: RepContext[] = laps.filter(lap => lap.is_rep).map((lap, repNumber) => {
    const rawLap = rawLaps[lap.idx - 1] || {}
    const startMs = new Date(rawLap.start_time || '').getTime()
    const durationS = Number(rawLap.total_timer_time) || lap.duration_s
    const repWindows = makeWindows(records, startMs, startMs + durationS * 1000)
    const baselineEnd = Math.min(60, Math.max(30, durationS * .3))
    return { lap, repNumber: repNumber + 1, group: repGroup(durationS), set: 0, durationS, startMs, endMs: startMs + durationS * 1000, windows: repWindows, baseline: repWindows.filter(window => window.start >= 10 && window.start < baselineEnd) }
  })
  let setNumber = 0
  let previous: RepContext | undefined
  for (const context of contexts) {
    const durationRatio = previous ? context.durationS / previous.durationS : 1
    const paceRatio = previous ? (context.durationS / context.lap.distance_m) / (previous.durationS / previous.lap.distance_m) : 1
    if (!previous || context.group !== previous.group || durationRatio < .67 || durationRatio > 1.5 || paceRatio < .8 || paceRatio > 1.25) setNumber++
    context.set = setNumber
    previous = context
  }
  const freshModelsBySet = new Map<number, Map<MetricKey, ReferenceModel>>()
  const anchorsBySet = new Map<number, RepContext[]>()
  for (const currentSet of new Set(contexts.map(context => context.set))) {
    const setContexts = contexts.filter(context => context.set === currentSet)
    const anchors = setContexts.slice(0, Math.min(2, setContexts.length))
    anchorsBySet.set(currentSet, anchors)
    const referenceWindows = anchors.flatMap(context => context.baseline).filter(terrainComparable)
    const models = new Map<MetricKey, ReferenceModel>()
    for (const definition of definitions) {
      const model = fitReference(referenceWindows, definition.key, definition.threshold)
      if (model) models.set(definition.key, model)
    }
    freshModelsBySet.set(currentSet, models)
  }
  const withinModelsBySet = new Map<number, Map<MetricKey, ReferenceModel>>()
  for (const currentSet of new Set(contexts.map(context => context.set))) {
    const referenceWindows = contexts.filter(context => context.set === currentSet).flatMap(context => context.baseline).filter(terrainComparable)
    const models = new Map<MetricKey, ReferenceModel>()
    for (const definition of definitions) {
      const model = fitReference(referenceWindows, definition.key, definition.threshold)
      if (model) models.set(definition.key, model)
    }
    withinModelsBySet.set(currentSet, models)
  }

  return contexts.map(context => {
    const freshModels = freshModelsBySet.get(context.set)!
    const models = withinModelsBySet.get(context.set)!
    const anchors = anchorsBySet.get(context.set)!
    const baselineEnd = context.baseline.length ? Math.max(...context.baseline.map(window => window.start)) + 10 : 30
    const detectionStart = Math.max(baselineEnd + 20, context.durationS * .4)
    const availableMetrics = definitions.filter(definition => models.has(definition.key)).length
    const availableFamilies = new Set(definitions.filter(definition => models.has(definition.key)).map(definition => definition.family)).size
    const availablePrimaryFamilies = new Set(definitions.filter(definition => definition.family !== 'gait' && models.has(definition.key)).map(definition => definition.family)).size
    const withinOffsets = new Map<MetricKey, number>()
    const startOffsets = new Map<MetricKey, number>()
    for (const definition of definitions) {
      const model = models.get(definition.key)
      if (model) {
        const ratios = context.baseline.filter(terrainComparable).map(window => {
          const value = window.values[definition.key], speed = window.values.speed
          return finite(value) && finite(speed) ? value / model.predict(speed) : NaN
        }).filter(finite)
        const offset = median(ratios)
        if (finite(offset)) withinOffsets.set(definition.key, offset)
      }
      const freshModel = freshModels.get(definition.key)
      if (!freshModel) continue
      const freshRatios = context.baseline.filter(terrainComparable).map(window => {
        const value = window.values[definition.key], speed = window.values.speed
        return finite(value) && finite(speed) ? value / freshModel.predict(speed) : NaN
      }).filter(finite)
      const freshOffset = median(freshRatios)
      if (finite(freshOffset)) startOffsets.set(definition.key, freshOffset)
    }
    const startSignalsAt = (thresholdFactor: number) => strongestByFamily(definitions.flatMap(definition => {
      const model = freshModels.get(definition.key), offset = startOffsets.get(definition.key)
      if (!model || !finite(offset)) return []
      const change = offset - 1, threshold = model.threshold * thresholdFactor
      const triggered = definition.direction === 'up' ? change >= threshold : change <= -threshold
      return triggered ? [{ key: definition.key, label: definition.label, family: definition.family, changePercent: change * 100, thresholdPercent: threshold * 100 }] : []
    }))
    const startFullSignals = startSignalsAt(1), startWarningSignals = startSignalsAt(.6)
    const startFullPrimary = startFullSignals.filter(signal => signal.family !== 'gait')
    const startWarningPrimary = startWarningSignals.filter(signal => signal.family !== 'gait')
    const isFreshAnchor = anchors.includes(context)
    const startStatus: FormBreakdownResult['startStatus'] = isFreshAnchor ? 'reference' : availablePrimaryFamilies < 2 ? 'insufficient' : startFullPrimary.length >= 2 ? 'degraded' : startWarningPrimary.length >= 2 || startFullPrimary.length >= 1 ? 'drift' : 'fresh'
    const startSignals = startStatus === 'degraded' ? startFullPrimary : startStatus === 'drift' ? (startWarningPrimary.length >= 2 ? startWarningPrimary : startFullPrimary) : []
    const candidateWindows = context.windows.filter(window => window.start >= detectionStart)
    const terrainWindowsExcluded = candidateWindows.filter(window => !terrainComparable(window)).length
    const evaluate = (thresholdFactor: number) => candidateWindows.filter(terrainComparable).map(window => {
      const rawSignals = definitions.flatMap(definition => {
        const model = models.get(definition.key)
        const value = window.values[definition.key]
        const speed = window.values.speed
        if (!model || !finite(value) || !finite(speed)) return []
        const expected = model.predict(speed) * (withinOffsets.get(definition.key) ?? 1)
        const change = (value - expected) / expected
        const threshold = model.threshold * thresholdFactor
        const triggered = definition.direction === 'up' ? change >= threshold : change <= -threshold
        return triggered ? [{ key: definition.key, label: definition.label, family: definition.family, changePercent: change * 100, thresholdPercent: threshold * 100 }] : []
      })
      return { window, signals: strongestByFamily(rawSignals) }
    })
    const requiredWindows = context.durationS >= 120 ? 3 : 2
    const fullChanges = evaluate(1)
    const warningChanges = evaluate(.6)
    const primaryOnly = (items: typeof fullChanges) => items.map(item => ({ ...item, signals: item.signals.filter(signal => signal.family !== 'gait') }))
    const fullPrimaryChanges = primaryOnly(fullChanges), warningPrimaryChanges = primaryOnly(warningChanges)
    const detected = sustainedChange(fullPrimaryChanges, requiredWindows, 2)
    // Cadence and stride length are pacing context, not independent evidence of form failure.
    const driftDetected = detected || sustainedChange(warningPrimaryChanges, 2, 2) || sustainedChange(fullPrimaryChanges, 2, 1)
    const repRecords = records.filter(record => {
      const timestamp = record.timestamp ? new Date(record.timestamp).getTime() : NaN
      return timestamp >= context.startMs && timestamp <= context.endMs
    })
    const speed = median(repRecords.map(record => recordValue(record, 'speed')).filter(finite))
    const paceSecPerM = Number.isFinite(speed) && speed > 0 ? 1 / speed : context.lap.duration_s / context.lap.distance_m
    const paceAdjusted = [...models.values()].filter(model => model.paceAdjusted).length >= 2
    const confidence: FormBreakdownResult['confidence'] = availablePrimaryFamilies < 3 ? 'low' : paceAdjusted && detected && detected.signals.length >= 3 ? 'high' : 'medium'
    const status: FormBreakdownResult['status'] = availablePrimaryFamilies < 2 ? 'insufficient' : context.durationS < 60 ? 'too_short' : detected ? 'breakdown' : driftDetected ? 'drift' : 'stable'
    const changeAtS = detected?.window.start ?? driftDetected?.window.start
    const changePercentOfRep = changeAtS == null ? undefined : 100 * changeAtS / context.durationS
    return { lapIndex: context.lap.idx, repNumber: context.repNumber, durationS: context.lap.duration_s, paceSecPerM, breakdownAtS: detected?.window.start, driftAtS: driftDetected?.window.start, changePercentOfRep, status, startStatus, startSignals, freshReferenceReps: anchors.map(anchor => anchor.repNumber), confidence, signals: (detected || driftDetected)?.signals || [], availableMetrics, availableFamilies, sustainedSeconds: requiredWindows * 10, paceAdjusted, repGroup: context.group, repSet: context.set, terrainWindowsExcluded }
  })
}
