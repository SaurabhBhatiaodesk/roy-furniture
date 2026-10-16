import test from "node:test";
import assert from "node:assert/strict";
import { parseInvAdvBranchSum } from "../app/adapters/branchSumCsvAdapter.js";

test("incremental CSV parsing preserves quoted multiline fields and skips invalid rows", () => {
  const result = parseInvAdvBranchSum('Item Number,Description,Retail,Available\r\n,"Invalid",99,1\r\nCHAIR-1,"A chair, with ""arms""\nand cushion",100,2\r\nCHAIR-2,Chair,50,1');
  assert.equal(result.invalid.length, 1);
  assert.equal(result.invalid[0].row, 2);
  assert.equal(result.valid.length, 2);
  assert.equal(result.valid[0].description, 'A chair, with "arms"\nand cushion');
  assert.equal(result.valid[1].sku, "CHAIR-2");
});

test("parses LastPPCUpdate and Furniture Wizard product fields", () => {
  const csv = [
    "Item Number,Model Name,Description,Retail,Regular,Available,In Stock,Category,Collection,Dimensions,LastPPCUpdate",
    'SOFA-1,Roy Sofa,"Three seat sofa",899,1099,2,3,Sofas,Living Room,80 x 35 x 32,2026-08-13 10:00:00',
  ].join("\n");

  const result = parseInvAdvBranchSum(csv);
  assert.equal(result.invalid.length, 0);
  assert.deepEqual(result.valid[0], {
    ...result.valid[0],
    sku: "SOFA-1",
    model_name: "Roy Sofa",
    price: 899,
    compareAtPrice: 1099,
    quantity: 2,
    available: 2,
    inStockQuantity: 3,
    inStock: true,
    category: "Sofas",
    collection: "Living Room",
    dimensions: "80 x 35 x 32",
    lastPpcUpdate: "2026-08-13 10:00:00",
  });
});

test("uses Available as sellable stock and clamps negative values", () => {
  const csv = [
    "Item Number,Description,Retail,Available,In Stock,LastPPCUpdate",
    "SOFA-2,Sofa,499,-2,5,2026-08-13 11:00:00",
  ].join("\n");

  const product = parseInvAdvBranchSum(csv).valid[0];
  assert.equal(product.quantity, 0);
  assert.equal(product.inStockQuantity, 5);
  assert.equal(product.inStock, false);
});

test("falls back to In Stock when Available is absent", () => {
  const csv = [
    "Item Number,Description,Retail,In Stock,LastPPCUpdate",
    "SOFA-3,Sofa,499,4,2026-08-13 12:00:00",
  ].join("\n");

  const product = parseInvAdvBranchSum(csv).valid[0];
  assert.equal(product.quantity, 4);
  assert.equal(product.inStock, true);
});
