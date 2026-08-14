/**
 * Adapter for InvAdvBranchSum.csv (single-file FTP sync).
 */

export function branchSumCsvAdapter({ fileContent }) {
  if (!fileContent || typeof fileContent !== "string") {
    throw new Error("branchSumCsvAdapter requires fileContent as a string.");
  }

  return {
    getInventory: async () => {
      const { valid, invalid } = parseInvAdvBranchSum(fileContent);

      return {
        products: valid,
        skippedRows: invalid,
        totalRows: valid.length + invalid.length,
      };
    },
  };
}

function parseInvAdvBranchSum(fileContent) {
  const rows = parseCSVRows(fileContent.trim());
  const headers = rows.shift()?.map((h) => clean(h)) ?? [];

  const valid = [];
  const invalid = [];

  rows.forEach((cols, index) => {
    const row = Object.fromEntries(
      headers.map((header, i) => [header, clean(cols[i] || "")]),
    );

    const sku =
      row["Item Number"] || row["Item Num"] || row.ItemNumber || row.sku;
    const modelName =
      row.RealName || row.Model || row.Description || row["Item Number"];
    const description = row.Description || "";
    const price = row.Retail || row.Regular;
    const compareAtPrice = row["Regular Price"] || row.Regular;
    const quantity = row.Available ?? row.QtyAvailable ?? "0";
    const inStockQty = row["In Stock"] ?? quantity;
    const lastUpdatedByVendor =
      row["LastPPCUpdate"] ||
      row["Last PPC Update"] ||
      row["Last Updated By Vendor"] ||
      row["Last Updated"] ||
      row.LastUpdatedByVendor ||
      "";

    const errors = [];

    if (!sku) errors.push("Missing Item Number");
    if (!price || Number.isNaN(toNumber(price))) errors.push("Invalid Retail price");
    if (quantity === "" || Number.isNaN(toNumber(quantity))) {
      errors.push("Invalid Available quantity");
    }

    if (errors.length > 0) {
      invalid.push({
        file: "InvAdvBranchSum.csv",
        row: index + 2,
        data: row,
        errors,
      });
      return;
    }

    const available = toInteger(quantity);

    valid.push({
      sku: clean(sku),
      model_name: clean(modelName),
      title: clean(modelName),
      description: clean(description),
      manufacturer: clean(row.Manufacturer),
      vendor: clean(row.Manufacturer),
      category: clean(row.Category),
      subcategory: clean(row.Subcategory),
      type: clean(row.Type),
      collection: clean(row.Collection),
      dimensions: clean(row.Dimensions),
      itemSize: clean(row["Item Size"]),
      color: clean(row.Color),
      style: clean(row.Style),
      price: toNumber(price),
      compareAtPrice: compareAtPrice ? toNumber(compareAtPrice) : null,
      quantity: available,
      available,
      inStock: available > 0 || toInteger(inStockQty) > 0,
      cost: toMoney(row.Cost),
      actualCost: toMoney(row["Actual Cost"]),
      barcode: clean(row["UPC Code"]),
      closeOut: toBoolean(row.CloseOut),
      hotList: toBoolean(row["Hot List"]),
      discontinued: toBoolean(row.Discontinue || row.Discontinued),
      specialOrder: toInteger(row["Spcl Order"]) === 1,
      lastUpdatedByVendor: clean(lastUpdatedByVendor),
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
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
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
