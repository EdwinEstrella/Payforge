/**
 * Initial Sync: Import existing Stripe customers to Insforge
 */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@insforge/sdk');

const insforge = createClient({
  baseUrl: process.env.INSFORGE_BASE_URL,
  anonKey: process.env.INSFORGE_SERVICE_ROLE_KEY
});

module.exports = async function(request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const customers = await stripe.customers.list({ limit: 100 });
    const importResults = [];

    for (const customer of customers.data) {
      const { data, error } = await insforge.from('clients').upsert({
        email: customer.email,
        name: customer.name || customer.description,
        stripe_customer_id: customer.id,
        status: 'inactive', // Se actualizará al recibir un webhook de suscripción activa
        updated_at: new Date().toISOString()
      }, { onConflict: 'email' }).select().single();

      importResults.push({ email: customer.email, success: !error });
    }

    return new Response(JSON.stringify({ 
      message: `Procesados ${customers.data.length} clientes`,
      results: importResults 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
