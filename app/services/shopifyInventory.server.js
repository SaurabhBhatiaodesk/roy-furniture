export async function syncInventory(admin, { inventoryItemId, quantity }) {
  const locationId = process.env.SHOPIFY_LOCATION_ID;

  if (!locationId) {
    throw new Error("SHOPIFY_LOCATION_ID missing in .env");
  }

  await activateInventoryAtLocation(admin, {
    inventoryItemId,
    locationId,
  });

  const response = await admin.graphql(
    `
    mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup {
          createdAt
          reason
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
        input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: [
            {
              inventoryItemId,
              locationId,
              quantity: Number(quantity),
            },
          ],
        },
      },
    }
  );

  const data = await response.json();
  const errors = data.data.inventorySetQuantities.userErrors;

  if (errors.length) {
    throw new Error(errors[0].message);
  }

  return data.data.inventorySetQuantities.inventoryAdjustmentGroup;
}


async function activateInventoryAtLocation(admin, { inventoryItemId, locationId }) {
  const response = await admin.graphql(
    `
    mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
      inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
        inventoryLevel {
          id
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
        inventoryItemId,
        locationId,
      },
    }
  );

  const data = await response.json();
  const errors = data.data.inventoryActivate.userErrors;

  if (errors.length) {
    throw new Error(errors[0].message);
  }

  return data.data.inventoryActivate.inventoryLevel;
}

