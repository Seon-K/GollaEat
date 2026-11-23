"""Exact Python casefold ordering without installing database functions."""
from functools import lru_cache

from django.db.models import Func


@lru_cache(maxsize=1)
def _fold_mapping():
    single, folded, expansions = [], [], []
    for codepoint in range(0x110000):
        char = chr(codepoint)
        value = char.casefold()
        if value == char:
            continue
        if len(value) == 1:
            single.append(char)
            folded.append(value)
        else:
            expansions.append((char, value))
    return ''.join(single), ''.join(folded), expansions


class UnicodeCasefold(Func):
    """C-collated result equals Python str.casefold, including expansions.

    ASCII/Hangul names take the cheap LOWER(C) branch. Other names use a
    complete mapping from the running Python Unicode version. Folded output
    is stable, so replacing expansion inputs cannot alter earlier outputs.
    """
    arity = 1

    def as_postgresql(self, compiler, connection, **extra_context):
        source, params = compiler.compile(self.source_expressions[0])
        single, folded, expansions = _fold_mapping()
        expression = f'TRANSLATE({source}, %s, %s)'
        mapped_params = [*params, single, folded]
        for char, value in expansions:
            expression = f'REPLACE({expression}, %s, %s)'
            mapped_params.extend([char, value])
        sql = (f'CASE WHEN ({source} COLLATE "C") ~ %s THEN {expression} '
               f'ELSE LOWER({source} COLLATE "C") END')
        return sql, [*params, r'[^\x01-\x7f가-힣]', *mapped_params, *params]

    def as_sqlite(self, compiler, connection, **extra_context):
        # Connection-local function only; no schema/data mutation.
        connection.ensure_connection()
        connection.connection.create_function('catalog_casefold', 1,
            lambda value: value.casefold() if value is not None else None, deterministic=True)
        return super().as_sql(compiler, connection, function='catalog_casefold', **extra_context)
