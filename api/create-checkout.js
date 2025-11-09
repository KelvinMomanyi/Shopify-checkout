// api/sync-prices.js
const Shopify = require('shopify-api-node');

// Initialize Shopify (reused across invocations in same container)
const shopify = new Shopify({
  shopName: process.env.SHOPIFY_SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_ADMIN_API_TOKEN,
  autoLimit: true
});

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items, cart_token } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid items array' });
    }

    console.log(`🔄 Syncing prices for ${items.length} items...`);

    // Track which variants we've updated
    const updatedVariants = [];
    const originalPrices = new Map();

    // Update each variant's price to match the custom calculation
    for (const item of items) {
      const { variant_id, custom_price_cents, shopify_price_cents } = item;

      // Only update if custom price differs from Shopify price
      if (custom_price_cents !== shopify_price_cents) {
        try {
          // Store original price
          if (!originalPrices.has(variant_id)) {
            originalPrices.set(variant_id, shopify_price_cents);
          }

          // Update variant price
          const customPriceFormatted = (custom_price_cents / 100).toFixed(2);
          
          await shopify.productVariant.update(variant_id, {
            price: customPriceFormatted
          });

          updatedVariants.push({
            variant_id,
            old_price: shopify_price_cents / 100,
            new_price: parseFloat(customPriceFormatted)
          });

          console.log(`✅ Updated variant ${variant_id}: $${shopify_price_cents / 100} → $${customPriceFormatted}`);
         
        } catch (error) {
          console.error(`❌ Failed to update variant ${variant_id}:`, error.message);
        }
      }
    }

    // Get the cart's checkout URL
    const checkoutUrl = `/checkout?cart_token=${cart_token}`;

    // Send immediate response
    res.json({
      success: true,
      updated_variants: updatedVariants,
      checkout_url: checkoutUrl,
      message: `Successfully synced ${updatedVariants.length} variant prices`,
      note: 'Prices will be restored automatically by scheduled job'
    });

    // Note: Price restoration should be handled by a separate cron job
    // because Vercel serverless functions timeout after execution
    // See api/restore-prices.js for the restoration logic

  } catch (error) {
    console.error('❌ Price sync error:', error);
    return res.status(500).json({
      error: 'Failed to sync prices',
      details: error.message
    });
  }
};