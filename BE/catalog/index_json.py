"""Preserve evaluator datetime values in derived JSON snapshots."""
import json
from datetime import datetime
from django.core.serializers.json import DjangoJSONEncoder
from django.utils.dateparse import parse_datetime


class EvaluationSnapshotEncoder(DjangoJSONEncoder):
    def default(self, value):
        if isinstance(value, datetime):
            return value.isoformat()
        return super().default(value)


def restore_dates(value):
    for key in ('checked_at', 'valid_until', 'imported_at'):
        if isinstance(value.get(key), str):
            parsed = parse_datetime(value[key])
            if parsed is not None:
                value[key] = parsed
    return value


class EvaluationSnapshotDecoder(json.JSONDecoder):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, object_hook=restore_dates, **kwargs)
