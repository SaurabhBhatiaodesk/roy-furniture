/**
 * Inventory + Product Sync Service
 *
 * Flow:
 * 1. Get products from CSV adapter
 * 2. Match SKU in Shopify
 * 3. If SKU exists → update product details, price, inventory, status
 * 4. If SKU not found → create product, set price, inventory, status
 * 5. Return sync report
 */

import { resolveShopifyLocationId } from "./shopifyLocation.server.js";

const GET_VARIANT_BY_SKU = `
  query getVariantBySku($sku: String!) {
    productVariants(first: 1, query: $sku) {
      edges {
        node {
          id
          sku
          price
          compareAtPrice
          inventoryQuantity
          inventoryItem {
            id
          }
          product {
            id
            title
            status
          }
        }
      }
    }
  }
`;

const INVENTORY_ACTIVATE = `
  mutation inventoryActivate(
    $inventoryItemId: ID!,
    $locationId: ID!,
    $available: Int
  ) {
    inventoryActivate(
      inventoryItemId: $inventoryItemId,
      locationId: $locationId,
      available: $available
    ) {
      inventoryLevel {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_INVENTORY = `
  mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_PRODUCT = `
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// productVariantUpdate was removed from the Admin API — variant price/compareAtPrice
// updates now go through productVariantsBulkUpdate instead.
const UPDATE_VARIANT = `
  mutation productVariantsBulkUpdate(
    $productId: ID!,
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(
      productId: $productId,
      variants: $variants
    ) {
      productVariants {
        id
        price
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CREATE_PRODUCT = `
  mutation productCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product {
        id
        title
        status
        variants(first: 1) {
          edges {
            node {
              id
              inventoryItem {
                id
              }
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_DEFAULT_VARIANT = `
  mutation productVariantsBulkUpdate(
    $productId: ID!,
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(
      productId: $productId,
      variants: $variants
    ) {
      productVariants {
        id
        price
        sku
        inventoryItem {
          id
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function activateInventoryAtLocation(admin, {
  inventoryItemId,
  locationId,
  quantity = 0,
}) {
  const data = await shopifyGraphQL(admin, INVENTORY_ACTIVATE, {
    inventoryItemId,
    locationId,
    available: quantity,
  });

  const userErrors = data?.inventoryActivate?.userErrors ?? [];

  if (userErrors.length > 0) {
    const message = userErrors.map((e) => e.message).join(", ");

    // Ignore if already activated/stocked
    if (
      message.toLowerCase().includes("already") ||
      message.toLowerCase().includes("stocked")
    ) {
      return data.inventoryActivate;
    }

    throw new Error(message);
  }

  return data.inventoryActivate;
}

async function shopifyGraphQL(admin, query, variables = {}) {
  const response = await admin.graphql(query, { variables });
  const data = await response.json();

  if (data.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
  
  //For fetching location details only
  //   const locationResponse = await admin.graphql(`
  // {
  //   locations(first: 10) {
  //     edges {
  //       node {
  //         id
  //         name
  //       }
  //     }
  //   }
  // }
  //   `);

  // const locationData = await locationResponse.json();
  // console.log(
  //   "LOCATIONS:",
  //   JSON.stringify(locationData.data.locations.edges, null, 2)
  // );
}

function buildDescriptionHtml(product) {
  const parts = [];

  if (product.description) {
    parts.push(`<p>${product.description}</p>`);
  }

  if (product.dimensions) {
    parts.push(`<p><strong>Dimensions:</strong> ${product.dimensions}</p>`);
  }

  if (product.itemSize) {
    parts.push(`<p><strong>Item Size:</strong> ${product.itemSize}</p>`);
  }

  return parts.join("");
}

function buildTags(product) {
  const tags = new Set();

  for (const value of [
    product.collection,
    product.category,
    product.subcategory,
    product.type,
    product.color,
    product.style,
  ]) {
    if (value) tags.add(value);
  }

  if (product.closeOut) tags.add("closeout");
  if (product.hotList) tags.add("hot-list");
  if (product.specialOrder) tags.add("special-order");
  if (product.discontinued) tags.add("discontinued");

  return [...tags];
}

function resolveProductStatus(product) {
  if (product.discontinued) return "ARCHIVED";
  if (product.inStock || product.quantity > 0) return "ACTIVE";
  return "DRAFT";
}

async function getLocationId(admin, locationId) {
  return resolveShopifyLocationId(admin, locationId);
}

async function findVariantBySku(admin, sku) {
  const data = await shopifyGraphQL(admin, GET_VARIANT_BY_SKU, {
    sku: `sku:${sku}`,
  });

  const edge = data?.productVariants?.edges?.[0];

  if (!edge) return null;

  // 🔥 STRICT CHECK
  if (edge.node.sku !== sku) {
    return null;
  }

  return {
    variantId: edge.node.id,
    sku: edge.node.sku,
    currentPrice: parseFloat(edge.node.price),
    currentCompareAtPrice: edge.node.compareAtPrice
      ? parseFloat(edge.node.compareAtPrice)
      : null,
    currentQuantity: edge.node.inventoryQuantity,
    inventoryItemId: edge.node.inventoryItem.id,
    productId: edge.node.product.id,
    productTitle: edge.node.product.title,
    productStatus: edge.node.product.status,
  };
}

async function setSkuOnInventoryItem(admin, inventoryItemId, sku) {
  if (!sku) return;

  const data = await shopifyGraphQL(
    admin,
    `
    mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem { id sku }
        userErrors { field message }
      }
    }
    `,
    {
      id: inventoryItemId,
      input: { sku, tracked: true },
    },
  );

  const userErrors = data?.inventoryItemUpdate?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }
}

async function createProduct(admin, product, locationId) {
  const finalLocationId = await getLocationId(admin, locationId);

  const productPayload = {
    title: product.model_name || product.sku,
    descriptionHtml: buildDescriptionHtml(product),
    productType: product.category || undefined,
    tags: buildTags(product),
    status: resolveProductStatus(product),
  };

  const vendor = product.vendor || product.manufacturer;
  if (vendor) productPayload.vendor = vendor;

  const productData = await shopifyGraphQL(admin, CREATE_PRODUCT, {
    product: productPayload,
  });

  const productErrors = productData?.productCreate?.userErrors ?? [];

  if (productErrors.length > 0) {
    throw new Error(productErrors.map((e) => e.message).join(", "));
  }

  const createdProduct = productData.productCreate.product;
  const defaultVariant = createdProduct.variants.edges[0]?.node;

  if (!defaultVariant?.id) {
    throw new Error("Default variant was not created by Shopify.");
  }

  await setSkuOnInventoryItem(admin, defaultVariant.inventoryItem.id, product.sku);

  const variantInput = {
    id: defaultVariant.id,
    price: String(product.price),
  };

  if (product.compareAtPrice) {
    variantInput.compareAtPrice = String(product.compareAtPrice);
  }

  const variantData = await shopifyGraphQL(admin, UPDATE_DEFAULT_VARIANT, {
    productId: createdProduct.id,
    variants: [variantInput],
  });

  const variantErrors =
    variantData?.productVariantsBulkUpdate?.userErrors ?? [];

  if (variantErrors.length > 0) {
    throw new Error(variantErrors.map((e) => e.message).join(", "));
  }

  const updatedVariant =
    variantData.productVariantsBulkUpdate.productVariants[0];

  await updateInventory(admin, {
    inventoryItemId:
      updatedVariant?.inventoryItem?.id || defaultVariant.inventoryItem.id,
    locationId: finalLocationId,
    quantity: product.quantity,
  });

  return {
    productId: createdProduct.id,
    productTitle: createdProduct.title,
    productStatus: createdProduct.status,
    variantId: updatedVariant?.id || defaultVariant.id,
    inventoryItemId:
      updatedVariant?.inventoryItem?.id || defaultVariant.inventoryItem.id,
  };
}

async function updateProductDetails(admin, productId, product) {
  const data = await shopifyGraphQL(admin, UPDATE_PRODUCT, {
    input: {
      id: productId,
      title: product.model_name,
      descriptionHtml: buildDescriptionHtml(product),
      productType: product.category,
      vendor: product.vendor || product.manufacturer || undefined,
      tags: buildTags(product),
    },
  });

  const userErrors = data?.productUpdate?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  return data.productUpdate.product;
}

async function updateVariantPrice(admin, productId, variantId, price, compareAtPrice) {
  const variantInput = {
    id: variantId,
    price: String(price),
  };

  if (compareAtPrice) {
    variantInput.compareAtPrice = String(compareAtPrice);
  }

  const data = await shopifyGraphQL(admin, UPDATE_VARIANT, {
    productId,
    variants: [variantInput],
  });

  const userErrors = data?.productVariantsBulkUpdate?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  return data.productVariantsBulkUpdate.productVariants[0];
}

async function updateInventory(admin, { inventoryItemId, locationId, quantity }) {
  await activateInventoryAtLocation(admin, {
    inventoryItemId,
    locationId,
    quantity,
  });

  const data = await shopifyGraphQL(admin, UPDATE_INVENTORY, {
    input: {
      name: "available",
      reason: "correction",
      ignoreCompareQuantity: true,
      quantities: [
        {
          inventoryItemId,
          locationId,
          quantity,
        },
      ],
    },
  });

  const userErrors = data?.inventorySetQuantities?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  return data.inventorySetQuantities;
}

async function updateProductStatus(admin, { productId, product, currentStatus }) {
  const targetStatus = resolveProductStatus(product);

  if (currentStatus === targetStatus) return null;

  const data = await shopifyGraphQL(admin, UPDATE_PRODUCT, {
    input: {
      id: productId,
      status: targetStatus,
    },
  });

  const userErrors = data?.productUpdate?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  return targetStatus;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runInventorySync({
  adapter,
  admin,
  locationId,
  offset = 0,
  limit = null,
}) {
  const startedAt = new Date().toISOString();

  const report = {
    startedAt,
    completedAt: null,
    source: "csv",
    totalRows: 0,
    processedOffset: offset,
    processedLimit: limit,
    created: [],
    updated: [],
    skipped: [],
    failed: [],
  };

  let products = [];
  let finalLocationId;

  try {
    finalLocationId = await getLocationId(admin, locationId);

    const result = await adapter.getInventory();

    products = result.products;
    report.totalRows = result.totalRows;

    if (result.skippedRows?.length > 0) {
      result.skippedRows.forEach((row) => {
        report.skipped.push({
          sku: row.data?.sku || `Row ${row.row}`,
          reason: `CSV parse error: ${row.errors.join(", ")}`,
        });
      });
    }
  } catch (err) {
    console.error("[inventory-sync] Setup error:", err.message);
    report.failed.push({
      sku: "ALL",
      reason: `Setup error: ${err.message}`,
    });

    report.completedAt = new Date().toISOString();
    return report;
  }

  const productsToSync =
    limit != null
      ? products.slice(offset, offset + limit)
      : products.slice(offset);

  report.processedCount = productsToSync.length;

  for (const product of productsToSync) {
    try {
      const variant = await findVariantBySku(admin, product.sku);

      if (!variant) {
        const created = await createProduct(admin, product, finalLocationId);

        report.created.push({
          sku: product.sku,
          productTitle: created.productTitle,
          quantity: product.quantity,
          price: product.price,
          status: resolveProductStatus(product),
          reason: "Product created because SKU was not found in Shopify",
        });

        await delay(500);
        continue;
      }

      await updateProductDetails(admin, variant.productId, product);

      const priceChanged = variant.currentPrice !== product.price;
      const compareAtPriceChanged =
        (variant.currentCompareAtPrice ?? null) !==
        (product.compareAtPrice ?? null);
      const quantityChanged = variant.currentQuantity !== product.quantity;

      if (priceChanged || compareAtPriceChanged) {
        await updateVariantPrice(
          admin,
          variant.productId,
          variant.variantId,
          product.price,
          product.compareAtPrice,
        );
      }

      if (quantityChanged) {
        await updateInventory(admin, {
          inventoryItemId: variant.inventoryItemId,
          locationId: finalLocationId,
          quantity: product.quantity,
        });
      }

      const newStatus = await updateProductStatus(admin, {
        productId: variant.productId,
        product,
        currentStatus: variant.productStatus,
      });

      if (
        !priceChanged &&
        !compareAtPriceChanged &&
        !quantityChanged &&
        !newStatus
      ) {
        report.skipped.push({
          sku: product.sku,
          reason: "No product, price, inventory, or status changes needed",
        });

        continue;
      }

      report.updated.push({
        sku: product.sku,
        productTitle: product.model_name,
        previousQuantity: variant.currentQuantity,
        newQuantity: product.quantity,
        previousPrice: variant.currentPrice,
        newPrice: product.price,
        priceChanged,
        quantityChanged,
        statusChanged: newStatus
          ? `${variant.productStatus} → ${newStatus}`
          : null,
      });

      await delay(500);
    } catch (err) {
      console.error(`[inventory-sync] Failed SKU ${product.sku}:`, err.message);
      report.failed.push({
        sku: product.sku,
        reason: err.message,
      });
    }
  }

  report.completedAt = new Date().toISOString();
  return report;
}