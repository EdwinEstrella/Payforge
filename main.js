const { app, BrowserWindow, ipcMain } = require('electron/main')
const path = require('node:path')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')

// Configuración del log
log.transports.file.level = "info"
autoUpdater.logger = log

// Configuración de Insforge
const INSFORGE_URL = 'https://payforge.azokia.com'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MDAzOTl9.qFBw69Ih3UhdYWuEjzMDXuV8ElpzFRUc6Oi88sH7B90'

let mainWindow = null

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    show: false,
    icon: path.join(__dirname, 'logo_blanco_negro.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.loadFile('index.html')
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) return { action: 'allow' }
    return { action: 'deny' }
  })
  
  mainWindow.maximize() // Iniciar maximizada
  mainWindow.show()

  // Notify renderer when window is maximized/unmaximized
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized', false)
  })
}

// Auth handler usando REST API nativa
ipcMain.handle('auth-login', async (event, { email, password }) => {
  try {
    const response = await fetch(`${INSFORGE_URL}/api/auth/sessions?client_type=desktop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`
      },
      body: JSON.stringify({ email, password })
    })

    const data = await response.json()

    if (!response.ok) {
      return { data: null, error: data }
    }

    return { data, error: null }
  } catch (error) {
    console.error('Fetch error:', error)
    return { data: null, error: { message: 'Error de red o conexión al servidor' } }
  }
})

// Window controls handlers
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  }
})

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close()
})

// Aplicación lista
app.whenReady().then(() => {
  createWindow()

  // Revisar actualizaciones si no estamos en macOS
  if (process.platform !== 'darwin') {
    autoUpdater.checkForUpdatesAndNotify()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})