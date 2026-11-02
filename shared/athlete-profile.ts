import type { Activity, Lap } from './types.js'
import { analyzeFormBreakdown, type FormBreakdownResult } from './form-analysis.js'
import { metricNumber } from './progress.js'
import { DEFAULT_FITNESS_PROFILE, equivalentTime, parseRaceTime, thresholdTarget, type FitnessProfile } from './planner.js'

export type ProfileConfidence = 'low' | 'medium' | 'high'
export type ChangeState = 'improved' | 'regressed' | 'mixed' | 'similar' | 'insufficient'
export type IntensityAnchorId = 'mile' | '3k' | '5k' | '8k' | 'threshold' | 'easy' | 'recovery'
export type ExposureBand = 'all' | 'short' | 'medium' | 'long' | 'extended'

export interface LearnedMechanics {
  groundContactMs?: number
  groundContactBalancePct?: number
  verticalRatioPct?: number
  verticalOscillationMm?: number
  cadenceSpm?: number
  strideLengthM?: number
}
export interface MechanicChange {
  key: keyof LearnedMechanics; label: string; latest?: number; established?: number; changePct?: number
  direction: 'favorable' | 'adverse' | 'similar' | 'context'
}
export interface AnchorSummary {
  id: IntensityAnchorId; label: string; targetPaceSecPerM?: number; targetTimeS?: number; reps: number; workouts: number
}
export interface AthleteTrendPoint extends LearnedMechanics {
  activityId: string; activityName: string; localDate: string; dateValue: number; reps: number; medianDurationS: number
  paceSecPerM: number; distanceM?: number; stablePct?: number; driftOnsetPct?: number; legsFeel?: number
  rolling: LearnedMechanics & { paceSecPerM?: number; stablePct?: number; driftOnsetPct?: number }
  baselineWorkouts: number; baselineReps: number
}
export interface AthleteComparison {
  anchorId: IntensityAnchorId; anchorLabel: string; exposureBand: ExposureBand; windowWeeks: number
  latestWorkoutDate?: string; latestWorkoutName?: string; latestReps: number; baselineReps: number; baselineWorkouts: number
  latestMechanics: LearnedMechanics; baselineMechanics: LearnedMechanics; changes: MechanicChange[]
  changeState: ChangeState; confidence: 'none' | 'low' | 'medium' | 'high'; summary: string
}
export interface LearnedAthleteProfile {
  generatedAt: string; dateFrom?: string; dateTo?: string; runningActivities: number; intervalWorkouts: number; reps: number; assessedReps: number
  anchors: AnchorSummary[]; selectedAnchorId: IntensityAnchorId; selectedExposureBand: ExposureBand; windowWeeks: number
  comparison: AthleteComparison; trend: AthleteTrendPoint[]
  lifestyle: { collection: 'not_collected'; influence: 'none'; explanation: string }
  limitations: string[]
}
export interface FitnessProfileSnapshot { effectiveDate: string; profile: FitnessProfile }
export interface AthleteProfileOptions { now?: Date; fitnessProfile?: FitnessProfile; fitnessHistory?: FitnessProfileSnapshot[]; anchorId?: IntensityAnchorId; exposureBand?: ExposureBand; windowWeeks?: number }

type RepObservation = {
  activityId: string; activityName: string; localDate: string; dateMs: number; surface: string; legsFeel?: number
  paceSecPerM: number; anchorId: IntensityAnchorId; exposure: Exclude<ExposureBand, 'all'>; lap: Lap; result?: FormBreakdownResult
}
type SessionObservation = {
  activityId: string; activityName: string; localDate: string; dateMs: number; reps: number; medianDurationS: number; paceSecPerM: number
  distanceM?: number; mechanics: LearnedMechanics; stablePct?: number; driftOnsetPct?: number; legsFeel?: number
}

