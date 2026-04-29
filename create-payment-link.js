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
    console.log('1. Función iniciada');

    const key = Deno.env.get('STRIPE_SECRET_KEY');
    console.log('2. Key encontrada:', !!key);
    if (!key) throw new Error('STRIPE_SECRET_KEY no configurada');

    const stripe = new Stripe(key, { apiVersion: '2024-06-20' });
    console.log('3. Stripe inicializado');

    const body = await request.json();
    console.log('4. Body:', JSON.stringify(body));

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

    console.log('5. Creando sesión Stripe...');
    const session = await stripe.checkout.sessions.create(sessionConfig);
    console.log('6. Sesión creada:', session.id);

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('❌ Error:', err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
