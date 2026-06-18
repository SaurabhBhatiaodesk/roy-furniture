# Roy Furniture × Shopify
## Automated Product Sync — Client Handoff Notes

**Prepared for:** Roy Furniture  
**Store:** roy-furniture.myshopify.com  
**Data source:** Furniture Wizard — `InvAdvBranchSum.csv`  
**Date:** June 2026

---

## Executive Summary

We have built and configured a **Shopify app** that automatically syncs your Furniture Wizard inventory file to your Shopify store.

The app will:

- **Create** new products when a SKU does not exist in Shopify  
- **Update** existing products when Furniture Wizard data has changed  
- Set the correct **price, stock, and product status** (Active / Draft / Archived)  
- Run **automatically every 10 minutes** — no manual work needed after setup  

**Important:** The first full catalog sync (~45,000 products) will take approximately **2–3 days**. After that, only changed or new products sync — usually within **10 minutes**.

---

## How It Works (Simple Overview)

```
Furniture Wizard  →  CSV file (SFTP)  →  Our Shopify App  →  Your Shopify Store
```

1. The app connects to Furniture Wizard and downloads `InvAdvBranchSum.csv`
2. It reads each product row from the file
3. It checks whether the product is **new** or **changed**
4. It sends updates to Shopify in safe batches of **250 products per run**
5. It saves a record of what was synced so unchanged products are not re-processed

You can monitor progress and run a sync manually from the Shopify app page: **FTP Cron Sync**.

---

## The Two Most Important CSV Columns

These two columns drive the entire sync logic:

### 1. Item Number → Shopify SKU (Match Key)

| | |
|---|---|
| **Purpose** | Uniquely identifies each product |
| **How we use it** | We search Shopify by this SKU. If found → **update**. If not found → **create new product**. |
| **Why it matters** | This is how we know which CSV row belongs to which Shopify product. |

### 2. Last Updated By Vendor → Change Detector (Smart Sync Key)

| | |
|---|---|
| **Purpose** | Tells us when Furniture Wizard last modified this product row |
| **How we use it** | After a successful sync, we save this value. On the next run, we only sync products where this value **has changed** or the SKU is **brand new**. |
| **Why it matters** | Without this, all 45,000+ products would need to sync every day — taking days and overloading Shopify's API. With this, **only real changes sync** — fast and efficient. |

**In plain terms:**  
> If Furniture Wizard didn't change a product, we don't touch it in Shopify.

---

## Product Status in Shopify

Your products are automatically set to the correct Shopify status based on these CSV rules:

| Shopify Status | When It Applies | CSV Column |
|----------------|-----------------|------------|
| **Archived** | Product is discontinued | **Discontinue = TRUE** (Column AI) |
| **Active** | Product has stock available | **Available > 0** (Column O) |
| **Draft** | No stock, and product is not discontinued | Available = 0, Discontinue ≠ TRUE |

**Rule priority:**
1. Discontinued? → **Archived** (always first)
2. Has stock? → **Active**
3. No stock, not discontinued? → **Draft**

---

## All CSV Columns We Use

### Pricing & Inventory

| CSV Column | Goes to Shopify As | Notes |
|------------|-------------------|-------|
| **Retail** | Selling Price | Required — what the customer pays |
| **Regular Price** | Compare-at Price | Shows original/was price when higher than Retail |
| **Available** | Inventory Quantity | Also used for Active/Draft status |
| **In Stock** | Stock helper | Used alongside Available for status logic |

### Product Details

| CSV Column | Goes to Shopify As |
|------------|-------------------|
| **Model** | Product Title |
| **RealName** | Product Title (if Model is empty) |
| **Description** | Product Description |
| **Manufacturer** | Vendor |
| **Category** | Product Type |
| **Dimensions** | Added to Description |
| **Item Size** | Added to Description |

### Tags (for filtering & search in Shopify)

| CSV Column | Shopify Tag Added |
|------------|------------------|
| **Collection** | Collection name as tag |
| **Subcategory** | Subcategory as tag |
| **Type** | Type as tag |
| **Color** | Color as tag |
| **Style** | Style as tag |
| **CloseOut** | `closeout` |
| **Hot List** | `hot-list` |
| **Spcl Order** | `special-order` (when value = 1) |

### Not Synced to Shopify Yet (available for future use)

