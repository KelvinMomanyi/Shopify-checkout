// // api/create-checkout.js
// const Shopify = require('shopify-api-node');

// // Initialize Shopify (reused across invocations in same container)
// const shopify = new Shopify({
//   shopName: process.env.SHOPIFY_SHOP_NAME,
//   apiKey: process.env.SHOPIFY_API_KEY,
//   password: process.env.SHOPIFY_ADMIN_API_TOKEN,
//   autoLimit: true
// });

// module.exports = async (req, res) => {
//   // Set CORS headers
//   res.setHeader('Access-Control-Allow-Credentials', true);
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

//   // Handle preflight
//   if (req.method === 'OPTIONS') {
//     return res.status(200).end();
//   }

//   // Only allow POST
//   if (req.method !== 'POST') {
//     return res.status(405).json({ error: 'Method not allowed' });
//   }

//   try {
//     const { items, cart_token } = req.body;

//     if (!items || !Array.isArray(items)) {
//       return res.status(400).json({ error: 'Invalid items array' });
//     }

//     console.log(`🔄 Syncing prices for ${items.length} items...`);

//     // Track which variants we've updated
//     const updatedVariants = [];
//     const originalPrices = new Map();

//     // Update each variant's price to match the custom calculation
//     for (const item of items) {
//       const { variant_id, custom_price_cents, shopify_price_cents } = item;

//       // Only update if custom price differs from Shopify price
//       if (custom_price_cents !== shopify_price_cents) {
//         try {
//           // Store original price
//           if (!originalPrices.has(variant_id)) {
//             originalPrices.set(variant_id, shopify_price_cents);
//           }

//           // Update variant price
//           const customPriceFormatted = (custom_price_cents / 100).toFixed(2);
          
//           await shopify.productVariant.update(variant_id, {
//             price: customPriceFormatted
//           });

//           updatedVariants.push({
//             variant_id,
//             old_price: shopify_price_cents / 100,
//             new_price: parseFloat(customPriceFormatted)
//           });

//           console.log(`✅ Updated variant ${variant_id}: $${shopify_price_cents / 100} → $${customPriceFormatted}`);
         
//         } catch (error) {
//           console.error(`❌ Failed to update variant ${variant_id}:`, error.message);
//         }
//       }
//     }

//     // Get the cart's checkout URL
//     const checkoutUrl = `/checkout?cart_token=${cart_token}`;

//     // Send immediate response
//     res.json({
//       success: true,
//       updated_variants: updatedVariants,
//       checkout_url: checkoutUrl,
//       message: `Successfully synced ${updatedVariants.length} variant prices`,
//       note: 'Prices will be restored automatically by scheduled job'
//     });

//     // Note: Price restoration should be handled by a separate cron job
//     // because Vercel serverless functions timeout after execution
//     // See api/restore-prices.js for the restoration logic

//   } catch (error) {
//     console.error('❌ Price sync error:', error);
//     return res.status(500).json({
//       error: 'Failed to sync prices',
//       details: error.message
//     });
//   }
// };

// // // api/create-checkout.js
// // const Shopify = require('shopify-api-node');

// // // Initialize Shopify Admin client (reused across invocations in same container)
// // const shopify = new Shopify({
// //   shopName: process.env.SHOPIFY_SHOP_NAME,
// //   apiKey: process.env.SHOPIFY_API_KEY,
// //   password: process.env.SHOPIFY_ADMIN_API_TOKEN,
// //   autoLimit: true
// // });

// // module.exports = async (req, res) => {
// //   // Set CORS headers (consistent with sync-prices.js)
// //   res.setHeader('Access-Control-Allow-Credentials', true);
// //   res.setHeader('Access-Control-Allow-Origin', '*');
// //   res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
// //   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

// //   // Handle preflight
// //   if (req.method === 'OPTIONS') {
// //     return res.status(200).end();
// //   }

// //   // Only allow POST
// //   if (req.method !== 'POST') {
// //     return res.status(405).json({ error: 'Method not allowed' });
// //   }

// //   try {
// //     const { items } = req.body;

// //     if (!items || !Array.isArray(items)) {
// //       return res.status(400).json({ error: 'Invalid items array' });
// //     }

// //     if (!process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
// //       return res.status(500).json({ error: 'Missing SHOPIFY_STOREFRONT_ACCESS_TOKEN env var' });
// //     }

// //     console.log(`🛒 Creating checkout for ${items.length} items...`);

