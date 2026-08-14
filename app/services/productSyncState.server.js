import prisma from "../db.server.js";

export function getLastUpdatedByVendor(product) {
  return String(product.lastUpdatedByVendor ?? "").trim();
}

export async function loadProductSyncStateMap() {
  const rows = await prisma.productSyncState.findMany({
    select: { sku: true, lastUpdatedByVendor: true },
  });

  return new Map(rows.map((row) => [row.sku, row.lastUpdatedByVendor ?? ""]));
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

export async function markProductsSynced(products) {
  if (!products.length) return;

  await prisma.$transaction(
    products.map((product) =>
      prisma.productSyncState.upsert({
        where: { sku: product.sku },
        create: {
          sku: product.sku,
          lastUpdatedByVendor: getLastUpdatedByVendor(product),
        },
        update: {
          lastUpdatedByVendor: getLastUpdatedByVendor(product),
        },
      }),
    ),
  );
}

export async function countTrackedProducts() {
  return prisma.productSyncState.count();
}
