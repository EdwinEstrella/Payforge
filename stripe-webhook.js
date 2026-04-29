/**
 * Stripe Webhook Handler for Insforge
 * Handles subscription events and updates the database
 */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@insforge/sdk');

// El cliente SDK se inicializa dentro de la función para usar las variables de entorno del backend
const insforge = createClient({
  baseUrl: process.env.INSFORGE_BASE_URL,
  anonKey: process.env.INSFORGE_SERVICE_ROLE_KEY // Usamos la key de servicio para bypass RLS si es necesario
});

module.exports = async function(request) {
  const signature = request.headers.get('stripe-signature');
  const body = await request.text();

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const data = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(data);
      break;
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(data);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(data);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(data);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

async function handleCheckoutSessionCompleted(session) {
  const customerId = session.customer;
  const customerEmail = session.customer_details.email;
  const customerName = session.customer_details.name;

  // 1. Upsert cliente
  const { data: client, error: clientError } = await insforge.from('clients').upsert({
    email: customerEmail,
    name: customerName,
    stripe_customer_id: customerId,
    status: 'active',
    updated_at: new Date().toISOString()
  }, { onConflict: 'email' }).select().single();

  if (clientError) {
    console.error('Error upserting client:', clientError);
    return;
  }

  // 2. Si es una suscripción, registrarla
  if (session.mode === 'subscription' && session.subscription) {
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    await insforge.from('subscriptions').upsert({
      client_id: client.id,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'stripe_subscription_id' });
  }

  // 3. Registrar el pago inicial en el historial
  if (session.payment_status === 'paid') {
    await insforge.from('payment_history').insert([{
      stripe_charge_id: session.payment_intent || `session_${session.id}`,
      client_id: client.id,
      amount: session.amount_total,
      currency: session.currency,
      status: 'succeeded',
      description: `Pago inicial - ${session.mode === 'subscription' ? 'Suscripción' : 'Pago único'}`,
      created_at: new Date().toISOString()
    }]);
  }
}

async function handleInvoicePaymentSucceeded(invoice) {
  if (!invoice.subscription) return;

  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  
  await insforge.from('subscriptions').upsert({
    stripe_subscription_id: subscription.id,
    client_id: await getClientIdByStripeId(invoice.customer),
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'stripe_subscription_id' });
}

async function handleInvoicePaymentFailed(invoice) {
  // Notificar o marcar como past_due
  const { error } = await insforge.from('clients')
    .update({ status: 'past_due' })
    .eq('stripe_customer_id', invoice.customer);
    
  if (error) console.error('Error updating status on payment failure:', error);
}

async function handleSubscriptionDeleted(subscription) {
  await insforge.from('subscriptions')
    .update({ status: 'canceled' })
    .eq('stripe_subscription_id', subscription.id);
    
  await insforge.from('clients')
    .update({ status: 'inactive' })
    .eq('stripe_customer_id', subscription.customer);
}

async function getClientIdByStripeId(stripeCustomerId) {
  const { data } = await insforge.from('clients')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();
  return data ? data.id : null;
}
