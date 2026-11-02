import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { CHANNELS, type Channel } from '../shared/types.js'

contextBridge.exposeInMainWorld('runningLog', {
  invoke: (channel: Channel, ...args: unknown[]) => { if (!(CHANNELS as readonly string[]).includes(channel)) throw new Error('IPC channel not allowed'); return ipcRenderer.invoke(channel, ...args) },
  pathsForFiles: (files: File[]) => files.map(file => webUtils.getPathForFile(file)),
  onProgress: (callback: (event: any) => void) => { const listener=(_:unknown,event:any)=>callback(event);ipcRenderer.on('sync:progress',listener);ipcRenderer.on('analysis:progress',listener);return()=>{ipcRenderer.removeListener('sync:progress',listener);ipcRenderer.removeListener('analysis:progress',listener)} },
})
