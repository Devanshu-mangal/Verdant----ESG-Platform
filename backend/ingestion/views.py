from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from django.shortcuts import get_object_or_404
from django.db.models import Sum, Avg, Count, Q, F
from django.db.models.functions import TruncMonth

from .models import (
    Tenant, DataSource, UploadBatch,
    NormalizedActivity, ApprovalAction, AuditLog,
    ValidationIssue, RawRecord,
)
from .serializers import (
    TenantSerializer, DataSourceSerializer, UploadBatchSerializer,
    NormalizedActivityListSerializer, NormalizedActivityDetailSerializer,
    AuditLogSerializer,
)
from .tasks import process_upload_batch


class TenantViewSet(viewsets.ModelViewSet):
    queryset = Tenant.objects.all()
    serializer_class = TenantSerializer


class DataSourceViewSet(viewsets.ModelViewSet):
    queryset = DataSource.objects.select_related('tenant').all()
    serializer_class = DataSourceSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        tenant_id = self.request.query_params.get('tenant')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        return qs


class UploadBatchViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = UploadBatch.objects.select_related('source__tenant').order_by('-uploaded_at')
    serializer_class = UploadBatchSerializer

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser])
    def upload(self, request):
        source_id   = request.data.get('source_id')
        uploaded_by = request.data.get('uploaded_by', 'analyst@breatheesg.com')
        file_obj    = request.FILES.get('file')

        if not source_id or not file_obj:
            return Response(
                {'error': 'source_id and file are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        source = get_object_or_404(DataSource, id=source_id)
        raw_content = file_obj.read().decode('utf-8', errors='replace')

        batch = UploadBatch.objects.create(
            source=source,
            uploaded_by=uploaded_by,
            file_name=file_obj.name,
            status=UploadBatch.Status.PENDING,
            summary={'raw_content': raw_content},
        )

        import os
	if os.environ.get('RENDER'):
    		process_upload_batch(str(batch.id))
	else:
    		process_upload_batch.delay(str(batch.id))

        return Response(
            UploadBatchSerializer(batch).data,
            status=status.HTTP_202_ACCEPTED
        )


class NormalizedActivityViewSet(viewsets.ModelViewSet):
    queryset = NormalizedActivity.objects.select_related(
        'raw_record__batch__source', 'tenant'
    ).prefetch_related('issues', 'approvals').order_by('-created_at')
    serializer_class = NormalizedActivityListSerializer

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return NormalizedActivityDetailSerializer
        return NormalizedActivityListSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('tenant'):
            qs = qs.filter(tenant_id=params['tenant'])
        if params.get('scope'):
            qs = qs.filter(scope=params['scope'])
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('flagged') == 'true':
            qs = qs.filter(status__in=['FLAGGED', 'REVIEW_REQUIRED'])
        if params.get('category'):
            qs = qs.filter(category=params['category'])
        if params.get('source_type'):
            qs = qs.filter(raw_record__batch__source__source_type=params['source_type'])
        if params.get('batch'):
            qs = qs.filter(raw_record__batch_id=params['batch'])
        return qs

    def destroy(self, request, *args, **kwargs):
        activity = self.get_object()
        if activity.status == NormalizedActivity.ReviewStatus.LOCKED:
            return Response({'error': 'Record is locked'}, status=status.HTTP_400_BAD_REQUEST)
        actor = request.data.get('actor', 'analyst@breatheesg.com')
        tenant = activity.tenant
        meta = {
            'activity_id': str(activity.id),
            'scope': activity.scope,
            'category': activity.category,
        }
        AuditLog.objects.create(
            tenant=tenant,
            actor=actor,
            event='row.deleted',
            description=f'Record deleted by {actor}',
            metadata=meta,
        )
        activity.raw_record.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def flag(self, request, pk=None):
        activity = self.get_object()
        if activity.status == NormalizedActivity.ReviewStatus.LOCKED:
            return Response({'error': 'Record is locked'}, status=status.HTTP_400_BAD_REQUEST)
        activity.status = NormalizedActivity.ReviewStatus.FLAGGED
        activity.save(update_fields=['status'])
        actor = request.data.get('actor', 'analyst@breatheesg.com')
        AuditLog.objects.create(
            tenant=activity.tenant,
            activity=activity,
            actor=actor,
            event='row.flagged',
            description=f'Manually flagged by {actor}',
            metadata={},
        )
        return Response({'status': 'flagged'})

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        activity = self.get_object()
        if activity.status == NormalizedActivity.ReviewStatus.LOCKED:
            return Response({'error': 'Record is locked'}, status=400)
        ApprovalAction.objects.create(
            activity=activity,
            decision='APPROVED',
            reviewer=request.data.get('reviewer', 'analyst@breatheesg.com'),
            comment=request.data.get('comment', ''),
        )
        activity.status = NormalizedActivity.ReviewStatus.APPROVED
        activity.save(update_fields=['status'])
        AuditLog.objects.create(
            tenant=activity.tenant, activity=activity,
            actor=request.data.get('reviewer', 'analyst@breatheesg.com'),
            event='row.approved',
            description=f"Approved by {request.data.get('reviewer', 'analyst')}",
            metadata={'comment': request.data.get('comment', '')},
        )
        return Response({'status': 'approved'})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        activity = self.get_object()
        if activity.status == NormalizedActivity.ReviewStatus.LOCKED:
            return Response({'error': 'Record is locked'}, status=400)
        ApprovalAction.objects.create(
            activity=activity,
            decision='REJECTED',
            reviewer=request.data.get('reviewer', 'analyst@breatheesg.com'),
            comment=request.data.get('comment', ''),
        )
        activity.status = NormalizedActivity.ReviewStatus.REVIEW_REQUIRED
        activity.save(update_fields=['status'])
        AuditLog.objects.create(
            tenant=activity.tenant, activity=activity,
            actor=request.data.get('reviewer', 'analyst@breatheesg.com'),
            event='row.rejected',
            description=f"Rejected by {request.data.get('reviewer', 'analyst')}",
            metadata={'comment': request.data.get('comment', '')},
        )
        return Response({'status': 'rejected'})

    @action(detail=False, methods=['post'])
    def bulk_approve(self, request):
        ids      = request.data.get('ids', [])
        reviewer = request.data.get('reviewer', 'analyst@breatheesg.com')
        comment  = request.data.get('comment', '')
        activities = NormalizedActivity.objects.filter(
            id__in=ids
        ).exclude(status=NormalizedActivity.ReviewStatus.LOCKED)
        updated = 0
        for activity in activities:
            ApprovalAction.objects.create(
                activity=activity, decision='APPROVED',
                reviewer=reviewer, comment=comment,
            )
            activity.status = NormalizedActivity.ReviewStatus.APPROVED
            activity.save(update_fields=['status'])
            AuditLog.objects.create(
                tenant=activity.tenant, activity=activity, actor=reviewer,
                event='row.approved',
                description=f'Bulk approved by {reviewer}',
                metadata={'comment': comment},
            )
            updated += 1
        return Response({'approved': updated})


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related('tenant', 'activity', 'batch').order_by('-created_at')
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('tenant'):
            qs = qs.filter(tenant_id=params['tenant'])
        if params.get('activity'):
            qs = qs.filter(activity_id=params['activity'])
        if params.get('batch'):
            qs = qs.filter(batch_id=params['batch'])
        if params.get('event'):
            qs = qs.filter(event=params['event'])
        return qs


@api_view(['GET'])
def analytics(request):
    tenant_id = request.query_params.get('tenant')
    qs = NormalizedActivity.objects.filter(tenant_id=tenant_id) if tenant_id else NormalizedActivity.objects.all()

    # CO2e by scope
    scope_data = {}
    for scope in ['SCOPE_1', 'SCOPE_2', 'SCOPE_3']:
        agg = qs.filter(scope=scope).aggregate(
            total_co2=Sum('co2e_kg'),
            count=Count('id'),
            avg_confidence=Avg('confidence_score'),
        )
        scope_data[scope] = {
            'co2e_kg':        round(agg['total_co2'] or 0, 2),
            'count':          agg['count'] or 0,
            'avg_confidence': round(agg['avg_confidence'] or 0, 3),
        }

    # Monthly trend
    monthly = (
        qs.filter(period_start__isnull=False)
        .annotate(month=TruncMonth('period_start'))
        .values('month', 'scope')
        .annotate(co2=Sum('co2e_kg'), count=Count('id'))
        .order_by('month', 'scope')
    )
    trend = {}
    for row in monthly:
        m = row['month'].strftime('%Y-%m') if row['month'] else 'unknown'
        if m not in trend:
            trend[m] = {'month': m, 'SCOPE_1': 0, 'SCOPE_2': 0, 'SCOPE_3': 0}
        trend[m][row['scope']] = round(row['co2'] or 0, 2)
    trend_list = sorted(trend.values(), key=lambda x: x['month'])

    # Top emission categories
    top_categories = list(
        qs.values('category', 'scope')
        .annotate(total=Sum('co2e_kg'), count=Count('id'))
        .order_by('-total')[:8]
    )

    # Source health
    batches = UploadBatch.objects.select_related('source')
    if tenant_id:
        batches = batches.filter(source__tenant_id=tenant_id)

    source_health = []
    for source_type, label in [
        ('SAP_FUEL',      'SAP Fuel'),
        ('UTILITY_ELEC',  'Utility Electricity'),
        ('TRAVEL_CONCUR', 'Corporate Travel'),
    ]:
        source_batches = batches.filter(source__source_type=source_type)
        if not source_batches.exists():
            continue
        total_rows  = sum(b.total_rows for b in source_batches)
        failed_rows = sum(b.failed_rows for b in source_batches)
        processed   = sum(b.processed_rows for b in source_batches)
        source_qs   = qs.filter(raw_record__batch__source__source_type=source_type)
        anomaly_count = ValidationIssue.objects.filter(activity__in=source_qs).count()
        avg_conf    = source_qs.aggregate(a=Avg('confidence_score'))['a'] or 0
        fail_rate   = (failed_rows / total_rows) if total_rows > 0 else 0

        if avg_conf >= 0.90 and fail_rate < 0.05 and anomaly_count == 0:
            health = 'GOOD'
        elif avg_conf >= 0.75 and fail_rate < 0.15:
            health = 'AVERAGE'
        else:
            health = 'POOR'

        source_health.append({
            'source_type':    source_type,
            'label':          label,
            'health':         health,
            'total_rows':     total_rows,
            'processed':      processed,
            'failed':         failed_rows,
            'anomalies':      anomaly_count,
            'avg_confidence': round(avg_conf, 3),
            'fail_rate':      round(fail_rate, 3),
        })

    # Normalization insights
    total       = qs.count()
    flagged     = qs.filter(status__in=['FLAGGED', 'REVIEW_REQUIRED']).count()
    approved    = qs.filter(status='APPROVED').count()
    low_conf    = qs.filter(confidence_score__lt=0.85).count()
    conversions = qs.exclude(original_unit=F('activity_unit')).count()
    inferred    = ValidationIssue.objects.filter(activity__in=qs, issue_type='INFERRED_DISTANCE').count()
    duplicates  = ValidationIssue.objects.filter(activity__in=qs, issue_type='DUPLICATE').count()
    negative    = ValidationIssue.objects.filter(activity__in=qs, issue_type='NEGATIVE_VALUE').count()
    avg_conf_all = qs.aggregate(a=Avg('confidence_score'))['a'] or 0

    insights = {
        'total':               total,
        'flagged':             flagged,
        'approved':            approved,
        'low_confidence':      low_conf,
        'unit_conversions':    conversions,
        'inferred_distances':  inferred,
        'duplicates_detected': duplicates,
        'negative_values':     negative,
        'avg_confidence':      round(avg_conf_all, 3),
        'normalization_rate':  round((total - flagged) / total, 3) if total > 0 else 0,
        'auto_approve_rate':   round(approved / total, 3) if total > 0 else 0,
    }

    return Response({
        'scope_breakdown': scope_data,
        'monthly_trend':   trend_list,
        'top_categories':  top_categories,
        'source_health':   source_health,
        'insights':        insights,
    })
