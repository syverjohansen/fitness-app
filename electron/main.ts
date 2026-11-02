import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { RunningDb } from './db.js'
import { parseFit } from './fit.js'
import { analyzeActivity, chatAboutActivity, parsePlannedWorkout } from './ai.js'
import { submitMfa, syncGarmin } from './garmin.js'

const here=path.dirname(fileURLToPath(import.meta.url));let win:BrowserWindow;let db:RunningDb
const apiKeyPath=()=>path.join(app.getPath('userData'),'openrouter-key')
async function getKey(){if(process.env.OPENROUTER_API_KEY)return process.env.OPENROUTER_API_KEY;try{const bytes=await fs.readFile(apiKeyPath());return safeStorage.isEncryptionAvailable()?safeStorage.decryptString(bytes):''}catch{return''}}
async function setKey(value:string){if(!safeStorage.isEncryptionAvailable())throw new Error('Secure credential storage is unavailable on this system. Use OPENROUTER_API_KEY instead.');if(!value){await fs.rm(apiKeyPath(),{force:true});return}await fs.writeFile(apiKeyPath(),safeStorage.encryptString(value),{mode:0o600})}
const analysisQueue:string[]=[]
let analysisQueueRunning=false
function enqueueAnalysis(id:string){if(db.getSettings().auto_analyze!=='true'||analysisQueue.includes(id))return;analysisQueue.push(id);void runAnalysisQueue()}
async function runAnalysisQueue(){
  if(analysisQueueRunning)return
  analysisQueueRunning=true
  try{
    const key=await getKey();if(!key){analysisQueue.length=0;return}
    let completed=0
    while(analysisQueue.length){const id=analysisQueue.shift()!,remaining=analysisQueue.length;win.webContents.send('analysis:progress',{type:'analysis',id,status:'started',message:`Analyzing imported workout ${completed+1} of ${completed+remaining+1}…`});try{await analyzeActivity(db,id,key);completed++;win.webContents.send('analysis:progress',{type:'analysis',id,status:'done',message:`Analyzed ${completed} workout${completed===1?'':'s'}`})}catch(error){win.webContents.send('analysis:progress',{type:'analysis',id,status:'error',message:error instanceof Error?error.message:String(error)})}}
  }finally{analysisQueueRunning=false}
}
async function importPaths(paths:string[]){const results=[];const archive=path.join(app.getPath('userData'),'fit-files');await fs.mkdir(archive,{recursive:true});for(const p of paths){try{const a=await parseFit(p);const target=path.join(archive,`${a.id.replace(/[^a-zA-Z0-9._-]/g,'-')}.fit`);await fs.copyFile(p,target);a.fit_file_path=target;const inserted=db.insertActivity(a);results.push({...inserted,file:path.basename(p)});if(inserted.inserted)enqueueAnalysis(inserted.id)}catch(e){results.push({inserted:false,file:path.basename(p),error:e instanceof Error?e.message:String(e)})}}return results}
function wire(){
  ipcMain.handle('dashboard:get',(_,f)=>db.dashboard(f));ipcMain.handle('activity:get',(_,id)=>db.getActivity(id));ipcMain.handle('activity:update',(_,id,c)=>{db.updateActivity(id,c);return db.getActivity(id)});ipcMain.handle('activity:delete',(_,id)=>db.db.prepare('DELETE FROM activities WHERE id=?').run(id));ipcMain.handle('lap:toggle',(_,id,idx,v)=>db.toggleLap(id,idx,v))
  ipcMain.handle('manual:create',(_,data)=>db.createManualActivity(data));ipcMain.handle('manual:exercises-save',(_,id,exercises)=>{db.saveExercises(id,exercises);return db.getActivity(id)})
  ipcMain.handle('planner:list',(_,cycleId)=>db.listPlannedWorkouts(cycleId));ipcMain.handle('planner:save',(_,plan)=>db.savePlannedWorkout(plan));ipcMain.handle('planner:delete',(_,id)=>db.deletePlannedWorkout(id));ipcMain.handle('planner:parse',async(_,text)=>parsePlannedWorkout(db,text,await getKey()))
  ipcMain.handle('workout-chat:list',(_,id)=>db.listWorkoutChat(id));ipcMain.handle('workout-chat:send',async(_,id,question)=>chatAboutActivity(db,id,question,await getKey()));ipcMain.handle('workout-chat:clear',(_,id)=>db.clearWorkoutChat(id))
  ipcMain.handle('journal:add',(_,d)=>db.addJournal(d));ipcMain.handle('journal:update',(_,id,b)=>db.updateJournal(id,b));ipcMain.handle('journal:delete',(_,id)=>db.deleteJournal(id));ipcMain.handle('cycles:list',()=>db.listCycles());ipcMain.handle('cycle:save',(_,c)=>db.saveCycle(c));ipcMain.handle('cycle:delete',(_,id)=>db.db.prepare('DELETE FROM cycles WHERE id=?').run(id));ipcMain.handle('cycle:detail',(_,id)=>db.cycleDetail(id))
  ipcMain.handle('progress:get',(_,mode,f)=>db.progress(mode,f));ipcMain.handle('similar:get',(_,id)=>db.similar(id));ipcMain.handle('athlete-profile:get',(_,filters)=>db.athleteProfile(filters));ipcMain.handle('recovery:get',(_,id)=>db.recoveryAssessment(id));ipcMain.handle('settings:get',()=>db.getSettings());ipcMain.handle('settings:set',(_,k,v)=>db.setSetting(k,String(v)));ipcMain.handle('settings:api-key',(_,v)=>setKey(v));ipcMain.handle('settings:has-api-key',async()=>!!(await getKey()))
  ipcMain.handle('demo:load',()=>db.seedDemo());ipcMain.handle('demo:clear',()=>db.clearDemo());ipcMain.handle('import:paths',(_,paths)=>importPaths(paths));ipcMain.handle('dialog:import',async()=>{const r=await dialog.showOpenDialog(win,{filters:[{name:'FIT activity',extensions:['fit']}],properties:['openFile','multiSelections']});return r.canceled?[]:importPaths(r.filePaths)})
  ipcMain.handle('backup:export',async()=>{const r=await dialog.showSaveDialog(win,{defaultPath:`running-log-backup-${new Date().toISOString().slice(0,10)}.json`});if(r.canceled||!r.filePath)return false;const ids=db.db.prepare('SELECT id FROM activities ORDER BY start_time').all() as Array<{id:string}>,cycles=db.listCycles(),data={exported_at:new Date().toISOString(),activities:ids.map(row=>db.getActivity(row.id)),cycles,planned_workouts:cycles.flatMap(cycle=>db.listPlannedWorkouts(cycle.id)),journal:db.db.prepare('SELECT * FROM journal').all(),workout_chat:db.db.prepare('SELECT * FROM workout_chat_messages ORDER BY activity_id,id').all(),settings:db.getSettings()};await fs.writeFile(r.filePath,JSON.stringify(data,null,2));return true})
  ipcMain.handle('ai:analyze',async(_,id)=>{win.webContents.send('analysis:progress',{type:'analysis',id,status:'started'});try{const r=await analyzeActivity(db,id,await getKey());win.webContents.send('analysis:progress',{type:'analysis',id,status:'done'});return r}catch(e){win.webContents.send('analysis:progress',{type:'analysis',id,status:'error'});throw e}})
  ipcMain.handle('garmin:sync',(_,password)=>syncGarmin(db,win,app.isPackaged?path.join(process.resourcesPath,'python','sync_garmin.py'):path.join(app.getAppPath(),'python','sync_garmin.py'),path.join(app.getPath('userData'),'garmin-tokens'),path.join(app.getPath('userData'),'garmin-downloads'),password,enqueueAnalysis));ipcMain.handle('garmin:mfa',(_,code)=>submitMfa(code))
}
app.whenReady().then(()=>{db=new RunningDb(path.join(app.getPath('userData'),'running-log.sqlite'));wire();win=new BrowserWindow({width:1440,height:920,minWidth:1050,minHeight:680,titleBarStyle:'hiddenInset',backgroundColor:'#f5f4ef',webPreferences:{preload:path.join(app.getAppPath(),'electron','preload.cjs'),contextIsolation:true,nodeIntegration:false}});win.webContents.on('console-message',(_event,level,message)=>console.log(`[renderer:${level}] ${message}`));win.webContents.on('did-fail-load',(_event,code,description,url)=>console.error(`Renderer failed to load ${url}: ${code} ${description}`));if(process.env.VITE_DEV_SERVER_URL)win.loadURL(process.env.VITE_DEV_SERVER_URL);else win.loadFile(path.join(here,'../../dist/index.html'));app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)win.loadFile(path.join(here,'../../dist/index.html'))})})
app.on('window-all-closed',()=>{db?.close();if(process.platform!=='darwin')app.quit()})
