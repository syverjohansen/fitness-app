import assert from 'node:assert/strict'
import test from 'node:test'
import { RunningDb } from '../electron/db.js'

test('stores, orders, and clears a workout conversation',()=>{
  const db=new RunningDb(':memory:')
  try{
    const activityId=db.createManualActivity({kind:'cross_training',name:'Pool recovery',date:'2026-10-27',time:'12:00',duration_min:30})
    db.addWorkoutChatMessage(activityId,'user','How did this compare?')
    db.addWorkoutChatMessage(activityId,'assistant','There is not enough comparable history yet.','openai/test-model')
    const messages=db.listWorkoutChat(activityId)
    assert.deepEqual(messages.map(message=>message.role),['user','assistant'])
    assert.equal(messages[1].model,'openai/test-model')
    assert.equal(messages[1].activity_id,activityId)
    db.clearWorkoutChat(activityId)
    assert.equal(db.listWorkoutChat(activityId).length,0)
  }finally{db.close()}
})

test('deleting a workout also deletes its conversation',()=>{
  const db=new RunningDb(':memory:')
  try{
    const activityId=db.createManualActivity({kind:'other',name:'Drills',date:'2026-10-27',time:'13:00',duration_min:15})
    db.addWorkoutChatMessage(activityId,'user','What did I record?')
    db.db.prepare('DELETE FROM activities WHERE id=?').run(activityId)
    assert.equal(db.listWorkoutChat(activityId).length,0)
  }finally{db.close()}
})
