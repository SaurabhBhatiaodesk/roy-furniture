// This is the CONTRACT every adapter must follow.
// Never change this interface.

export async function createAdapter(type, config) {
  if (type === "csv") {
    const { csvAdapter } = await import("./csvAdapter.js");
    return csvAdapter(config);
  }

  if (type === "api") {
    const { apiAdapter } = await import("./apiAdapter.js");
    return apiAdapter(config);
  }

  throw new Error(`Unknown adapter type: ${type}`);
}

// Every adapter must return this shape:
// {
//   getInventory: async () => [
//     { sku, model_name, quantity, price }
//   ]
// }