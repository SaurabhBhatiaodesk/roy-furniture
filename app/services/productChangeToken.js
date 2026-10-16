import { createHash } from "node:crypto";

const SYNC_FIELDS = [
  "sku",
  "model_name",
  "description",
  "manufacturer",
  "vendor",
  "category",
  "subcategory",
  "type",
  "collection",
  "dimensions",
  "itemSize",
  "color",
  "style",
  "price",
  "compareAtPrice",
  "quantity",
  "available",
  "inStockQuantity",
  "closeOut",
  "hotList",
  "discontinued",
  "specialOrder",
];

export function getProductChangeToken(product) {
  // Vendor export timestamps can refresh daily without any sellable data changing.
  // Versioning causes a one-time reconciliation when upgrading older saved tokens.
  const fingerprint = Object.fromEntries(
    SYNC_FIELDS.map((field) => [field, product[field] ?? null]),
  );
  const digest = createHash("sha256")
    .update(JSON.stringify(fingerprint))
    .digest("hex");

  return `v2:${digest}`;
}
