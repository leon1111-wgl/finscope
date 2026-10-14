"""Official daily Treasury curve, preserving published percentage-point units."""
from datetime import date
import math
import xml.etree.ElementTree as ET

TENORS = {'3m': 'BC_3MONTH', '2y': 'BC_2YEAR', '5y': 'BC_5YEAR', '10y': 'BC_10YEAR', '30y': 'BC_30YEAR'}


def parse_treasury(raw):
    root = ET.fromstring(raw)
    result = {}
    for element in root.iter():
        if element.tag.split('}')[-1] != 'properties':
            continue
        fields = {child.tag.split('}')[-1]: child.text for child in element}
        if not fields.get('NEW_DATE'):
            continue
        day = fields['NEW_DATE'][:10]
        date.fromisoformat(day)
        row = {'date': day}
        for key, field in TENORS.items():
            raw_value = fields.get(field)
            value = float(raw_value) if raw_value and raw_value.strip() else None
            if value is not None and (not math.isfinite(value) or not -10 <= value <= 100):
                raise ValueError(f'Invalid Treasury yield on {day}')
            row[key] = value
        result[day] = row
    if not result:
        raise ValueError('No Treasury observations')
    return [result[k] for k in sorted(result)]
