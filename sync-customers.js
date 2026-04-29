import Stripe from 'npm:stripe';
import { createClient } from 'npm:@insforge/sdk';

export default async function(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
  };

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
  const insforge = createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    anonKey: Deno.env.get('INSFORGE_SERVICE_ROLE_KEY')
  });

  try {
    const customers = await stripe.customers.list({ limit: 100 });
    const importResults = [];

    for (const customer of customers.data) {
      const { data, error } = await insforge.from('clients').upsert({
        email: customer.email,
        name: customer.name || customer.description || 'Sin nombre',
        stripe_customer_id: customer.id,
        status: 'inactive',
        updated_at: new Date().toISOString()
      }, { onConflict: 'email' }).select().single();

      importResults.push({ email: customer.email, success: !error });
    }

    return new Response(JSON.stringify({ 
      message: `Procesados ${customers.data.length} clientes`,
      results: importResults 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
