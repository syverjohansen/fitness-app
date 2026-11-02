import assert from 'node:assert/strict'
import test from 'node:test'
import {DEFAULT_FITNESS_PROFILE,equivalentTime,parseRaceTime,personalExponent,thresholdTarget} from '../shared/planner.js'
test('parses minute and hour race times',()=>{assert.equal(parseRaceTime('27:20'),1640);assert.equal(parseRaceTime('2:49:26'),10166)})
test('recreates the personal 3k to 5k exponent in the ODS',()=>{assert.ok(Math.abs(personalExponent(3000,5000,DEFAULT_FITNESS_PROFILE.prs)-1.06400469790578)<1e-10)})
test('converts a 27 minute five-mile goal to the ODS 3k goal',()=>{assert.ok(Math.abs(equivalentTime(8045,27*60,3000,DEFAULT_FITNESS_PROFILE.prs).timeS-566.012195122)<.001)})
test('recreates the three-minute threshold target from current fitness',()=>{const r=thresholdTarget(8045,28*60,3,DEFAULT_FITNESS_PROFILE.prs);assert.ok(Math.abs(r.equivalentTimeS-3294.943761405)<.001);assert.ok(Math.abs(r.paceSecPerKm-219.662917427)<.001)})
