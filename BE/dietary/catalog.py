"""A 메뉴 데이터 조회 어댑터 경계"""
from django.conf import settings
from django.utils.module_loading import import_string


class UnavailableCatalog:
    def get_component(self, component_id):
        return None


def get_catalog():
    return import_string(getattr(settings, 'DIETARY_CATALOG_ADAPTER', 'dietary.catalog.UnavailableCatalog'))()
