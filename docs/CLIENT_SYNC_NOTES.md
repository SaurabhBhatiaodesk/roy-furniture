# Roy Furniture — Shopify Product Sync
## Client Summary Document

**Shop:** roy-furniture.myshopify.com  
**Data Source:** Furniture Wizard — `InvAdvBranchSum.csv` (via SFTP)  
**Sync Method:** Automated Shopify embedded app with scheduled background job

---

## 1. What We Built

We developed a **Shopify app** that automatically reads your inventory file from Furniture Wizard and **creates or updates products** in your Shopify store.

The app runs on a **schedule (every 10 minutes)** and processes products in **controlled batches** so Shopify’s API limits are respected and the server stays stable.

You can also trigger a sync manually from the app admin under **“FTP Cron Sync”**.

---

## 2. How the CSV File Is Read

| Item | Detail |
|------|--------|
| **File name** | `InvAdvBranchSum.csv` |
| **Server** | Furniture Wizard SFTP (`ftp.furnwiz.cloud`, port 22) |
| **Match key** | **Item Number** = Shopify variant **SKU** |
| **Total products** | Approximately **45,000+** rows in the file |

On each scheduled run, the app downloads a **fresh copy** of the CSV so any newly added products appear within the next sync cycle.

---

## 3. Smart Sync — “Last Updated By Vendor” (Important)

To avoid re-processing all 45,000+ products on every run (which would take days and overload Shopify), we implemented **delta sync** using the CSV column:

### **Last Updated By Vendor**

| Situation | What the app does |
|-----------|-------------------|
| Product **never synced before** | Syncs to Shopify (create or update) |
| **Last Updated By Vendor** value **changed** since last sync | Syncs that product |
| **Last Updated By Vendor** value **same** as last sync | **Skips** — no unnecessary API calls |

Each successfully synced SKU is recorded in our database with its last **Last Updated By Vendor** value. On the next run, only rows where this value differs are picked up.

**What this means for you:**
- **First-time setup:** All products need to sync once (see Section 6).
- **After that:** Only products Furniture Wizard actually changed will update — typically within **one cron cycle (10 minutes)**.
- **New products** added to the CSV are detected and synced **first**, before routine updates.

---

## 4. Product Status Rules in Shopify

Shopify product visibility (Active / Draft / Archived) is set automatically from your CSV columns:

| Shopify Status | Condition | CSV Reference |
|----------------|-----------|---------------|
| **Archived** | Product is discontinued | **Discontinue = TRUE** (Column AI) |
| **Active** | Product has stock | **Available > 0** (Column O — Available) |
| **Draft** | No stock and not discontinued | Available = 0 and Discontinue ≠ TRUE |

**Priority order:** Discontinued is checked first. If discontinued → Archived. Otherwise, stock determines Active vs Draft.

---

## 5. CSV Keys / Columns — What We Use and Why

Below is every important column from `InvAdvBranchSum.csv`, **why we use it**, and **what it does in Shopify**.

### A. Main Keys (Most Important)

| CSV Column | Column Ref. | Why We Use It | Used For |
|------------|-------------|---------------|----------|
| **Item Number** | — | **Primary match key** — uniquely identifies each product in both Furniture Wizard and Shopify | Shopify **Variant SKU**. If this SKU exists → **update**; if not → **create new product** |
| **Last Updated By Vendor** | — | **Delta sync key** — tells us if Furniture Wizard changed this row since our last sync | We save this value in our database after each successful sync. Next run: only sync if this value **changed** OR product is **new**. This avoids re-processing all 45,000+ products every day |
| **Discontinue** | Column AI | Controls whether product should be hidden/archived in store | If `TRUE` → Shopify status = **Archived** (highest priority rule) |
| **Available** | Column O | Controls stock and product visibility | If `> 0` → **Active** + inventory quantity set. If `0` and not discontinued → **Draft** |
| **Retail** | — | Required selling price | Shopify **Price** (what customer pays) |
| **Regular Price** | — | Original/compare price | Shopify **Compare-at Price** (shows as “was” price if higher than Retail) |

---

### B. Product Information Keys

| CSV Column | Why We Use It | Used For in Shopify |
|------------|---------------|---------------------|
| **Model** | Main product name customers see | **Product Title** |
| **RealName** | Backup name if Model is empty | **Product Title** (fallback) |
| **Description** | Product details text | **Product Description** (HTML) |
| **Manufacturer** | Who makes the product | **Vendor** field in Shopify |
| **Category** | Product grouping | **Product Type** |
| **Collection** | Marketing/collection grouping | **Tag** (for filtering/search in Shopify) |
| **Subcategory** | Finer grouping | **Tag** |
| **Type** | Product type/style grouping | **Tag** |
| **Color** | Color attribute | **Tag** |
| **Style** | Style attribute | **Tag** |
| **Dimensions** | Physical size info | Added into **Product Description** |
| **Item Size** | Size info | Added into **Product Description** |

---

### C. Stock & Status Helper Keys

| CSV Column | Why We Use It | Used For |
|------------|---------------|----------|
| **In Stock** | Extra stock check if Available is used differently | Helps decide if product is **in stock** (used with Available for Active status) |
| **QtyAvailable** | Backup column name for quantity | **Inventory quantity** (fallback if Available column missing) |

---

### D. Tag / Flag Keys (Special Labels)

| CSV Column | Why We Use It | Used For |
|------------|---------------|----------|
| **CloseOut** | Marks clearance/closeout items | Adds tag `closeout` in Shopify |
| **Hot List** | Marks featured/hot items | Adds tag `hot-list` in Shopify |
| **Spcl Order** | Special order items | Adds tag `special-order` in Shopify (when value = 1) |
| **Discontinued** | Alternate discontinue column name | Same as **Discontinue** → Archived if true |

