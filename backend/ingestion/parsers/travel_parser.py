import math
import pandas as pd

AIRPORT_COORDS = {
    'BOM': (19.0896, 72.8656),  'DEL': (28.5562, 77.1000),
    'BLR': (13.1986, 77.7066),  'MAA': (12.9900, 80.1693),
    'HYD': (17.2403, 78.4294),  'CCU': (22.6520, 88.4463),
    'LHR': (51.4775, -0.4614),  'CDG': (49.0097,  2.5478),
    'JFK': (40.6413,-73.7781),  'SFO': (37.6213,-122.379),
    'SIN': ( 1.3644,103.9915),  'DXB': (25.2532, 55.3657),
    'NRT': (35.7720,140.3929),  'FRA': (50.0379,  8.5622),
    'AMS': (52.3086,  4.7639),  'ORD': (41.9742,-87.9073),
}

FLIGHT_EF = {
    'economy':         0.255,
    'premium_economy': 0.360,
    'business':        0.573,
    'first':           0.858,
}

HOTEL_EF_PER_NIGHT = 31.0

GROUND_EF = {
    'taxi':   0.149,
    'rental': 0.192,
    'train':  0.041,
    'bus':    0.089,
}


def parse_travel_csv(file_obj):
    try:
        df = pd.read_csv(file_obj, dtype=str, sep=None, engine='python')
    except Exception as e:
        raise ValueError(f"Could not read CSV: {e}")

    df.columns = df.columns.str.strip()

    records = []
    for idx, row in df.iterrows():
        records.append({
            'row_index': idx,
            'raw': row.to_dict(),
            'parsed': _parse_travel_row(row),
        })
    return records


def _clean(val):
    """Return stripped string or None if empty/nan."""
    if val is None:
        return None
    s = str(val).strip()
    if s.lower() in ('', 'nan', 'none'):
        return None
    return s


def _parse_travel_row(row):
    parsed = {}
    travel_type = (_clean(row.get('travel_type')) or '').lower()
    parsed['travel_type']    = travel_type
    parsed['traveler_id']    = _clean(row.get('traveler_id')) or ''
    parsed['travel_date']    = _clean(row.get('travel_date')) or ''
    parsed['expense_report'] = _clean(row.get('expense_report_id')) or ''

    if travel_type == 'flight':
        parsed.update(_parse_flight(row))
    elif travel_type == 'hotel':
        parsed.update(_parse_hotel(row))
    elif travel_type in ('taxi', 'rental', 'train', 'bus'):
        parsed.update(_parse_ground(row, travel_type))

    return parsed


def _parse_flight(row):
    result = {}
    origin = (_clean(row.get('origin_iata')) or '').upper()
    dest   = (_clean(row.get('destination_iata')) or '').upper()
    cabin  = (_clean(row.get('cabin_class')) or 'economy').lower()

    result['origin_iata']      = origin
    result['destination_iata'] = dest
    result['cabin_class']      = cabin

    # Try provided distance first
    raw_dist = _clean(row.get('distance_km'))
    provided_distance = None
    if raw_dist:
        try:
            provided_distance = float(raw_dist)
        except ValueError:
            pass

    if provided_distance and provided_distance > 0:
        result['distance_km']       = provided_distance
        result['distance_source']   = 'provided'
        result['confidence_penalty']= 0.0
    else:
        # Calculate great-circle
        dist, note = _great_circle_km(origin, dest)
        result['distance_km']       = dist      # may be None if airport unknown
        result['distance_source']   = note
        result['confidence_penalty']= 0.0 if dist else 0.3

    ef = FLIGHT_EF.get(cabin, FLIGHT_EF['economy'])
    result['emission_factor']      = ef
    result['emission_factor_unit'] = 'kg_co2e_per_pax_km'

    dist = result.get('distance_km')
    if dist and dist > 0:
        result['co2e_kg'] = round(dist * ef, 2)
    else:
        result['co2e_kg'] = None

    return result


def _parse_hotel(row):
    result = {}
    raw_nights = _clean(row.get('nights'))
    try:
        result['nights'] = float(raw_nights) if raw_nights else None
    except ValueError:
        result['nights'] = None

    result['hotel_name'] = _clean(row.get('hotel_name')) or ''
    result['city']       = _clean(row.get('city')) or ''

    if result.get('nights'):
        result['co2e_kg'] = round(result['nights'] * HOTEL_EF_PER_NIGHT, 2)
    else:
        result['co2e_kg'] = None

    result['emission_factor']      = HOTEL_EF_PER_NIGHT
    result['emission_factor_unit'] = 'kg_co2e_per_room_night'
    return result


def _parse_ground(row, transport_type):
    result = {}
    raw_dist = _clean(row.get('distance_km'))
    try:
        result['distance_km'] = float(raw_dist) if raw_dist else None
    except ValueError:
        result['distance_km'] = None

    ef = GROUND_EF.get(transport_type, 0.149)
    result['emission_factor']      = ef
    result['emission_factor_unit'] = 'kg_co2e_per_km'

    dist = result.get('distance_km')
    if dist and dist > 0:
        result['co2e_kg'] = round(dist * ef, 2)
    else:
        result['co2e_kg'] = None

    return result


def _great_circle_km(iata1, iata2):
    if iata1 not in AIRPORT_COORDS or iata2 not in AIRPORT_COORDS:
        missing = [c for c in [iata1, iata2] if c not in AIRPORT_COORDS]
        return None, f"unknown_airport:{','.join(missing)}"

    lat1, lon1 = map(math.radians, AIRPORT_COORDS[iata1])
    lat2, lon2 = map(math.radians, AIRPORT_COORDS[iata2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return round(6371 * c, 1), 'great_circle_calculated'
