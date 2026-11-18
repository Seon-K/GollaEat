"""Backend A boundary. No duplicate menu/ingredient/source persistence in B."""
from django.conf import settings
from django.utils.module_loading import import_string


class UnavailableCatalog:
    def get_component(self, component_id):
        return None


def get_catalog():
    return import_string(getattr(settings, 'DIETARY_CATALOG_ADAPTER', 'dietary.catalog.UnavailableCatalog'))()
