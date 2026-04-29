const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '.env') })
const { app, BrowserWindow, ipcMain } = require('electron/main')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')
const Stripe = require('stripe')

// Configuración del log
log.transports.file.level = "info"
autoUpdater.logger = log

// Configuración de Insforge desde variables de entorno
const INSFORGE_URL = process.env.INSFORGE_BASE_URL
const ANON_KEY = process.env.INSFORGE_ANON_KEY

// Stripe SDK directo en Node.js (sin edge function)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

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

// Generar link de pago dinámico (Stripe SDK directo)
ipcMain.handle('stripe-create-link', async (event, payload) => {
  try {
    const { description = 'Pago de Servicio', amount, type = 'payment', interval = 'month', currency = 'usd' } = payload

    if (!amount) {
      return { data: null, error: { error: 'El monto es obligatorio' } }
    }

    if (!['payment', 'subscription'].includes(type)) {
      return { data: null, error: { error: 'type debe ser payment o subscription' } }
    }

    const priceData = {
      currency,
      product_data: { name: description },
      unit_amount: amount,
    }

    if (type === 'subscription') {
      priceData.recurring = { interval }
    }

    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [{ price_data: priceData, quantity: 1 }],
      mode: type,
      success_url: 'https://payforge.azokia.com/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://payforge.azokia.com/cancel',
    }

    if (type === 'payment') {
      sessionConfig.customer_creation = 'always'
    }

    console.log('Creando Checkout Session con Stripe SDK...', { description, amount, type })
    const session = await stripe.checkout.sessions.create(sessionConfig)
    console.log('Sesión creada:', session.id, session.url)

    // GUARDAR LINK EN LA BASE DE DATOS
    try {
      await fetch(`${INSFORGE_URL}/api/database/records/payment_links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY
        },
        body: JSON.stringify({
          url: session.url,
          description: description,
          amount: amount,
          currency: currency.toUpperCase(),
          created_at: new Date().toISOString()
        })
      })
      console.log('Link guardado en Insforge DB');
    } catch (saveErr) {
      console.error('Error al guardar link en DB:', saveErr.message);
    }

    return { data: { url: session.url, sessionId: session.id }, error: null }
  } catch (error) {
    console.error('Error creando Checkout Session:', error.message)
    return { data: null, error: { error: error.message } }
  }
})

// Obtener historial de links generados
ipcMain.handle('db-get-links', async () => {
  try {
    const response = await fetch(`${INSFORGE_URL}/api/database/records/payment_links?select=*&order=created_at.desc`, {
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

// Eliminar un link del historial
ipcMain.handle('db-delete-link', async (event, id) => {
  try {
    const response = await fetch(`${INSFORGE_URL}/api/database/records/payment_links?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY
      }
    })
    return { success: response.ok, error: response.ok ? null : 'No se pudo eliminar' }
  } catch (error) {
    return { success: false, error: error.message }
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

// Obtener el balance desde Stripe
ipcMain.handle('stripe-get-balance', async () => {
  try {
    const balance = await stripe.balance.retrieve()
    return { data: balance, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
})

// --- CONTRATOS HANDLERS ---

ipcMain.handle('db-get-contracts', async () => {
  try {
    const response = await fetch(`${INSFORGE_URL}/api/database/records/contracts?select=*,clients(name,email)&order=created_at.desc`, {
      headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY }
    })
    const data = await response.json()
    return { data, error: response.ok ? null : data }
  } catch (error) {
    return { data: null, error: error.message }
  }
})

ipcMain.handle('db-create-contract', async (event, payload) => {
  try {
    // Calcular expiración (+7 días)
    const expiryAt = new Date()
    expiryAt.setDate(expiryAt.getDate() + 7)

    // Si el cliente es manual, podríamos crear un registro de cliente temporal 
    // o simplemente guardar el nombre/email en el contrato.
    // Vamos a guardarlo directamente en el contrato para máxima flexibilidad.

    const response = await fetch(`${INSFORGE_URL}/api/database/records/contracts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        ...payload,
        status: 'pending',
        expiry_at: expiryAt.toISOString(),
        created_at: new Date().toISOString()
      })
    })
    const data = await response.json()
    return { data: data[0], error: response.ok ? null : data }
  } catch (error) {
    return { data: null, error: error.message }
  }
})

ipcMain.handle('db-cancel-contract', async (event, { id, reason, detail }) => {
  try {
    const response = await fetch(`${INSFORGE_URL}/api/database/records/contracts?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY
      },
      body: JSON.stringify({
        status: 'cancelled',
        cancel_reason: reason,
        cancel_detail: detail
      })
    })
    return { success: response.ok, error: response.ok ? null : 'Error al cancelar' }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('db-delete-contract', async (event, id) => {
  try {
    const response = await fetch(`${INSFORGE_URL}/api/database/records/contracts?id=eq.${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY }
    })
    return { success: response.ok, error: response.ok ? null : 'Error al eliminar' }
  } catch (error) {
    return { success: false, error: error.message }
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