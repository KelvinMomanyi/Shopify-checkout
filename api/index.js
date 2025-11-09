// api/index.js
import express from "express";
import Shopify from "shopify-api-node";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const shopify = new Shopify({
  shopName: process.env.SHOPIFY_SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_ADMIN_API_TOKEN,
  autoLimit: true
});

// ========== ROUTES ==========

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Example route: create draft order (Approach 2)
app.post("/apps/cart/create-checkout", async (req, res) => {
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

    res.json({
      success: true,
      checkout_url: draftOrder.invoice_url,
      total_price: draftOrder.total_price
    });
  } catch (error) {
    console.error("❌ Error creating draft order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Export handler for Vercel
export default app;
