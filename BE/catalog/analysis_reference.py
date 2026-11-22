"""Parse and display AI analysis without feeding evidence to the B adapter."""
import csv
import hashlib
import io
import json
from pathlib import Path

from django.core.management.base import CommandError


REQUIRED_COLUMNS = {'preprocess_row_id', 'place_id', 'restaurant_name', 'menu_name', 'description',
    'explicit_ingredients', 'explicit_components', 'gemini_estimated_ingredients', 'ingredient_source',
    'evidence_level', 'information_status', 'gemini_status', 'top1_fd_Code', 'public_reference_food_name',
    'public_reference_allergens', 'public_reference_allergy_raw', 'public_reference_status',
    'restaurant_ingredient_verification', 'allergy_safety_status'}


def _list(value, column, number):
    try:
        result = json.loads(value) if value.strip() else []
    except (ValueError, TypeError):
        raise CommandError(f'Row {number}: {column} must contain a JSON string list') from None
    if not isinstance(result, list) or any(not isinstance(item, str) or not item.strip() for item in result):
        raise CommandError(f'Row {number}: {column} must contain a JSON string list')
    return result


def read_analysis_csv(path):
    path = Path(path)
    try:
        raw = path.read_bytes()
        reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig')), strict=True)
        headers = reader.fieldnames or []
        if len(headers) != len(set(headers)) or REQUIRED_COLUMNS - set(headers):
            raise CommandError('Missing or duplicate analysis CSV columns')
        rows = list(reader)
    except (OSError, UnicodeError, csv.Error):
        raise CommandError('Analysis CSV could not be read') from None
    if not rows:
        raise CommandError('Analysis CSV is empty')
    seen, result = set(), []
    digest = hashlib.sha256(raw).hexdigest()
    for number, row in enumerate(rows, start=2):
        if None in row or any(value is None for value in row.values()):
            raise CommandError(f'Row {number}: inconsistent CSV columns')
        mid = row['preprocess_row_id']
        if not mid or mid != mid.strip() or len(mid) > 100 or mid in seen:
            raise CommandError(f'Row {number}: invalid or duplicate menu ID')
        seen.add(mid)
        ingredients = _list(row['explicit_ingredients'], 'explicit_ingredients', number)
        components = _list(row['explicit_components'], 'explicit_components', number)
        estimates = _list(row['gemini_estimated_ingredients'], 'gemini_estimated_ingredients', number)
        source = row['ingredient_source']
        if source not in {'QWEN_TEXT_EXTRACTION', 'GEMINI_ESTIMATED', 'NONE'} or (
                source == 'QWEN_TEXT_EXTRACTION' and (not ingredients or estimates)) or (
                source == 'GEMINI_ESTIMATED' and (ingredients or not estimates)) or (
                source == 'NONE' and (ingredients or estimates)):
            raise CommandError(f'Row {number}: inconsistent ingredient source')
        if row['evidence_level'] not in {'DESCRIPTION_SUPPORTED', 'MENU_NAME_ONLY', 'NO_EXPLICIT_INGREDIENT'} or (
                row['information_status'] not in {'NO_EXPLICIT_INGREDIENT', 'TEXT_EVIDENCE_ONLY', 'DESCRIPTION_MISSING'}):
            raise CommandError(f'Row {number}: unknown evidence/information status')
        if (row['restaurant_ingredient_verification'] != 'NOT_VERIFIED' or
                row['allergy_safety_status'] != 'UNKNOWN_NOT_VERIFIED' or
                row['public_reference_status'] != 'UNVERIFIED_SIMILAR_FOOD'):
            raise CommandError(f'Row {number}: this importer accepts unverified references only')
        if len(row['gemini_status']) > 100 or not row['menu_name'].strip() or not row['restaurant_name'].strip():
            raise CommandError(f'Row {number}: invalid analysis metadata')
        result.append((row, {
            'explicit_ingredients': ingredients, 'explicit_components': components,
            'gemini_estimated_ingredients': estimates, 'ingredient_source': source,
            'evidence_level': row['evidence_level'], 'information_status': row['information_status'],
            'gemini_status': row['gemini_status'], 'public_food_code': row['top1_fd_Code'],
            'public_food_name': row['public_reference_food_name'], 'public_allergens': row['public_reference_allergens'],
            'public_allergy_raw': row['public_reference_allergy_raw'], 'public_reference_status': row['public_reference_status'],
            'restaurant_ingredient_verification': row['restaurant_ingredient_verification'],
            'allergy_safety_status': row['allergy_safety_status'], 'payload': row,
            'source_filename': path.name[:255], 'source_sha256': digest,
        }))
    return result


def analysis_json(reference):
    if reference is None:
        return None
    return {
        'ingredient_source': reference.ingredient_source,
        'qwen': {'ingredients': reference.explicit_ingredients, 'components': reference.explicit_components,
            'evidence_level': reference.evidence_level, 'information_status': reference.information_status},
        'gemini': {'estimated_ingredients': reference.gemini_estimated_ingredients,
            'processing_status': reference.gemini_status or None},
        'public_reference': {'food_code': reference.public_food_code or None,
            'food_name': reference.public_food_name or None, 'allergens': reference.public_allergens or None,
            'allergy_raw': reference.public_allergy_raw or None, 'match_present': bool(reference.public_food_code.strip()),
            'status': reference.public_reference_status},
        'restaurant_ingredient_verification': reference.restaurant_ingredient_verification,
        'allergy_safety_status': reference.allergy_safety_status,
        'verification_status': 'unverified', 'usable_for_dietary_judgement': False,
        'source': {'filename': reference.source_filename, 'sha256': reference.source_sha256,
            'imported_at': reference.imported_at},
        'notice': '텍스트 추출·AI 추정·유사 음식 참고 정보이며 실제 매장 재료 및 알레르기 안전성을 확인한 정보가 아닙니다.',
    }
