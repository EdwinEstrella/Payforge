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
    const [clients, subscriptions, paymentHistory] = await Promise.all([
      getInsforgeRecords('clients', 'select=*&order=name.asc'),
      getInsforgeRecords('subscriptions', 'select=*'),
      getInsforgeRecords('payment_history', 'select=*&order=created_at.desc')
    ])

    const subscriptionsByClient = new Map()
    for (const subscription of subscriptions) {
      const existing = subscriptionsByClient.get(subscription.client_id)
      const currentEnd = new Date(subscription.current_period_end || 0).getTime()
      const existingEnd = new Date(existing?.current_period_end || 0).getTime()
      if (!existing || currentEnd > existingEnd) {
        subscriptionsByClient.set(subscription.client_id, subscription)
      }
    }

    const latestPaymentByClient = new Map()
    for (const payment of paymentHistory) {
      if (!payment.client_id || latestPaymentByClient.has(payment.client_id)) continue
      if (!['succeeded', 'refunded'].includes(payment.status)) continue
      latestPaymentByClient.set(payment.client_id, payment)
    }

    const enrichedClients = await Promise.all(clients.map(async (client) => {
      const subscription = subscriptionsByClient.get(client.id) || null
      const latestPayment = latestPaymentByClient.get(client.id) || null
      const stripeDetails = await getStripeSubscriptionDetails(subscription?.stripe_subscription_id)

      return {
        ...client,
        subscription_status: stripeDetails?.status || subscription?.status || null,
        subscription_amount: stripeDetails?.amount ?? latestPayment?.amount ?? null,
        subscription_currency: stripeDetails?.currency || latestPayment?.currency || null,
        subscription_interval: stripeDetails?.interval || null,
        next_invoice_at: stripeDetails?.nextInvoiceAt || subscription?.current_period_end || null,
        last_payment_amount: latestPayment?.amount ?? null,
        last_payment_currency: latestPayment?.currency || null,
        last_payment_at: latestPayment?.created_at || null
      }
    }))

    return { data: enrichedClients, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
})

async function getStripeSubscriptionDetails (subscriptionId) {
  if (!subscriptionId) return null

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const item = subscription.items?.data?.[0]
    const price = item?.price
    return {
      status: subscription.status,
      amount: price?.unit_amount ?? null,
      currency: price?.currency || null,
      interval: price?.recurring?.interval || null,
      nextInvoiceAt: toIso(subscription.current_period_end || item?.current_period_end)
    }
  } catch (error) {
    console.error(`No se pudo leer la suscripción ${subscriptionId}:`, error.message)
    return null
  }
}

// Sincronizar Stripe directo desde Electron. No dependemos de Edge Functions para evitar webhooks/handlers rotos.
ipcMain.handle('stripe-sync-customers', async () => {
  try {
    const result = await syncStripeToInsforge()
    return { data: result, error: null }
  } catch (error) {
    console.error('Error en sync:', error)
    return { data: null, error: error.message }
  }
})

