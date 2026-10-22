import test from "node:test";
import assert from "node:assert/strict";
import { getProductChangeToken } from "../app/services/productChangeToken.js";

const product = {
  sku: "SOFA-1",
  model_name: "Roy Sofa",
  price: 899,
  quantity: 2,
  lastPpcUpdate: "2026-08-13 10:00:00",
};

test("change token stays stable for identical product data", () => {
  assert.equal(getProductChangeToken(product), getProductChangeToken({ ...product }));
});

test("change token detects stock or price changes with the same LastPPCUpdate", () => {
  assert.notEqual(
    getProductChangeToken(product),
    getProductChangeToken({ ...product, quantity: 0 }),
  );
  assert.notEqual(
    getProductChangeToken(product),
    getProductChangeToken({ ...product, price: 799 }),
  );
});

test("change token ignores timestamp-only vendor refreshes", () => {
  assert.equal(
    getProductChangeToken(product),
    getProductChangeToken({ ...product, lastPpcUpdate: "2026-08-13 11:00:00" }),
  );
});

test("merchandising changes do not trigger the restricted sync", () => {
  assert.equal(getProductChangeToken(product), getProductChangeToken({ ...product, model_name: "Changed name", description: "New text", compareAtPrice: 1000 }));
});
