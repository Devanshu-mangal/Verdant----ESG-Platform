# Decision log

Every meaningful ambiguity in the assignment, what I chose, and why.

---

## Source 1: SAP — flat-file CSV export

**Ambiguity**: SAP exposes data via IDoc, flat-file, OData (via SAP Gateway), and BAPI. Which to support?

**Decision**: SAP flat-file CSV export (ME2M / MB51 report format).

**Reasoning**:
Most enterprise clients export SAP data manually for sustainability reporting. Full OData or BAPI integration requires SAP BASIS configuration, RFC credentials, and client-specific customisation — realistic for a production integration, but out of scope for an ingestion prototype. The flat-file export is what a sustainability lead actually sends today.

The parser handles German column names (WERKS, MATNR, MENGE, MEINS, BUDAT, LIFNR), comma-as-decimal-separator in German locale exports, SAP-specific unit codes (L, KG, TO, M3, GJ), and YYYYMMDD and DD.MM.YYYY date formats.

**What I would ask the PM**: Which SAP module is the client using — MM (Materials Management) or FI (Financial)? The column set differs. Are plant codes mapped to facilities somewhere, or does the client maintain a lookup table?

**What would break in production**: Material number to fuel type mapping is hardcoded. A real client would have hundreds of material codes — we'd need a client-supplied mapping table at onboarding.

---

## Source 2: Utility electricity — portal CSV export

**Ambiguity**: Utility data comes as PDFs, portal CSV exports, or direct APIs depending on the utility.

**Decision**: Portal CSV export.

**Reasoning**:
PDF extraction was explicitly avoided. OCR on utility bills introduces error rates that are difficult to validate programmatically, and the verification burden on analysts would be high. Most utility portals (BESCOM, Tata Power, MSEDCL) now offer CSV downloads. This is the mode facilities teams actually use today.

The parser handles column name aliases across different utility export formats, non-calendar billing periods (bills that start on the 4th and end on the 3rd), and estimated readings (`is_estimated=true`) which receive a confidence penalty of 0.15.

**What I would ask the PM**: Which utility providers does this client use? Do their portals export in a consistent format, or will we need per-utility parsers? Is demand (kW) data required for Scope 2 market-based calculations?

**What would break in production**: Some utilities export kVAh (kilovolt-ampere-hours) rather than kWh. We don't convert kVAh → kWh because the conversion requires power factor data the CSV doesn't contain. Those rows would get flagged with UNIT_UNKNOWN.

---

## Source 3: Corporate travel — Concur-style CSV export

**Ambiguity**: Travel platforms expose REST APIs (Concur SAP, Navan, TravelPerk all have documented APIs). Should I pull via API or accept CSV exports?

**Decision**: CSV export in Concur report format, with a mock that mirrors what the Concur Expense Report API returns.

**Reasoning**:
Concur's API requires OAuth2 with company-level app registration — not possible to demonstrate in a prototype without client credentials. However, the CSV export from Concur's "Expense Report" module has a well-documented structure. The sample data reflects real Concur field names (expense_report_id, traveler_id, origin_iata, destination_iata, cabin_class).

For flights without distance data, great-circle distance is calculated from IATA airport codes using the Haversine formula. This is exactly what GHG protocol guidance suggests when actual routing is unavailable. Confidence is set to 0.70 for calculated distances vs 1.00 for provided distances.

**What I would ask the PM**: Does the client use Concur, Navan, or another platform? Is ground transport tracked, or only flights and hotels? Are personal trips sometimes accidentally included in corporate card data?

**What would break in production**: The IATA airport coordinate table covers major hubs only. Tier-2 airports (e.g. Coimbatore, Mangalore) would trigger UNIT_UNKNOWN-equivalent flags. Production would use a full airport database (ourairports.com publishes one).

---

## Async processing via Celery

**Decision**: Use Celery with Redis broker for ingestion tasks.

**Reasoning**: File parsing, normalization, anomaly detection, and audit log creation should not block the HTTP request. A 10,000-row SAP export should return 202 Accepted immediately, not make the analyst wait 30 seconds.

**Tradeoff acknowledged**: Celery adds operational complexity — Redis must be running, worker processes must be managed. Documented in TRADEOFFS.md.

---

## Confidence scoring

**Decision**: Compute confidence as a float, not a categorical label.

**Reasoning**: A float allows downstream aggregation (average
