# ERPNext Stock — what a mature open-source inventory module contains

**What this is.** A feature inventory of ERPNext's Stock module, read from the
source rather than from marketing pages. It exists so that "does a real
warehouse system do X" is a question with a citable answer while OneInventory is
being designed, and so that anything we leave out is left out on purpose.

**Read from:** `github.com/frappe/erpnext` at `9160182` (2026-08-28), shallow
clone, `erpnext/stock/` plus the adjacent `subcontracting/` module.

**Size:** 80 doctypes (tables/forms) and 51 canned reports in `stock/` alone,
plus 13 doctypes in `subcontracting/`. For scale: OneInventory has 20
collections, 61 operations and 22 screens.

⚠️ **THIS IS A CATALOGUE, NOT A ROADMAP.** ERPNext is an ERP: its stock module
exists to feed a general ledger, and roughly a third of what follows is
accounting machinery that only makes sense if you are also the accounting
system. Copying the list would produce a worse product than choosing from it.
The last section is the honest reading.

---

## 1. The spine — four tables everything else hangs off

| Table | What it is |
|---|---|
| **Item** | The catalogue record. ~90 fields spanning stock, purchase, sales, manufacturing, accounting and tax. |
| **Warehouse** | A **tree** (`lft`/`rgt` nested set), with `is_group`, a parent, a type, and an address. |
| **Bin** | The per (item × warehouse) balance — a *projection*, not a fact. Holds `actual_qty`, `reserved_qty`, `ordered_qty`, `indented_qty`, `planned_qty`, `projected_qty`, plus four separate reservation buckets and `valuation_rate`/`stock_value`. |
| **Stock Ledger Entry (SLE)** | The append-only event. Every movement in the whole system lands here. |

**The Stock Ledger Entry is the design.** Its fields are worth reading in full,
because they encode most of ERPNext's stock behaviour:

- `item_code`, `warehouse`, `actual_qty` (signed change), `qty_after_transaction`
- `posting_date` + `posting_time` + `posting_datetime` — **temporal ordering is
  by posting time, not insert time**, with `creation` as the tie-breaker
- `voucher_type` + `voucher_no` + `voucher_detail_no` — a polymorphic reference
  to whatever document caused the movement, down to the child row
- `incoming_rate`, `outgoing_rate`, `valuation_rate`, `stock_value`,
  `stock_value_difference` — the money half, booked into the GL
- `stock_queue` — **the whole FIFO/LIFO queue serialised onto every row**, as
  `[[qty, rate], …]`
- `is_cancelled` — entries are never deleted
- `dependant_sle_voucher_detail_no` — cross-warehouse transfers point at the row
  they depend on, so a rate change on one side reprices the other
- `recalculate_rate`, `is_adjustment_entry`, `serial_and_batch_bundle`

**Projected quantity** is the number the whole reorder system runs on:

```
projected = actual + ordered + indented + planned − reserved
          − reserved_for_production − reserved_for_sub_contract
```

---

## 2. The item record

**Identity and naming** — `item_code` (unique) or a naming series; `item_name`,
`item_group` (a tree), `brand`, `description`, image, `disabled`, `end_of_life`.

**Tracking mode** — `is_stock_item` (maintain stock at all), `has_batch_no`,
`has_serial_no`, `has_variants`, `is_fixed_asset`.

**Units** — `stock_uom` plus a **UOM conversion table** on the item, and separate
`purchase_uom` / `sales_uom` defaults. Conversion factors are per item, and a
global setting decides whether a UOM with no factor on the item is allowed.

**Batches** — `create_new_batch` (auto-mint on receipt), `batch_number_series`,
`has_expiry_date`, `shelf_life_in_days`, `retain_sample` + `sample_quantity`.

**Serials** — `serial_no_series`, `warranty_period`.

**Variants** — `has_variants` + `variant_based_on` (Item Attribute | Manufacturer)
+ an attributes table. Attributes have their own doctype with value lists, and
`Item Variant Settings` controls which fields propagate from template to variant.

**Reorder** — a **table** of `Item Reorder` rows, each naming a warehouse, a
level, a quantity, and a request type (Purchase | Transfer | Material Issue |
Manufacture) — so one item can reorder differently per warehouse, and can
*check* availability in a parent warehouse group while *requesting* into a leaf.
Plus `safety_stock`, `min_order_qty`, `lead_time_days`.

**Valuation** — a per-item `valuation_method` overriding the global default:
**FIFO | Moving Average | LIFO | Standard Cost**.

