import { createHash } from "node:crypto";

const SYNC_FIELDS = ["sku", "price", "priceSource", "quantity", "inventoryVerified", "discontinued", "discontinuedVerified"];

export function getProductChangeToken(product) {
  // Vendor export timestamps can refresh daily without any sellable data changing.
  // Versioning causes a one-time reconciliation when upgrading older saved tokens.
  const fingerprint = Object.fromEntries(
    SYNC_FIELDS.map((field) => [field, product[field] ?? null]),
  );
  const digest = createHash("sha256")
    .update(JSON.stringify(fingerprint))
    .digest("hex");

  return `v3:${digest}`;
}
