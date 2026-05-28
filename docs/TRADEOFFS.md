# Tradeoffs

Three things deliberately not built, and why.

---

## 1. PDF ingestion for utility bills

**What was skipped**: OCR-based extraction from utility bill PDFs.

**Why**: PDF extraction introduces an error surface that is difficult to validate programmatically. OCR accuracy on tabular utility bill data is typically 92–97% — meaning 3–8% of values would require manual correction. For an audit-ready system, that error rate is unacceptable without a costly human review step on every extracted value.

More importantly, the verification problem compounds: if an extracted value is wrong, there is no reliable automated way to detect it unless the same value appears elsewhere in the bill for cross-checking. The portal CSV export solves this cleanly — the utility has already done the extraction.

**What this means in production**: If a client's utility does not offer portal CSV export, PDF ingestion becomes necessary. At that point I would build a two-pass system: OCR extraction followed by a mandatory analyst confirmation step before any PDF-derived value enters the ledger. The confidence score for PDF-extracted values would be capped at 0.70 regardless of extraction quality.

---

## 2. Emission factor versioning

**What was skipped**: A versioned emission factor table in the database.

**Why**: Emission factors change annually — DEFRA/BEIS publish updated GHG conversion factors every year, and country-specific grid factors (CEA for India, EPA for the US) are revised periodically. In this prototype, EFs are hardcoded constants in the normalizer module.

The correct production design would store EFs in a database table with `(fuel_type, unit, region, valid_from, valid_to, source_document)` fields, and each `NormalizedActivity` would FK to the specific EF record used. This makes recalculation auditable — if the 2024 DEFRA factors are revised, affected records can be identified and recomputed with a full audit trail.

Hardcoding was chosen here to keep the normalizer readable and the prototype scope bounded. The structure is designed to make this upgrade straightforward: the normalizer already receives fuel type and unit as parameters, so swapping the constant lookup for a database query is a single-function change.

---

## 3. Reporting period lock and finalisation workflow

**What was skipped**: A formal reporting period model with batch-level lock and finalisation.

**Why**: The current system supports per-activity LOCKED status, but not a concept of "Q1 2024 is now closed — no further modifications permitted across all activities in that period." A production ESG platform would have a `ReportingPeriod` model that, once locked by a senior reviewer, prevents any activity within that period from being modified regardless of individual activity status.

This was skipped because it requires a more complex UI flow (period selection, bulk lock confirmation, lock audit trail) and a non-trivial DB constraint — period boundaries don't always align with calendar months, as the utility billing period data demonstrates. Getting this right would require a dedicated design discussion with the PM about what a reporting period actually means for this client.

**The consequence of skipping this**: An analyst could technically approve and then re-open records after they have been sent to auditors. In production, the LOCKED status at the activity level provides partial protection, but a period-level lock is the correct boundary.
