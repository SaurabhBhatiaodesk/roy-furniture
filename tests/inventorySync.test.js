import test from "node:test";
import assert from "node:assert/strict";
import { runInventorySync } from "../app/services/inventorySync.js";

const product = { sku: "TEST-1", model_name: "Chair", price: 100, quantity: 2 };

function fixture({ details = {}, quantity = 2, total = 99, status = "ACTIVE", published = true, collection = false, fail = false, publicationScopes = true } = {}) {
  const calls = [];
  const admin = { graphql: async (query, { variables } = {}) => {
    calls.push({ query, variables });
    let data;
    if (query.includes("query getVariantBySku")) {
      assert.equal(variables.locationId, "location-1");
      data = { productVariants: { edges: [{ node: {
        id: "variant-1", sku: product.sku, price: "100.00", compareAtPrice: null,
        inventoryQuantity: total,
        inventoryItem: { id: "item-1", inventoryLevel: { quantities: [{ name: "available", quantity }] } },
        product: { id: "product-1", title: "Chair", descriptionHtml: "", productType: "", vendor: "", tags: [], status, ...details },
      } }] } };
    } else if (query.includes("query getSyncAccessScopes")) {
      data = { currentAppInstallation: { accessScopes: publicationScopes ? [{ handle: "write_publications" }] : [] } };
    } else if (query.includes("query getOnlineStorePublication")) {
      data = { publications: { nodes: [{ id: "publication-1", supportsFuturePublishing: true }] } };
    } else if (query.includes("query getPublicationStatus")) {
      data = { product: { publishedOnPublication: published } };
    } else if (query.includes("query findCollection")) {
      data = { collections: { nodes: [{ id: "collection-1", title: "Living" }] } };
    } else if (query.includes("query getCollectionMembership")) {
      data = { product: { inCollection: collection } };
    } else if (query.includes("mutation productUpdate")) {
      data = { productUpdate: { product: { id: "product-1" }, userErrors: fail ? [{ message: "Write failed" }] : [] } };
    } else if (query.includes("mutation publishResource")) {
      data = { publishablePublish: { userErrors: [] } };
    } else if (query.includes("mutation inventoryActivate")) {
      data = { inventoryActivate: { userErrors: [] } };
    } else if (query.includes("mutation inventorySetQuantities")) {
      data = { inventorySetQuantities: { userErrors: [] } };
    } else if (query.includes("mutation productVariantsBulkUpdate")) {
      data = { productVariantsBulkUpdate: { productVariants: [{ id: "variant-1" }], userErrors: [] } };
    } else throw new Error(`Unexpected operation: ${query}`);
    return { json: async () => ({ data }) };
  } };
  return { calls, run: (overrides = {}) => runInventorySync({
    admin, locationId: "location-1",
    adapter: { getInventory: async () => ({ products: [{ ...product, ...overrides }], totalRows: 1 }) },
  }) };
}

test("repeated identical syncs perform no mutations, regardless of aggregate inventory", async () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) {
    const report = await f.run();
    assert.equal(report.skipped.length, 1);
    assert.equal(report.failed.length, 0);
  }
  assert.equal(f.calls.filter(c => c.query.includes("mutation")).length, 0);
});

test("details-only edits are reported updated and send only changed fields", async () => {
  const f = fixture({ details: { title: "Old chair" } });
  const report = await f.run();
  assert.equal(report.updated[0].detailsChanged, true);
  assert.equal(report.skipped.length, 0);
  const writes = f.calls.filter(c => c.query.includes("mutation"));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].variables.product, { id: "product-1", title: "Chair" });
});

test("existing collection membership and unordered tags do not trigger writes", async () => {
  const f = fixture({ collection: true, details: { tags: ["blue", "Living"] } });
  const report = await f.run({ collection: "Living", color: "blue" });
  assert.equal(report.skipped.length, 1);
  assert.equal(f.calls.filter(c => c.query.includes("mutation")).length, 0);
});

test("missing publication is repaired and counted as an update", async () => {
  const f = fixture({ published: false });
  const report = await f.run();
  assert.equal(report.updated[0].publicationChanged, true);
  assert.equal(f.calls.filter(c => c.query.includes("mutation")).length, 1);
});

test("changed location quantity is updated even if aggregate quantity matches", async () => {
  const f = fixture({ quantity: 1, total: 2 });
  const report = await f.run();
  assert.equal(report.updated[0].quantityChanged, true);
  assert.equal(f.calls.filter(c => c.query.includes("mutation inventorySetQuantities")).length, 1);
});

test("failed details update is reported failed", async () => {
  const f = fixture({ details: { title: "Old chair" }, fail: true });
  const report = await f.run();
  assert.equal(report.failed.length, 1);
  assert.equal(report.skipped.length, 0);
  assert.equal(report.updated.length, 0);
});

test("compare-at-only edits are counted as updates", async () => {
  const f = fixture();
  const report = await f.run({ compareAtPrice: 150 });
  assert.equal(report.updated[0].compareAtPriceChanged, true);
  assert.equal(f.calls.filter(c => c.query.includes("mutation")).length, 1);
});

test("missing optional publication permissions do not fail product sync or cause retries", async () => {
  const f = fixture({ publicationScopes: false });
  const report = await f.run();
  assert.equal(report.failed.length, 0);
  assert.equal(report.skipped.length, 1);
  assert.equal(f.calls.some(c => c.query.includes("query getOnlineStorePublication")), false);
  assert.equal(f.calls.some(c => c.query.includes("mutation")), false);
});