const DAY_MS = 86_400_000
const anchorSpecs: Array<{ id: Exclude<IntensityAnchorId, 'threshold'>; label: string; distanceM: number }> = [
  { id: 'mile', label: 'Mile pace', distanceM: 1609.344 }, { id: '3k', label: '3K pace', distanceM: 3000 },
  { id: '5k', label: '5K pace', distanceM: 5000 }, { id: '8k', label: '8K pace', distanceM: 8000 },
]
const metricDefinitions: Array<{ key: keyof LearnedMechanics; label: string; role: 'primary' | 'context' }> = [
  { key: 'groundContactMs', label: 'Ground contact', role: 'primary' }, { key: 'verticalRatioPct', label: 'Vertical ratio', role: 'primary' },
  { key: 'verticalOscillationMm', label: 'Vertical oscillation', role: 'primary' }, { key: 'groundContactBalancePct', label: 'GCT balance', role: 'primary' },
  { key: 'cadenceSpm', label: 'Cadence', role: 'context' }, { key: 'strideLengthM', label: 'Stride length', role: 'context' },
]
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const median = (values: Array<number | undefined>) => { const sorted=values.filter(finite).sort((a,b)=>a-b); if(!sorted.length)return undefined;const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2 }
const rounded = (value: number | undefined, places=1) => value==null?undefined:Number(value.toFixed(places))
function validProfile(profile?:FitnessProfile):FitnessProfile { return profile?.prs?.length&&profile.current?.length?profile:DEFAULT_FITNESS_PROFILE }
function profileAt(date:string,current:FitnessProfile,history:FitnessProfileSnapshot[]){const valid=history.filter(row=>row?.effectiveDate&&row?.profile).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));return valid.filter(row=>row.effectiveDate<=date).at(-1)?.profile??valid[0]?.profile??current}
function currentMarks(profile:FitnessProfile){const rows=profile.current.map(mark=>({...mark,timeS:parseRaceTime(mark.time)})).filter(mark=>mark.distanceM>0&&finite(mark.timeS)&&mark.timeS>0);return rows.length?rows:DEFAULT_FITNESS_PROFILE.current.map(mark=>({...mark,timeS:parseRaceTime(mark.time)}))}
function raceAnchorPace(profile:FitnessProfile,distanceM:number){return median(currentMarks(profile).map(mark=>equivalentTime(mark.distanceM,mark.timeS,distanceM,profile.prs).timeS/distanceM))!}
function thresholdPace(profile:FitnessProfile,durationS:number){return median(currentMarks(profile).map(mark=>thresholdTarget(mark.distanceM,mark.timeS,Math.max(1,durationS/60),profile.prs).paceSecPerKm/1000))!}
function anchorTargets(profile:FitnessProfile):AnchorSummary[]{return [...anchorSpecs.map(spec=>{const pace=raceAnchorPace(profile,spec.distanceM);return{id:spec.id,label:spec.label,targetPaceSecPerM:pace,targetTimeS:pace*spec.distanceM,reps:0,workouts:0}}),{id:'threshold',label:'Sub-threshold',targetPaceSecPerM:thresholdPace(profile,360),reps:0,workouts:0}]}
function classifyAnchor(profile:FitnessProfile,paceSecPerM:number,durationS:number):IntensityAnchorId {const choices=[...anchorSpecs.map(spec=>({id:spec.id as IntensityAnchorId,pace:raceAnchorPace(profile,spec.distanceM)})),{id:'threshold' as const,pace:thresholdPace(profile,durationS)}];return choices.sort((a,b)=>Math.abs(Math.log(paceSecPerM/a.pace))-Math.abs(Math.log(paceSecPerM/b.pace)))[0].id}
function exposureFor(seconds:number):Exclude<ExposureBand,'all'>{if(seconds<60)return'short';if(seconds<180)return'medium';if(seconds<360)return'long';return'extended'}
function rawMechanic(observation:RepObservation,key:keyof LearnedMechanics){const lap=observation.lap;if(key==='groundContactMs')return metricNumber(lap,'stance_time');if(key==='groundContactBalancePct')return metricNumber(lap,'stance_time_balance');if(key==='verticalRatioPct')return metricNumber(lap,'vertical_ratio');if(key==='verticalOscillationMm')return metricNumber(lap,'vertical_oscillation');if(key==='cadenceSpm')return lap.avg_cadence??metricNumber(lap,'cadence');const mm=metricNumber(lap,'step_length');return mm==null?undefined:mm/1000}
function mechanics(observations:RepObservation[]):LearnedMechanics{return Object.fromEntries(metricDefinitions.map(definition=>[definition.key,rounded(median(observations.map(observation=>rawMechanic(observation,definition.key))),definition.key==='strideLengthM'?2:1)]))}
function activityMechanics(activity:Activity):LearnedMechanics{const series=activity.series||[],summary=activity.metrics||{};const value=(key:string)=>{const direct=summary[key];return finite(direct)?direct:median(series.map(point=>(point as any)[key]))};const step=value('step_length');return{groundContactMs:rounded(value('stance_time')),groundContactBalancePct:rounded(value('stance_time_balance')),verticalRatioPct:rounded(value('vertical_ratio')),verticalOscillationMm:rounded(value('vertical_oscillation')),cadenceSpm:rounded(activity.avg_cadence??value('cadence')),strideLengthM:rounded(step==null?undefined:step/1000,2)}}
function sessionRows(rows:RepObservation[]):SessionObservation[]{const ids=[...new Set(rows.map(row=>row.activityId))];return ids.map(id=>{const reps=rows.filter(row=>row.activityId===id),assessed=reps.filter(row=>row.result&&!['insufficient','too_short'].includes(row.result.status)),changed=assessed.filter(row=>['drift','breakdown'].includes(row.result!.status));return{activityId:id,activityName:reps[0].activityName,localDate:reps[0].localDate,dateMs:reps[0].dateMs,reps:reps.length,medianDurationS:median(reps.map(row=>row.lap.duration_s))||0,paceSecPerM:median(reps.map(row=>row.paceSecPerM))||0,mechanics:mechanics(reps),stablePct:assessed.length?rounded(100*assessed.filter(row=>row.result?.status==='stable').length/assessed.length,0):undefined,driftOnsetPct:rounded(median(changed.map(row=>row.result?.changePercentOfRep)),0),legsFeel:reps[0].legsFeel}}).sort((a,b)=>a.dateMs-b.dateMs)}
function aggregateSessions(rows:SessionObservation[]):LearnedMechanics{return Object.fromEntries(metricDefinitions.map(definition=>[definition.key,rounded(median(rows.map(row=>row.mechanics[definition.key])),definition.key==='strideLengthM'?2:1)]))}
function mechanicChanges(latest:LearnedMechanics,baseline:LearnedMechanics):MechanicChange[]{return metricDefinitions.map(definition=>{const latestValue=latest[definition.key],establishedValue=baseline[definition.key];if(!finite(latestValue)||!finite(establishedValue)||!establishedValue)return{key:definition.key,label:definition.label,latest:latestValue,established:establishedValue,direction:definition.role==='context'?'context':'similar'};let changePct=100*(establishedValue-latestValue)/establishedValue;if(definition.key==='groundContactBalancePct')changePct=100*(Math.abs(establishedValue-50)-Math.abs(latestValue-50))/Math.max(.5,Math.abs(establishedValue-50));return{key:definition.key,label:definition.label,latest:latestValue,established:establishedValue,changePct:rounded(changePct),direction:definition.role==='context'?'context':changePct>=2?'favorable':changePct<=-2?'adverse':'similar'}})}
function changeState(changes:MechanicChange[]):ChangeState{const usable=changes.filter(change=>finite(change.changePct)&&change.direction!=='context');if(!usable.length)return'insufficient';const favorable=usable.filter(change=>change.direction==='favorable').length,adverse=usable.filter(change=>change.direction==='adverse').length;if(favorable>=2&&!adverse)return'improved';if(adverse>=2&&!favorable)return'regressed';if(favorable&&adverse)return'mixed';return'similar'}
function comparisonSummary(latest:SessionObservation|undefined,prior:SessionObservation[],state:ChangeState,changes:MechanicChange[],weeks:number,aerobic=false){if(!latest)return aerobic?'No runs match this recovery selection.':'No reps match this intensity and duration selection.';if(!prior.length)return`No earlier matching workout falls inside the previous ${weeks} weeks.`;const evidenceCount=prior.reduce((sum,row)=>sum+row.reps,0),evidenceLabel=`${evidenceCount} prior ${aerobic?`run${evidenceCount===1?'':'s'}`:'reps'}`;if(state==='insufficient')return`${evidenceLabel} were found, but the latest and baseline do not share a recorded mechanics metric.`;const strongest=changes.filter(change=>change.direction==='favorable'||change.direction==='adverse').sort((a,b)=>Math.abs(b.changePct||0)-Math.abs(a.changePct||0)).slice(0,2);const evidence=strongest.map(change=>`${change.label} ${Math.abs(change.changePct||0).toFixed(1)}% ${change.direction==='favorable'?'better':'worse'}`).join(' · ');const prefix=state==='similar'?'Mechanics were similar to baseline':state==='mixed'?'Mechanics moved in mixed directions':state==='improved'?'Mechanics improved versus baseline':'Mechanics regressed versus baseline';return`${prefix}${evidence?`: ${evidence}`:''}. Based on ${evidenceLabel} from ${prior.length} workout${prior.length===1?'':'s'}.`}

