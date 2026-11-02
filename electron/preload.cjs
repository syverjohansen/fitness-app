const { contextBridge, ipcRenderer, webUtils } = require('electron')

const channels = new Set([
  'dashboard:get', 'activity:get', 'activity:update', 'activity:delete', 'lap:toggle',
  'journal:add', 'journal:update', 'journal:delete', 'cycles:list', 'cycle:save', 'cycle:delete', 'cycle:detail',
  'progress:get', 'similar:get', 'athlete-profile:get', 'recovery:get', 'settings:get', 'settings:set', 'settings:api-key', 'settings:has-api-key',
  'demo:load', 'demo:clear', 'import:files', 'import:paths', 'dialog:import', 'backup:export',
  'ai:analyze', 'garmin:sync', 'garmin:mfa', 'manual:create', 'manual:exercises-save',
  'planner:list', 'planner:save', 'planner:delete', 'planner:parse',
  'workout-chat:list', 'workout-chat:send', 'workout-chat:clear',
])

contextBridge.exposeInMainWorld('runningLog', {
  invoke(channel, ...args) {
    if (!channels.has(channel)) throw new Error(`IPC channel not allowed: ${channel}`)
    return ipcRenderer.invoke(channel, ...args)
  },
  pathsForFiles(files) {
    return files.map(file => webUtils.getPathForFile(file))
  },
  onProgress(callback) {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('sync:progress', listener)
    ipcRenderer.on('analysis:progress', listener)
    return () => {
      ipcRenderer.removeListener('sync:progress', listener)
      ipcRenderer.removeListener('analysis:progress', listener)
    }
  },
})
