import prisma from "../db.server.js";
import { getProductChangeToken } from "./productChangeToken.js";

export function getLastUpdatedByVendor(product) {
  return getProductChangeToken(product);
}

export async function loadProductSyncStateMap() {
  const rows = await prisma.productSyncState.findMany({
    select: { sku: true, changeToken: true },
  });

  return new Map(rows.map((row) => [row.sku, row.changeToken ?? ""]));
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
  const queue = [...newProducts, ...updatedProducts];

  return {
    batch: queue.slice(0, batchSize),
    pendingNew: newProducts.length,
    pendingUpdated: updatedProducts.length,
    pendingTotal: queue.length,
  };
}

export async function markProductsSynced(products) {
  if (!products.length) return;

  await prisma.$transaction(
    products.map((product) =>
      prisma.productSyncState.upsert({
        where: { sku: product.sku },
        create: {
          sku: product.sku,
          changeToken: getLastUpdatedByVendor(product),
        },
        update: {
          changeToken: getLastUpdatedByVendor(product),
        },
      }),
    ),
  );
}

export async function countTrackedProducts() {
  return prisma.productSyncState.count();
}