// //     // Step 1: Create the cart via Storefront GraphQL API (carts are Storefront-only)
// //     const storefrontUrl = `https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/api/2024-10/graphql.json`;
// //     const cartMutation = `
// //       mutation cartCreate($input: CartInput!) {
// //         cartCreate(input: $input) {
// //           cart {
// //             id
// //             token
// //             lines(first: 20) {
// //               edges {
// //                 node {
// //                   id
// //                   quantity
// //                   merchandise {
// //                     ... on ProductVariant {
// //                       id
// //                     }
// //                   }
// //                 }
// //               }
// //             }
// //           }
// //           userErrors {
// //             field
// //             message
// //           }
// //         }
// //       }
// //     `;
// //     const variables = {
// //       input: {
// //         lines: items.map(item => ({
// //           quantity: item.quantity || 1,
// //           merchandiseId: `gid://shopify/ProductVariant/${item.variant_id}`
// //         }))
// //       }
// //     };

// //     const cartResponse = await fetch(storefrontUrl, {
// //       method: 'POST',
// //       headers: {
// //         'Content-Type': 'application/json',
// //         'X-Shopify-Storefront-Access-Token': process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN
// //       },
// //       body: JSON.stringify({ query: cartMutation, variables })
// //     });

// //     const cartData = await cartResponse.json();
// //     if (cartData.errors) {
// //       throw new Error(`GraphQL Errors: ${JSON.stringify(cartData.errors)}`);
// //     }
// //     const cartCreate = cartData.data.cartCreate;
// //     if (cartCreate.userErrors.length > 0) {
// //       throw new Error(`Cart creation errors: ${JSON.stringify(cartCreate.userErrors)}`);
// //     }
// //     const cart = cartCreate.cart;
// //     if (!cart) {
// //       throw new Error('Cart creation failed: No cart returned');
// //     }

// //     const { id: cartId, token: cartToken } = cart;
// //     console.log(`✅ Cart created: ID=${cartId}, Token=${cartToken}`);

// //     // Step 2: Sync prices (integrated from sync-prices.js logic, using Admin API)
// //     // Track which variants we've updated
// //     const updatedVariants = [];
// //     const originalPrices = new Map();

// //     for (const item of items) {
// //       const { variant_id, custom_price_cents, shopify_price_cents } = item;

// //       // Skip if no price diff or missing data
// //       if (!custom_price_cents || !shopify_price_cents || custom_price_cents === shopify_price_cents) {
// //         console.log(`⏭️ Skipping variant ${variant_id}: No price change needed`);
// //         continue;
// //       }

// //       try {
// //         // Store original price (for later restoration via cron job)
// //         if (!originalPrices.has(variant_id)) {
// //           originalPrices.set(variant_id, shopify_price_cents);
// //         }

// //         // Fetch current variant to confirm price (safety check for races)
// //         const variant = await shopify.productVariant.get(variant_id);
// //         const currentPriceCents = Math.round(parseFloat(variant.price) * 100);

// //         if (currentPriceCents !== shopify_price_cents) {
// //           console.warn(`⚠️ Variant ${variant_id} price mismatch: expected ${shopify_price_cents}¢, got ${currentPriceCents}¢`);
// //         }

// //         // Update variant price to custom value
// //         const customPriceFormatted = (custom_price_cents / 100).toFixed(2);
        
// //         await shopify.productVariant.update(variant_id, {
// //           price: customPriceFormatted
// //         });

// //         updatedVariants.push({
// //           variant_id,
// //           old_price: (shopify_price_cents / 100).toFixed(2),
// //           new_price: parseFloat(customPriceFormatted)
// //         });

// //         console.log(`✅ Updated variant ${variant_id}: $${(shopify_price_cents / 100).toFixed(2)} → $${customPriceFormatted}`);
       
// //       } catch (error) {
// //         console.error(`❌ Failed to update variant ${variant_id}:`, error.message);
// //         // Continue processing other items; don't fail the entire checkout
// //       }
// //     }

// //     // Step 3: Optional - Generate a new storefront access token if needed (for rotation or multi-use)
// //     // But since we have one in env, skip dynamic creation unless required. For client-side, use public token.
// //     // If you need a temporary delegate token, it would be handled client-side via App Bridge.
// //     // To address /private_access_tokens 401, ensure app scopes include unauthenticated_* and app is installed.

// //     // Step 4: Generate absolute checkout URL
// //     const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN || `${process.env.SHOPIFY_SHOP_NAME}.myshopify.com`; // e.g., 'sofamojo.com' or fallback
// //     const checkoutUrl = `https://${shopDomain}/cart?token=${cartToken}&_x=1`; // Shopify's cart-to-checkout redirect; _x=1 for fresh load

