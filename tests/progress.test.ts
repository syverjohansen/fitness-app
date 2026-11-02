import assert from 'node:assert/strict'
import test from 'node:test'
import { inferIntervalCategory, inferRepCategory, metricNumber } from '../shared/progress.js'
import { RunningDb } from '../electron/db.js'
import type { Activity, Lap } from '../shared/types.js'

const reps = (...durations: number[]): Lap[] => durations.map((duration_s, idx) => ({ idx: idx + 1, distance_m: 400, duration_s, is_rep: 1 }))

test('uses runner-friendly duration bands for fallback interval categories', () => {
  assert.equal(inferIntervalCategory('Explosive reps', 'Intervals', reps(10, 11, 10)), 'sprint')
  assert.equal(inferIntervalCategory('Fast 400s', 'Intervals', reps(62, 61, 63)), 'speed')
  assert.equal(inferIntervalCategory('5 x 3 minutes', 'Intervals', reps(180, 180, 180)), 'vo2')
})

test('explicit workout intent wins over duration', () => {
  assert.equal(inferIntervalCategory('10 x steep hill', 'Intervals', reps(45, 46, 44)), 'hills')
  assert.equal(inferIntervalCategory('Treadmill incline reps', 'Intervals', reps(180, 180)), 'hills')
  assert.equal(inferIntervalCategory('Cruise intervals', 'Threshold', reps(180, 180, 180)), 'sub_threshold')
  assert.equal(inferIntervalCategory('Marathon blocks', 'Intervals', reps(1200, 1200)), 'aerobic_race_pace')
})

test('categorizes short finishers separately from the main workout intent', () => {
  assert.equal(inferRepCategory('vo2', 'Intervals', reps(210)[0]), 'vo2')
  assert.equal(inferRepCategory('vo2', 'Race', {...reps(540)[0],distance_m:3000}), 'vo2')
  assert.equal(inferRepCategory('vo2', 'Intervals', reps(42)[0]), 'speed')
  assert.equal(inferRepCategory('sub_threshold', 'Threshold', reps(360)[0]), 'sub_threshold')
  assert.equal(inferRepCategory('sub_threshold', 'Threshold', reps(45)[0]), 'speed')
  assert.equal(inferRepCategory('hills', 'Hills', reps(45)[0]), 'hills')
})

test('reads standardized Garmin lap metrics', () => {
  const lap = { ...reps(180)[0], metrics: { power: 342, stance_time: 211 } }
  assert.equal(metricNumber(lap, 'power'), 342)
  assert.equal(metricNumber(lap, 'stance_time'), 211)
})

test('running progress excludes swimming, skiing, and hiking laps',()=>{
  const db=new RunningDb(':memory:')
  let day=0
  const activity=(id:string,sport:string,workout_type:Activity['workout_type'],lap:Lap):Activity=>{day++;const date=`2026-01-${String(day).padStart(2,'0')}`;return{id,source:'demo',start_time:`${date}T12:00:00Z`,local_date:date,name:id,sport,distance_m:lap.distance_m,duration_s:lap.duration_s,series:[],raw_summary:{},workout_type,type_source:'user',surface:'outdoor',shoes:'',tags:[],ai_summary:'',reps_source:'user',laps:[lap]}}
  try{
    db.insertActivity(activity('run','running','Intervals',{idx:1,is_rep:1,distance_m:800,duration_s:150}))
    db.insertActivity(activity('pool','lap_swimming','Intervals',{idx:1,is_rep:1,distance_m:100,duration_s:80}))
    db.insertActivity(activity('ski','skate_skiing_ws','Intervals',{idx:1,is_rep:1,distance_m:1000,duration_s:180}))
    db.insertActivity(activity('hike','hiking','Intervals',{idx:1,is_rep:1,distance_m:500,duration_s:300}))
    const intervals=db.progress('intervals',{compare:'sessions'}) as any[]
    assert.deepEqual(intervals.map(row=>row.id),['run'])
    db.insertActivity(activity('easy-run','indoor_running','Easy',{idx:1,is_rep:0,distance_m:5000,duration_s:1500}))
    db.insertActivity(activity('easy-swim','lap_swimming','Easy',{idx:1,is_rep:0,distance_m:1000,duration_s:1200}))
    const steady=db.progress('steady',{type:'Easy'}) as any[]
    assert.deepEqual(steady.map(row=>row.id),['easy-run'])
  }finally{db.close()}
})
