import math


def page_parameters(params):
    values = []
    for name, default, maximum in [('page', 1, 2147483647), ('limit', 20, 100)]:
        raw = params.get(name, str(default))
        if not isinstance(raw, str) or not raw.isascii() or not raw.isdecimal():
            raise ValueError(f'{name} must be an integer')
        value = int(raw)
        if not 1 <= value <= maximum:
            raise ValueError(f'{name} must be between 1 and {maximum}')
        values.append(value)
    return values


def paginate(queryset, page, limit):
    # 필터·정렬 결과의 페이지 단위 조회
    total = queryset.count()
    pages = math.ceil(total / limit)
    selected = list(queryset[(page - 1) * limit:page * limit])
    return selected, {'page': page, 'limit': limit, 'count': len(selected), 'total': total,
                      'total_pages': pages, 'next_page': page + 1 if page < pages else None,
                      'previous_page': page - 1 if page > 1 and total else None}
