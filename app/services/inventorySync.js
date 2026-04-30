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

const GET_FIRST_LOCATION = `
  query getFirstLocation {
    locations(first: 1) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`;

const GET_VARIANT_BY_SKU = `
  query getVariantBySku($sku: String!) {
    productVariants(first: 1, query: $sku) {
      edges {
        node {
          id
          sku
          price
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

const UPDATE_VARIANT = `
  mutation productVariantUpdate($input: ProductVariantInput!) {
    productVariantUpdate(input: $input) {
      productVariant {
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
  mutation productCreate($input: ProductInput!) {
    productCreate(input: $input) {
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
  return `
    <p>${product.description || ""}</p>
    ${
      product.dimensions
        ? `<p><strong>Dimensions:</strong> ${product.dimensions}</p>`
        : ""
    }
  `;
}

function buildTags(product) {
  const tags = [];

  if (product.collection) tags.push(product.collection);
  if (product.category) tags.push(product.category);

  return tags;
}

async function getLocationId(admin, locationId) {
  if (locationId) return locationId;

  const data = await shopifyGraphQL(admin, GET_FIRST_LOCATION);
  const firstLocation = data?.locations?.edges?.[0]?.node;

  if (!firstLocation?.id) {
    throw new Error("No Shopify location found.");
  }

  return firstLocation.id;
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
    currentQuantity: edge.node.inventoryQuantity,
    inventoryItemId: edge.node.inventoryItem.id,
    productId: edge.node.product.id,
    productTitle: edge.node.product.title,
    productStatus: edge.node.product.status,
  };
}

async function createProduct(admin, product, locationId) {
  const finalLocationId = await getLocationId(admin, locationId);

  const productData = await shopifyGraphQL(admin, CREATE_PRODUCT, {
    input: {
      title: product.model_name,
      descriptionHtml: buildDescriptionHtml(product),
      productType: product.category,
      tags: buildTags(product),
      status: product.inStock ? "ACTIVE" : "DRAFT",
    },
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

  const variantData = await shopifyGraphQL(admin, UPDATE_DEFAULT_VARIANT, {
    productId: createdProduct.id,
    variants: [
      {
        id: defaultVariant.id,
        price: String(product.price),
        inventoryItem: {
          sku: product.sku,
          tracked: true,
        },
      },
    ],
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
      tags: buildTags(product),
    },
  });

  const userErrors = data?.productUpdate?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  return data.productUpdate.product;
}

async function updateVariantPrice(admin, variantId, price) {
  const data = await shopifyGraphQL(admin, UPDATE_VARIANT, {
    input: {
      id: variantId,
      price: String(price),
    },
  });

  const userErrors = data?.productVariantUpdate?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  return data.productVariantUpdate.productVariant;
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

async function updateProductStatus(admin, { productId, inStock, currentStatus }) {
  const targetStatus = inStock ? "ACTIVE" : "DRAFT";

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

export async function runInventorySync({ adapter, admin, locationId }) {
  const startedAt = new Date().toISOString();

  const report = {
    startedAt,
    completedAt: null,
    source: "csv",
    totalRows: 0,
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
    report.failed.push({
      sku: "ALL",
      reason: `Adapter error: ${err.message}`,
    });

    report.completedAt = new Date().toISOString();
    return report;
  }

  for (const product of products) {
    try {
      const variant = await findVariantBySku(admin, product.sku);

      if (!variant) {
        const created = await createProduct(admin, product, finalLocationId);

        report.created.push({
          sku: product.sku,
          productTitle: created.productTitle,
          quantity: product.quantity,
          price: product.price,
          status: product.inStock ? "ACTIVE" : "DRAFT",
          reason: "Product created because SKU was not found in Shopify",
        });

        await delay(500);
        continue;
      }

      await updateProductDetails(admin, variant.productId, product);

      const priceChanged = variant.currentPrice !== product.price;
      const quantityChanged = variant.currentQuantity !== product.quantity;

      if (priceChanged) {
        await updateVariantPrice(admin, variant.variantId, product.price);
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
        inStock: product.inStock,
        currentStatus: variant.productStatus,
      });

      if (!priceChanged && !quantityChanged && !newStatus) {
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
      report.failed.push({
        sku: product.sku,
        reason: err.message,
      });
    }
  }

  report.completedAt = new Date().toISOString();
  return report;
}