import prisma from "../db.server.js";

function moneySet(value) {
  if (!value) return null;
  return {
    amount: String(value.amount ?? "0"),
    currencyCode: value.currency_code || value.currencyCode || null,
  };
}

function addressPayload(address) {
  if (!address) return null;
  return {
    firstName: address.first_name || null,
    lastName: address.last_name || null,
    company: address.company || null,
    address1: address.address1 || null,
    address2: address.address2 || null,
    city: address.city || null,
    province: address.province || null,
    provinceCode: address.province_code || null,
    postalCode: address.zip || null,
    country: address.country || null,
    countryCode: address.country_code || null,
    phone: address.phone || null,
  };
}

export function mapShopifyOrder(order, shop) {
  return {
    source: "shopify",
    shop,
    shopifyOrderId: String(order.id),
    orderNumber: String(order.order_number || order.name || order.id),
    createdAt: order.created_at || null,
    processedAt: order.processed_at || null,
    currency: order.currency || null,
    financialStatus: order.financial_status || null,
    fulfillmentStatus: order.fulfillment_status || null,
    email: order.email || order.contact_email || null,
    phone: order.phone || null,
    customer: order.customer
      ? {
          shopifyCustomerId: String(order.customer.id || ""),
          firstName: order.customer.first_name || null,
          lastName: order.customer.last_name || null,
          email: order.customer.email || null,
          phone: order.customer.phone || null,
        }
      : null,
    billingAddress: addressPayload(order.billing_address),
    shippingAddress: addressPayload(order.shipping_address),
    subtotal: moneySet(order.current_subtotal_price_set?.shop_money) || {
      amount: String(order.current_subtotal_price || order.subtotal_price || "0"),
      currencyCode: order.currency || null,
    },
    tax: moneySet(order.current_total_tax_set?.shop_money) || {
      amount: String(order.current_total_tax || order.total_tax || "0"),
      currencyCode: order.currency || null,
    },
    total: moneySet(order.current_total_price_set?.shop_money) || {
      amount: String(order.current_total_price || order.total_price || "0"),
      currencyCode: order.currency || null,
    },
    note: order.note || null,
    lineItems: (order.line_items || []).map((item) => ({
      shopifyLineItemId: String(item.id),
      productId: item.product_id ? String(item.product_id) : null,
      variantId: item.variant_id ? String(item.variant_id) : null,
      sku: item.sku || null,
      title: item.title || item.name || null,
      variantTitle: item.variant_title || null,
      quantity: Number(item.quantity || 0),
      price: String(item.price || "0"),
    })),
  };
}

function orderEndpointHeaders() {
  const headers = { "content-type": "application/json" };

  if (process.env.FURNITURE_WIZARD_ORDER_API_KEY) {
    headers.authorization = `Bearer ${process.env.FURNITURE_WIZARD_ORDER_API_KEY}`;
  } else if (process.env.FURNITURE_WIZARD_ORDER_USERNAME) {
    const credentials = Buffer.from(
      `${process.env.FURNITURE_WIZARD_ORDER_USERNAME}:${process.env.FURNITURE_WIZARD_ORDER_PASSWORD || ""}`,
    ).toString("base64");
    headers.authorization = `Basic ${credentials}`;
  }

  return headers;
}

async function deliverOrder(record) {
  const endpoint = process.env.FURNITURE_WIZARD_ORDER_URL?.trim();

  if (!endpoint) {
    return prisma.furnitureWizardOrder.update({
      where: { id: record.id },
      data: {
        status: "pending_configuration",
        lastError: "Furniture Wizard order endpoint is not configured.",
      },
    });
  }

  try {
    const response = await fetch(endpoint, {
      method: process.env.FURNITURE_WIZARD_ORDER_METHOD || "POST",
      headers: orderEndpointHeaders(),
      body: JSON.stringify(record.payload),
      signal: AbortSignal.timeout(
        Number(process.env.FURNITURE_WIZARD_ORDER_TIMEOUT_MS || 15000),
      ),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Furniture Wizard returned ${response.status}: ${body.slice(0, 500)}`,
      );
    }

    return prisma.furnitureWizardOrder.update({
      where: { id: record.id },
      data: {
        status: "delivered",
        attempts: { increment: 1 },
        lastError: null,
        deliveredAt: new Date(),
      },
    });
  } catch (error) {
    return prisma.furnitureWizardOrder.update({
      where: { id: record.id },
      data: {
        status: "failed",
        attempts: { increment: 1 },
        lastError: error.message.slice(0, 2000),
      },
    });
  }
}

export async function coordinateShopifyOrder({ order, shop }) {
  const payload = mapShopifyOrder(order, shop);
  const record = await prisma.furnitureWizardOrder.upsert({
    where: {
      shop_shopifyOrderId: {
        shop,
        shopifyOrderId: payload.shopifyOrderId,
      },
    },
    create: {
      shop,
      shopifyOrderId: payload.shopifyOrderId,
      orderNumber: payload.orderNumber,
      payload,
    },
    update: {
      orderNumber: payload.orderNumber,
      payload,
    },
  });

  if (record.status === "delivered") return record;
  return deliverOrder(record);
}

export async function retryPendingFurnitureWizardOrders({ limit = 20 } = {}) {
  if (!process.env.FURNITURE_WIZARD_ORDER_URL?.trim()) {
    return { attempted: 0, delivered: 0, failed: 0, configurationMissing: true };
  }

  const records = await prisma.furnitureWizardOrder.findMany({
    where: {
      status: { in: ["pending", "pending_configuration", "failed"] },
      attempts: { lt: 10 },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const results = [];

  for (const record of records) {
    results.push(await deliverOrder(record));
  }

  return {
    attempted: results.length,
    delivered: results.filter((record) => record.status === "delivered").length,
    failed: results.filter((record) => record.status === "failed").length,
    configurationMissing: false,
  };
}
