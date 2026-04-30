// app/adapters/furnitureWizardCsvAdapter.js

export function furnitureWizardCsvAdapter({
  webFormatContent,
  branchSumContent,
  inventoryExportContent,
}) {
  return {
    getInventory: async () => {
      const webProducts = parseWebFormat(webFormatContent);
      const branchSummary = parseBranchSummary(branchSumContent);
      const branchWiseInventory = parseInventoryExport(inventoryExportContent);

      const products = webProducts.valid.map((product) => {
        const sku = product.sku;

        const branchSummaryData = branchSummary.validBySku[sku];
        const branchWiseData = branchWiseInventory.validBySku[sku] || [];

        return {
          ...product,

          // Override/extend from InvAdvBranchSum.csv
          category: branchSummaryData?.category || product.category || "",
          subcategory: branchSummaryData?.subcategory || "",
          collection: branchSummaryData?.collection || product.collection || "",
          dimensions: branchSummaryData?.dimensions || product.dimensions || "",
          manufacturer: branchSummaryData?.manufacturer || product.supplier || "",
          cost: branchSummaryData?.cost || null,
          actualCost: branchSummaryData?.actualCost || null,

          // Final inventory numbers
          inStock: branchSummaryData?.inStock ?? product.inStockQty,
          available: branchSummaryData?.available ?? product.quantity,

          // Location/branch inventory from InvAdvExport.csv
          branches: branchWiseData,

          // Shopify inventory quantity
          quantity: branchSummaryData?.available ?? product.quantity,
        };
      });

      return {
        products,
        skippedRows: [
          ...webProducts.invalid,
          ...branchSummary.invalid,
          ...branchWiseInventory.invalid,
        ],
        totalRows:
          webProducts.totalRows +
          branchSummary.totalRows +
          branchWiseInventory.totalRows,
      };
    },
  };
}

/* ---------------- WEB FORMAT ---------------- */

function parseWebFormat(fileContent) {
  const rows = getRows(fileContent);
  const headers = rows.shift();

  const valid = [];
  const invalid = [];

  rows.forEach((cols, index) => {
    const row = toObject(headers, cols);

    const sku = row.ItemNumber;
    const modelName = row.Model;
    const description = row.Description;
    const price = row.Retail || row.Regular;
    const quantity = row.QtyAvailable;

    const errors = [];

    if (!sku) errors.push("Missing ItemNumber/SKU");
    if (!modelName) errors.push("Missing Model");
    if (!price || Number.isNaN(toNumber(price))) errors.push("Invalid price");
    if (quantity === "" || Number.isNaN(toNumber(quantity))) {
      errors.push("Invalid QtyAvailable");
    }

    if (errors.length) {
      invalid.push({
        file: "WebFormat.csv",
        row: index + 2,
        data: row,
        errors,
      });
      return;
    }

    valid.push({
      sku: clean(sku),
      model_name: clean(modelName),
      title: clean(modelName),
      supplier: clean(row.Supplier),
      description: clean(description),
      price: toNumber(price),
      regularPrice: toNumber(row.Regular),
      retailPrice: toNumber(row.Retail),
      quantity: toInteger(quantity),
      inStockQty: toInteger(quantity),
      dimensions: "",
      category: "",
      collection: "",
      closeOut: toBoolean(row.CloseOut),
      hotList: toBoolean(row["Hot List"]),
    });
  });

  return {
    valid,
    invalid,
    totalRows: valid.length + invalid.length,
  };
}

/* ---------------- BRANCH SUMMARY ---------------- */

function parseBranchSummary(fileContent) {
  const rows = getRows(fileContent);
  const headers = rows.shift();

  const validBySku = {};
  const invalid = [];

  rows.forEach((cols, index) => {
    const row = toObject(headers, cols);

    const sku = row["Item Number"];
    const available = row.Available;
    const inStock = row["In Stock"];

    const errors = [];

    if (!sku) errors.push("Missing Item Number");
    if (available === "" || Number.isNaN(toNumber(available))) {
      errors.push("Invalid Available");
    }

    if (errors.length) {
      invalid.push({
        file: "InvAdvBranchSum.csv",
        row: index + 2,
        data: row,
        errors,
      });
      return;
    }

    validBySku[clean(sku)] = {
      sku: clean(sku),
      manufacturer: clean(row.Manufacturer),
      model: clean(row.Model),
      description: clean(row.Description),
      category: clean(row.Category),
      subcategory: clean(row.Subcategory),
      type: clean(row.Type),
      dimensions: clean(row.Dimensions),
      color: clean(row.Color),
      style: clean(row.Style),
      collection: clean(row.Collection),
      inStock: toInteger(inStock),
      available: toInteger(available),
      cost: toMoney(row.Cost),
      actualCost: toMoney(row["Actual Cost"]),
      retail: toMoney(row.Retail),
      regularPrice: toMoney(row["Regular Price"]),
      hotList: toBoolean(row["Hot List"]),
      closeOut: toBoolean(row.CloseOut),
      discontinued: toBoolean(row.Discontinued),
      warehouseLocation: clean(row["Warehouse Location"]),
    };
  });

  return {
    validBySku,
    invalid,
    totalRows: Object.keys(validBySku).length + invalid.length,
  };
}

/* ---------------- INVENTORY EXPORT / BRANCH-WISE ---------------- */

function parseInventoryExport(fileContent) {
  const rows = getRows(fileContent);
  const headers = rows.shift();

  const validBySku = {};
  const invalid = [];

  rows.forEach((cols, index) => {
    const row = toObject(headers, cols);

    const sku = row["Item Number"];
    const branch = row.Branch;
    const available = row.Available;

    const errors = [];

    if (!sku) errors.push("Missing Item Number");
    if (!branch) errors.push("Missing Branch");
    if (available === "" || Number.isNaN(toNumber(available))) {
      errors.push("Invalid Available");
    }

    if (errors.length) {
      invalid.push({
        file: "InvAdvExport.csv",
        row: index + 2,
        data: row,
        errors,
      });
      return;
    }

    const item = {
      sku: clean(sku),
      branch: clean(branch),
      inStock: toInteger(row["In Stock"]),
      available: toInteger(row.Available),
      onOrder: toInteger(row["On Order"]),
      specialOrder: toInteger(row["Spcl Order"]),
      warehouseLocation: clean(row["Warehouse Location"]),
    };

    if (!validBySku[item.sku]) {
      validBySku[item.sku] = [];
    }

    validBySku[item.sku].push(item);
  });

  return {
    validBySku,
    invalid,
    totalRows:
      Object.values(validBySku).reduce((sum, arr) => sum + arr.length, 0) +
      invalid.length,
  };
}

/* ---------------- HELPERS ---------------- */

function getRows(fileContent) {
  if (!fileContent || typeof fileContent !== "string") {
    return [];
  }

  return parseCSVRows(fileContent.trim()).map((row) => row.map(clean));
}

function toObject(headers, cols) {
  return Object.fromEntries(headers.map((header, index) => [header, cols[index] || ""]));
}

function clean(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/^"|"$/g, "")
    .trim();
}

function toNumber(value) {
  return Number(clean(value).replace(/[$,%]/g, ""));
}

function toInteger(value) {
  return parseInt(toNumber(value) || 0, 10);
}

function toMoney(value) {
  const num = toNumber(value);
  return Number.isNaN(num) ? null : num;
}

function toBoolean(value) {
  return String(value).toLowerCase() === "true";
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