import Stripe from 'npm:stripe';
import { createClient } from 'npm:@insforge/sdk';

export default async function(request) {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
  const insforge = createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    anonKey: Deno.env.get('INSFORGE_SERVICE_ROLE_KEY')
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
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const data = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(data, stripe, insforge);
      break;
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(data, stripe, insforge);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(data, insforge);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(data, insforge);
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleCheckoutSessionCompleted(session, stripe, insforge) {
  const customerId = session.customer;
  const customerEmail = session.customer_details.email;
  const customerName = session.customer_details.name;

  // El estado inicial del cliente dependerá de si el pago se completó
  const initialStatus = session.payment_status === 'paid' ? 'active' : 'incomplete';

  const { data: client, error: clientError } = await insforge.from('clients').upsert({
    email: customerEmail,
    name: customerName,
    stripe_customer_id: customerId,
    status: initialStatus,
    updated_at: new Date().toISOString()
  }, { onConflict: 'email' }).select().single();

  if (clientError) return;

  if (session.mode === 'subscription' && session.subscription) {
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    
    // Si es suscripción, el estado del cliente debe sincronizarse con el de la suscripción
    // (active, incomplete, past_due, etc.)
    await insforge.from('clients').update({ 
      status: subscription.status 
    }).eq('id', client.id);

    await insforge.from('subscriptions').upsert({
      client_id: client.id,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'stripe_subscription_id' });
  }

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

async function handleInvoicePaymentSucceeded(invoice, stripe, insforge) {
  if (!invoice.subscription) return;
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  const { data: client } = await insforge.from('clients').select('id').eq('stripe_customer_id', invoice.customer).single();
  
  if (client) {
    await insforge.from('subscriptions').upsert({
      stripe_subscription_id: subscription.id,
      client_id: client.id,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'stripe_subscription_id' });
  }
}

async function handleInvoicePaymentFailed(invoice, insforge) {
  await insforge.from('clients').update({ status: 'past_due' }).eq('stripe_customer_id', invoice.customer);
}

async function handleSubscriptionDeleted(subscription, insforge) {
  await insforge.from('subscriptions').update({ status: 'canceled' }).eq('stripe_subscription_id', subscription.id);
  await insforge.from('clients').update({ status: 'inactive' }).eq('stripe_customer_id', subscription.customer);
}
