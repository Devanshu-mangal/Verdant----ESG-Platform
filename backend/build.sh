#!/usr/bin/env bash
set -e
pip install -r requirements.txt
python manage.py migrate
python manage.py shell -c "
from ingestion.models import Tenant, DataSource
t, _ = Tenant.objects.get_or_create(slug='acme-corp', defaults={'name': 'Acme Corporation'})
sources = [
    ('SAP Fuel & Procurement Export', 'SAP_FUEL', 'CSV_UPLOAD'),
    ('Utility Portal Electricity', 'UTILITY_ELEC', 'CSV_UPLOAD'),
    ('Concur Travel Export', 'TRAVEL_CONCUR', 'CSV_UPLOAD'),
]
for name, stype, method in sources:
    DataSource.objects.get_or_create(tenant=t, source_type=stype, defaults={'name': name, 'ingestion_method': method})
print('Seed complete')
"
