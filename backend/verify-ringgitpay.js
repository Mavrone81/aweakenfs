const fetch = require('node-fetch');

const baseUrl = 'http://localhost:9000';
const publishableKey = 'pk_01JN00YV7HYBQGTS5N8Y8S8N01'; // From previous logs or default

async function handleResponse(response) {
    if (response.ok) {
        return await response.json();
    } else {
        const text = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${text}`);
    }
}

async function postData(endpoint, data) {
    const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-publishable-key': publishableKey,
        },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

async function verifyRinggitPay() {
    try {
        console.log("1. Fetching regions...");
        const regionsRes = await fetch(`${baseUrl}/store/regions`, {
            headers: { 'x-publishable-key': publishableKey }
        });
        const regionsData = await handleResponse(regionsRes);
        const regionId = regionsData.regions[0].id;
        console.log(`Using region: ${regionId}`);

        console.log("2. Creating a cart...");
        const cartData = await postData('/store/carts', { region_id: regionId });
        const cartId = cartData.cart.id;
        console.log(`Cart created: ${cartId}`);

        console.log("3. Adding an item to the cart...");
        const productsResponse = await fetch(`${baseUrl}/store/products`, {
            headers: { 'x-publishable-key': publishableKey }
        });
        const productsData = await handleResponse(productsResponse);
        if (!productsData.products[0]) throw new Error("No products found");
        const variantId = productsData.products[0].variants[0].id;

        await postData(`/store/carts/${cartId}/line-items`, { variant_id: variantId, quantity: 1 });
        console.log("Item added.");

        console.log("4. Creating payment sessions...");
        const paymentSessionsData = await postData(`/store/carts/${cartId}/payment-sessions`, {});
        console.log("Payment sessions created.");

        const sessions = paymentSessionsData.cart.payment_collection.payment_sessions;
        console.log("Available payment sessions:");
        sessions.forEach(s => console.log(`- ${s.provider_id} (Status: ${s.status})`));

        const ringgitPaySession = sessions.find(s => s.provider_id === 'ringgitpay');
        if (ringgitPaySession) {
            console.log("\n✅ SUCCESS: RinggitPay provider is active and available!");
        } else {
            console.log("\n❌ FAILURE: RinggitPay provider NOT found in available sessions.");
        }

    } catch (error) {
        console.error("Error during verification:", error.message);
    }
}

verifyRinggitPay();
