import process from "node:process";
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

export function parseInvAdvBranchSum(fileContent) {
  const rows = parseCSVRows(fileContent.trim());
  const headers = rows.next().value?.map((h) => clean(h)) ?? [];

  const valid = [];
  const invalid = [];

  let index = -1;
  for (const cols of rows) {
    index++;
    const row = Object.fromEntries(
      headers.map((header, i) => [header, clean(cols[i] || "")]),
    );

    const sku =
      row["Item Number"] || row["Item Num"] || row.ItemNumber || row.sku;
    const modelName =
      row.Model ||
      row["Model Name"] ||
      row.RealName ||
      row.Description ||
      row["Item Number"];
    const description = row.Description || "";
    const price = row.Retail;
    // Compare-at prices are intentionally not sourced from FW.
    const availableValue = row.Available ?? row.QtyAvailable;
    const inStockValue = row["In Stock"];
    const quantity = availableValue ?? inStockValue ?? "0";
    const lastPpcUpdate =
      row.LastPPCUpdate ||
      row["Last PPC Update"] ||
      row["LastPPC Update"] ||
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
      continue;
    }

    const available = Math.max(0, toInteger(quantity));
    const inStockQuantity = Math.max(
      0,
      toInteger(inStockValue ?? availableValue ?? "0"),
    );
    const sellingPrice = toNumber(price);
    const showroomColumn = process.env.FW_SHOWROOM_AVAILABLE_COLUMN;
    const warehouseColumn = process.env.FW_WAREHOUSE_AVAILABLE_COLUMN;
    const numericStock = value => value != null && String(value).trim() !== "" && Number.isInteger(toNumber(value));
    const branchVerified = showroomColumn && warehouseColumn && showroomColumn !== warehouseColumn && numericStock(row[showroomColumn]) && numericStock(row[warehouseColumn]);
    const totalVerified = process.env.FW_AVAILABLE_IS_COMBINED_SELLABLE === "true" && numericStock(availableValue);
    const verifiedQuantity = branchVerified
      ? Math.max(0, toInteger(row[showroomColumn])) + Math.max(0, toInteger(row[warehouseColumn]))
      : available;
    const discontinuedRaw = row.Discontinue ?? row.Discontinued;
    const discontinuedVerified = discontinuedRaw != null && ["true", "false", "1", "0", "yes", "no"].includes(String(discontinuedRaw).trim().toLowerCase());

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
      price: sellingPrice,
      priceSource: "Retail",
      inventoryVerified: Boolean(branchVerified || totalVerified),
      discontinuedVerified,
      compareAtPrice: null,
      quantity: verifiedQuantity,
      available,
      inStockQuantity,
      inStock: available > 0,
      cost: toMoney(row.Cost),
      actualCost: toMoney(row["Actual Cost"]),
      barcode: clean(row["UPC Code"]),
      closeOut: toBoolean(row.CloseOut),
      hotList: toBoolean(row["Hot List"]),
      discontinued: toBoolean(discontinuedRaw),
      specialOrder: toInteger(row["Spcl Order"]) === 1,
      lastPpcUpdate: clean(lastPpcUpdate),
      lastUpdatedByVendor: clean(lastPpcUpdate),
    });
  }

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

function* parseCSVRows(text) {
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
        yield row;
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
    yield row;
  }

}
