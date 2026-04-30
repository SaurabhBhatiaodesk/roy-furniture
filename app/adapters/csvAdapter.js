// app/adapters/csvAdapter.js

export function csvAdapter({ fileContent }) {
  if (!fileContent || typeof fileContent !== "string") {
    throw new Error("csvAdapter requires fileContent as a string.");
  }

  return {
    getInventory: async () => {
      const { valid, invalid } = parseCSV(fileContent);

      return {
        products: valid,
        skippedRows: invalid,
        totalRows: valid.length + invalid.length,
      };
    },
  };
}

function parseCSV(fileContent) {
  const rows = parseCSVRows(fileContent.trim());

  const headers = rows.shift().map((h) => clean(h));

  const valid = [];
  const invalid = [];

  rows.forEach((cols, index) => {
    const row = Object.fromEntries(
      headers.map((header, i) => [header, clean(cols[i] || "")])
    );

    const sku = row.ItemNumber || row["Item Number"] || row.sku;
    const model_name = row.Model || row.model_name || "";
    const description = row.Description || "";
    const price = row.Retail || row.Regular || row.price;
    const quantity = row.QtyAvailable || row.quantity || row.Available || "0";
    const dimensions = row.Dimensions || "";
    const category = row.Category || "";
    const collection = row.Collection || "";

    const errors = [];

    if (!sku) errors.push("Missing SKU");
    if (!model_name) errors.push("Missing model_name");
    if (!price || Number.isNaN(Number(price))) errors.push("Invalid price");
    if (quantity === "" || Number.isNaN(Number(quantity))) {
      errors.push("Invalid quantity");
    }

    if (errors.length > 0) {
      invalid.push({
        row: index + 2,
        data: { sku, model_name, description, price, quantity },
        errors,
      });
      return;
    }

    valid.push({
      sku: String(sku).trim(),
      model_name: String(model_name).trim(),
      description: String(description).trim(),
      price: Number(price),
      quantity: Number.parseInt(quantity, 10),
      dimensions: String(dimensions).trim(),
      category: String(category).trim(),
      collection: String(collection).trim(),
      inStock: Number.parseInt(quantity, 10) > 0,
    });
  });

  return { valid, invalid };
}

function clean(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/^"|"$/g, "")
    .trim();
}

function parseCSVRows(text) {
  const rows = [];
  let row = [];
  let value = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      value += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (value || row.length) {
        row.push(value);
        rows.push(row);
        row = [];
        value = "";
      }

      if (char === "\r" && nextChar === "\n") {
        i++;
      }
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}