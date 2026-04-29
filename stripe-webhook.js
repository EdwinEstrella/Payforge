import Stripe from 'npm:stripe';
import { createClient } from 'npm:@insforge/sdk';

export default async function(request) {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
  const insforge = createClient({
    baseUrl: Deno.env.get('INSFORGE_INTERNAL_URL') || Deno.env.get('INSFORGE_BASE_URL'),
    anonKey: Deno.env.get('API_KEY')
  });

  const signature = request.headers.get('stripe-signature');
  const body = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log(`[Webhook] Evento recibido: ${event.type}`);
  const data = event.data.object;

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(data, stripe, insforge);
        break;
      case 'checkout.session.expired':
        await handleCheckoutExpired(data, insforge);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(data, insforge);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(data, insforge);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoiceSucceeded(data, stripe, insforge);
        break;
      case 'invoice.payment_failed':
        await handleInvoiceFailed(data, insforge);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(data, insforge);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(data, insforge);
        break;
    }
  } catch (err) {
    console.error(`[Webhook] Error procesando ${event.type}:`, err.message);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// --- CHECKOUT SESSION COMPLETED ---
async function handleCheckoutCompleted(session, stripe, insforge) {
  const customerId = session.customer;
  const customerEmail = session.customer_details?.email;
  const customerName = session.customer_details?.name;

  if (!customerEmail) {
    console.error('[Webhook] checkout.session.completed sin email');
    return;
  }

  // Obtener método de pago del customer
  let paymentMethod = 'Sin método';
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1
    });
    if (paymentMethods.data.length > 0) {
      const card = paymentMethods.data[0].card;
      paymentMethod = `${card.brand.charAt(0).toUpperCase() + card.brand.slice(1)} •••• ${card.last4}`;
    }
  } catch (e) {
    console.log('[Webhook] No se pudo obtener método de pago:', e.message);
  }

  // Estado real basado en payment_status
  const clientStatus = session.payment_status === 'paid' ? 'active' : 'incomplete';

  // Upsert cliente
  const { data: client, error: clientError } = await insforge.database
    .from('clients')
    .upsert([{
      email: customerEmail,
      name: customerName,
      stripe_customer_id: customerId,
      status: clientStatus,
      payment_method: paymentMethod,
      updated_at: new Date().toISOString()
    }], { onConflict: 'email' })
    .select('*')
    .single();

  if (clientError) {
    console.error('[Webhook] Error upsert cliente:', clientError);
    return;
  }

  // Si es suscripción, registrar/actualizar
  if (session.mode === 'subscription' && session.subscription) {
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    
    await insforge.database.from('clients').update({
      status: subscription.status
    }).eq('id', client.id);

    await insforge.database.from('subscriptions').upsert([{
      client_id: client.id,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }], { onConflict: 'stripe_subscription_id' });
  }

  // Registrar pago en historial
  if (session.payment_status === 'paid') {
    await insforge.database.from('payment_history').insert([{
      stripe_charge_id: session.payment_intent || `session_${session.id}`,
      client_id: client.id,
      amount: session.amount_total,
      currency: session.currency,
      status: 'succeeded',
      description: `${session.mode === 'subscription' ? 'Suscripción' : 'Pago único'} - ${customerName || customerEmail}`,
      failure_reason: null
    }]);
  }

  console.log(`[Webhook] Checkout completado para ${customerEmail} (${session.mode})`);
}

// --- CHECKOUT SESSION EXPIRED ---
async function handleCheckoutExpired(session, insforge) {
  await insforge.database.from('payment_history').insert([{
    stripe_charge_id: session.payment_intent || `expired_${session.id}`,
    client_id: null,
    amount: session.amount_total || 0,
    currency: session.currency || 'usd',
    status: 'expired',
    description: `Link expirado sin pago`,
    failure_reason: 'El cliente no completó el pago antes de que expirara el link (24h)'
  }]);
  console.log(`[Webhook] Checkout expirado: ${session.id}`);
}

// --- PAYMENT INTENT FAILED ---
async function handlePaymentFailed(paymentIntent, insforge) {
  const errorMsg = paymentIntent.last_payment_error?.message || 'Error desconocido';
  const errorCode = paymentIntent.last_payment_error?.code || '';
  const customerEmail = paymentIntent.receipt_email || paymentIntent.last_payment_error?.payment_method?.billing_details?.email;

  // Buscar cliente si existe
  let clientId = null;
  if (paymentIntent.customer) {
    const { data: client } = await insforge.database
      .from('clients')
      .select('id')
      .eq('stripe_customer_id', paymentIntent.customer)
      .single();
    clientId = client?.id || null;
  }

  await insforge.database.from('payment_history').insert([{
    stripe_charge_id: paymentIntent.id,
    client_id: clientId,
    amount: paymentIntent.amount || 0,
    currency: paymentIntent.currency || 'usd',
    status: 'failed',
    description: `Pago fallido${customerEmail ? ' - ' + customerEmail : ''}`,
    failure_reason: `${errorCode ? errorCode + ': ' : ''}${errorMsg}`
  }]);
  console.log(`[Webhook] Pago fallido: ${errorMsg}`);
}

