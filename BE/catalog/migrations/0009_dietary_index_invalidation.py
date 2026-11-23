from django.db import migrations

TABLES = ["catalog_menu", "catalog_restaurant", "catalog_fooddeclaration", "catalog_menucomponent",
          "catalog_allergenlink", "catalog_catalogsource", "catalog_menuanalysisreference",
          "catalog_optiongroup", "dietary_criterion", "dietary_supportrule"]
STATE = "catalog_menudietarystate"

def affected(table, refs):
    def values(column): return " UNION ".join(f"SELECT {r}.{column} AS menu_id" for r in refs)
    if table == "catalog_menu":
        direct = values("preprocess_row_id")
        return direct + f" UNION SELECT COALESCE(d.menu_id,c.menu_id) FROM catalog_fooddeclaration d LEFT JOIN catalog_menucomponent c ON c.id=d.component_id JOIN catalog_allergenlink l ON l.id=d.import_link_id WHERE l.menu_id IN ({direct})"
    if table == "catalog_restaurant":
        return "SELECT preprocess_row_id AS menu_id FROM catalog_menu WHERE restaurant_id IN (" + values("place_id") + ")"
    if table in {"catalog_menucomponent", "catalog_menuanalysisreference", "catalog_optiongroup"}:
        return values("menu_id")
    if table == "catalog_fooddeclaration":
        return values("menu_id") + " UNION SELECT menu_id FROM catalog_menucomponent WHERE id IN (" + values("component_id") + ")"
    if table == "catalog_allergenlink":
        return values("menu_id") + " UNION SELECT COALESCE(d.menu_id,c.menu_id) FROM catalog_fooddeclaration d LEFT JOIN catalog_menucomponent c ON c.id=d.component_id WHERE d.import_link_id IN (" + values("id") + ")"
    ids = values("id")
    return ("SELECT COALESCE(d.menu_id,c.menu_id) AS menu_id FROM catalog_fooddeclaration d LEFT JOIN catalog_menucomponent c ON c.id=d.component_id WHERE d.source_id IN (" + ids + ") UNION SELECT menu_id FROM catalog_allergenlink WHERE source_id IN (" + ids + ")")


def install(apps, schema_editor):
    connection = schema_editor.connection
    State = apps.get_model("catalog", "MenuDietaryState")
    Menu = apps.get_model("catalog", "Menu")
    State.objects.using(connection.alias).bulk_create([State(menu_id=mid) for mid in Menu.objects.using(connection.alias).values_list("pk", flat=True)], ignore_conflicts=True, batch_size=1000)
    for table in TABLES:
        for event in ["INSERT", "UPDATE", "DELETE"]:
            name = f"dietary_dirty_{table}_{event.lower()}"
            refs = ["NEW"] if event == "INSERT" else ["OLD"] if event == "DELETE" else ["NEW", "OLD"]
            global_change = table.startswith("dietary_")
            update = f"UPDATE {STATE} SET dirty=TRUE, revision=revision+1, valid_until=NULL"
            if not global_change:
                changed = affected(table, refs)
                # DISTINCT resolves an untyped NULL to text on PostgreSQL.
                expiry = "NULL::timestamp with time zone" if connection.vendor == "postgresql" else "NULL"
                select = f"SELECT DISTINCT c.menu_id, 1, TRUE, {expiry}, '', '', '' FROM ({changed}) c JOIN catalog_menu m ON m.preprocess_row_id=c.menu_id WHERE c.menu_id IS NOT NULL"
            if connection.vendor == "postgresql":
                body = update + ";" if global_change else (f"INSERT INTO {STATE} (menu_id,revision,dirty,valid_until,search_text,name_key,category_key) {select} ON CONFLICT (menu_id) DO UPDATE SET dirty=TRUE, revision={STATE}.revision+1,valid_until=NULL;")
                schema_editor.execute(f"CREATE FUNCTION {name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN {body} RETURN NULL; END $$")
                schema_editor.execute(f"CREATE TRIGGER {name} AFTER {event} ON {table} FOR EACH ROW EXECUTE FUNCTION {name}()")
            elif connection.vendor == "sqlite":
                body = update + ";" if global_change else (f"INSERT OR IGNORE INTO {STATE} (menu_id,revision,dirty,valid_until,search_text,name_key,category_key) {select.replace('c.menu_id, 1, TRUE', 'c.menu_id, 0, TRUE')}; {update} WHERE menu_id IN ({changed});")
                schema_editor.execute(f"CREATE TRIGGER {name} AFTER {event} ON {table} BEGIN {body} END")


def uninstall(apps, schema_editor):
    for table in TABLES:
        for event in ["insert", "update", "delete"]:
            name = f"dietary_dirty_{table}_{event}"
            if schema_editor.connection.vendor == "postgresql":
                schema_editor.execute(f"DROP TRIGGER IF EXISTS {name} ON {table}")
                schema_editor.execute(f"DROP FUNCTION IF EXISTS {name}()")
            elif schema_editor.connection.vendor == "sqlite":
                schema_editor.execute(f"DROP TRIGGER IF EXISTS {name}")


class Migration(migrations.Migration):
    dependencies = [("catalog", "0008_dietary_search_index")]
    operations = [migrations.RunPython(install, uninstall)]
