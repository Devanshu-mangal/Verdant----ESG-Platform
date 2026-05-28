import pandas as pd
from datetime import datetime

# SAP ME2M / MB51 flat-file export column mapping.
# Real SAP exports use German field names. We map them to internal names.
# WERKS = plant code, MATNR = material number, MENGE = quantity,
# MEINS = unit of measure, BUDAT = posting date, LIFNR = vendor number
SAP_COLUMN_MAP = {
    'WERKS': 'plant_code',
    'MATNR': 'material_number',
    'MENGE': 'quantity',
    'MEINS': 'unit',
    'BUDAT': 'posting_date',
    'LIFNR': 'vendor_id',
    'TXZ01': 'material_description',
    'DMBTR': 'amount_local_currency',
    'WAERS': 'currency',
}

# Material numbers that indicate fuel purchases.
# In real SAP these are configured per client — we use realistic examples.
FUEL_MATERIAL_CODES = {
    'DIES-001': 'Diesel',
    'DIES-002': 'Diesel',
    'PETR-001': 'Petrol',
    'PETR-002': 'Petrol',
    'HFO-001':  'Heavy Fuel Oil',
    'LPG-001':  'LPG',
    'NGAS-001': 'Natural Gas',
}

# SAP unit codes → canonical unit
# SAP uses its own unit codes, not SI units
SAP_UNIT_MAP = {
    'L':   'liters',
    'LTR': 'liters',
    'KG':  'kg',
    'TO':  'tonnes',    # SAP "TO" = metric tonne
    'M3':  'm3',
    'GAL': 'gallons_us',
    'KWH': 'kwh',
    'GJ':  'gj',
}


def parse_sap_csv(file_obj):
    """
    Parse a SAP flat-file CSV export.
    Returns a list of dicts, one per row, with raw and mapped fields.
    Raises ValueError if the file doesn't look like a SAP export.
    """
    try:
        df = pd.read_csv(file_obj, dtype=str, sep=None, engine='python')
    except Exception as e:
        raise ValueError(f"Could not read CSV: {e}")

    df.columns = df.columns.str.strip()

    # Detect if this looks like a SAP file — must have at least MENGE and MEINS
    has_german = any(col in df.columns for col in ['MENGE', 'WERKS', 'MATNR'])
    if not has_german:
        raise ValueError("File does not appear to be a SAP export (missing MENGE/WERKS/MATNR columns)")

    # Rename columns we know about, leave the rest as-is
    df = df.rename(columns={k: v for k, v in SAP_COLUMN_MAP.items() if k in df.columns})

    records = []
    for idx, row in df.iterrows():
        record = {
            'row_index': idx,
            'raw': row.to_dict(),
            'parsed': _parse_sap_row(row),
        }
        records.append(record)

    return records


def _parse_sap_row(row):
    """Extract and clean fields from a single SAP row."""
    parsed = {}

    # Quantity — SAP uses comma as decimal separator in German locale exports
    raw_qty = str(row.get('quantity', '') or '').strip()
    raw_qty = raw_qty.replace(',', '.')
    try:
        parsed['quantity'] = float(raw_qty)
    except ValueError:
        parsed['quantity'] = None
        parsed['quantity_error'] = f"Could not parse quantity: {raw_qty!r}"

    # Unit
    raw_unit = str(row.get('unit', '') or '').strip().upper()
    parsed['unit_original'] = raw_unit
    parsed['unit_canonical'] = SAP_UNIT_MAP.get(raw_unit)

    # Date — SAP BUDAT format is YYYYMMDD or DD.MM.YYYY
    raw_date = str(row.get('posting_date', '') or '').strip()
    parsed['posting_date'] = _parse_sap_date(raw_date)
    parsed['posting_date_raw'] = raw_date

    # Material / fuel type
    mat = str(row.get('material_number', '') or '').strip().upper()
    parsed['material_number'] = mat
    parsed['fuel_type'] = FUEL_MATERIAL_CODES.get(mat)

    # Plant code and vendor
    parsed['plant_code'] = str(row.get('plant_code', '') or '').strip()
    parsed['vendor_id']   = str(row.get('vendor_id', '') or '').strip()
    parsed['description'] = str(row.get('material_description', '') or '').strip()

    return parsed


def _parse_sap_date(raw):
    """Try multiple SAP date formats."""
    for fmt in ('%Y%m%d', '%d.%m.%Y', '%Y-%m-%d'):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return None
