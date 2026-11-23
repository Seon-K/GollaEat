"""Repair functions already installed by 0009 without rebuilding index data."""
from importlib import import_module

from django.db import migrations


def repair_functions(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    original = import_module("catalog.migrations.0009_dietary_index_invalidation")
    for table in original.TABLES:
        if table.startswith("dietary_"):
            continue
        for event in ["INSERT", "UPDATE", "DELETE"]:
            name = f"dietary_dirty_{table}_{event.lower()}"
            refs = ["NEW"] if event == "INSERT" else ["OLD"] if event == "DELETE" else ["NEW", "OLD"]
            changed = original.affected(table, refs)
            select = (
                "SELECT DISTINCT c.menu_id, 1, TRUE, NULL::timestamp with time zone, '', '', '' "
                f"FROM ({changed}) c JOIN catalog_menu m ON m.preprocess_row_id=c.menu_id "
                "WHERE c.menu_id IS NOT NULL"
            )
            schema_editor.execute(
                f"CREATE OR REPLACE FUNCTION {name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
                f"INSERT INTO {original.STATE} (menu_id,revision,dirty,valid_until,search_text,name_key,category_key) "
                f"{select} ON CONFLICT (menu_id) DO UPDATE SET dirty=TRUE, "
                f"revision={original.STATE}.revision+1,valid_until=NULL; RETURN NULL; END $$"
            )


class Migration(migrations.Migration):
    dependencies = [("catalog", "0010_dietary_evaluation_snapshot")]
    # Keep the type-safe functions when rolling back to the corrected 0009.
    operations = [migrations.RunPython(repair_functions, migrations.RunPython.noop)]