async function syncStripeToInsforge () {
  const [customers, subscriptions, charges] = await Promise.all([
    stripe.customers.list({ limit: 100 }),
    stripe.subscriptions.list({ status: 'all', limit: 100 }),
    stripe.charges.list({ limit: 100 })
  ])

  const subscriptionsByCustomer = new Map()
  for (const subscription of subscriptions.data) {
    const list = subscriptionsByCustomer.get(subscription.customer) || []
    list.push(subscription)
    subscriptionsByCustomer.set(subscription.customer, list)
  }

  const bestCustomerByEmail = new Map()
  for (const customer of customers.data) {
    if (!customer.email) continue
    const hasActiveSubscription = (subscriptionsByCustomer.get(customer.id) || [])
      .some(subscription => ['active', 'trialing'].includes(subscription.status))
    const score = (hasActiveSubscription ? 10_000_000_000_000 : 0) + customer.created
    const current = bestCustomerByEmail.get(customer.email)
    if (!current || score > current.score) {
      bestCustomerByEmail.set(customer.email, { customer, score, hasActiveSubscription })
    }
  }

  const syncedClients = []
  for (const { customer, hasActiveSubscription } of bestCustomerByEmail.values()) {
    const paymentMethod = await getStripePaymentMethodLabel(customer.id)
    const client = await upsertInsforgeRecord('clients', 'email', customer.email, {
      email: customer.email,
      name: customer.name || customer.description || customer.email,
      stripe_customer_id: customer.id,
      status: hasActiveSubscription ? 'active' : 'inactive',
      payment_method: paymentMethod,
      updated_at: new Date().toISOString()
    })
    syncedClients.push(client)
  }

  const clients = await getInsforgeRecords('clients', 'select=id,email,stripe_customer_id')
  const clientByStripeCustomer = new Map(clients.map(client => [client.stripe_customer_id, client]))

  let syncedSubscriptions = 0
  for (const subscription of subscriptions.data) {
    const item = subscription.items?.data?.[0]
    await upsertInsforgeRecord('subscriptions', 'stripe_subscription_id', subscription.id, {
      client_id: clientByStripeCustomer.get(subscription.customer)?.id || null,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start: toIso(subscription.current_period_start || item?.current_period_start),
      current_period_end: toIso(subscription.current_period_end || item?.current_period_end),
      updated_at: new Date().toISOString()
    })
    syncedSubscriptions++
  }

  let syncedCharges = 0
  for (const charge of charges.data) {
    await upsertInsforgeRecord('payment_history', 'stripe_charge_id', charge.id, {
      stripe_charge_id: charge.id,
      client_id: clientByStripeCustomer.get(charge.customer)?.id || null,
      amount: charge.amount,
      currency: charge.currency,
      status: charge.refunded ? 'refunded' : charge.status,
      description: charge.description || charge.billing_details?.name || charge.billing_details?.email || 'Stripe charge',
      failure_reason: charge.failure_message || null,
      created_at: toIso(charge.created) || new Date().toISOString()
    })
    syncedCharges++
  }

  return {
    message: `Sincronizados ${syncedClients.length} clientes, ${syncedSubscriptions} suscripciones y ${syncedCharges} pagos`,
    clients: syncedClients.length,
    subscriptions: syncedSubscriptions,
    payments: syncedCharges
  }
}

async function getStripePaymentMethodLabel (customerId) {
  try {
    const methods = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })
    const card = methods.data[0]?.card
    if (!card) return 'No saved method'
    return `${card.brand.charAt(0).toUpperCase() + card.brand.slice(1)} **** ${card.last4}`
  } catch (_error) {
    return 'No saved method'
  }
}

async function getInsforgeRecords (table, query = 'select=*') {
  const response = await fetch(`${INSFORGE_URL}/api/database/records/${table}?${query}`, {
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'apikey': ANON_KEY
    }
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.message || data?.error || `No se pudo leer ${table}`)
  return data
}

