# Source research

For each source: what real-world format was researched, what the sample data reflects, and what would break.

---

## Source 1: SAP fuel and procurement

### Format researched
SAP MM module flat-file exports, specifically MB51 (material document list) and ME2M (purchase orders by material). These are the two most common exports a sustainability team receives from their ERP team.

Key findings from research:
- SAP uses its own unit codes: `L` (liters), `KG` (kilograms), `TO` (metric tonnes — not "T"), `M3` (cubic meters), `GJ` (gigajoules)
- Column names are in German in the default SAP system locale: WERKS (plant), MATNR (material number), MENGE (quantity), MEINS (unit of measure), BUDAT (posting date), LIFNR (vendor number)
- Dates in BUDAT field use YYYYMMDD format in system exports but DD.MM.YYYY in user-facing report exports — both are handled
- Quantities use comma as decimal separator in German locale exports
- Credit memos and returns appear as negative quantities — these are legitimate SAP records, not data errors

### What the sample data reflects
- 20 rows across 4 plant codes (IN01, IN02, IN03, IN04) and 5 material types
- German column names throughout
- One row with negative quantity (row 15: -200L, a returns/credit memo) — flagged as NEGATIVE_VALUE
- One statistical outlier (row 14: 47800L Diesel Industrial at plant IN03, roughly 4x typical monthly volume) — flagged by z-score detector
- Mix of fuel types: Diesel, Petrol, Natural Gas, Heavy Fuel Oil, LPG
- Realistic INR amounts in DMBTR field

### What would break in production
- Material number to fuel type mapping is hardcoded. A real SAP client will have hundreds of material numbers, many not fuel-related. A client-supplied mapping table is required at onboarding.
- Plant codes have no geographic meaning in this prototype. In production, plant codes must map to physical locations for Scope 1 boundary determination.
- Some SAP configurations add custom Z-fields (ZMATNR, ZWERKS) for client-specific data. These would be silently ignored by the current parser.

---

## Source 2: Utility electricity

### Format researched
Utility portal CSV exports from Indian utilities: BESCOM (Bangalore), Tata Power (Mumbai), MSEDCL (Maharashtra). Also reviewed international equivalents.

Key findings:
- Billing periods do not align with calendar months. BESCOM bills typically run from the 4th of one month to the 3rd of the next.
- Some utilities flag estimated readings (meter not read, consumption estimated from previous average) in a status column as "E" or "Estimated".
- The `demand_kw` (peak demand) field appears in HT (High Tension) connection exports but not LT (Low Tension) exports.
- Column names vary between utilities — BESCOM uses "Consumption (kWh)" while Tata Power uses "energy_kwh". The parser handles common aliases.

### What the sample data reflects
- 3 meters across 3 sites: Bangalore HQ, Bangalore Warehouse, Mumbai Office
- Non-calendar billing periods starting on the 4th and 8th of the month
- One estimated reading (MTR-BLR-001, June 2024) — confidence 0.85
- One statistical outlier (MTR-BLR-001, May 2024: 196400 kWh vs typical 50000 kWh) — flagged by z-score detector at 3.4 standard deviations
- Mix of HT-1, HT-2, and LT-2 tariff codes reflecting realistic connection types
- Indian grid emission factor: 0.716 kg CO₂e/kWh (CEA 2023)

### What would break in production
- kVAh units (used by some Indian utilities) cannot be converted to kWh without power factor data.
- Multi-register meters (peak/off-peak separately billed) would require aggregation logic before normalization.
- If a meter spans multiple facilities, consumption cannot be attributed to a single Scope 2 boundary without sub-metering data.

---

## Source 3: Corporate travel

### Format researched
Concur Expense Report export format and Concur Travel API v4. Also reviewed Navan (formerly TripActions) and TravelPerk CSV export formats.

Key findings:
- Concur exports mix travel types (flight, hotel, car rental, train) in a single report, distinguished by expense type code
- Flight records frequently contain only origin/destination IATA codes — actual routing via intermediate airports is not always captured
- Hotel records contain nights but not always check-in/check-out dates
- Ground transport records often have currency amounts but not distances
- GHG Protocol guidance recommends great-circle distance as the proxy for flight distance when actual routing is unavailable, which is what this system implements

Emission factors used:
- Flights: DEFRA 2023 per passenger-km by cabin class (economy 0.255, business 0.573, first 0.858)
- Hotels: DEFRA 2023 average 31.0 kg CO₂e per room-night
- Ground transport: DEFRA 2023 per km by mode (taxi 0.149, train 0.041, bus 0.089)

### What the sample data reflects
- 20 rows: flights (domestic India, short-haul international, long-haul international), hotels, ground transport
- All flights use IATA codes only — distances calculated via Haversine formula, confidence 0.70
- Mix of economy and business cabin classes — business class rows show higher EF correctly
- One taxi with no distance (EMP-1055, Feb 2024) — skipped with reason logged in audit trail
- One train with distance provided (45km) — ground EF applied at full confidence
- Hotel stays at named properties with realistic city attributions

### What would break in production
- The IATA coordinate table covers 16 major hubs. Any flight involving a tier-2 airport (Coimbatore, Nagpur, Bhopal) would produce null distance and be skipped.
- Layered flights booked as a single ticket may appear as one row or two depending on the travel agent, leading to double-counting or undercounting.
- Taxi distances are rarely logged in expense systems — employees enter fare, not distance. A spend-to-distance conversion would require city-level average taxi rates.
