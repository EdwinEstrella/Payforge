require('dotenv').config()
const { app, BrowserWindow, ipcMain } = require('electron/main')
const path = require('node:path')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')

// Configuración del log
log.transports.file.level = "info"
autoUpdater.logger = log

// Configuración de Insforge desde variables de entorno
const INSFORGE_URL = process.env.INSFORGE_BASE_URL
const ANON_KEY = process.env.INSFORGE_ANON_KEY

let mainWindow = null

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    show: false,
    icon: path.join(__dirname, 'logo_blanco_negro.ico'),
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

  // Setup auto-updater events
  autoUpdater.on('checking-for-update', () => mainWindow?.webContents.send('checking-for-update'))
  autoUpdater.on('update-available', (info) => mainWindow?.webContents.send('update-available', info))
  autoUpdater.on('update-not-available', () => mainWindow?.webContents.send('update-not-available'))
  autoUpdater.on('download-progress', (progress) => mainWindow?.webContents.send('download-progress', progress))
  autoUpdater.on('update-downloaded', (info) => mainWindow?.webContents.send('update-downloaded', info))
  autoUpdater.on('error', (err) => mainWindow?.webContents.send('update-error', err.message || err))
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

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall(false, true)
})

// --- DB & STRIPE HANDLERS ---

// Obtener lista de clientes desde Insforge
ipcMain.handle('db-get-clients', async () => {
  try {
    const response = await fetch(`${INSFORGE_URL}/api/database/records/clients?select=*&order=name.asc`, {
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY
      }
    })
    const data = await response.json()
    return { data, error: response.ok ? null : data }
  } catch (error) {
    return { data: null, error: error.message }
  }
})

// Llamar a la función de sincronización inicial
ipcMain.handle('stripe-sync-customers', async () => {
  try {
    console.log('Llamando a sync-customers-handler-new2...');
    const response = await fetch(`${INSFORGE_URL}/functions/sync-customers-handler-new2`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY
      }
    })
    const data = await response.json()
    console.log('Respuesta sync:', data);
    return { data, error: response.ok ? null : data }
  } catch (error) {
    console.error('Error en sync:', error);
    return { data: null, error: error.message }
  }
})

// Generar link de pago dinámico
ipcMain.handle('stripe-create-link', async (event, payload) => {
  try {
    console.log('Generando link de pago con payload:', payload);
    const response = await fetch(`${INSFORGE_URL}/functions/create-payment-link-handler`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY
      },
      body: JSON.stringify(payload)
    })
    const data = await response.json()
    console.log('Respuesta generación link:', data);
    return { data, error: response.ok ? null : data }
  } catch (error) {
    console.error('Error generando link:', error);
    return { data: null, error: error.message }
  }
})

// Obtener historial de pagos desde Insforge
ipcMain.handle('db-get-history', async () => {
  try {
    const response = await fetch(`${INSFORGE_URL}/api/database/records/payment_history?select=*&order=created_at.desc`, {
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY
      }
    })
    const data = await response.json()
    return { data, error: response.ok ? null : data }
  } catch (error) {
    return { data: null, error: error.message }
  }
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