**Supply** — `supplier_items` table, `country_of_origin`, `customs_tariff_number`,
`last_purchase_rate`, `is_customer_provided_item`, `delivered_by_supplier`
(drop-ship), `is_sub_contracted_item`.

**Quality** — `inspection_required_before_purchase` / `…before_delivery` and a
`quality_inspection_template`.

**Tolerances** — `over_delivery_receipt_allowance` (%), `over_billing_allowance`,
`allow_negative_stock` per item.

**Other** — `weight_per_unit` + `weight_uom`, `barcodes` table (typed: EAN, UPC-A,
CODE-39, EAN-13/8, GS1, GTIN, GTIN-14, ISBN…), `item_defaults` per company,
`taxes`, `item_alternative` (substitutes, optionally two-way), manufacturers +
part numbers, customer-specific item codes, price lists, `production_capacity`,
company restriction.

---

## 3. The transactions

Every one of these is a **submittable document** — draft → submitted → cancelled,
with an amendment chain (`amended_from`). Nothing is edited after submission;
you cancel and amend, and the cancellation writes its own ledger entries.

### Stock Entry — the general-purpose movement

One document, **thirteen purposes**:

`Material Issue` · `Material Receipt` · `Material Transfer` ·
`Material Transfer for Manufacture` · `Material Consumption for Manufacture` ·
`Manufacture` · `Repack` · `Send to Subcontractor` · `Disassemble` ·
`Receive from Customer` · `Return Raw Material to Customer` ·
`Subcontracting Delivery` · `Subcontracting Return`

Workspaces can define their own **Stock Entry Type** records mapping to one of
those purposes, so "Cycle count adjustment" or "Damage write-off" becomes a
first-class named transaction without code.

Carries: source and target warehouse defaults, **in-transit warehouse** support
(`add_to_transit` — a transfer becomes two documents with stock parked in a
transit warehouse between them), barcode scanning with a `last_scanned_warehouse`,
per-row batch/serial, **additional costs** (landed cost rows on the entry
itself), `apply_putaway_rule`, `process_loss_qty` / `process_loss_percentage`,
`is_opening`, project and cost centre.

### Purchase Receipt — goods in

Rejection handling is the notable part: a `rejected_warehouse` and per-row
accepted/rejected quantities, so a partial rejection is one document. Also
`apply_putaway_rule`, `is_return` + `return_against`, `is_internal_supplier` +
`inter_company_reference` (inter-company transfers auto-create the paired
document), subcontracting linkage, transporter fields, `per_billed` / `per_returned`.

### Delivery Note — goods out

`is_return` + `return_against`, `is_internal_customer` + inter-company pairing,
transporter/driver/vehicle/LR number, `dispatch_address`, `installation_status`,
`per_billed` / `per_installed` / `per_returned`, packed items (for bundles).

### Material Request — "we need this"

Types: Purchase | Material Transfer | Material Issue | Manufacture |
Subcontracting. Statuses: Draft, Submitted, Stopped, Cancelled, Pending,
Partially Ordered, Ordered, Issued, Transferred, Received. Tracks `per_ordered`
and `per_received`, has a `transfer_status` (Not Started | In Transit |
Completed), and records `auto_created_via_reorder` so an automatic request is
distinguishable from one a person raised.

### Pick List — the warehouse floor document

Given a set of demands, ERPNext **computes where to pick from** and produces a
list. Notable fields: `parent_warehouse` (pick anywhere under this node),
`scan_mode`, `prompt_qty`, `group_same_items`, `pick_manually` (override the
computation), `consider_rejected_warehouses`, and an over-picking allowance.
Statuses: Draft, Open, Partly Delivered, Partially Transferred, Completed.
It reserves stock while it is open.

### Stock Reconciliation — the count

Purposes: `Opening Stock` | `Stock Reconciliation`. Set a quantity *and/or* a
valuation rate per row; the difference posts to a named **Difference Account**
and cost centre. Has `scan_mode` and `scan_barcode` for counting with a device.

### Quality Inspection

Types: Incoming | Outgoing | In Process. Attaches to a Purchase Receipt,
Purchase Invoice, Subcontracting Receipt, Delivery Note, Stock Entry or Job Card,
names an item and optionally a serial or batch, records a `sample_size`, and
carries a **readings table** driven by a `Quality Inspection Template` — each
reading is a named parameter with an acceptance formula or numeric range,
grouped by parameter group. Status: Accepted | Rejected | Cancelled. Two global
settings decide what happens when an inspection is missing or rejected — **Stop
or Warn**.

### Landed Cost Voucher

