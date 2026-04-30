export async function upsertShopifyProduct(admin, item) {
  console.log("PRODUCT ORG DEBUG:", {
    sku: item.sku,
    title: item.title || item.model_name || item.modelName,
    category: item.category,
    collection: item.collection,
    productType: item.category,
  });

  const existing = await findVariantBySku(admin, item.sku);

  // =============================
  // CREATE PRODUCT
  // =============================
  if (!existing) {
    // Step 1: Create product (auto-creates a default variant)
    const response = await admin.graphql(
      `
      mutation productCreate($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
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
      `,
      {
        variables: {
          product: {
            title:
              item.title ||
              item.model_name ||
              item.modelName ||
              item.sku,
            descriptionHtml: `
              <p>${item.description || ""}</p>
              <p><strong>Dimensions:</strong> ${item.dimensions || ""}</p>
            `,
            productType: item.category || "",
            vendor: "Furniture Wizard",
            status: "ACTIVE",
          },
        },
      }
    );

    const data = await response.json();
    const errors = data.data.productCreate.userErrors;
    if (errors.length) throw new Error(errors[0].message);

    const product = data.data.productCreate.product;
    const defaultVariant = product.variants.edges[0].node;

    // Step 2: Set SKU via inventoryItemUpdate (works across all API versions)
    await setSkuOnInventoryItem(admin, defaultVariant.inventoryItem.id, item.sku);

    // Step 3: Add to collection
    await addProductToCollection(admin, product.id, item.collection);

    return {
      productId: product.id,
      variantId: defaultVariant.id,
      inventoryItemId: defaultVariant.inventoryItem.id,
    };
  }

  // =============================
  // UPDATE PRODUCT
  // =============================
  await admin.graphql(
    `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
        }
        userErrors {
          message
        }
      }
    }
    `,
    {
      variables: {
        input: {
          id: existing.productId,
          title:
            item.title ||
            item.model_name ||
            item.modelName ||
            item.sku,
          descriptionHtml: `
            <p>${item.description || ""}</p>
            <p><strong>Dimensions:</strong> ${item.dimensions || ""}</p>
          `,
          productType: item.category || "",
        },
      },
    }
  );

  await addProductToCollection(admin, existing.productId, item.collection);

  return existing;
}


// ✅ Set SKU using inventoryItemUpdate — works on all Shopify API versions
async function setSkuOnInventoryItem(admin, inventoryItemId, sku) {
  if (!sku) return;

  const response = await admin.graphql(
    `
    mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem {
          id
          sku
        }
        userErrors {
          field
          message
        }
      }
    }
    `,
    {
      variables: {
        id: inventoryItemId,
        input: { sku },
      },
    }
  );

  const data = await response.json();
  const errors = data.data.inventoryItemUpdate.userErrors;

  if (errors.length) {
    console.log("SKU UPDATE ERROR:", errors);
    throw new Error(errors[0].message);
  }

  console.log("SKU SET:", sku);
}


async function addProductToCollection(admin, productId, collectionName) {
  if (!collectionName) return;

  const title = String(collectionName).trim();
  let collectionId = await findCollection(admin, title);

  if (!collectionId) {
    collectionId = await createCollection(admin, title);
  }

  if (!collectionId) return;

  const response = await admin.graphql(
    `
    mutation addProduct($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        userErrors {
          message
        }
      }
    }
    `,
    {
      variables: {
        id: collectionId,
        productIds: [productId],
      },
    }
  );

  const data = await response.json();

  if (data.data.collectionAddProducts.userErrors.length) {
    console.log("COLLECTION ADD ERROR:", data.data.collectionAddProducts.userErrors);
  } else {
    console.log("COLLECTION ADDED:", title);
  }
}


async function findVariantBySku(admin, sku) {
  if (!sku) return null;

  const response = await admin.graphql(
    `
    query getVariantBySku($query: String!) {
      productVariants(first: 1, query: $query) {
        edges {
          node {
            id
            sku
            product {
              id
            }
            inventoryItem {
              id
            }
          }
        }
      }
    }
    `,
    {
      variables: { query: `sku:${sku}` },
    }
  );

  const data = await response.json();
  const variant = data.data.productVariants.edges[0]?.node;

  if (!variant) return null;

  return {
    productId: variant.product.id,
    variantId: variant.id,
    inventoryItemId: variant.inventoryItem.id,
  };
}


async function findCollection(admin, title) {
  const response = await admin.graphql(
    `
    query {
      collections(first: 50) {
        edges {
          node {
            id
            title
          }
        }
      }
    }
    `
  );

  const data = await response.json();
  const found = data.data.collections.edges.find(
    (c) => c.node.title.toLowerCase() === title.toLowerCase()
  );

  return found?.node?.id || null;
}


async function createCollection(admin, title) {
  const response = await admin.graphql(
    `
    mutation {
      collectionCreate(input: { title: "${title}" }) {
        collection {
          id
          title
        }
        userErrors {
          message
        }
      }
    }
    `
  );

  const data = await response.json();

  if (data.data.collectionCreate.userErrors.length) {
    console.log("CREATE COLLECTION ERROR:", data.data.collectionCreate.userErrors);
    return null;
  }

  console.log("COLLECTION CREATED:", title);
  return data.data.collectionCreate.collection.id;
}