---

### E. Keys Read from CSV (Not Sent to Shopify Yet)

These columns are parsed from the file but are **not currently pushed** to Shopify. They can be added later if needed:

| CSV Column | Currently |
|------------|-----------|
| **Cost** | Parsed only — not synced to Shopify |
| **Actual Cost** | Parsed only — not synced to Shopify |
| **UPC Code** | Parsed only — barcode sync not enabled yet |

---

### F. Shopify Status Logic (Summary)

We use **Discontinue** and **Available** together:

```
IF Discontinue = TRUE     →  ARCHIVED
ELSE IF Available > 0     →  ACTIVE
ELSE                      →  DRAFT (no stock, not discontinued)
```

---

### G. Create vs Update Logic

| Key Used | Logic |
|----------|-------|
| **Item Number** | Search Shopify by SKU |
| SKU found | Update title, description, vendor, price, inventory, status, tags |
| SKU not found | Create new product with all mapped fields |
| **Last Updated By Vendor** | After successful sync, save value — skip on next run if unchanged |

---

## 6. CSV → Shopify Field Mapping (Quick Reference)

| CSV Column | Shopify Field |
|------------|---------------|
| Item Number | Variant SKU (unique match key) |
| Model / RealName | Product Title |
| Description | Product Description |
| Manufacturer | Vendor |
| Category | Product Type |
| Collection, Subcategory, Type, Color, Style | Tags |
| Retail | Selling Price |
| Regular Price | Compare-at Price |
| Available | Inventory Quantity |
| Dimensions, Item Size | Added to Description |
| Discontinue | Status → Archived |
| Last Updated By Vendor | Delta sync control (our database) |

**Create vs Update:**
- If SKU **exists** in Shopify → product details, price, inventory, and status are **updated**.
- If SKU **not found** → a **new product** is **created**.

---

## 7. First-Time Sync vs Ongoing Sync

### First time (initial load)
- Database has no sync history → **all ~45,000+ products** are treated as new/pending.
- App processes **250 products per run**, every **10 minutes**.
- Estimated time for full initial sync: **approximately 2–3 days**.

This is expected and normal — Shopify GraphQL API has rate limits; pushing all products at once would cause failures and throttling.

### After first sync is complete
- Only products with a **changed Last Updated By Vendor** value (or **brand-new SKUs**) are processed.
- Most runs will finish in **minutes**, not days.
- Example: If Furniture Wizard updates 50 products today, only those 50 sync on the next run(s).

---

## 8. Why Batch Size = 250?

| Reason | Explanation |
|--------|-------------|
| **Shopify API limits** | GraphQL Admin API enforces rate limits (cost-based throttling). Large bursts cause errors and retries. |
| **Server stability** | Each product requires multiple API calls (lookup, update/create, inventory, status). 250 per batch keeps load manageable. |
| **Reliability** | Smaller batches = fewer failures per run; failed SKUs retry on the next cycle. |
| **Speed after go-live** | Batch size mainly affects the **one-time initial load**. Day-to-day updates use delta sync and complete quickly regardless of batch size. |

Batch size and interval can be adjusted if needed, but increasing too much risks API throttling from Shopify.

**Current settings:**
- Batch size: **250 products per run**
- Interval: **Every 10 minutes**

---

## 9. Sync Priority Order

When multiple products are pending, the app processes in this order:

1. **New SKUs** (in CSV but not yet in our sync database) — highest priority  
2. **Updated products** (Last Updated By Vendor changed)

This ensures newly added furniture items appear in Shopify as soon as possible.

---

## 10. Inventory Location

The app **automatically detects** your Shopify store’s primary location for inventory updates. No manual location ID configuration is required in normal operation.

---

## 11. Monitoring & Admin UI

Inside the Shopify app, open **“FTP Cron Sync”** to see:

- Last run time and success/failure status
- Counts: Created · Updated · Skipped · Failed
- Pending new products waiting to sync
- Pending updates waiting to sync
- **Run Sync Now** button for manual trigger

---

## 12. Technical Flow (Overview)

```
Furniture Wizard SFTP
        ↓
InvAdvBranchSum.csv downloaded
        ↓
Parse ~45,000+ products
        ↓
Filter: only new SKUs OR changed "Last Updated By Vendor"
        ↓
Batch of 250 → Shopify GraphQL API
        ↓
Create new products / Update existing by SKU
        ↓
Set status (Active / Draft / Archived)
        ↓
Update inventory quantity
        ↓
Save sync record in database
```

---

## 13. What You Need to Do

1. **Install / open the app** in Shopify admin at least once (so the app can save store access).
2. **Approve required permissions:** products, inventory, locations (read/write).
3. **Let the first sync run** — allow 2–3 days for the full catalog (~45k products).
4. **After go-live:** No daily action needed — cron runs automatically. Use the admin page only to check status or run manually if needed.

---

## 14. Summary for Client

| Topic | Answer |
|-------|--------|
| Where does data come from? | Furniture Wizard CSV via SFTP |
| How are products matched? | Item Number = Shopify SKU |
| How do we avoid syncing all 45k every day? | **Last Updated By Vendor** delta sync |
| Product visibility rules? | Discontinue → Archived; Stock > 0 → Active; No stock → Draft |
| First sync how long? | ~2–3 days (250 products every 10 min) |
| Daily updates how fast? | Usually within 10 minutes of CSV change |
| New products? | Detected on next run, synced first |

---

*Document prepared for Roy Furniture — Shopify Product Sync Implementation*  
*For questions or batch-size / schedule changes, contact your development team.*