| CSV Column | Status |
|------------|--------|
| Cost | Read from file — not sent to Shopify |
| Actual Cost | Read from file — not sent to Shopify |
| UPC Code | Read from file — barcode not enabled yet |

---

## First Sync vs Daily Updates

### First-time sync (one-time setup)

| | |
|---|---|
| **What happens** | All ~45,000+ products need to sync once because there is no prior sync history |
| **Speed** | 250 products every 10 minutes |
| **Estimated time** | **2–3 days** for the full catalog |
| **What you need to do** | Keep the app running and allow it to complete — no action required |

### After first sync is complete (ongoing)

| | |
|---|---|
| **What happens** | Only new SKUs or rows where **Last Updated By Vendor** changed |
| **Speed** | Typically completes within **one 10-minute cycle** |
| **Example** | If 50 products were updated in Furniture Wizard today → only those 50 sync |
| **New products** | Detected on the next run and synced **first** before other updates |

---

## Why 250 Products Per Batch?

We process **250 products per run** (every 10 minutes) for these reasons:

| Reason | Detail |
|--------|--------|
| **Shopify API limits** | Shopify restricts how many API calls an app can make per minute. Sending too many at once causes errors and throttling. |
| **Reliability** | Each product needs several API calls (lookup, update/create, price, inventory, status). Smaller batches = fewer failures. |
| **Server stability** | Keeps the app and Shopify connection stable and consistent. |
| **Daily speed unaffected** | Batch size only affects the **one-time initial load**. Day-to-day delta updates are fast regardless. |

> Increasing batch size beyond 250 risks API errors from Shopify and is not recommended without testing.

---

## Sync Priority

When products are waiting to sync, the app processes them in this order:

1. **New products** (SKU in CSV but never synced before) — synced first  
2. **Updated products** (Last Updated By Vendor changed) — synced after new products  

This ensures newly added furniture items appear in your store as quickly as possible.

---

## Monitoring the Sync

Open your Shopify admin → Roy Furniture app → **FTP Cron Sync**

You will see:

- ✅ Last run status (Success / Failed)
- 📊 Counts: Created · Updated · Skipped · Failed
- 🆕 How many new products are waiting to sync
- 🔄 How many updated products are waiting
- ▶️ **Run Sync Now** button for manual sync

---

## What We Need From You

| Step | Action |
|------|--------|
| 1 | Open the Roy Furniture app in Shopify admin at least once |
| 2 | Approve app permissions (products, inventory, locations) |
| 3 | Allow **2–3 days** for the initial full catalog sync to complete |
| 4 | After go-live — no daily action needed. The app runs automatically. |

---

## Quick FAQ

**Q: Where does the product data come from?**  
A: Furniture Wizard — file `InvAdvBranchSum.csv` downloaded automatically via SFTP.

**Q: How does the app know which Shopify product to update?**  
A: By matching **Item Number** from the CSV to the **SKU** in Shopify.

**Q: Will all 45,000 products sync every day?**  
A: No. Only products where **Last Updated By Vendor** changed, or brand-new SKUs.

**Q: How long will the first sync take?**  
A: Approximately **2–3 days** (250 products every 10 minutes).

**Q: How fast are daily updates after go-live?**  
A: Usually within **10 minutes** of Furniture Wizard updating the CSV.

**Q: What happens when a new product is added in Furniture Wizard?**  
A: It is detected on the next scheduled run and synced to Shopify first.

**Q: How is product visibility (Active/Draft/Archived) decided?**  
A: Discontinue = TRUE → Archived. Available > 0 → Active. No stock + not discontinued → Draft.

**Q: Can I trigger a sync manually?**  
A: Yes — use the **Run Sync Now** button on the FTP Cron Sync page in the app.

---

## Summary Table

| Topic | Detail |
|-------|--------|
| Data source | Furniture Wizard `InvAdvBranchSum.csv` via SFTP |
| Product match key | Item Number = Shopify SKU |
| Smart sync key | Last Updated By Vendor |
| Product status | Discontinue → Archived · Stock > 0 → Active · No stock → Draft |
| Schedule | Every 10 minutes, 250 products per run |
| First full sync | ~2–3 days |
| Daily updates | ~10 minutes after CSV change |
| New products | Synced first, automatically |
| Manual sync | Available in app → FTP Cron Sync |

---

*Roy Furniture — Shopify Product Sync*  
*Implementation complete. For support or configuration changes, please contact your development team.*
