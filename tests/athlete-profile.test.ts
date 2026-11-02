import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAthleteProfile } from '../shared/athlete-profile.js'
import type { Activity, Lap } from '../shared/types.js'

function activity(id:string,date:string,paceSecondsPerMile:number,repCount=4,mechanics={stance:205,ratio:6.2,oscillation:82},durationS?:number):Activity{
  const laps:Lap[]=Array.from({length:repCount},(_,index)=>({idx:index+1,is_rep:1,distance_m:800,duration_s:durationS??paceSecondsPerMile/1609.344*800,avg_hr:190,avg_cadence:182,metrics:{stance_time:mechanics.stance+index,stance_time_balance:50.1,vertical_ratio:mechanics.ratio,vertical_oscillation:mechanics.oscillation,step_length:1540}}))
  return{id,source:'test',start_time:`${date}T12:00:00.000Z`,local_date:date,name:'Track reps',sport:'running',distance_m:5000,duration_s:1500,avg_hr:170,series:[],raw_summary:{},workout_type:'Intervals',type_source:'user',surface:'track',shoes:'',tags:[],ai_summary:'',reps_source:'user',laps}
}
function easy(id:string,date:string,distanceM:number,stance:number):Activity{return{id,source:'test',start_time:`${date}T12:00:00.000Z`,local_date:date,name:'Easy run',sport:'running',distance_m:distanceM,duration_s:distanceM*.29,series:[{time:0,distance:0,stance_time:stance,vertical_ratio:7,vertical_oscillation:90,cadence:174,step_length:1400},{time:100,distance:400,stance_time:stance+2,vertical_ratio:7.1,vertical_oscillation:91,cadence:173,step_length:1390}],raw_summary:{},workout_type:'Easy',type_source:'user',surface:'road',shoes:'',legs_feel:4,tags:[],ai_summary:'',reps_source:'user'}}

test('groups reps by personalized Planner anchors without exposing heart rate',()=>{
  const profile=buildAthleteProfile([activity('a','2026-10-01',320),activity('b','2026-10-08',320)],{now:new Date('2026-10-09T00:00:00Z')})
  const populated=profile.anchors.find(anchor=>anchor.reps===8)
  assert.ok(populated)
  assert.match(populated.label,/pace|threshold/i)
  assert.equal(profile.intervalWorkouts,2)
  assert.doesNotMatch(JSON.stringify(profile),/avg_hr|max_hr/i)
})

test('compares the latest workout only with earlier workouts in the chosen window',()=>{
  const activities=[activity('old-a','2026-09-15',320,4,{stance:220,ratio:7,oscillation:90}),activity('old-b','2026-10-01',320,4,{stance:220,ratio:7,oscillation:90}),activity('today','2026-10-15',320,4,{stance:200,ratio:6.2,oscillation:80})]
  const initial=buildAthleteProfile(activities),anchorId=initial.anchors.find(anchor=>anchor.reps===12)!.id
  const profile=buildAthleteProfile(activities,{anchorId,windowWeeks:6})
  assert.equal(profile.comparison.latestWorkoutDate,'2026-10-15')
  assert.equal(profile.comparison.baselineWorkouts,2)
  assert.equal(profile.comparison.changeState,'improved')
  assert.ok((profile.comparison.latestMechanics.groundContactMs||Infinity)<(profile.comparison.baselineMechanics.groundContactMs||0))
  assert.match(profile.comparison.summary,/8 prior reps from 2 workouts/)
})

test('rolling history excludes the current workout and separates duration bands',()=>{
  const activities=[activity('a','2026-09-01',320,4,undefined,50),activity('b','2026-09-15',320,4,undefined,50),activity('c','2026-10-01',320,4,{stance:230,ratio:7,oscillation:90},150),activity('d','2026-10-15',320,4,{stance:200,ratio:6,oscillation:78},150)]
  const initial=buildAthleteProfile(activities),medium=initial.anchors.slice(0,5).map(anchor=>buildAthleteProfile(activities,{anchorId:anchor.id,exposureBand:'medium',windowWeeks:8})).find(profile=>profile.trend.length===2)!
  assert.ok(medium)
  assert.equal(medium.trend.length,2)
  assert.equal(medium.trend[0].baselineWorkouts,0)
  assert.equal(medium.trend[1].baselineWorkouts,1)
  assert.equal(medium.trend[1].rolling.groundContactMs,medium.trend[0].groundContactMs)
  assert.notEqual(medium.trend[1].rolling.groundContactMs,medium.trend[1].groundContactMs)
})

test('easy runs use whole-run mechanics and a similar-distance baseline',()=>{
  const profile=buildAthleteProfile([easy('near','2026-10-01',10000,230),easy('far','2026-10-08',5000,210),easy('latest','2026-10-15',10500,220)],{anchorId:'easy',windowWeeks:6})
  assert.equal(profile.selectedAnchorId,'easy')
  assert.equal(profile.comparison.baselineWorkouts,1)
  assert.equal(profile.comparison.latestReps,1)
  assert.equal(profile.comparison.baselineMechanics.groundContactMs,231)
  assert.match(profile.comparison.summary,/1 prior run from 1 workout/)
})

test('treats absent lifestyle data as unknown with no influence',()=>{
  const profile=buildAthleteProfile([])
  assert.equal(profile.lifestyle.collection,'not_collected')
  assert.equal(profile.lifestyle.influence,'none')
  assert.match(profile.lifestyle.explanation,/cannot change/i)
  assert.match(profile.limitations[0],/No interval reps/i)
})
