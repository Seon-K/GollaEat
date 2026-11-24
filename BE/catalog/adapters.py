"""Read-only CSV implementation of the backend B catalog contract."""
import re

from django.conf import settings

from .repository import CatalogDataError, CsvCatalogRepository
from .operations import expand_present_tags


class DietaryCatalog:
    def get_components(self, menu_ids):
        if settings.CATALOG_USE_DB:
            from .db_repository import DatabaseCatalogRepository
            return DatabaseCatalogRepository().get_dietary_components(menu_ids)
        if settings.CATALOG_FINAL_CSV:
            from .final_repository import get_repository
            available = {m['menu_id'] for m in get_repository().list_menus()}
            return {mid: {'present_tags': [], 'absent_tags': [], 'sources': [],
                          'preference_tags': []} if mid in available else None
                    for mid in menu_ids}
        return {mid: self.get_component(mid) for mid in menu_ids}

    # Only reviewed declarations are eligible; structure checks alone are not proof.
    VERIFIED = {'manual_visual_checked', 'official_image_visual_checked'}
    TAGS = {
        '난류': 'egg', '계란': 'egg', '달걀': 'egg', '우유': 'milk',
        '메밀': 'buckwheat', '땅콩': 'nuts', '호두': 'nuts', '잣': 'nuts',
        '아몬드': 'nuts', '대두': 'soy', '밀': 'wheat', '고등어': 'fish',
        '게': 'crustacean', '새우': 'crustacean', '조개류': 'shellfish',
        '굴': 'shellfish', '전복': 'shellfish', '홍합': 'shellfish',
        '돼지고기': 'pork', '복숭아': 'peach', '토마토': 'tomato',
        '아황산류': 'sulfites', '닭고기': 'chicken', '쇠고기': 'beef',
        '소고기': 'beef', '오징어': 'squid',
        '견과류': 'nuts', '생선': 'fish', '갑각류': 'crustacean',
        '기타 육류': 'other-meat', '치즈': 'cheese-butter', '버터': 'cheese-butter',
        '치즈·버터': 'cheese-butter', '꿀': 'honey', '젤라틴': 'gelatin',
    }

    def get_component(self, component_id):
        if settings.CATALOG_USE_DB:
            from .db_repository import DatabaseCatalogRepository
            return DatabaseCatalogRepository().get_dietary_component(component_id)
        if settings.CATALOG_USE_DB or settings.CATALOG_FINAL_CSV:
            from .final_repository import get_repository
            try:
                menu = get_repository().get_menu(component_id)
            except CatalogDataError:
                return None
            return {'present_tags': [], 'absent_tags': [], 'sources': [], 'preference_tags': []} if menu else None
        repository = CsvCatalogRepository(settings.CATALOG_MENU_CSV, '')
        try:
            menu = repository.get_menu(component_id)
        except CatalogDataError:
            return None
        if menu is None:
            return None
        source = menu['source']
        verified = menu['verification']['verification_status'] in self.VERIFIED
        traceable = bool(source.get('source_url') or (
            source.get('source_file') and source.get('evidence_locator')))
        tags = set()
        if verified and traceable:
            text = menu['allergen_information'].get('allergens_contains_normalized') or ''
            for token in re.split(r'[,;|/\n]+', text):
                tag = self.TAGS.get(token.strip())
                if tag:
                    tags.add(tag)
                individual = {'고등어': 'mackerel', '게': 'crab', '새우': 'shrimp'}.get(token.strip())
                if individual:
                    tags.add(individual)
        return {
            'present_tags': sorted(expand_present_tags(tags)), 'absent_tags': [], 'preference_tags': [],
            'sources': [dict(source, id=component_id, title=menu['brand'] + ' ' + menu['menu_name'],
                             url=source.get('source_url'),
                             checked_at=source.get('source_reference_date'),
                             verification_status=menu['verification']['verification_status'])]
                       if traceable else [],
        }