async function upsertInsforgeRecord (table, key, value, payload) {
  const existing = await getInsforgeRecords(table, `select=*&${key}=eq.${encodeURIComponent(value)}&limit=1`)
  if (existing.length > 0) {
    const response = await fetch(`${INSFORGE_URL}/api/database/records/${table}?${key}=eq.${encodeURIComponent(value)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data?.message || data?.error || `No se pudo actualizar ${table}`)
    return Array.isArray(data) ? data[0] : data
  }

  const response = await fetch(`${INSFORGE_URL}/api/database/records/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
      'apikey': ANON_KEY,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify([payload])
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.message || data?.error || `No se pudo insertar en ${table}`)
  return Array.isArray(data) ? data[0] : data
}

function toIso (timestamp) {
  return timestamp ? new Date(timestamp * 1000).toISOString() : null
}

// Obtener tasa de cambio y conversión de USD a DOP usando Stripe FX Quotes (con fallback tolerante a fallos)
ipcMain.handle('stripe-get-fx-rate', async (event, { amountUsdCent }) => {
  try {
    const baseAmount = amountUsdCent || 100 // Por defecto $1.00 USD
    let rate = 58.50 // Tasa de fallback por defecto para RD (muy cercana a la tasa real)
    let isLiveQuote = false
    let quoteId = null

    try {
      // Realizar consulta directa mediante Fetch para evitar limitaciones de versiones antiguas del SDK de Stripe que no tienen registrado el recurso 'fxQuotes' (en preview)
      const authHeader = 'Basic ' + Buffer.from(process.env.STRIPE_SECRET_KEY + ':').toString('base64')
      
      const params = new URLSearchParams()
      params.append('to_currency', 'usd')
      params.append('from_currencies[]', 'dop')
      params.append('lock_duration', 'hour')

      const response = await fetch('https://api.stripe.com/v1/fx_quotes', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Stripe-Version': '2025-03-31.preview',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      })

      if (response.ok) {
        const fxQuote = await response.json()
        console.log('[Stripe FX API Detail] Respuesta completa de Stripe FX:', JSON.stringify(fxQuote, null, 2))
        const dopRate = fxQuote?.rates?.dop || fxQuote?.rates?.DOP
        if (dopRate && dopRate.exchange_rate) {
          // Stripe devuelve la tasa DOP -> USD (por ejemplo, 0.017094)
          // La tasa inversa USD -> DOP es 1 / tasa_stripe (por ejemplo, 58.50)
          rate = 1 / dopRate.exchange_rate
          isLiveQuote = true
          quoteId = fxQuote.id
          console.log(`[Stripe FX] Cotización oficial en vivo obtenida vía HTTP. Tasa USD->DOP: ${rate}. ID: ${quoteId}`)
        }
      } else {
        const errData = await response.json().catch(() => ({}))
        console.log(`[Stripe FX API Error] Stripe respondió con código ${response.status}:`, errData?.error?.message || response.statusText)
      }
    } catch (stripeErr) {
      console.log(`[Stripe FX Fallback] Falló llamada directa a FX Quotes API. Usando simulación de tasa. Detalle: ${stripeErr.message}`)
    }

    const calculatedDopCent = Math.round(baseAmount * rate)

    return {
      data: {
        rate,
        usdCent: baseAmount,
        dopCent: calculatedDopCent,
        isLiveQuote,
        quoteId,
        rateFormatted: rate.toFixed(4)
      },
      error: null
    }
  } catch (err) {
    console.error('Error general en stripe-get-fx-rate:', err.message)
    return { data: null, error: err.message }
  }
})

// Generar link de pago dinámico (Stripe SDK directo)
ipcMain.handle('stripe-create-link', async (event, payload) => {
  try {
    const { description = 'Pago de Servicio', notes = '', amount, type = 'payment', interval = 'month', currency = 'usd', dopAmountText } = payload

    if (!amount) {
      return { data: null, error: { error: 'El monto es obligatorio' } }
    }

    if (!['payment', 'subscription'].includes(type)) {
      return { data: null, error: { error: 'type debe ser payment o subscription' } }
    }

    const finalDescription = dopAmountText && currency.toLowerCase() === 'usd'
      ? `${description} (Aprox. RD$${dopAmountText})`
      : description

    // Combinar las notas del usuario con la nota de conversión DOP si está habilitada
    let finalNote = notes
    if (dopAmountText && currency.toLowerCase() === 'usd') {
      const dopLine = `Equivalente aproximado: RD$${dopAmountText} según tasa Stripe. (Nota: Los cargos en tarjeta se procesan en USD. El monto final en pesos es un estimado de referencia y puede variar según las políticas de tu banco emisor).`
      finalNote = notes ? `${notes}\n\n${dopLine}` : dopLine
    }

    const priceData = {
      currency,
      product_data: { 
        name: description, // Mantiene el concepto limpio en Stripe
        ...(finalNote ? { description: finalNote } : {}) // Asigna las notas/subtítulo en Stripe Checkout
      },
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
      metadata: {
        base_usd_amount: (amount / 100).toFixed(2),
        ...(dopAmountText ? { equivalent_dop_amount: dopAmountText } : {})
      }
    }

    if (type === 'payment') {
      sessionConfig.customer_creation = 'always'
    }

    console.log('Creando Checkout Session con Stripe SDK...', { finalDescription, amount, type })
    const session = await stripe.checkout.sessions.create(sessionConfig)
    console.log('Sesión creada:', session.id, session.url)

    let finalUrl = session.url
    try {
      console.log('Acortando URL con is.gd API...')
      const shortenerRes = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(session.url)}`)
      if (shortenerRes.ok) {
        const shortData = await shortenerRes.json()
        if (shortData.shorturl) {
          finalUrl = shortData.shorturl
          console.log('URL acortada con éxito por is.gd:', finalUrl)
        }
      }
    } catch (shortenErr) {
      console.error('Error acortando URL con is.gd:', shortenErr.message)
      // Fallback al URL largo original de Stripe para resiliencia del flujo
    }

    // GUARDAR LINK EN LA BASE DE DATOS
    try {
      await fetch(`${INSFORGE_URL}/api/database/records/payment_links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY
        },
        body: JSON.stringify([{
          url: `${finalUrl}||${session.url}`,
          description: finalDescription,
          amount: amount,
          currency: currency.toUpperCase(),
          created_at: new Date().toISOString()
        }])
      })
      console.log('Link guardado en Insforge DB');
    } catch (saveErr) {
      console.error('Error al guardar link en DB:', saveErr.message);
    }

    return { data: { url: finalUrl, sessionId: session.id }, error: null }
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
    const expiryAt = new Date()
    expiryAt.setDate(expiryAt.getDate() + 7)

    const response = await fetch(`${INSFORGE_URL}/api/database/records/contracts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify([{
        ...payload,
        status: 'pending',
        expiry_at: expiryAt.toISOString(),
        created_at: new Date().toISOString()
      }])
    })
    const data = await response.json()
    
    // Si hay propuesta, actualizar su estado a 'annexed'
    if (response.ok && payload.proposal_id) {
      await fetch(`${INSFORGE_URL}/api/database/records/proposals?id=eq.${payload.proposal_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY
        },
        body: JSON.stringify({ status: 'annexed' })
      })
    }

    return { data: data[0], error: response.ok ? null : data }
  } catch (error) {
    return { data: null, error: error.message }
  }
})