export function buildAthleteProfile(activities:Activity[],options:AthleteProfileOptions|Date={}):LearnedAthleteProfile{
  const opts=options instanceof Date?{now:options}:options,now=opts.now??new Date(),currentProfile=validProfile(opts.fitnessProfile),history=opts.fitnessHistory??[],running=activities.filter(activity=>activity.sport.toLowerCase().includes('run')),observations:RepObservation[]=[];let intervalWorkouts=0
  for(const activity of running){const reps=(activity.laps||[]).filter(lap=>lap.is_rep&&lap.distance_m>0&&lap.duration_s>0);if(!reps.length)continue;intervalWorkouts++;const results=analyzeFormBreakdown(activity.raw_fit_json,activity.laps||[]),byLap=new Map(results.map(result=>[result.lapIndex,result])),dateMs=new Date(activity.start_time||`${activity.local_date}T12:00:00`).getTime(),datedProfile=validProfile(profileAt(activity.local_date,currentProfile,history));for(const lap of reps){const paceSecPerM=byLap.get(lap.idx)?.paceSecPerM??lap.duration_s/lap.distance_m;observations.push({activityId:activity.id,activityName:activity.name,localDate:activity.local_date,dateMs,surface:activity.surface,legsFeel:activity.legs_feel,paceSecPerM,anchorId:classifyAnchor(datedProfile,paceSecPerM,lap.duration_s),exposure:exposureFor(lap.duration_s),lap,result:byLap.get(lap.idx)})}}
  const aerobicSessions:Record<'easy'|'recovery',SessionObservation[]>={easy:[],recovery:[]};for(const activity of running){const key=activity.workout_type==='Easy'?'easy':activity.workout_type==='Recovery'?'recovery':undefined;if(!key||!activity.distance_m||!activity.duration_s)continue;aerobicSessions[key].push({activityId:activity.id,activityName:activity.name,localDate:activity.local_date,dateMs:new Date(activity.start_time||`${activity.local_date}T12:00:00`).getTime(),reps:1,medianDurationS:activity.duration_s,paceSecPerM:activity.duration_s/activity.distance_m,distanceM:activity.distance_m,mechanics:activityMechanics(activity),legsFeel:activity.legs_feel})}aerobicSessions.easy.sort((a,b)=>a.dateMs-b.dateMs);aerobicSessions.recovery.sort((a,b)=>a.dateMs-b.dateMs)
  const anchors=[...anchorTargets(currentProfile).map(anchor=>{const rows=observations.filter(row=>row.anchorId===anchor.id);return{...anchor,reps:rows.length,workouts:new Set(rows.map(row=>row.activityId)).size}}),{id:'easy' as const,label:'Easy',reps:aerobicSessions.easy.length,workouts:aerobicSessions.easy.length},{id:'recovery' as const,label:'Recovery',reps:aerobicSessions.recovery.length,workouts:aerobicSessions.recovery.length}]
  const requested=opts.anchorId,selectedAnchorId=requested&&anchors.some(anchor=>anchor.id===requested)?requested:(anchors.filter(anchor=>!['easy','recovery'].includes(anchor.id)).slice().sort((a,b)=>b.reps-a.reps)[0]?.id??'3k'),isAerobic=selectedAnchorId==='easy'||selectedAnchorId==='recovery',selectedExposureBand=isAerobic?'all':opts.exposureBand??'all',windowWeeks=Math.min(52,Math.max(2,opts.windowWeeks??6)),selectedRows=observations.filter(row=>row.anchorId===selectedAnchorId&&(selectedExposureBand==='all'||row.exposure===selectedExposureBand)),sessions=isAerobic?aerobicSessions[selectedAnchorId]:sessionRows(selectedRows),latest=sessions.at(-1),windowMs=windowWeeks*7*DAY_MS
  const comparable=(row:SessionObservation,reference:SessionObservation)=>!isAerobic||(!row.distanceM||!reference.distanceM||Math.abs(row.distanceM/reference.distanceM-1)<=.2),baseline=latest?sessions.filter(row=>row.dateMs<latest.dateMs&&row.dateMs>=latest.dateMs-windowMs&&comparable(row,latest)):[],baselineMechanics=aggregateSessions(baseline),latestMechanics=latest?.mechanics??{},changes=mechanicChanges(latestMechanics,baselineMechanics),state=changeState(changes),baselineReps=baseline.reduce((sum,row)=>sum+row.reps,0),confidence:AthleteComparison['confidence']=!latest||!baseline.length||state==='insufficient'?'none':baseline.length>=4&&baselineReps>=12?'high':baseline.length>=2&&baselineReps>=6?'medium':'low'
  const trend:AthleteTrendPoint[]=sessions.map((session,index)=>{const prior=sessions.slice(0,index).filter(row=>row.dateMs>=session.dateMs-windowMs&&comparable(row,session)),rolling=aggregateSessions(prior);return{activityId:session.activityId,activityName:session.activityName,localDate:session.localDate,dateValue:session.dateMs,reps:session.reps,medianDurationS:session.medianDurationS,paceSecPerM:session.paceSecPerM,distanceM:session.distanceM,stablePct:session.stablePct,driftOnsetPct:session.driftOnsetPct,legsFeel:session.legsFeel,...session.mechanics,rolling:{...rolling,paceSecPerM:rounded(median(prior.map(row=>row.paceSecPerM)),4),stablePct:rounded(median(prior.map(row=>row.stablePct)),0),driftOnsetPct:rounded(median(prior.map(row=>row.driftOnsetPct)),0)},baselineWorkouts:prior.length,baselineReps:prior.reduce((sum,row)=>sum+row.reps,0)}})
  const dates=running.map(activity=>activity.local_date).filter(Boolean).sort(),assessed=observations.filter(row=>row.result&&!['insufficient','too_short'].includes(row.result.status)),limitations:string[]=[];if(!observations.length)limitations.push('No interval reps are flagged yet. Mark reps in the Log to begin learning.');if(!assessed.length)limitations.push('No reps have enough full-resolution running-dynamics data for form assessment yet.');if(Object.values(mechanics(observations)).filter(finite).length<3)limitations.push('Most imported reps are missing running-dynamics fields; compatible Garmin sensors can add them.')
  return{generatedAt:now.toISOString(),dateFrom:dates[0],dateTo:dates.at(-1),runningActivities:running.length,intervalWorkouts,reps:observations.length,assessedReps:assessed.length,anchors,selectedAnchorId,selectedExposureBand,windowWeeks,comparison:{anchorId:selectedAnchorId,anchorLabel:anchors.find(anchor=>anchor.id===selectedAnchorId)?.label??selectedAnchorId,exposureBand:selectedExposureBand,windowWeeks,latestWorkoutDate:latest?.localDate,latestWorkoutName:latest?.activityName,latestReps:latest?.reps??0,baselineReps,baselineWorkouts:baseline.length,latestMechanics,baselineMechanics,changes,changeState:state,confidence,summary:comparisonSummary(latest,baseline,state,changes,windowWeeks,isAerobic)},trend,lifestyle:{collection:'not_collected',influence:'none',explanation:'Lifestyle data is not currently collected or used, so missing watch wear, sleep, HRV, and resting heart rate cannot change this profile or a workout recommendation.'},limitations}
}
