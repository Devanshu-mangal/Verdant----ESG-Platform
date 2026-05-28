"""
Maps parsed records from any source into NormalizedActivity fields.
This is where raw source data becomes canonical ESG ledger entries.
"""

# Unit conversion to canonical units
UNIT_CONVERSIONS = {
    'liters':     ('liters',  1.0),
    'gallons_us': ('liters',  3.78541),
    'gallons_uk': ('liters',  4.54609),
    'kg':         ('kg',      1.0),
    'tonnes':     ('kg',   1000.0),
    'lbs':        ('kg',      0.453592),
    'm3':         ('m3',      1.0),
    'kwh':        ('kwh',     1.0),
    'mwh':        ('kwh',  1000.0),
    'gj':         ('kwh',   277.778),
}

# Emission factors kg CO2e per canonical unit
# Source: BEIS/DEFRA 2023 GHG Conversion Factors
EMISSION_FACTORS = {
    ('Diesel',          'liters'): (2.68785, 'DEFRA_2023'),
    ('Petrol',          'liters'): (2.31361, 'DEFRA_2023'),
    ('Natural Gas',     'm3'):     (2.02228, 'DEFRA_2023'),
    ('Heavy Fuel Oil',  'liters'): (3.17940, 'DEFRA_2023'),
    ('LPG',             'liters'): (1.55540, 'DEFRA_2023'),
    ('Electricity_UK',  'kwh'):    (0.20707, 'DEFRA_2023'),
    ('Electricity_IN',  'kwh'):    (0.71600, 'CEA_2023'),   # India grid
    ('Electricity_US',  'kwh'):    (0.38600, 'EPA_2023'),
}


def normalize_sap_record(parsed):
    """Turn a parsed SAP row into NormalizedActivity field values."""
    result = {}
    p = parsed['parsed']

    fuel_type = p.get('fuel_type')
    if not fuel_type:
        result['skip'] = True
        result['skip_reason'] = f"Material {p.get('material_number')} not mapped to a fuel type"
        return result

    original_unit = p.get('unit_canonical') or p.get('unit_original', '').lower()
    quantity      = p.get('quantity')

    if quantity is None:
        result['skip'] = True
        result['skip_reason'] = 'Could not parse quantity'
        return result

    canonical_value, canonical_unit, confidence, notes = _convert_unit(quantity, original_unit)

    result.update({
        'scope':          'SCOPE_1',
        'category':       'Stationary Combustion',
        'activity_type':  fuel_type,
        'original_value': quantity,
        'original_unit':  p.get('unit_original', original_unit),
        'activity_value': canonical_value,
        'activity_unit':  canonical_unit,
        'confidence_score': confidence,
        'confidence_notes': notes,
        'period_start':   p.get('posting_date'),
        'period_end':     p.get('posting_date'),
    })

    ef_key = (fuel_type, canonical_unit)
    if ef_key in EMISSION_FACTORS:
        ef, source = EMISSION_FACTORS[ef_key]
        result['co2e_kg']               = round(canonical_value * ef, 3)
        result['emission_factor']       = ef
        result['emission_factor_source']= source
    else:
        result['confidence_score'] = min(result['confidence_score'], 0.6)
        result['confidence_notes'] += f' | No emission factor for ({fuel_type}, {canonical_unit})'

    return result


def normalize_utility_record(parsed, grid_region='Electricity_IN'):
    """Turn a parsed utility row into NormalizedActivity field values."""
    result = {}
    p = parsed['parsed']

    kwh = p.get('consumption_kwh')
    if kwh is None:
        result['skip'] = True
        result['skip_reason'] = 'Could not parse consumption_kwh'
        return result

    confidence = 0.85 if p.get('is_estimated') else 1.0
    notes      = 'Estimated meter reading — lower confidence' if p.get('is_estimated') else ''

    result.update({
        'scope':          'SCOPE_2',
        'category':       'Purchased Electricity',
        'activity_type':  'Grid Electricity',
        'original_value': kwh,
        'original_unit':  'kwh',
        'activity_value': kwh,
        'activity_unit':  'kwh',
        'confidence_score': confidence,
        'confidence_notes': notes,
        'period_start':   p.get('period_start'),
        'period_end':     p.get('period_end'),
    })

    ef_key = (grid_region, 'kwh')
    if ef_key in EMISSION_FACTORS:
        ef, source = EMISSION_FACTORS[ef_key]
        result['co2e_kg']                = round(kwh * ef, 3)
        result['emission_factor']        = ef
        result['emission_factor_source'] = source

    return result


