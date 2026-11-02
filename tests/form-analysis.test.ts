import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeFormBreakdown, buildLapMetricTimelines, buildRepMetricTimelines } from '../shared/form-analysis.js'

const start=new Date('2026-01-01T12:00:00Z')
function fixture(breakdownAt?:number){
  const records=Array.from({length:181},(_,second)=>({timestamp:new Date(start.getTime()+second*1000).toISOString(),enhanced_speed:5,cadence:second>=(breakdownAt??999)?85:90,power:second>=(breakdownAt??999)?330:300,stance_time:second>=(breakdownAt??999)?231:210,step_length:1500,vertical_oscillation:90,vertical_ratio:6}))
  return{raw:{laps:[{start_time:start.toISOString(),total_timer_time:180}],records},laps:[{idx:1,is_rep:1,distance_m:900,duration_s:180}]}
}

test('detects a sustained change across independent form families',()=>{const data=fixture(90),result=analyzeFormBreakdown(data.raw,data.laps)[0];assert.equal(result.breakdownAtS,90);assert.deepEqual(result.signals.map(signal=>signal.key).sort(),['power_cost','stance_time']);assert.equal(result.sustainedSeconds,30)})
test('does not invent breakdown in a stable rep',()=>{const data=fixture(),result=analyzeFormBreakdown(data.raw,data.laps)[0];assert.equal(result.breakdownAtS,undefined);assert.equal(result.signals.length,0)})

test('builds rep-numbered 10-second mechanic timelines for AI questions',()=>{
  const data=fixture(90)
  data.raw.records.forEach((record,second)=>Object.assign(record,{distance:second*5,enhanced_altitude:10+second*.01,stance_time_balance:50.2,heart_rate:150}))
  const timeline=buildRepMetricTimelines(data.raw,data.laps,2)[0]
  assert.equal(timeline.rep_number,1)
  assert.equal(timeline.lap_index,1)
  assert.equal(timeline.windows.length,18)
  assert.equal(timeline.windows[0].start_s,0)
  assert.equal(timeline.windows[0].cadence_spm,180)
  assert.equal(timeline.windows[0].ground_contact_ms,210)
  assert.equal(timeline.windows[9].ground_contact_ms,231)
  assert.equal(timeline.windows[9].percent_of_rep,50)
  assert.equal(timeline.windows[9].ground_contact_balance_percent,50.2)
})

test('builds 10-second timelines for race laps that are not flagged as reps',()=>{
  const data=fixture()
  data.laps[0].is_rep=0
  const timeline=buildLapMetricTimelines(data.raw,data.laps,[1],2)[0]
  assert.equal(timeline.rep_number,undefined)
  assert.equal(timeline.lap_index,1)
  assert.equal(timeline.windows.length,18)
  assert.equal(timeline.windows[0].cadence_spm,180)
})

test('reports sustained moderate changes as drift rather than breakdown',()=>{const data=fixture();for(const [second,record] of data.raw.records.entries())if(second>=90){record.cadence=88;record.stance_time=218;record.vertical_ratio=6.2}const result=analyzeFormBreakdown(data.raw,data.laps)[0];assert.equal(result.status,'drift');assert.equal(result.driftAtS,90);assert.equal(result.changePercentOfRep,50);assert.equal(result.breakdownAtS,undefined)})

test('does not double-count correlated cadence and stride changes',()=>{const data=fixture();for(const [second,record] of data.raw.records.entries())if(second>=90){record.cadence=84;record.step_length=1300}const result=analyzeFormBreakdown(data.raw,data.laps)[0];assert.equal(result.breakdownAtS,undefined)})

test('normalizes expected running dynamics when pace changes',()=>{
  const secondStart=new Date(start.getTime()+240_000)
  const makeRep=(repStart:Date,baseSpeed:number,slowLate=false)=>Array.from({length:181},(_,second)=>{const speed=slowLate&&second>=90?baseSpeed-.2:baseSpeed;return{timestamp:new Date(repStart.getTime()+second*1000).toISOString(),enhanced_speed:speed,cadence:130+10*speed,power:60*speed,stance_time:450-50*speed,step_length:500+200*speed,vertical_oscillation:90,vertical_ratio:9-.6*speed}})
  const raw={laps:[{start_time:start.toISOString(),total_timer_time:180},{start_time:secondStart.toISOString(),total_timer_time:180}],records:[...makeRep(start,4,true),...makeRep(secondStart,5)]}
  const laps=[{idx:1,is_rep:1,distance_m:720,duration_s:180},{idx:2,is_rep:1,distance_m:900,duration_s:180}]
  const results=analyzeFormBreakdown(raw,laps)
  assert.equal(results[0].paceAdjusted,true)
  assert.equal(results[0].breakdownAtS,undefined)
})

test('keeps short finishers out of the long-rep reference model',()=>{
  const data=fixture()
  const shortStart=new Date(start.getTime()+240_000)
  data.raw.laps.push({start_time:shortStart.toISOString(),total_timer_time:40})
  data.raw.records.push(...Array.from({length:41},(_,second)=>({timestamp:new Date(shortStart.getTime()+second*1000).toISOString(),enhanced_speed:7,cadence:105,power:600,stance_time:160,step_length:1900,vertical_oscillation:75,vertical_ratio:4})))
  data.laps.push({idx:2,is_rep:1,distance_m:280,duration_s:40})
  const results=analyzeFormBreakdown(data.raw,data.laps)
  assert.equal(results[0].repGroup,'long')
  assert.equal(results[0].status,'stable')
  assert.equal(results[1].repGroup,'short')
  assert.equal(results[1].status,'too_short')
})

test('does not call steep-terrain power changes form drift',()=>{
  const data=fixture(90)
  for(const [second,record] of data.raw.records.entries())Object.assign(record,{distance:second*5,enhanced_altitude:second<90?10:10+(second-90)*.25})
  const result=analyzeFormBreakdown(data.raw,data.laps)[0]
  assert.equal(result.status,'stable')
  assert.ok(result.terrainWindowsExcluded>0)
})

test('detects cumulative fatigue at the start of a later rep separately from within-rep drift',()=>{
  const raw={laps:[] as any[],records:[] as any[]}
  const laps=[] as Array<{idx:number;is_rep:number;distance_m:number;duration_s:number}>
  for(let rep=0;rep<3;rep++){
    const repStart=new Date(start.getTime()+rep*240_000)
    raw.laps.push({start_time:repStart.toISOString(),total_timer_time:180})
    raw.records.push(...Array.from({length:181},(_,second)=>({timestamp:new Date(repStart.getTime()+second*1000).toISOString(),enhanced_speed:5,cadence:rep===2?85:90,power:300,stance_time:rep===2?231:210,step_length:1500,vertical_oscillation:90,vertical_ratio:rep===2?6.4:6})))
    laps.push({idx:rep+1,is_rep:1,distance_m:900,duration_s:180})
  }
  const results=analyzeFormBreakdown(raw,laps)
  assert.deepEqual(results[2].freshReferenceReps,[1,2])
  assert.equal(results[2].startStatus,'degraded')
  assert.equal(results[2].status,'stable')
})
