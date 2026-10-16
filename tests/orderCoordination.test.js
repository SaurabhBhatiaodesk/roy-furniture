import test from "node:test";
import assert from "node:assert/strict";
import { mapShopifyOrder } from "../app/services/orderCoordination.server.js";

test("maps Shopify order, customer, totals, address, and SKU", () => {
  const mapped = mapShopifyOrder(
    {
      id: 123,
      order_number: 1001,
      currency: "USD",
      email: "customer@example.com",
      total_price: "999.00",
      customer: { id: 9, first_name: "Roy", last_name: "Customer" },
      shipping_address: { city: "San Diego", zip: "92101" },
      line_items: [
        { id: 5, sku: "SOFA-1", title: "Roy Sofa", quantity: 1, price: "999.00" },
      ],
    },
    "roy-furniture.myshopify.com",
  );

  assert.equal(mapped.shopifyOrderId, "123");
  assert.equal(mapped.orderNumber, "1001");
  assert.equal(mapped.customer.firstName, "Roy");
  assert.equal(mapped.shippingAddress.city, "San Diego");
  assert.equal(mapped.total.amount, "999.00");
  assert.equal(mapped.lineItems[0].sku, "SOFA-1");
});
