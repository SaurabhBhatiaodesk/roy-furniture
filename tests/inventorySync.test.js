import process from "node:process";
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSkuMatches, runInventorySync } from '../app/services/restrictedSync.server.js';
const product = { sku: 'DL-01', price: 100, priceSource: 'Retail', quantity: 1, inventoryVerified: true, discontinued: false, discontinuedVerified: true };
function variant(overrides = {}) { return { id: 'v1', sku: 'DL-01', price: '100.00', inventoryItem: { id: 'i1', inventoryLevel: { quantities: [{ name: 'available', quantity: 1 }] } }, product: { id: 'p1', title: 'Client title', status: 'ACTIVE', publishedAt: '2026-01-01', discontinued: { value: 'false' } }, ...overrides }; }
function fixture(variants = [variant()], data = product) {
 const writes = [];
 const admin = { graphql: async (query, { variables }) => {
  if(query.includes('query syncCatalog')) return { json: async () => ({ data: { productVariants: { nodes: variants, pageInfo: { hasNextPage: false } } } }) };
  writes.push({query,variables});
  const key=query.includes('syncRetailPrice')?'productVariantsBulkUpdate':query.includes('syncAvailableStock')?'inventorySetQuantities':'metafieldsSet';
  return {json:async()=>({data:{[key]:{userErrors:[]}}})};
 } };
 return {writes,run:()=>runInventorySync({admin,shop:'roy.myshopify.com',locationId:'l1',adapter:{getInventory:async()=>({products:[data],totalRows:1})}})};
}
process.env.FW_SYNC_APPROVED='true'; process.env.CRON_SYNC_ENABLED='true'; process.env.SHOP_DOMAIN='roy.myshopify.com';
test('identical active product makes no writes',async()=>{const f=fixture();const r=await f.run();assert.equal(r.skipped.length,1);assert.equal(f.writes.length,0);});
test('unmatched FW product is never created',async()=>{const f=fixture([]);const r=await f.run();assert.equal(r.created.length,0);assert.equal(f.writes.length,0);});
test('draft, archived and unpublished products are never updated',async()=>{for(const p of [{status:'DRAFT',publishedAt:'date'},{status:'ARCHIVED',publishedAt:'date'},{status:'ACTIVE',publishedAt:null}]){const f=fixture([variant({product:{id:'p1',...p}})],{...product,price:200});await f.run();assert.equal(f.writes.length,0);}});
test('duplicate and missing internal SKUs are audit issues, not fuzzy matches',()=>{const variants=[variant(),variant({id:'v2'}),variant({id:'v3',sku:''})];const a=auditSkuMatches([product],variants);assert.equal(a.matches.length,0);assert.equal(a.issues.length,3);});
test('duplicate FW Item Numbers block matching',()=>{assert.equal(auditSkuMatches([product,product],[variant()]).matches.length,0);});
test('Retail-only change preserves compare-at and merchandising',async()=>{const f=fixture([variant()],{...product,price:200});const r=await f.run();assert.equal(r.updated.length,1);assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0].variables.variants,[{id:'v1',price:'200'}]);});
test('unknown inventory mapping blocks all writes',async()=>{const f=fixture([variant()],{...product,price:200,inventoryVerified:false});const r=await f.run();assert.match(r.failed[0].reason,/not verified/);assert.equal(f.writes.length,0);});
test('discontinued flag is written without archiving or publishing',async()=>{const f=fixture([variant()],{...product,discontinued:true});const r=await f.run();assert.equal(r.updated[0].discontinuedChanged,true);assert.equal(f.writes.length,1);assert.equal(f.writes[0].variables.metafields[0].value,'true');});
test('stock-only change uses location quantity with compare-and-set',async()=>{const f=fixture([variant()],{...product,quantity:0});await f.run();assert.equal(f.writes.length,1);assert.equal(f.writes[0].variables.input.quantities[0].compareQuantity,1);assert.equal(f.writes[0].variables.input.quantities[0].locationId,'l1');assert.equal(f.writes[0].variables.input.ignoreCompareQuantity,false);});
test('unknown discontinued field blocks writes',async()=>{const f=fixture([variant()],{...product,discontinuedVerified:false});const r=await f.run();assert.equal(r.failed.length,1);assert.equal(f.writes.length,0);});
test('paused integration performs no API calls',async()=>{process.env.FW_SYNC_APPROVED='false';try{const f=fixture();await assert.rejects(f.run(),/disabled/);assert.equal(f.writes.length,0);}finally{process.env.FW_SYNC_APPROVED='true';}});
test('wrong shop cannot run sync',async()=>{process.env.SHOP_DOMAIN='different.myshopify.com';try{await assert.rejects(fixture().run(),/SHOP_DOMAIN/);}finally{process.env.SHOP_DOMAIN='roy.myshopify.com';}});