// --- CHARGE REFUNDED ---
async function handleChargeRefunded(charge, insforge) {
  // Actualizar el registro existente de succeeded a refunded
  const { data: existing } = await insforge.database
    .from('payment_history')
    .select('id')
    .eq('stripe_charge_id', charge.payment_intent || charge.id)
    .single();

  if (existing) {
    await insforge.database.from('payment_history').update({
      status: 'refunded',
      failure_reason: `Reembolso procesado: ${(charge.amount_refunded / 100).toFixed(2)} ${charge.currency.toUpperCase()}`
    }).eq('id', existing.id);
  } else {
    await insforge.database.from('payment_history').insert([{
      stripe_charge_id: charge.payment_intent || charge.id,
      client_id: null,
      amount: charge.amount_refunded,
      currency: charge.currency,
      status: 'refunded',
      description: `Reembolso`,
      failure_reason: `Reembolso procesado`
    }]);
  }
  console.log(`[Webhook] Cargo reembolsado: ${charge.id}`);
}

// --- INVOICE PAYMENT SUCCEEDED ---
async function handleInvoiceSucceeded(invoice, stripe, insforge) {
  if (!invoice.subscription) return;

  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  const { data: client } = await insforge.database
    .from('clients')
    .select('id')
    .eq('stripe_customer_id', invoice.customer)
    .single();

  if (!client) return;

  // Actualizar suscripción
  await insforge.database.from('subscriptions').upsert([{
    stripe_subscription_id: subscription.id,
    client_id: client.id,
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }], { onConflict: 'stripe_subscription_id' });

  // Actualizar estado del cliente
  await insforge.database.from('clients').update({
    status: subscription.status
  }).eq('id', client.id);

  // Registrar pago de renovación
  const chargeId = invoice.charge || `invoice_${invoice.id}`;
  await insforge.database.from('payment_history').insert([{
    stripe_charge_id: chargeId,
    client_id: client.id,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    status: 'succeeded',
    description: `Renovación de suscripción`,
    failure_reason: null
  }]);

  console.log(`[Webhook] Invoice pagada: ${invoice.id}`);
}

// --- INVOICE PAYMENT FAILED ---
async function handleInvoiceFailed(invoice, insforge) {
  const { data: client } = await insforge.database
    .from('clients')
    .select('id')
    .eq('stripe_customer_id', invoice.customer)
    .single();

  // Actualizar cliente a past_due
  await insforge.database.from('clients').update({
    status: 'past_due'
  }).eq('stripe_customer_id', invoice.customer);

  // Registrar fallo en historial
  const errorMsg = invoice.last_finalization_error?.message || 'Pago de factura rechazado';
  await insforge.database.from('payment_history').insert([{
    stripe_charge_id: invoice.charge || `inv_fail_${invoice.id}`,
    client_id: client?.id || null,
    amount: invoice.amount_due,
    currency: invoice.currency,
    status: 'failed',
    description: `Fallo renovación de suscripción`,
    failure_reason: errorMsg
  }]);

  console.log(`[Webhook] Invoice fallida: ${invoice.id} - ${errorMsg}`);
}

// --- SUBSCRIPTION UPDATED ---
async function handleSubscriptionUpdated(subscription, insforge) {
  await insforge.database.from('subscriptions').update({
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }).eq('stripe_subscription_id', subscription.id);

  // Sincronizar estado del cliente con el de la suscripción
  await insforge.database.from('clients').update({
    status: subscription.status === 'active' ? 'active' : 
            subscription.status === 'past_due' ? 'past_due' :
            subscription.status === 'canceled' ? 'inactive' : subscription.status
  }).eq('stripe_customer_id', subscription.customer);

  console.log(`[Webhook] Suscripción actualizada: ${subscription.id} → ${subscription.status}`);
}

// --- SUBSCRIPTION DELETED ---
async function handleSubscriptionDeleted(subscription, insforge) {
  await insforge.database.from('subscriptions').update({
    status: 'canceled',
    updated_at: new Date().toISOString()
  }).eq('stripe_subscription_id', subscription.id);

  await insforge.database.from('clients').update({
    status: 'inactive'
  }).eq('stripe_customer_id', subscription.customer);

  console.log(`[Webhook] Suscripción cancelada: ${subscription.id}`);
}
