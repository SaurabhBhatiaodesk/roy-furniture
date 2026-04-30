// Built now, activated later — just swap the type in config
export function apiAdapter({ baseUrl, apiKey }) {
  return {
    getInventory: async () => {
      // TODO: replace with real Furniture Wizard API call
      const res = await fetch(`${baseUrl}/inventory`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await res.json();

      // Map API response to same shape as CSV adapter
      return data.products.map((p) => ({
        sku: p.sku.trim(),
        model_name: p.model_name?.trim(),
        description: p.description?.trim() || "",
        price: parseFloat(p.price),
        quantity: parseInt(p.stockLevel, 10),
        inStock: parseInt(p.stockLevel, 10) > 0,
        collection: p.collection?.trim() || "",
        category: p.category?.trim() || "",
        dimensions: p.dimensions?.trim() || "",
      }));
    },
  };
}
