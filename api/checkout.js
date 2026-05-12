
const stripe = require('stripe')(process.env.STRIPE_PRIVATE_KEY);

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { planId, points, price } = req.body;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'hkd',
              product_data: {
              name: `BlessingCardAI - ${planId} Plan`,
              description: `Add ${points} points to your account`,
              },
              unit_amount: price * 100, // Stripe uses cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/pricing`,
      });

      res.status(200).json({ url: session.url });
    } catch (err) {
      console.error("STRIPE ERROR:", err); res.status(500).json({ error: err.message });
    }
  } else {
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
  }
}