Take one or more Purchase Receipts, add freight/duty/insurance rows, and
**redistribute the cost across the received items** — by Qty, by Amount, or
manually. Submitting it triggers a revaluation of everything downstream of those
receipts. Can reference vendor invoices.

### Packing Slip

Splits a Delivery Note into numbered packages (`from_case_no` / `to_case_no`),
each with net and gross weight in their own UOMs.

### Shipment + Delivery Trip

**Shipment** is a carrier booking: pickup and delivery parties (each Company |
Customer | Supplier), addresses, contacts, a parcel table or template, pickup
date and time window, value of goods, Incoterm, carrier, service, AWB number,
tracking URL and tracking status (In Progress | Delivered | Returned | Lost).
**Delivery Trip** is the van: a driver, a vehicle, a departure time, an ordered
list of stops with addresses and estimated arrival, total distance, and email
notification to customers.

---

## 4. Batches and serials

**Batch** — `batch_id` (unique), item, `manufacturing_date`, `expiry_date`,
supplier, a **parent batch** (so a split batch keeps its lineage), a source
document reference, `batch_qty`, `use_batchwise_valuation`, and
`allow_negative_stock_for_batch`.

**Serial No** — a record per physical unit: item, warehouse, batch, company,
`purchase_rate`, status (Active | Inactive | Consumed | Delivered | Expired),
customer, `warranty_expiry_date`, `amc_expiry_date`, `maintenance_status`
(Under Warranty | Out of Warranty | Under AMC | Out of AMC), employee, location,
and an asset link.

**Serial and Batch Bundle** — the modern indirection. Rather than stamping serial
numbers onto every transaction row, a submittable *bundle* document holds the
entries (`Serial and Batch Entry`: serial, batch, qty, incoming/outgoing rate,
warehouse) and the transaction points at the bundle. Carries
`type_of_transaction` (Inward | Outward | Maintenance | Asset Repair),
`is_rejected`, `is_packed`, an average rate and total. This is what makes
batch-wise valuation and serial-level costing possible.

**Picking policy** — `pick_serial_and_batch_based_on`: **FIFO | LIFO | Expiry**,
with `auto_create_serial_and_batch_bundle_for_outward` and
`auto_reserve_serial_and_batch`.

---

## 5. Warehouse behaviour

**The warehouse tree.** `is_group` nodes with children; a transaction names a
leaf, but reports, pick lists and reorder checks can run against a group and
roll up. Warehouses carry an address, a **Warehouse Type**, a
`default_in_transit_warehouse`, `is_rejected_warehouse`, and can belong to a
customer (consignment).

**Putaway Rule.** Per (item × warehouse): a `capacity` in a stated UOM, a
`priority`, and a disable switch. On a receipt with `apply_putaway_rule`, ERPNext
distributes the incoming quantity across warehouses by priority until each is
full. There is a **Warehouse Capacity Summary** page showing how full each
warehouse is against its rules.

**Inventory Dimension.** A configuration doctype that lets a workspace add its
own dimension to the stock ledger — a rack, a bay, a zone, a project, a
temperature band — without code. It names a reference doctype, which documents it
applies to, whether it is inward/outward/both, whether it is mandatory (with a
condition expression), and **whether negative stock is validated per dimension**.
This is ERPNext's answer to bin-level locations: you extend the ledger's key
rather than deepening the warehouse tree.

**Stock Reservation Entry.** A submittable reservation of quantity (or of
specific serials/batches) against a Sales Order, Work Order, Pick List or
Production Plan, with `reserved_qty`, `delivered_qty`, `consumed_qty`,
`transferred_qty` and a status ladder (Draft, Partially Reserved, Reserved,
Partially Delivered, Delivered, Cancelled). Global switches: `enable_stock_reservation`,
`allow_partial_reservation`, `auto_reserve_stock`,
`auto_reserve_stock_for_sales_order_on_purchase`.

---

## 6. Valuation and the accounting seam

**Four methods**, global default overridable per item: **FIFO**, **Moving
Average**, **LIFO**, **Standard Cost**.

FIFO and LIFO are implemented as an explicit queue/stack of `[qty, rate]` bins
(`stock/valuation.py`), serialised onto every ledger row so any point in history
can be reconstructed. Standard Cost has its own `Item Standard Cost` doctype with
effective dates and a posting-date validation.

**Back-dated entries are the hard part, and ERPNext has an entire subsystem for
it.** Inserting a movement before existing ones invalidates every
`qty_after_transaction`, `valuation_rate` and `stock_value` after it. So:

