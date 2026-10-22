import prisma from "../db.server.js";
import { getProductChangeToken } from "./productChangeToken.js";

export function getLastUpdatedByVendor(product) {
  return getProductChangeToken(product);
}

export async function loadProductSyncStateMap(shop) {
  const prefix = `${shop}:`;
  const rows = await prisma.productSyncState.findMany({
    where: { sku: { startsWith: prefix } },
    select: { sku: true, changeToken: true },
  });

  return new Map(rows.map((row) => [row.sku.slice(prefix.length), row.changeToken ?? ""]));
}

export function partitionChangedProducts(products, syncStateMap) {
  const newProducts = [];
  const updatedProducts = [];

  for (const product of products) {
    const sku = product.sku;
    const csvStamp = getLastUpdatedByVendor(product);
    const storedStamp = syncStateMap.get(sku);

    if (storedStamp === undefined) {
      newProducts.push(product);
      continue;
    }

    if (storedStamp !== csvStamp) {
      updatedProducts.push(product);
    }
  }

  return { newProducts, updatedProducts };
}

export function filterChangedProducts(products, syncStateMap) {
  const { newProducts, updatedProducts } = partitionChangedProducts(
    products,
    syncStateMap,
  );

  return [...newProducts, ...updatedProducts];
}

export function buildSyncBatch(products, syncStateMap, batchSize) {
  const { newProducts, updatedProducts } = partitionChangedProducts(
    products,
    syncStateMap,
  );
  // Updated products (existing SKUs whose LastPPCUpdate/etc. changed) are
  // prioritized ahead of brand-new SKUs, so price/stock changes on products
  // that already exist in Shopify don't get stuck behind a large backlog of
  // brand-new product creates.
  const queue = [...updatedProducts, ...newProducts];

  return {
    batch: queue.slice(0, batchSize),
    pendingNew: newProducts.length,
    pendingUpdated: updatedProducts.length,
    pendingTotal: queue.length,
  };
}

export async function markProductsSynced(products, shop) {
  if (!products.length) return;

  await prisma.$transaction(
    products.map((product) =>
      prisma.productSyncState.upsert({
        where: { sku: `${shop}:${product.sku}` },
        create: {
          sku: `${shop}:${product.sku}`,
          changeToken: getLastUpdatedByVendor(product),
        },
        update: {
          changeToken: getLastUpdatedByVendor(product),
        },
      }),
    ),
  );
}

export async function countTrackedProducts(shop) {
  return prisma.productSyncState.count({ where: { sku: { startsWith: `${shop}:` } } });
}
