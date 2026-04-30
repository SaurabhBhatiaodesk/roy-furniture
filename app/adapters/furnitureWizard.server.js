export async function getFurnitureWizardProducts() {
    
  // Replace this with real Furniture Wizard API later

  return [
    {
      sku: "SOFA-001",
      modelName: "Luxury Sofa",
      description: "Premium 3 seater sofa",
      price: "899.00",
      inStock: 5,
      available: 5,
      category: "Sofa",
      collection: "Living Room",
      dimensions: "80 x 35 x 32",
    },
  ];
}

export async function notifyFurnitureWizardOrder(order) {
  // Replace with real Furniture Wizard order API later
  console.log("Notify Furniture Wizard order:", order.id);
  return { success: true };
}