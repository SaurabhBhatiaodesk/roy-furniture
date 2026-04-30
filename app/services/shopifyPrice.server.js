export async function syncPrice(admin, { productId, variantId, price }) {
  const response = await admin.graphql(
    `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
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
    `,
    {
      variables: {
        productId, // ✅ REQUIRED
        variants: [
          {
            id: variantId,
            price: String(price),
          },
        ],
      },
    }
  );

  const data = await response.json();
  const errors = data.data.productVariantsBulkUpdate.userErrors;

  if (errors.length) {
    throw new Error(errors[0].message);
  }

  return data.data.productVariantsBulkUpdate.productVariants[0];
}