// //     // Send immediate response
// //     res.json({
// //       success: true,
// //       cart_id: cartId,
// //       cart_token: cartToken,
// //       storefront_public_token: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN,  // For unauthenticated client-side queries (do not expose in prod if sensitive)
// //       checkout_url: checkoutUrl,
// //       updated_variants: updatedVariants,
// //       original_prices: Object.fromEntries(originalPrices),  // For cron restoration reference (variant_id -> cents)
// //       message: `Checkout created successfully. Synced ${updatedVariants.length} variant prices.`,
// //       note: 'Prices will be restored automatically by scheduled job (api/restore-prices.js). Use storefront_public_token for client-side GraphQL queries.'
// //     });

// //     // Note: Price restoration should be handled by a separate cron job (api/restore-prices.js)
// //     // because Vercel serverless functions timeout after execution.
// //     // Use webhooks (e.g., carts/update) or cron to scan recent carts and revert using original_prices.
// //     // For /private_access_tokens 401: Confirm Storefront scopes in custom app config and reinstall app.

// //   } catch (error) {
// //     console.error('❌ Create checkout error:', error);
// //     return res.status(500).json({
// //       error: 'Failed to create checkout',
// //       details: error.message
// //     });
// //   }
// // };

// Custom checkout from notification
// api/create-checkout.js
const Shopify = require('shopify-api-node');

const shopify = new Shopify({
  shopName: process.env.SHOPIFY_SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_ADMIN_API_TOKEN,
  autoLimit: true
});

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items, customer_email } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid items array' });
    }

    console.log(`📦 Creating draft order for ${items.length} items...`);

    // Build line items with custom prices
    const lineItems = items.map(item => {
      const customPrice = (item.custom_price_cents / 100).toFixed(2);
      
      // Build properties array - Shopify expects {name, value} format
      const properties = [];
      
      if (item.price_breakdown) {
        const { base, fabric_name, fabric, additional } = item.price_breakdown;
        
        // Add fabric name if present
        if (fabric_name) {
          properties.push({
            name: 'Fabric',
            value: fabric_name
          });
        }
        
        // Add price breakdown as line item properties
        if (base > 0) {
          properties.push({
            name: '_Base Price',
            value: `£${(base / 100).toFixed(2)}`
          });
        }
        
        if (fabric > 0) {
          properties.push({
            name: '_Fabric Upcharge',
            value: `£${(fabric / 100).toFixed(2)}`
          });
        }
        
        if (additional > 0) {
          properties.push({
            name: '_Additional Options',
            value: `£${(additional / 100).toFixed(2)}`
          });
        }
      }

      console.log(`  - Item: Variant ${item.variant_id}, Qty: ${item.quantity}, Price: £${customPrice}`);

      return {
        variant_id: item.variant_id,
        quantity: item.quantity,
        price: customPrice,
        properties: properties.length > 0 ? properties : undefined
      };
    });

    // Create draft order payload
    const draftOrderData = {
      line_items: lineItems,
      use_customer_default_address: true,
      note: 'Custom pricing applied via checkout app'
    };

    // Add customer email if provided
    if (customer_email && customer_email.trim() !== '') {
      draftOrderData.email = customer_email.trim();
      console.log(`👤 Customer email: ${customer_email}`);
    } else {
      console.log('👤 Guest checkout (no email provided)');
    }

    console.log('📤 Creating draft order with data:', JSON.stringify(draftOrderData, null, 2));

    // Create the draft order
    const draftOrder = await shopify.draftOrder.create(draftOrderData);

    console.log(`✅ Draft order created: ID ${draftOrder.id}, Name: ${draftOrder.name}`);

    // Complete the draft order to generate invoice URL
    const completedDraftOrder = await shopify.draftOrder.complete(draftOrder.id);

    console.log(`✅ Draft order completed. Invoice URL: ${completedDraftOrder.invoice_url}`);

    // Return the invoice URL (this is the checkout page)
    res.json({
      success: true,
      checkout_url: completedDraftOrder.invoice_url,
      draft_order_id: draftOrder.id,
      order_name: draftOrder.name,
      total_price: completedDraftOrder.total_price,
      line_items_count: lineItems.length
    });

  } catch (error) {
    console.error('❌ Draft order creation error:', error);
    
    // Parse Shopify API errors
    let errorMessage = error.message;
    let errorDetails = {};
    
    if (error.response && error.response.body) {
      errorDetails = error.response.body;
      if (errorDetails.errors) {
        errorMessage = JSON.stringify(errorDetails.errors);
      }
    }
    
    return res.status(500).json({
      error: 'Failed to create checkout',
      message: errorMessage,
      details: errorDetails,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};