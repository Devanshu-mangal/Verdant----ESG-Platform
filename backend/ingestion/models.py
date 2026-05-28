import uuid
from django.db import models


class Tenant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class DataSource(models.Model):
    class SourceType(models.TextChoices):
        SAP_FUEL        = 'SAP_FUEL',      'SAP Fuel & Procurement'
        UTILITY_ELEC    = 'UTILITY_ELEC',  'Utility Electricity Portal'
        TRAVEL_CONCUR   = 'TRAVEL_CONCUR', 'Corporate Travel (Concur-style)'

    class IngestionMethod(models.TextChoices):
        CSV_UPLOAD = 'CSV_UPLOAD', 'CSV File Upload'
        API_PULL   = 'API_PULL',   'API Pull'

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant           = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='sources')
    name             = models.CharField(max_length=255)
    source_type      = models.CharField(max_length=50, choices=SourceType.choices)
    ingestion_method = models.CharField(max_length=50, choices=IngestionMethod.choices)
    parser_version   = models.CharField(max_length=20, default='1.0.0')
    is_active        = models.BooleanField(default=True)
    created_at       = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.tenant.name} / {self.name}"


class UploadBatch(models.Model):
    class Status(models.TextChoices):
        PENDING    = 'PENDING',    'Pending'
        PROCESSING = 'PROCESSING', 'Processing'
        DONE       = 'DONE',       'Done'
        FAILED     = 'FAILED',     'Failed'

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source         = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name='batches')
    uploaded_by    = models.CharField(max_length=255)
    uploaded_at    = models.DateTimeField(auto_now_add=True)
    file_name      = models.CharField(max_length=512, blank=True)
    status         = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    total_rows     = models.IntegerField(default=0)
    processed_rows = models.IntegerField(default=0)
    failed_rows    = models.IntegerField(default=0)
    summary        = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"{self.source.name} batch @ {self.uploaded_at:%Y-%m-%d %H:%M}"


class RawRecord(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch      = models.ForeignKey(UploadBatch, on_delete=models.CASCADE, related_name='raw_records')
    row_index  = models.IntegerField()
    raw_data   = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('batch', 'row_index')

    def __str__(self):
        return f"Raw row {self.row_index} from {self.batch}"


class NormalizedActivity(models.Model):
    class Scope(models.TextChoices):
        SCOPE_1 = 'SCOPE_1', 'Scope 1'
        SCOPE_2 = 'SCOPE_2', 'Scope 2'
        SCOPE_3 = 'SCOPE_3', 'Scope 3'

    class ReviewStatus(models.TextChoices):
        INGESTED        = 'INGESTED',        'Ingested'
        NORMALIZED      = 'NORMALIZED',      'Normalized'
        FLAGGED         = 'FLAGGED',         'Flagged'
        REVIEW_REQUIRED = 'REVIEW_REQUIRED', 'Review Required'
        APPROVED        = 'APPROVED',        'Approved'
        LOCKED          = 'LOCKED',          'Locked'

    id                     = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    raw_record             = models.OneToOneField(RawRecord, on_delete=models.CASCADE, related_name='normalized')
    tenant                 = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='activities')
    scope                  = models.CharField(max_length=10, choices=Scope.choices)
    category               = models.CharField(max_length=100)
    activity_type          = models.CharField(max_length=100)
    activity_value         = models.FloatField()
    activity_unit          = models.CharField(max_length=20)
    original_value         = models.FloatField()
    original_unit          = models.CharField(max_length=20)
    co2e_kg                = models.FloatField(null=True, blank=True)
    emission_factor        = models.FloatField(null=True, blank=True)
    emission_factor_source = models.CharField(max_length=100, blank=True)
    confidence_score       = models.FloatField(default=1.0)
    confidence_notes       = models.TextField(blank=True)
    status                 = models.CharField(max_length=20, choices=ReviewStatus.choices, default=ReviewStatus.INGESTED)
    period_start           = models.DateField(null=True, blank=True)
    period_end             = models.DateField(null=True, blank=True)
    created_at             = models.DateTimeField(auto_now_add=True)
    updated_at             = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.scope} / {self.category} / {self.activity_value} {self.activity_unit}"


class ValidationIssue(models.Model):
    class Severity(models.TextChoices):
        INFO    = 'INFO',    'Info'
        WARNING = 'WARNING', 'Warning'
        ERROR   = 'ERROR',   'Error'

    class IssueType(models.TextChoices):
        NEGATIVE_VALUE    = 'NEGATIVE_VALUE',    'Negative quantity'
        MISSING_FIELD     = 'MISSING_FIELD',     'Missing required field'
        UNIT_UNKNOWN      = 'UNIT_UNKNOWN',      'Unknown unit'
        ANOMALY_ZSCORE    = 'ANOMALY_ZSCORE',    'Statistical anomaly (z-score)'
        DUPLICATE         = 'DUPLICATE',         'Possible duplicate row'
        IMPOSSIBLE_DATE   = 'IMPOSSIBLE_DATE',   'Impossible or future date'
        INFERRED_DISTANCE = 'INFERRED_DISTANCE', 'Distance inferred from airport codes'

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    activity   = models.ForeignKey(NormalizedActivity, on_delete=models.CASCADE, related_name='issues')
    severity   = models.CharField(max_length=10, choices=Severity.choices)
    issue_type = models.CharField(max_length=50, choices=IssueType.choices)
    message    = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class ApprovalAction(models.Model):
    class Decision(models.TextChoices):
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'
        FLAGGED  = 'FLAGGED',  'Flagged for review'

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    activity   = models.ForeignKey(NormalizedActivity, on_delete=models.CASCADE, related_name='approvals')
    decision   = models.CharField(max_length=20, choices=Decision.choices)
    reviewer   = models.CharField(max_length=255)
    comment    = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class AuditLog(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant      = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='audit_logs')
    activity    = models.ForeignKey(NormalizedActivity, on_delete=models.CASCADE,
                                    related_name='audit_logs', null=True, blank=True)
    batch       = models.ForeignKey(UploadBatch, on_delete=models.CASCADE,
                                    related_name='audit_logs', null=True, blank=True)
    actor       = models.CharField(max_length=255)
    event       = models.CharField(max_length=100)
    description = models.TextField()
    metadata    = models.JSONField(default=dict)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
