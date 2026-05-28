# Data Model

## Design philosophy

The core insight driving this model is that ESG ingestion is not a storage problem — it is a **provenance problem**. Auditors don't just need the numbers; they need to know where each number came from, what transformations were applied, who reviewed it, and whether it can be reproduced. Every model decision flows from this.

---

## Entity overview
Tenant
├── DataSource          (where data comes from)
├── UploadBatch         (one ingestion run)
│    └── RawRecord      (untouched source rows)
│         └── NormalizedActivity   (canonical ESG ledger entry)
│              ├── ValidationIssue (anomaly flags)
│              └── ApprovalAction  (analyst decisions)
└── AuditLog            (immutable event history)

---

## Tenant

Multi-company support. Every object in the system is scoped to a tenant via foreign key. This was a deliberate first-class decision rather than an afterthought — adding multi-tenancy after the fact requires touching every query.

Fields: `id` (UUID), `name`, `slug`, `created_at`

**Why UUID primary keys throughout?** UUIDs are safe to expose in URLs and API responses without leaking row counts or sequence information. They also allow client-side ID generation before the server round-trip completes.

---

## DataSource

Represents a recurring data origin: a specific SAP system, a utility portal, a Concur account. Tracks `source_type`, `ingestion_method`, and `parser_version`.

`parser_version` is important for auditability: if the normalization logic changes between ingestion runs, we know which version processed which records.

---

## UploadBatch

One batch = one discrete ingestion event (one CSV upload, one API pull). Tracks processing status through: `PENDING → PROCESSING → DONE / FAILED`.

Stores a processing `summary` as JSON — row counts, anomaly counts, completion timestamp. The raw file content is temporarily stored here during async processing, then cleared after the Celery task completes. Raw content is never stored permanently in the batch — it lives in `RawRecord`.

---

## RawRecord

**The most important design decision in the system.**

Every source row is stored exactly as received, before any transformation. This record is never mutated after creation. There is no update path for `RawRecord` in the codebase.

Why this matters:
- Auditors can verify that the normalized value traces back to a real source row
- If a parser bug is discovered, affected records can be reprocessed from raw
- Disputes about source data can be resolved by inspecting what was actually received

`raw_data` is a JSONField containing the full source row as a dict. For SAP exports this includes original German column names. For utility CSVs it includes the original headers before alias normalization.

---

## NormalizedActivity

The canonical ESG ledger entry. This is what analysts review and auditors sign off on.

### Scope classification
- `SCOPE_1`: Direct emissions from owned sources (fuel combustion)
- `SCOPE_2`: Indirect emissions from purchased electricity
- `SCOPE_3`: Value chain emissions (business travel, procurement)

### Unit normalization
Both original and canonical values are stored:
- `original_value` / `original_unit`: what the source said (e.g. 12500 L)
- `activity_value` / `activity_unit`: canonical form (e.g. 12500 liters)

This diff is visible in the analyst UI, making normalization transparent.

### Confidence scoring
A float between 0 and 1 reflecting how reliable the normalization was:

| Score | Meaning |
|-------|---------|
| 1.00 | Exact unit match, no conversion |
| 0.85 | Known unit conversion applied (e.g. gallons → liters) |
| 0.80 | Ground transport with provided distance |
| 0.75 | Hotel stay — industry average EF, no property-level data |
| 0.70 | Flight distance estimated via great-circle from IATA codes |
| 0.60 | Unknown unit — no conversion applied |

### Review workflow
Status transitions:INGESTED → NORMALIZED → FLAGGED → REVIEW_REQUIRED → APPROVED → LOCKED

Once LOCKED, no further modifications are permitted. Locking is the audit boundary.

---

## ValidationIssue

Flags attached to a NormalizedActivity. One activity can have multiple issues. Severity: `INFO / WARNING / ERROR`.

Issue types implemented:
- `NEGATIVE_VALUE`: quantity below zero (SAP credit memos)
- `ANOMALY_ZSCORE`: value more than 3 standard deviations from category mean
- `DUPLICATE`: same scope, type, period, and value as another row
- `MISSING_FIELD`: required field absent
- `UNIT_UNKNOWN`: unit not in conversion table
- `INFERRED_DISTANCE`: flight distance calculated, not provided

---

## ApprovalAction

Records each analyst decision. Append-only — rejecting a previously approved record creates a new `ApprovalAction` rather than deleting the old one. The full decision history is preserved.

---

## AuditLog

Immutable append-only event log. No update or delete path exists in the codebase.

Every meaningful state change produces an audit log entry with: `actor`, `event` (dot-notation e.g. `row.normalized`), `description` (human-readable sentence), and `metadata` (structured JSON for machine consumption).

Example events in order for a typical row:
batch.parsed       → "Parsed 20 rows from SAP Fuel & Procurement Export"
row.normalized     → "Row 3 normalized: SCOPE_1 / Stationary Combustion / 12500.0 liters"
row.flagged        → "Validation issue (WARNING): Value 47800.0 is 3.8 std deviations from mean"
row.approved       → "Approved by analyst@breatheesg.com"
batch.completed    → "Batch complete: 20 normalized, 0 skipped, 3 anomalies"

---

## Multi-tenancy

Every model that holds ESG data (DataSource, UploadBatch, NormalizedActivity, AuditLog) has a FK to Tenant. All API queries filter by tenant. A future auth layer would enforce this at the request level — for this prototype, tenant filtering is applied at the query level in views.

---

## What this model does not handle

- **User authentication**: analyst identity is stored as a plain string. A production system would FK to a User model with role-based permissions (analyst vs reviewer vs auditor).
- **Emission factor versioning**: EFs are hardcoded in the normalizer. A production system would store them in a versioned table so recalculations are traceable.
- **Batch-level locking**: locking is currently per-activity. A production system would also support locking an entire reporting period at the batch level.
