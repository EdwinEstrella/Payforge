const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  getVersions: () => process.versions,
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', (_, isMaximized) => callback(isMaximized)),
  
  // Insforge Auth via IPC
  login: async (email, password) => {
    return await ipcRenderer.invoke('auth-login', { email, password })
  }
})