ipcMain.handle('stripe-generate-contract-links', async (event, { contractId, amount, description, scheme, recurringAmount }) => {
  try {
    const splits = [];
    if (scheme === '50-50') {
      splits.push({ label: 'Anticipo (50%)', amount: Math.round(amount * 0.5 * 100) });
      splits.push({ label: 'Saldo (50%)', amount: Math.round(amount * 0.5 * 100) });
    } else if (scheme === '3-parts') {
      splits.push({ label: 'Inicio (30%)', amount: Math.round(amount * 0.3 * 100) });
      splits.push({ label: 'Hito (40%)', amount: Math.round(amount * 0.4 * 100) });
      splits.push({ label: 'Final (30%)', amount: Math.round(amount * 0.3 * 100) });
    } else {
      splits.push({ label: 'Pago Único (100%)', amount: Math.round(amount * 100) });
    }

    const links = [];
    for (const split of splits) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `${description} - ${split.label}` },
            unit_amount: split.amount,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: 'https://payforge.azokia.com/success',
        cancel_url: 'https://payforge.azokia.com/cancel',
      });
      const link = { label: split.label, url: session.url, amount: split.amount, mode: 'payment' };
      links.push(link);

      await fetch(`${INSFORGE_URL}/api/database/records/payment_links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY
        },
        body: JSON.stringify([{
          url: session.url,
          description: `${description} - ${split.label}`,
          amount: split.amount,
          currency: 'USD',
          created_at: new Date().toISOString()
        }])
      });
    }

    if (recurringAmount && Number(recurringAmount) > 0) {
      const recurringCents = Math.round(Number(recurringAmount) * 100);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `${description} - Suscripción mensual` },
            unit_amount: recurringCents,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: 'https://payforge.azokia.com/success',
        cancel_url: 'https://payforge.azokia.com/cancel',
      });

      const link = { label: 'Suscripción mensual', url: session.url, amount: recurringCents, mode: 'subscription' };
      links.push(link);

      await fetch(`${INSFORGE_URL}/api/database/records/payment_links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY
        },
        body: JSON.stringify([{
          url: session.url,
          description: `${description} - Suscripción mensual`,
          amount: recurringCents,
          currency: 'USD',
          created_at: new Date().toISOString()
        }])
      });
    }

    return { data: links, error: null };
  } catch (error) {
    return { data: null, error: error.message };
  }
})

