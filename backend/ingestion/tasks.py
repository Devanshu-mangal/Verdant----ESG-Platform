import io
import math
from celery import shared_task
from django.utils import timezone

from .models import (
    UploadBatch, RawRecord, NormalizedActivity,
    ValidationIssue, AuditLog, Tenant
)
from .parsers.sap_parser import parse_sap_csv
from .parsers.utility_parser import parse_utility_csv
from .parsers.travel_parser import parse_travel_csv
from .parsers.normalizer import (
    normalize_sap_record, normalize_utility_record, normalize_travel_record
)
from .parsers.anomaly import detect_anomalies


def sanitize_for_json(obj):
    """Replace NaN/Inf floats with None so SQLite JSON constraint passes."""
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    return obj


@shared_task(bind=True)
def process_upload_batch(self, batch_id):
    try:
        batch = UploadBatch.objects.select_related('source__tenant').get(id=batch_id)
    except UploadBatch.DoesNotExist:
        return {'error': f'Batch {batch_id} not found'}

    batch.status = UploadBatch.Status.PROCESSING
    batch.save(update_fields=['status'])

    source      = batch.source
    tenant      = source.tenant
    source_type = source.source_type

    raw_content = batch.summary.get('raw_content', '')
    if not raw_content:
        _fail_batch(batch, 'No file content found in batch')
        return

    file_obj = io.StringIO(raw_content)

    try:
        if source_type == 'SAP_FUEL':
            parsed_rows = parse_sap_csv(file_obj)
        elif source_type == 'UTILITY_ELEC':
            parsed_rows = parse_utility_csv(file_obj)
        elif source_type == 'TRAVEL_CONCUR':
            parsed_rows = parse_travel_csv(file_obj)
        else:
            _fail_batch(batch, f'Unknown source type: {source_type}')
            return
    except ValueError as e:
        _fail_batch(batch, str(e))
        return

    batch.total_rows = len(parsed_rows)
    batch.save(update_fields=['total_rows'])

    AuditLog.objects.create(
        tenant=tenant, batch=batch, actor='system',
        event='batch.parsed',
        description=f'Parsed {len(parsed_rows)} rows from {source.name}',
        metadata={'source_type': source_type, 'row_count': len(parsed_rows)},
    )

    raw_records = []
    for row in parsed_rows:
        rr = RawRecord.objects.create(
            batch=batch,
            row_index=row['row_index'],
            raw_data=sanitize_for_json(row['raw']),
        )
        row['_raw_record'] = rr
        raw_records.append(row)

    normalized_list = []
    failed = 0

    for row in raw_records:
        if source_type == 'SAP_FUEL':
            norm = normalize_sap_record(row)
        elif source_type == 'UTILITY_ELEC':
            norm = normalize_utility_record(row)
        else:
            norm = normalize_travel_record(row)

        if norm.get('skip') or not norm.get('activity_value'):
            failed += 1
            AuditLog.objects.create(
                tenant=tenant, batch=batch, actor='system',
                event='row.skipped',
                description=f"Row {row['row_index']} skipped: {norm['skip_reason']}",
                metadata={'row_index': row['row_index'], 'reason': norm['skip_reason']},
            )
            continue

        period_start = _to_date(norm.get('period_start'))
        period_end   = _to_date(norm.get('period_end'))

        activity = NormalizedActivity.objects.create(
            raw_record      = row['_raw_record'],
            tenant          = tenant,
            scope           = norm['scope'],
            category        = norm['category'],
            activity_type   = norm['activity_type'],
            activity_value  = norm['activity_value'],
            activity_unit   = norm['activity_unit'],
            original_value  = norm['original_value'],
            original_unit   = norm['original_unit'],
            co2e_kg         = norm.get('co2e_kg'),
            emission_factor = norm.get('emission_factor'),
            emission_factor_source = norm.get('emission_factor_source', ''),
            confidence_score= norm.get('confidence_score', 1.0),
            confidence_notes= norm.get('confidence_notes', ''),
            status          = NormalizedActivity.ReviewStatus.NORMALIZED,
            period_start    = period_start,
            period_end      = period_end,
        )
        normalized_list.append(activity)

        AuditLog.objects.create(
            tenant=tenant, batch=batch, activity=activity, actor='system',
            event='row.normalized',
            description=(
                f"Row {row['row_index']} normalized: "
                f"{activity.scope} / {activity.category} / "
                f"{activity.activity_value} {activity.activity_unit}"
            ),
            metadata={
                'original_unit': norm['original_unit'],
                'canonical_unit': norm['activity_unit'],
                'confidence': norm.get('confidence_score'),
            },
        )

    activity_dicts = [
        {
            'scope':           a.scope,
            'category':        a.category,
            'activity_type':   a.activity_type,
            'activity_value':  a.activity_value,
            'activity_unit':   a.activity_unit,
            'confidence_score':a.confidence_score,
            'confidence_notes':a.confidence_notes,
            'period_start':    str(a.period_start) if a.period_start else None,
        }
        for a in normalized_list
    ]
    anomalies = detect_anomalies(activity_dicts)

    for idx, issue_type, severity, message in anomalies:
        if idx >= len(normalized_list):
            continue
        activity = normalized_list[idx]
        ValidationIssue.objects.create(
            activity=activity,
            severity=severity,
            issue_type=issue_type,
            message=message,
        )
        if activity.status == NormalizedActivity.ReviewStatus.NORMALIZED:
            activity.status = NormalizedActivity.ReviewStatus.FLAGGED
            activity.save(update_fields=['status'])

        AuditLog.objects.create(
            tenant=tenant, batch=batch, activity=activity, actor='system',
            event='row.flagged',
            description=f'Validation issue ({severity}): {message}',
            metadata={'issue_type': issue_type, 'severity': severity},
        )

    batch.processed_rows = len(normalized_list)
    batch.failed_rows    = failed
    batch.status         = UploadBatch.Status.DONE
    batch.summary.update({
        'processed_rows': len(normalized_list),
        'failed_rows':    failed,
        'anomalies_found':len(anomalies),
        'completed_at':   timezone.now().isoformat(),
    })
    batch.summary.pop('raw_content', None)
    batch.save(update_fields=['processed_rows', 'failed_rows', 'status', 'summary'])

    AuditLog.objects.create(
        tenant=tenant, batch=batch, actor='system',
        event='batch.completed',
        description=(
            f'Batch complete: {len(normalized_list)} normalized, '
            f'{failed} skipped, {len(anomalies)} anomalies'
        ),
        metadata=batch.summary,
    )

    return {
        'batch_id':  str(batch_id),
        'processed': len(normalized_list),
        'failed':    failed,
        'anomalies': len(anomalies),
    }


def _fail_batch(batch, reason):
    batch.status = UploadBatch.Status.FAILED
    batch.summary['error'] = reason
    batch.save(update_fields=['status', 'summary'])


def _to_date(val):
    if not val:
        return None
    from datetime import date
    if isinstance(val, date):
        return val
    try:
        from datetime import datetime
        return datetime.strptime(str(val)[:10], '%Y-%m-%d').date()
    except Exception:
        return None
