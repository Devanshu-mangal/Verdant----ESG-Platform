from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import (
    TenantViewSet, DataSourceViewSet, UploadBatchViewSet,
    NormalizedActivityViewSet, AuditLogViewSet, analytics,
)

router = DefaultRouter()
router.register('tenants',    TenantViewSet)
router.register('sources',    DataSourceViewSet)
router.register('batches',    UploadBatchViewSet)
router.register('activities', NormalizedActivityViewSet)
router.register('audit',      AuditLogViewSet)

urlpatterns = router.urls + [
    path('analytics/', analytics),
]
