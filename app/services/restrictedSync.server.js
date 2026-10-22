import { assertSyncApproved } from './syncApproval.server.js';

export const CATALOG_QUERY = `
query syncCatalog($after: String, $locationId: ID!) {
  productVariants(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id sku price
      inventoryItem { id inventoryLevel(locationId: $locationId) { quantities(names: ["available"]) { name quantity } } }
      product { id title status publishedAt discontinued: metafield(namespace: "$app", key: "fw_discontinued") { value } }
    }
  }
}`;
const PRICE_MUTATION = `mutation syncRetailPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } }
}`;
const STOCK_MUTATION = `mutation syncAvailableStock($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) { userErrors { message } }
}`;
const DISCONTINUED_MUTATION = `mutation syncDiscontinued($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { userErrors { message } }
}`;

async function graphql(admin, query, variables) {
  const response = await admin.graphql(query, { variables });
  const result = await response.json();
  if (result.errors?.length) throw new Error(result.errors.map(e => e.message).join('; '));
  if (!result.data) throw new Error('Shopify returned no data');
  for (const payload of Object.values(result.data)) {
    if (payload?.userErrors?.length) throw new Error(payload.userErrors.map(e => e.message).join('; '));
  }
  return result.data;
}

export async function loadSyncCatalog(admin, locationId) {
  if (!locationId) throw new Error('Set FW_SHOPIFY_LOCATION_ID explicitly before inventory sync.');
  const variants = [];
  let after = null;
  let more = true;
  do {
    const data = await graphql(admin, CATALOG_QUERY, { after, locationId });
    variants.push(...data.productVariants.nodes);
    const page = data.productVariants.pageInfo;
    more = page.hasNextPage;
    if (!more) break;
    if (!page.endCursor || page.endCursor === after) throw new Error('Catalog pagination did not advance');
    after = page.endCursor;
  } while (more);
  return variants;
}

// Exact, case-sensitive internal SKU matching. Never fall back to title or a metafield.
export function auditSkuMatches(products, variants) {
  const fw = new Map();
  const shopify = new Map();
  for (const product of products) {
    const sku = String(product.sku ?? '').trim();
    if (sku) fw.set(sku, [...(fw.get(sku) ?? []), product]);
  }
  for (const variant of variants) {
    const sku = String(variant.sku ?? '').trim();
    if (sku) shopify.set(sku, [...(shopify.get(sku) ?? []), variant]);
  }
  const issues = [];
  const matches = [];
  for (const variant of variants) {
    if (variant.product.status !== 'ACTIVE' || !variant.product.publishedAt) continue;
    const sku = String(variant.sku ?? '').trim();
    let reason;
    if (!sku) reason = 'Missing internal Shopify SKU';
    else if (shopify.get(sku).length !== 1) reason = 'Duplicate internal Shopify SKU';
    else if (!fw.has(sku)) reason = 'No matching Furniture Wizard Item Number';
    else if (fw.get(sku).length !== 1) reason = 'Duplicate Furniture Wizard Item Number';
    if (reason) issues.push({ sku, variantId: variant.id, productId: variant.product.id, title: variant.product.title, reason });
    else matches.push({ product: fw.get(sku)[0], variant });
  }
  return { matches, issues, fwOnlyCount: [...fw.keys()].filter(sku => !shopify.has(sku)).length };
}

export async function prepareSyncProducts(admin, products, locationId) {
  const audit = auditSkuMatches(products, await loadSyncCatalog(admin, locationId));
  return { products: audit.matches.map(match => match.product), audit };
}

export async function runInventorySync({ adapter, admin, shop, locationId = process.env.FW_SHOPIFY_LOCATION_ID, offset = 0, limit = null }) {
  assertSyncApproved(shop);
  const report = { startedAt: new Date().toISOString(), completedAt: null, source: 'Furniture Wizard', created: [], updated: [], skipped: [], failed: [], warnings: [], totalRows: 0 };
  const result = await adapter.getInventory();
  report.totalRows = result.totalRows;
  const { matches, issues } = auditSkuMatches(result.products, await loadSyncCatalog(admin, locationId));
  report.skipped.push(...issues);
  const selected = limit == null ? matches.slice(offset) : matches.slice(offset, offset + limit);
  report.processedCount = selected.length;
  for (const { product, variant } of selected) {
    try {
      assertSyncApproved(shop);
      if (product.priceSource !== 'Retail' || !Number.isFinite(product.price) || product.price < 0) throw new Error('A valid FW Retail price is required');
      if (!product.inventoryVerified || !Number.isInteger(product.quantity) || product.quantity < 0) throw new Error('Showroom/Warehouse inventory mapping is not verified');
      if (typeof product.discontinued !== 'boolean' || !product.discontinuedVerified) throw new Error('FW Discontinued field is missing or invalid');
      const level = variant.inventoryItem.inventoryLevel;
      const currentQuantity = level?.quantities.find(q => q.name === 'available')?.quantity;
      if (currentQuantity == null) throw new Error('Inventory item is not stocked at the configured Shopify location');
      const priceChanged = Number(variant.price) !== product.price;
      const quantityChanged = currentQuantity !== product.quantity;
      const discontinuedChanged = variant.product.discontinued?.value !== String(product.discontinued);
      // Preserve compare-at price, merchandising, status, and publication. No create operations exist here.
      if (priceChanged) await graphql(admin, PRICE_MUTATION, { productId: variant.product.id, variants: [{ id: variant.id, price: String(product.price) }] });
      if (quantityChanged) await graphql(admin, STOCK_MUTATION, { input: { name: 'available', reason: 'correction', ignoreCompareQuantity: false, quantities: [{ inventoryItemId: variant.inventoryItem.id, locationId, quantity: product.quantity, compareQuantity: currentQuantity }] } });
      if (discontinuedChanged) await graphql(admin, DISCONTINUED_MUTATION, { metafields: [{ ownerId: variant.product.id, namespace: '$app', key: 'fw_discontinued', type: 'boolean', value: String(product.discontinued) }] });
      const item = { sku: product.sku, productTitle: variant.product.title, previousPrice: Number(variant.price), newPrice: product.price, previousQuantity: currentQuantity, newQuantity: product.quantity, priceChanged, quantityChanged, discontinuedChanged };
      if (priceChanged || quantityChanged || discontinuedChanged) report.updated.push(item);
      else report.skipped.push({ ...item, reason: 'No price, inventory, or discontinued changes' });
    } catch (error) { report.failed.push({ sku: product.sku, reason: error.message }); }
  }
  report.completedAt = new Date().toISOString();
  return report;
}
