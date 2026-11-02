import assert from 'node:assert/strict'
import test from 'node:test'
import { RunningDb } from '../electron/db.js'

test('creates and edits a manual multi-block cycle workout',()=>{
  const db=new RunningDb(':memory:')
  try{
    const cycleId=Number(db.saveCycle({name:'5K build',kind:'race_build',start_date:'2026-11-02',end_date:'2026-12-20',goal:'Race well',summary:''}))
    const id=Number(db.savePlannedWorkout({cycle_id:cycleId,planned_date:'2026-11-04',name:'8K pace plus speed',purpose:'Aerobic race support',notes:'Stay controlled',status:'planned',blocks:[
      {idx:1,reps:3,rep_type:'distance',distance_m:1609,pace_anchor:'8k',pace_offset_min_s_per_mile:5,pace_offset_max_s_per_mile:10,recovery_type:'time',recovery_s:90,recovery_s_max:120},
      {idx:2,reps:4,rep_type:'distance',distance_m:200,pace_anchor:'speed',recovery_type:'distance',recovery_m:200},
    ] as any}))
    const created=db.listPlannedWorkouts(cycleId)[0]
    assert.equal(created.id,id)
    assert.equal(created.blocks.length,2)
    assert.equal(created.blocks[0].reps,3)
    assert.equal(created.blocks[0].pace_offset_max_s_per_mile,10)
    assert.equal(created.blocks[0].recovery_s_max,120)
    db.savePlannedWorkout({...created,name:'Adjusted 8K session',status:'adjusted',adjustment_note:'Reduced after heavy legs',blocks:created.blocks.slice(0,1)})
    const edited=db.listPlannedWorkouts(cycleId)[0]
    assert.equal(edited.name,'Adjusted 8K session')
    assert.equal(edited.status,'adjusted')
    assert.equal(edited.blocks.length,1)
    assert.ok(edited.original_json)
    db.deletePlannedWorkout(id)
    assert.equal(db.listPlannedWorkouts(cycleId).length,0)
  }finally{db.close()}
})
