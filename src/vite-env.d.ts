/// <reference types="vite/client" />
import type { Channel } from '../shared/types'
declare global { interface Window { runningLog: { invoke<T=any>(channel:Channel,...args:unknown[]):Promise<T>; pathsForFiles(files:File[]):string[]; onProgress(callback:(event:any)=>void):()=>void } } }
export {}
