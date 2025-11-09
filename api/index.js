// api/index.js
import Shopify from "shopify-api-node";

const shopify = new Shopify({
  shopName: process.env.SHOPIFY_SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_ADMIN_API_TOKEN,
  autoLimit: true
});

export default async function handler(req, res) {
  // Set CORS headers if needed
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    return res.json({ status: "OK", timestamp: new Date().toISOString() });
  }

  // Create checkout
  if (req.method === 'POST' && req.url === '/create-checkout') {
    try {
      const { items, customer_email } = req.body;

      const lineItems = items.map(item => ({
        variant_id: parseInt(item.variant_id),
        quantity: parseInt(item.quantity),
        price: (item.custom_price_cents / 100).toFixed(2)
      }));

      const draftOrder = await shopify.draftOrder.create({
        line_items: lineItems,
        email: customer_email || null,
        use_customer_default_address: true,
        note: "Custom pricing applied based on product configuration",
        tags: "custom-pricing"
      });

      return res.json({
        success: true,
        checkout_url: draftOrder.invoice_url,
        total_price: draftOrder.total_price
      });
    } catch (error) {
      console.error("❌ Error creating draft order:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(404).json({ error: "Not found" });
}