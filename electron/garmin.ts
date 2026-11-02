import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import type { BrowserWindow } from 'electron'
import type { RunningDb } from './db.js'
import { parseFit } from './fit.js'

let processRef: ChildProcessWithoutNullStreams | undefined
export function submitMfa(code:string){if(!processRef)throw new Error('No Garmin sign-in is waiting for MFA.');processRef.stdin.write(code.trim()+'\n')}
export function syncGarmin(db:RunningDb, win:BrowserWindow, script:string, tokenDir:string, outDir:string, password='', onImported?:(id:string)=>void){
  if(processRef)throw new Error('A Garmin sync is already running.')
  const s=db.getSettings(), known=db.garminKnownIds()
  const since=new Date(Date.now()-Number(s.sync_window||60)*86400000).toISOString().slice(0,10)
  const args=[script,'--tokens',tokenDir,'--out',outDir,'--since',since,'--known',...known]
  if(s.garmin_email)args.push('--email',s.garmin_email)
  const env={...globalThis.process.env,RUNNING_LOG_GARMIN_PASSWORD:password}
  const child=spawn(s.python_path||'python3',args,{env});processRef=child
  let buf='', stderr='', reportedError=false, reportedDone=false
  child.stdout.on('data',async chunk=>{buf+=String(chunk);const lines=buf.split('\n');buf=lines.pop()||'';for(const line of lines){if(!line.trim())continue;try{const msg=JSON.parse(line);if(msg.type==='error')reportedError=true;if(msg.type==='done')reportedDone=true;console.log('[garmin]',msg.type,msg.message||'');win.webContents.send('sync:progress',msg);if(msg.type==='activity'){const a=await parseFit(path.resolve(msg.file),'garmin',String(msg.id),msg.name,msg.type_key);const inserted=db.insertActivity(a);if(inserted.inserted)onImported?.(inserted.id)}}catch(e){reportedError=true;win.webContents.send('sync:progress',{type:'error',message:e instanceof Error?e.message:String(e)})}}})
  child.stderr.on('data',d=>{stderr+=String(d);console.error('[garmin stderr]',String(d).trim())})
  child.on('error',e=>{reportedError=true;processRef=undefined;win.webContents.send('sync:progress',{type:'error',message:e.message.includes('ENOENT')?`Python was not found at “${s.python_path}”. Check Settings.`:e.message})})
  child.on('close',code=>{processRef=undefined;if(code===0){if(!reportedDone)win.webContents.send('sync:progress',{type:'done'})}else if(!reportedError){win.webContents.send('sync:progress',{type:'error',message:stderr.trim()||`Garmin sync exited with code ${code}.`})}})
  return {started:true}
}
