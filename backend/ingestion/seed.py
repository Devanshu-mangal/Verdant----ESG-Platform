"""
Run with: python manage.py shell < ingestion/seed.py
Creates a test tenant + 3 data sources.
"""
from ingestion.models import Tenant, DataSource

tenant, created = Tenant.objects.get_or_create(
    slug='acme-corp',
    defaults={'name': 'Acme Corporation'}
)
print(f"{'Created' if created else 'Found'} tenant: {tenant.name}")

sources = [
    {
        'name': 'SAP Fuel & Procurement Export',
        'source_type': 'SAP_FUEL',
        'ingestion_method': 'CSV_UPLOAD',
    },
    {
        'name': 'Utility Portal Electricity',
        'source_type': 'UTILITY_ELEC',
        'ingestion_method': 'CSV_UPLOAD',
    },
    {
        'name': 'Concur Travel Export',
        'source_type': 'TRAVEL_CONCUR',
        'ingestion_method': 'CSV_UPLOAD',
    },
]

for s in sources:
    obj, created = DataSource.objects.get_or_create(
        tenant=tenant,
        source_type=s['source_type'],
        defaults={
            'name': s['name'],
            'ingestion_method': s['ingestion_method'],
        }
    )
    print(f"{'Created' if created else 'Found'} source: {obj.name} (id: {obj.id})")
