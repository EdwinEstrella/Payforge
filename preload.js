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
  },

  // Updater
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateEvents: (handlers) => {
    const onChecking = () => handlers.onChecking?.()
    const onAvailable = (_e, info) => handlers.onUpdateAvailable?.(info)
    const onNotAvailable = () => handlers.onUpdateNotAvailable?.()
    const onProgress = (_e, progress) => handlers.onDownloadProgress?.(progress)
    const onDownloaded = (_e, info) => handlers.onUpdateDownloaded?.(info)
    const onError = (_e, err) => handlers.onUpdateError?.(err)

    if (handlers.onChecking) ipcRenderer.on('checking-for-update', onChecking)
    if (handlers.onUpdateAvailable) ipcRenderer.on('update-available', onAvailable)
    if (handlers.onUpdateNotAvailable) ipcRenderer.on('update-not-available', onNotAvailable)
    if (handlers.onDownloadProgress) ipcRenderer.on('download-progress', onProgress)
    if (handlers.onUpdateDownloaded) ipcRenderer.on('update-downloaded', onDownloaded)
    if (handlers.onUpdateError) ipcRenderer.on('update-error', onError)
  },
  installUpdate: () => ipcRenderer.send('install-update'),

  // DB & Stripe Logic
  getClients: async () => ipcRenderer.invoke('db-get-clients'),
  getHistory: async () => ipcRenderer.invoke('db-get-history'),
  getLinks: async () => ipcRenderer.invoke('db-get-links'),
  deleteLink: async (id) => ipcRenderer.invoke('db-delete-link', id),
  createPaymentLink: async (data) => ipcRenderer.invoke('stripe-create-link', data),
  syncStripeCustomers: async () => ipcRenderer.invoke('stripe-sync-customers'),
  getBalance: async () => ipcRenderer.invoke('stripe-get-balance'),
  getFxRate: async (amountUsdCent) => ipcRenderer.invoke('stripe-get-fx-rate', { amountUsdCent }),

  // Contratos
  getContracts: async () => ipcRenderer.invoke('db-get-contracts'),
  createContract: async (data) => ipcRenderer.invoke('db-create-contract', data),
  cancelContract: async (id, reason, detail) => ipcRenderer.invoke('db-cancel-contract', { id, reason, detail }),
  deleteContract: async (id) => ipcRenderer.invoke('db-delete-contract', id),

  // Propuestas y Calendario
  getProposals: async () => ipcRenderer.invoke('db-get-proposals'),
  createProposal: async (data) => ipcRenderer.invoke('db-create-proposal', data),
  getCalendarEvents: async () => ipcRenderer.invoke('db-get-calendar-events'),
  generateContractLinks: async (data) => ipcRenderer.invoke('stripe-generate-contract-links', data),
  generateSingleContractLink: async (data) => ipcRenderer.invoke('stripe-generate-single-contract-link', data)
})
