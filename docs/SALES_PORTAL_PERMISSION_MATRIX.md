# V MOTIV V2 — Sales Executive Portal Permission Matrix

## Roles and Scope Definitions

| Role | System Identifier | Scope | Portal Access | Description |
|---|---|---|---|---|
| **Sales Executive** | `SALES_EXECUTIVE` | Branch Assigned Cities | Full Sales Workspace | Handles seller qualification, buyer follow-ups, test drives, quotations, and reservations in assigned branch. |
| **Operations Manager** | `OPERATIONS_MANAGER` | All Branches (Global) | Sales + Operations | Oversees pipeline, reassigns leads, reviews inspections, approves discount requests. |
| **Administrator** | `ADMIN` | All Branches (Global) | Full Administrative + Sales | Full system governance, role configuration, master data management, commercial approvals. |
| **Super Administrator** | `SUPER_ADMIN` | All Branches (Global) | Complete Root Access | Unrestricted root capabilities across all portals. |
| **Customer / Non-Employee** | *N/A* | None | Denied (`403 FORBIDDEN`) | Normal customers have no access to the sales executive workspace. |

---

## Detailed Action Matrix

| Feature / Action | Sales Executive | Operations Manager | Admin / Super Admin |
|---|---|---|---|
| **View Dashboard & Queue** | Own Branch Scope | Global Scope | Global Scope |
| **View Notifications** | Branch Scope | Global Scope | Global Scope |
| **View Seller Leads** | Own Branch Scope | All Branches | All Branches |
| **Create Walk-in Seller Lead** | Yes | Yes | Yes |
| **Claim Unassigned Lead** | Yes (Atomic) | Yes | Yes |
| **Reassign Seller Lead** | No (Assigned to self) | Yes (Any Employee) | Yes (Any Employee) |
| **Qualify / Disqualify Lead** | Yes | Yes | Yes |
| **Log Lead Interaction** | Yes | Yes | Yes |
| **Create & Complete Task** | Assigned Tasks | Any Task | Any Task |
| **Request Inspection** | Yes (Hub / Home) | Yes | Yes |
| **View Approved Inspection** | Yes (Read-only summary) | Yes (Full findings) | Yes (Full findings) |
| **Propose Purchase Offer** | Yes | Yes | Yes |
| **Record Customer Offer Decision** | Yes | Yes | Yes |
| **View Buyer Enquiries** | Branch Scope | All Branches | All Branches |
| **Update Buyer Lead Status** | Yes | Yes | Yes |
| **View Inventory Catalogue** | Published Only (Non-cost) | All | All (With cost data in Admin) |
| **Schedule Test Drive** | Yes | Yes | Yes |
| **Update Test Drive Status** | Yes | Yes | Yes |
| **Create Retail Quotation** | Yes | Yes | Yes |
| **Submit Retail Quotation** | Yes | Yes | Yes |
| **Request Price Discount** | Yes | Yes | Yes |
| **Approve / Reject Discount** | **No** (403 Forbidden) | **Yes** | **Yes** |
| **Place Vehicle Reservation** | Yes (Atomic) | Yes | Yes |
| **Release Reservation** | Own / Assigned | Any | Any |
| **Customer 360 View** | Yes | Yes | Yes |
| **Send Approved Transactional Email** | Yes (Approved templates only) | Yes | Yes |
| **View Funnel & Performance Reports** | Branch Aggregates | Global Aggregates | Global Aggregates |