- **Repost Item Valuation** — a submittable job with a status ladder (Queued, In
  Progress, Completed, Skipped, Failed, Cancelled), an error log, a progress
  index, a total voucher count, and a data file. It can repost by transaction or
  by (item × warehouse).
- **Stock Reposting Settings** — limits and scheduling for that queue.
- `run_parallel_reposting` runs on the scheduler; a nightly job re-checks for
  incorrect valuation entries.
- A `repost_gate` / `sle_processing_gate` prevents concurrent reposts of the same
  item and warehouse.
- Six diagnostic reports exist purely to find ledgers that have gone wrong —
  *Stock Ledger Invariant Check*, *Stock Ledger Variance*,
  *Incorrect Balance Qty After Transaction*, *Incorrect Stock Value Report*,
  *Incorrect Serial and Batch Bundle*, *FIFO Queue vs Qty After Transaction Comparison*.

**Freezing.** `stock_frozen_upto` (a date), `stock_frozen_upto_days` (a rolling
window), a `stock_auth_role` allowed to post into frozen periods, and a separate
role allowed to create back-dated transactions at all.

**Stock Closing Entry** — closes a period into a `Stock Closing Balance` snapshot
so reports do not have to replay the whole ledger. Runs as a background job with
its own status ladder.

**Negative stock** — allowed globally, per item, or per batch, each independently.
When disallowed, ERPNext validates not just the current entry but **every future
entry that would be made negative by it**.

---

## 7. Settings — the whole of Stock Settings

Worth reading as a list, because it is a map of every decision a warehouse
customer has ever asked to change:

*Naming* — item naming by code or series; batch naming series and prefix; serial
and batch bundle naming.

*Defaults* — default item group, stock UOM, valuation method, warehouse.

*Tolerances* — over delivery/receipt allowance (%), over transfer allowance (%),
over picking allowance (%), and a role allowed to exceed them.

*Negative stock* — allow globally; allow for batch.

*Reorder* — `auto_indent` (raise a Material Request at the reorder level) and
`reorder_email_notify`.

*Freezing* — frozen-up-to date, rolling days, authorised role, back-dated role.

*Quality* — action if inspection is not submitted (Stop | Warn); action if
rejected (Stop | Warn); allow inspection after purchase/delivery.

*Serial and batch* — activate per item, use serial/batch fields vs bundles,
inline editor, auto-create bundle for outward, auto-reserve, picking basis
(FIFO/LIFO/Expiry), disable the selector, allow an existing serial to be received
again, batch-wise valuation on/off.

*Reservation* — enable, allow partial, auto reserve, auto reserve on purchase.

*UOM* — allow editing stock-UOM quantity separately for sales, purchase and stock
entries; allow a UOM only if a conversion rate is defined on the item.

*Transfers* — validate material transfer warehouses; allow internal transfers at
an arm's-length (user-defined) rate.

*Pricing* — auto-insert item price if missing, update existing price list rate,
update price list based on Rate or Price List Rate.

*Display* — show the barcode field in stock transactions; clean item description
HTML.

---

## 8. The reports — all 51

**Balances and value**
Stock Balance · Item Balance · Warehouse Wise Stock Balance ·
Warehouse Wise Item Balance Age and Value · Total Stock Summary ·
Stock Projected Qty · Stock Analytics · Stock Ageing ·
Stock and Account Value Comparison · COGS by Item Group

**The ledger**
Stock Ledger · Serial No Ledger · Item Wise Consumption

**Batches**
Batch-Wise Balance History · Batch Item Expiry Status · Available Batch Report ·
Negative Batch Report · Stock Qty vs Batch Qty

**Serials**
Available Serial No · Serial No Status · Serial and Batch Summary ·
Serial No and Batch Traceability · Serial No Warranty Expiry ·
Serial No Service Contract Expiry · Incorrect Serial No Valuation ·
Stock Qty vs Serial No Count

**Buying and shortage**
Item Shortage Report · Itemwise Recommended Reorder Level · Items to be Requested ·
Requested Items to be Transferred ·
Material Requests for which Supplier Quotations are not Created ·
Purchase Receipt Trends · Delayed Item Report · Delayed Order Report

**Selling**
Delivery Note Trends · Product Bundle Balance · Reserved Stock

**Pricing**
Item Prices · Item Price Stock · Item Wise Price List Rate · Landed Cost Report

**Catalogue**
Item Variant Details · Item Where Used · BOM Search

**Diagnostics** (six, listed in §6)