ipcMain.handle('stripe-generate-single-contract-link', async (event, { amount, description, label, mode = 'payment' }) => {
  try {
    const unitAmount = Math.round(Number(amount) * 100)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `${description} - ${label}` },
          unit_amount: unitAmount,
          ...(mode === 'subscription' ? { recurring: { interval: 'month' } } : {})
        },
        quantity: 1,
      }],
      mode,
      success_url: 'https://payforge.azokia.com/success',
      cancel_url: 'https://payforge.azokia.com/cancel',
    })

    await fetch(`${INSFORGE_URL}/api/database/records/payment_links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY
      },
      body: JSON.stringify([{
        url: session.url,
        description: `${description} - ${label}`,
        amount: unitAmount,
        currency: 'USD',
        created_at: new Date().toISOString()
      }])
    })

    return { data: { label, url: session.url, amount: unitAmount, mode }, error: null }
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

// --- PROPOSALS HANDLERS ---

ipcMain.handle('db-get-proposals', async () => {
  try {
    const response = await fetch(`${INSFORGE_URL}/api/database/records/proposals?select=*,clients(name,email)&order=created_at.desc`, {
      headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY }
    })
    const data = await response.json()
    return { data, error: response.ok ? null : data }
  } catch (error) {
    return { data: null, error: error.message }
  }
})

ipcMain.handle('db-create-proposal', async (event, payload) => {
  try {
    const expiryAt = new Date()
    expiryAt.setDate(expiryAt.getDate() + 7)

    const response = await fetch(`${INSFORGE_URL}/api/database/records/proposals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify([{
        ...payload,
        status: 'draft',
        expiry_at: expiryAt.toISOString(),
        created_at: new Date().toISOString()
      }])
    })
    const data = await response.json()
    return { data: data[0], error: response.ok ? null : data }
  } catch (error) {
    return { data: null, error: error.message }
  }
})

ipcMain.handle('db-get-calendar-events', async () => {
  try {
    const [contractsRes, proposalsRes] = await Promise.all([
      fetch(`${INSFORGE_URL}/api/database/records/contracts?select=id,description,status,created_at,expiry_at,signed_at`, {
        headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY }
      }),
      fetch(`${INSFORGE_URL}/api/database/records/proposals?select=id,project_name,status,created_at,expiry_at`, {
        headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY }
      })
    ]);

    const contracts = await contractsRes.json();
    const proposals = await proposalsRes.json();

    const events = [];

    contracts.forEach(c => {
      events.push({ id: `c-start-${c.id}`, title: `Contrato: ${c.description}`, date: c.created_at, type: 'contract-created' });
      if (c.expiry_at) events.push({ id: `c-exp-${c.id}`, title: `Vence Contrato: ${c.description}`, date: c.expiry_at, type: 'contract-expiry' });
      if (c.signed_at) events.push({ id: `c-signed-${c.id}`, title: `Firmado: ${c.description}`, date: c.signed_at, type: 'contract-signed' });
    });

    proposals.forEach(p => {
      events.push({ id: `p-start-${p.id}`, title: `Propuesta: ${p.project_name}`, date: p.created_at, type: 'proposal-created' });
      if (p.expiry_at) events.push({ id: `p-exp-${p.id}`, title: `Vence Propuesta: ${p.project_name}`, date: p.expiry_at, type: 'proposal-expiry' });
    });

    return { data: events, error: null };
  } catch (error) {
    return { data: null, error: error.message };
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