def normalize_travel_record(parsed):
    """Turn a parsed travel row into NormalizedActivity field values."""
    result = {}
    p = parsed['parsed']
    travel_type = p.get('travel_type', '')

    if travel_type == 'flight':
        dist = p.get('distance_km')
        if not dist:
            result['skip'] = True
            result['skip_reason'] = 'No distance and airport codes not recognized'
            return result

        confidence = 1.0 - p.get('confidence_penalty', 0.0)
        if p.get('distance_source') == 'great_circle_calculated':
            confidence = min(confidence, 0.70)
            notes = f"Distance estimated via great-circle: {p['origin_iata']}→{p['destination_iata']}"
        else:
            notes = 'Distance provided directly'

        result.update({
            'scope':          'SCOPE_3',
            'category':       'Business Travel',
            'activity_type':  f"Flight ({p.get('cabin_class', 'economy')})",
            'original_value': dist,
            'original_unit':  'km',
            'activity_value': dist,
            'activity_unit':  'km',
            'co2e_kg':        p.get('co2e_kg'),
            'emission_factor': p.get('emission_factor'),
            'emission_factor_source': 'DEFRA_2023',
            'confidence_score': confidence,
            'confidence_notes': notes,
            'period_start':   p.get('travel_date'),
            'period_end':     p.get('travel_date'),
        })

    elif travel_type == 'hotel':
        nights = p.get('nights')
        if not nights:
            result['skip'] = True
            result['skip_reason'] = 'Missing hotel nights'
            return result
        result.update({
            'scope':          'SCOPE_3',
            'category':       'Business Travel',
            'activity_type':  'Hotel Stay',
            'original_value': nights,
            'original_unit':  'nights',
            'activity_value': nights,
            'activity_unit':  'nights',
            'co2e_kg':        p.get('co2e_kg'),
            'emission_factor': p.get('emission_factor'),
            'emission_factor_source': 'DEFRA_2023',
            'confidence_score': 0.75,
            'confidence_notes': 'Hotel EF is industry average — no property-level data',
            'period_start':   p.get('travel_date'),
            'period_end':     p.get('travel_date'),
        })
    else:
        dist = p.get('distance_km')
        if not dist:
            result['skip'] = True
            result['skip_reason'] = 'Missing distance for ground transport'
            return result
        result.update({
            'scope':          'SCOPE_3',
            'category':       'Business Travel',
            'activity_type':  f"Ground Transport ({travel_type})",
            'original_value': dist,
            'original_unit':  'km',
            'activity_value': dist,
            'activity_unit':  'km',
            'co2e_kg':        p.get('co2e_kg'),
            'emission_factor': p.get('emission_factor'),
            'emission_factor_source': 'DEFRA_2023',
            'confidence_score': 0.80,
            'confidence_notes': '',
            'period_start':   p.get('travel_date'),
            'period_end':     p.get('travel_date'),
        })

    return result


def _convert_unit(value, unit):
    """Convert value to canonical unit. Returns (value, unit, confidence, notes)."""
    unit = (unit or '').lower().strip()
    if unit in UNIT_CONVERSIONS:
        canonical_unit, factor = UNIT_CONVERSIONS[unit]
        converted = round(value * factor, 4)
        if factor == 1.0:
            return converted, canonical_unit, 1.0, ''
        else:
            return converted, canonical_unit, 0.85, f'Converted {unit} → {canonical_unit} (factor {factor})'
    else:
        return value, unit, 0.60, f'Unknown unit {unit!r} — no conversion applied'