**Dashboards** — number cards for Total Active Items, Total Stock Value, Total
Warehouses; charts for Warehouse-wise Stock Value, Stock Value by Item Group,
Oldest Items, Item Shortage Summary, Delivery Trends, Purchase Receipt Trends.

---

## 9. Scheduled work

- **`reorder_item`** — daily. Computes projected quantity per (item × warehouse),
  compares against each reorder row's level, and raises Material Requests grouped
  by type and company. Emails on creation if configured.
- **`repost_entries` / `run_parallel_reposting`** — the valuation repost queue.
- **`repost_incorrect_valuation_entries`** — a nightly self-check.
- **`update_maintenance_status`** — moves serials between warranty/AMC states.

---

## 10. What ERPNext has that OneInventory does not

Ordered by how much a real warehouse would miss it.

| # | Capability | Note |
|---|---|---|
| 1 | **Valuation and stock value** | Four methods, a FIFO queue per row, landed-cost redistribution, and a GL seam. OneInventory records quantity and no money at all. |
| 2 | **Back-dated entries and reposting** | The single largest subsystem in the module. OneInventory's ledger is append-only in real time and has no concept of inserting into the past. |
| 3 | **A warehouse tree** | OneInventory has `location` with a `within` parent, but no roll-up: a view over a parent does not include children. |
| 4 | **Reservation** | Committing stock to a demand before it moves. OneInventory has no notion of a demand at all. |
| 5 | **Pick lists** | Compute where to pick from, then work the list on a device. |
| 6 | **Putaway rules and capacity** | Per-shelf capacity with priority, and a fullness dashboard. |
| 7 | **Period freezing and closing** | A date before which nothing may post; a snapshot so reports need not replay. |
| 8 | **Variants** | One template, N attribute combinations, generated. |
| 9 | **UOM conversion** | OneInventory has a packing ladder (each/box/case) but no free UOM graph. |
| 10 | **Inventory dimensions** | Extending the ledger key without code. |
| 11 | **Inter-company / in-transit transfers** | Two-document transfers with stock parked in transit. |
| 12 | **Rejection at receipt** | A rejected warehouse and per-line accepted/rejected split. |
| 13 | **Shipping** | Carrier booking, parcels, tracking, delivery trips and stops. |
| 14 | **Quality inspection templates** | Named parameters with acceptance formulas; OneInventory's release rail records a verdict but not a reading set. |
| 15 | **Amendment chains** | Cancel-and-amend with a linked history, rather than an undo. |
| 16 | **Subcontracting** | Send raw material out, receive a finished good back, track what the supplier holds. |

**Where OneInventory is already ahead:** a scan-first phone surface (ERPNext's
scanning is a field on a desktop form), the four-clock expiry model, the AI lane,
offline queuing, an erasure model derived from declarations, and a design system
that treats the phone as the primary device.

---

## 11. The honest reading

**Three of these are load-bearing for anyone selling to a warehouse, and we
should decide about them deliberately rather than by omission.**

1. **Stock value.** "What is my inventory worth" is the second question every
   business asks after "what do I have", and it is the one an accountant asks
   first. We currently cannot answer it. Note that a *valuation* does not require
   a general ledger — a moving-average rate per (product × place) and a value on
   the balance is a fraction of ERPNext's machinery and answers most of the
   question.

2. **The warehouse tree that rolls up.** We already have the parent link; what
   we do not have is a view that sums a subtree. That is the difference between
   "Bay 3 has 12" and "Cold store has 400 across nine bays", and the second is
   what somebody standing in the doorway wants.

3. **Reservation.** Every business that promises stock to a customer before
   shipping it needs this, and without it two people sell the same case.

**Two are traps.**

- **The repost subsystem** exists because ERPNext allows back-dated entry. If we
  refuse back-dating outright — as we already effectively do — we never need any
  of it. That refusal is worth writing down as a decision rather than leaving as
  an absence, because the day somebody asks for "just let me fix yesterday's
  count" is the day the whole subsystem starts being built by accident.

- **Thirteen stock-entry purposes on one document.** That is what happens when a
  form grows a `purpose` field instead of the product growing verbs.
  OneInventory's five verbs (`receive`, `take`, `move`, `adjust`, `recount`) say
  the same things and each has its own refusals. Do not merge them.

**And one is a warning about ourselves.** ERPNext ships **six reports whose only
job is to find ledgers that have gone wrong** — invariant checks, variance
reports, incorrect-balance reports. That is not a criticism of ERPNext; it is
what a decade of production teaches a stock ledger. It is worth knowing now that
a chokepoint and an append-only ledger are the *start* of getting this right,
not the finish.
