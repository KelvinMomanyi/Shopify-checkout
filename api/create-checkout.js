// api/create-checkout.js
const Shopify = require('shopify-api-node');

// Initialize Shopify (reused across invocations in same container)
const shopify = new Shopify({
  shopName: process.env.SHOPIFY_SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_ADMIN_API_TOKEN,
  autoLimit: true
});

module.exports = async (req, res) => {
  // Set CORS headers (consistent with sync-prices.js)
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
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid items array' });
    }

    console.log(`🛒 Creating checkout for ${items.length} items...`);

    // Step 1: Prepare line_items for cart creation
    const lineItems = items.map(item => ({
      variant_id: item.variant_id,
      quantity: item.quantity || 1,
      // Optional: Add custom properties for line items (e.g., for discounts or metadata)
      // properties: [{ name: 'Custom Price Cents', value: item.custom_price_cents.toString() }]
    }));

    // Step 2: Create the cart via Shopify Cart API
    const cart = await shopify.cart.create({
      line_items: lineItems,
      // Optional: Add attributes, buyer identity, or note
      // attributes: [{ key: 'custom_checkout', value: 'true' }],
      // buyer_identity: { country_code: 'US', customer: { id: 123 } } // If known
    });

    const { id: cartId, token: cartToken } = cart;
    console.log(`✅ Cart created: ID=${cartId}, Token=${cartToken}`);

    // Step 3: Sync prices (integrated from sync-prices.js logic)
    // Track which variants we've updated
    const updatedVariants = [];
    const originalPrices = new Map();

    for (const item of items) {
      const { variant_id, custom_price_cents, shopify_price_cents } = item;

      // Skip if no price diff or missing data
      if (!custom_price_cents || !shopify_price_cents || custom_price_cents === shopify_price_cents) {
        console.log(`⏭️ Skipping variant ${variant_id}: No price change needed`);
        continue;
      }

      try {
        // Store original price (for later restoration via cron job)
        if (!originalPrices.has(variant_id)) {
          originalPrices.set(variant_id, shopify_price_cents);
        }

        // Fetch current variant to confirm price (safety check for races)
        const variant = await shopify.productVariant.get(variant_id);
        const currentPriceCents = Math.round(parseFloat(variant.price) * 100);

        if (currentPriceCents !== shopify_price_cents) {
          console.warn(`⚠️ Variant ${variant_id} price mismatch: expected ${shopify_price_cents}¢, got ${currentPriceCents}¢`);
        }

        // Update variant price to custom value
        const customPriceFormatted = (custom_price_cents / 100).toFixed(2);
        
        await shopify.productVariant.update(variant_id, {
          price: customPriceFormatted
        });

        updatedVariants.push({
          variant_id,
          old_price: (shopify_price_cents / 100).toFixed(2),
          new_price: parseFloat(customPriceFormatted)
        });

        console.log(`✅ Updated variant ${variant_id}: $${(shopify_price_cents / 100).toFixed(2)} → $${customPriceFormatted}`);
       
      } catch (error) {
        console.error(`❌ Failed to update variant ${variant_id}:`, error.message);
        // Continue processing other items; don't fail the entire checkout
      }
    }

    // Step 4: Generate private access token for client-side Storefront API (fixes 401 on /private_access_tokens)
    let privateToken = null;
    const storefrontAccessToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
    if (storefrontAccessToken) {
      try {
        const privateTokenMutation = `
          mutation privateAccessTokenCreate($input: PrivateAccessTokenCreateInput!) {
            privateAccessTokenCreate(input: $input) {
              privateAccessToken {
                token
                expiresAt
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        const variables = {
          input: {
            shopId: process.env.SHOPIFY_SHOP_NAME,  // e.g., 'sofamojo'
            accessToken: storefrontAccessToken
          }
        };
        const privateTokenResponse = await shopify.graphql(privateTokenMutation, variables);
        privateToken = privateTokenResponse.privateAccessTokenCreate?.privateAccessToken?.token;
        if (privateToken) {
          console.log(`✅ Private token generated for cart ${cartId} (expires: ${privateTokenResponse.privateAccessTokenCreate.privateAccessToken.expiresAt})`);
        } else {
          console.warn('⚠️ Failed to generate private token:', privateTokenResponse.privateAccessTokenCreate?.userErrors);
        }
      } catch (error) {
        console.error('❌ Private token generation error:', error.message);
        // Fallback: Client can use public storefront token
      }
    } else {
      console.warn('⚠️ SHOPIFY_STOREFRONT_ACCESS_TOKEN env var missing; skipping private token generation');
    }

    // Step 5: Generate absolute checkout URL
    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN || `${process.env.SHOPIFY_SHOP_NAME}.myshopify.com`; // e.g., 'sofamojo.com' or fallback
    const checkoutUrl = `https://${shopDomain}/cart?token=${cartToken}&_x=1`; // Shopify's cart-to-checkout redirect; _x=1 for fresh load

    // Send immediate response
    res.json({
      success: true,
      cart_id: cartId,
      cart_token: cartToken,
      private_token: privateToken,  // For client-side Storefront API queries (e.g., extensions)
      checkout_url: checkoutUrl,
      updated_variants: updatedVariants,
      original_prices: Object.fromEntries(originalPrices),  // For cron restoration reference
      message: `Checkout created successfully. Synced ${updatedVariants.length} variant prices.`,
      note: 'Prices will be restored automatically by scheduled job (api/restore-prices.js). Private token expires in ~1 hour.'
    });

    // Note: Price restoration should be handled by a separate cron job (api/restore-prices.js)
    // because Vercel serverless functions timeout after execution.
    // Use webhooks or cron to scan recent carts and revert using original_prices.

  } catch (error) {
    console.error('❌ Create checkout error:', error);
    return res.status(500).json({
      error: 'Failed to create checkout',
      details: error.message
    });
  }
};