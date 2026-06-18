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

let cachedLocation = null;

export async function resolveShopifyLocationId(admin, preferredId) {
  if (preferredId) {
    return preferredId;
  }

  if (cachedLocation) {
    return cachedLocation.id;
  }

  const response = await admin.graphql(GET_FIRST_LOCATION);
  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  const location = json.data?.locations?.edges?.[0]?.node;

  if (!location?.id) {
    throw new Error("No Shopify location found for this store.");
  }

  cachedLocation = location;
  console.log(`[inventory-sync] Using location: ${location.name} (${location.id})`);

  return location.id;
}

export function clearLocationCache() {
  cachedLocation = null;
}
