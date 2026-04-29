/**
 * Generate Dynamic Payment Link (Stripe Checkout Session)
 * This function creates a session with price_data on the fly.
 */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function(request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { amount, clientName, clientEmail, type = 'subscription', interval = 'month', currency = 'usd' } = await request.json();

    if (!amount || !clientName) {
      return new Response(JSON.stringify({ error: 'Faltan campos obligatorios: Monto o Nombre' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const lineItem = {
      price_data: {
        currency: currency,
        product_data: {
          name: `${type === 'subscription' ? 'Suscripción' : 'Pago'} Personalizado: ${clientName}`,
          description: `Gestionado vía Payforge`
        },
        unit_amount: amount,
      },
      quantity: 1
    };

    // Agregar recurrencia solo si es suscripción
    if (type === 'subscription') {
      lineItem.price_data.recurring = { interval: interval };
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: clientEmail,
      line_items: [lineItem],
      mode: type, // 'subscription' o 'payment'
      success_url: `${process.env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.CANCEL_URL,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
