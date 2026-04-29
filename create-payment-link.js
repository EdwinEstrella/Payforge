import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

export default async function(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
  };

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    if (!key) {
      return new Response(JSON.stringify({ 
        error: 'STRIPE_SECRET_KEY no configurada en el entorno de la edge function',
        hint: 'Configurar la variable de entorno STRIPE_SECRET_KEY en InsForge'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const stripe = new Stripe(key, { apiVersion: '2024-06-20' });

    const body = await request.json();

    const { amount, description = 'Pago de Servicio', type = 'payment', interval = 'month', currency = 'usd' } = body;

    if (!amount) {
      return new Response(JSON.stringify({ error: 'El monto es obligatorio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!['payment', 'subscription'].includes(type)) {
      return new Response(JSON.stringify({ error: 'type debe ser payment o subscription' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const priceData = {
      currency,
      product_data: { name: description },
      unit_amount: amount,
    };

    if (type === 'subscription') {
      priceData.recurring = { interval };
    }

    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [{ price_data: priceData, quantity: 1 }],
      mode: type,
      success_url: `${Deno.env.get('SUCCESS_URL') || 'https://payforge.azokia.com/success'}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: Deno.env.get('CANCEL_URL') || 'https://payforge.azokia.com/cancel',
    };

    if (type === 'payment') {
      sessionConfig.customer_creation = 'always';
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ 
      error: err.message,
      type: err.constructor?.name || 'Unknown',
      stack: err.stack?.split('\n').slice(0, 3).join('\n')
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
