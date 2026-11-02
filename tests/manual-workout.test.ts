import assert from 'node:assert/strict'
import test from 'node:test'
import { RunningDb } from '../electron/db.js'

test('creates and edits a manual strength workout with rep and timed exercises',()=>{
  const db=new RunningDb(':memory:')
  try{
    const id=db.createManualActivity({kind:'strength',name:'Gym after easy run',date:'2026-10-26',time:'18:30',duration_min:42,description:'Runner strength',note:'Calf felt normal',legs_feel:4,exercises:[
      {idx:1,exercise:'Bulgarian split squat',tracking_type:'reps',sets:3,reps:8,weight_value:35,weight_unit:'lb',notes:'each leg'},
      {idx:2,exercise:'Soleus isometric',tracking_type:'timed',sets:4,duration_s:45,band_color:'blue',notes:'bent knee'},
    ]})
    const workout=db.getActivity(id)!
    assert.equal(workout.source,'manual')
    assert.equal(workout.name_source,'user')
    assert.equal(workout.workout_type,'Strength')
    assert.equal(workout.duration_s,42*60)
    assert.equal(workout.exercises?.length,2)
    assert.equal(workout.exercises?.[0].weight_value,35)
    assert.equal(workout.exercises?.[1].duration_s,45)
    assert.equal(workout.journal?.[0].body,'Calf felt normal')
    db.saveExercises(id,[{idx:1,exercise:'Deadlift',tracking_type:'reps',sets:4,reps:5,weight_value:80,weight_unit:'kg'}])
    assert.equal(db.getActivity(id)?.exercises?.[0].exercise,'Deadlift')
    db.updateActivity(id,{sport:'cross_country_skiing'})
    assert.equal(db.getActivity(id)?.sport,'cross_country_skiing')
    db.db.prepare(`UPDATE activities SET name_source='auto' WHERE id=?`).run(id)
    db.updateActivity(id,{name:'Manually named workout'})
    assert.equal(db.getActivity(id)?.name_source,'user')
  }finally{db.close()}
})
