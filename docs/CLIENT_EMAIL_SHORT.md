# Short Email to Client — Copy & Send

**Subject:** Roy Furniture Shopify Sync — Update & Next Steps

---

Hi,

Roy Furniture Shopify sync is **done on our local setup**. Attached are full notes; short summary below.

**We need from you:**
1. **Last Updated By Vendor** — jab bhi Furniture Wizard mein product change karo, is column ko bhi update karna zaroori hai. Warna change Shopify par sync nahi hoga.
2. **Heroku access** — app 24/7 chalane ke liye:
   - **Option A:** aap access de do, **ya**
   - **Option B:** aap Heroku app banao, credentials share karo  
   Deploy hum kar lenge.

**Timeline (go-live ke baad):**
- Testing: ~**1 hour**
- Pehli full sync (~45k products): ~**2–3 days**
- Uske baad daily updates: ~**10 min** (sirf changed/new products)

**Aaj kya complete hua:**
- SFTP se CSV sync (`InvAdvBranchSum.csv`, ~45k products)
- **Last Updated By Vendor** se smart sync — sirf changed/new products
- Naye products pehle sync hote hain
- Status auto: Discontinue → Archived, Stock > 0 → Active, No stock → Draft
- Batch 250 / 10 min, **FTP Cron Sync** page se monitor + manual run

Please confirm Heroku option (A/B) aur **Last Updated By Vendor** maintain hoga.

Thanks,  
[Your Name]

**Attach:** `CLIENT_HANDOFF_FINAL.md`
