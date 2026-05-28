import pandas as pd
from datetime import datetime

# Utility portal CSV export columns.
# Different utilities name these differently — we handle common variants.
UTILITY_COLUMN_ALIASES = {
    'meter_id':             ['meter_id', 'Meter ID', 'MeterID', 'meter_number'],
    'billing_period_start': ['billing_period_start', 'Period Start', 'StartDate', 'start_date'],
    'billing_period_end':   ['billing_period_end',   'Period End',   'EndDate',   'end_date'],
    'consumption_kwh':      ['consumption_kwh', 'kWh', 'Consumption (kWh)', 'energy_kwh', 'Usage_kWh'],
    'demand_kw':            ['demand_kw', 'Peak Demand (kW)', 'demand', 'peak_kw'],
    'tariff':               ['tariff', 'Tariff Code', 'rate_code'],
    'is_estimated':         ['is_estimated', 'Estimated', 'estimated_read'],
    'site_name':            ['site_name', 'Site', 'Location', 'facility'],
}


def parse_utility_csv(file_obj):
    """
    Parse a utility portal electricity CSV export.
    Handles non-calendar billing periods and estimated readings.
    """
    try:
        df = pd.read_csv(file_obj, dtype=str, sep=None, engine='python')
    except Exception as e:
        raise ValueError(f"Could not read CSV: {e}")

    df.columns = df.columns.str.strip()
    df = _normalize_columns(df)

    if 'consumption_kwh' not in df.columns:
        raise ValueError("Could not find consumption column (tried: kWh, Consumption (kWh), energy_kwh, Usage_kWh)")

    records = []
    for idx, row in df.iterrows():
        records.append({
            'row_index': idx,
            'raw': row.to_dict(),
            'parsed': _parse_utility_row(row),
        })

    return records


def _normalize_columns(df):
    """Rename columns to canonical names using alias map."""
    rename = {}
    for canonical, aliases in UTILITY_COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in df.columns:
                rename[alias] = canonical
                break
    return df.rename(columns=rename)


def _parse_utility_row(row):
    parsed = {}

    # Consumption
    raw_kwh = str(row.get('consumption_kwh', '') or '').strip().replace(',', '')
    try:
        parsed['consumption_kwh'] = float(raw_kwh)
    except ValueError:
        parsed['consumption_kwh'] = None
        parsed['consumption_error'] = f"Could not parse kWh: {raw_kwh!r}"

    # Demand
    raw_kw = str(row.get('demand_kw', '') or '').strip().replace(',', '')
    try:
        parsed['demand_kw'] = float(raw_kw) if raw_kw else None
    except ValueError:
        parsed['demand_kw'] = None

    # Billing period — utility bills don't align with calendar months
    parsed['period_start'] = _parse_date(str(row.get('billing_period_start', '') or ''))
    parsed['period_end']   = _parse_date(str(row.get('billing_period_end', '') or ''))

    # Flag estimated readings — these have lower confidence
    est = str(row.get('is_estimated', '') or '').strip().lower()
    parsed['is_estimated'] = est in ('true', 'yes', '1', 'e', 'estimated')

    parsed['meter_id']  = str(row.get('meter_id', '') or '').strip()
    parsed['site_name'] = str(row.get('site_name', '') or '').strip()
    parsed['tariff']    = str(row.get('tariff', '') or '').strip()

    return parsed


def _parse_date(raw):
    raw = raw.strip()
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%Y%m%d'):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return None
