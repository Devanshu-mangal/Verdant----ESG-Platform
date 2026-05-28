from rest_framework import serializers
from .models import (
    Tenant, DataSource, UploadBatch, RawRecord,
    NormalizedActivity, ValidationIssue, ApprovalAction, AuditLog
)


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = '__all__'


class DataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSource
        fields = '__all__'


class UploadBatchSerializer(serializers.ModelSerializer):
    source_name = serializers.CharField(source='source.name', read_only=True)
    source_type = serializers.CharField(source='source.source_type', read_only=True)

    class Meta:
        model = UploadBatch
        fields = '__all__'


class ValidationIssueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ValidationIssue
        fields = '__all__'


class ApprovalActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApprovalAction
        fields = '__all__'


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = '__all__'


class NormalizedActivityListSerializer(serializers.ModelSerializer):
    issues       = ValidationIssueSerializer(many=True, read_only=True)
    source_name  = serializers.CharField(source='raw_record.batch.source.name', read_only=True)
    batch_id     = serializers.UUIDField(source='raw_record.batch.id', read_only=True)

    class Meta:
        model = NormalizedActivity
        fields = '__all__'


class NormalizedActivityDetailSerializer(serializers.ModelSerializer):
    issues      = ValidationIssueSerializer(many=True, read_only=True)
    approvals   = ApprovalActionSerializer(many=True, read_only=True)
    audit_logs  = AuditLogSerializer(many=True, read_only=True)
    raw_data    = serializers.JSONField(source='raw_record.raw_data', read_only=True)
    source_name = serializers.CharField(source='raw_record.batch.source.name', read_only=True)
    batch_id    = serializers.UUIDField(source='raw_record.batch.id', read_only=True)

    class Meta:
        model = NormalizedActivity
        fields = '__all__'
