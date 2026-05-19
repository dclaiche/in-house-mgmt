from django.db import migrations

PERMISSION_CODENAME = "manage_users"
PERMISSION_NAME = "Can manage non-admin users"
ORGANIZER_GROUP = "ORGANIZER"


def create_permission(apps, schema_editor):
    Permission = apps.get_model("auth", "Permission")
    Group = apps.get_model("auth", "Group")
    ContentType = apps.get_model("contenttypes", "ContentType")

    user_ct, _ = ContentType.objects.get_or_create(app_label="auth", model="user")
    permission, _ = Permission.objects.get_or_create(
        codename=PERMISSION_CODENAME,
        content_type=user_ct,
        defaults={"name": PERMISSION_NAME},
    )

    organizer_group, _ = Group.objects.get_or_create(name=ORGANIZER_GROUP)
    organizer_group.permissions.add(permission)


def delete_permission(apps, schema_editor):
    Permission = apps.get_model("auth", "Permission")
    ContentType = apps.get_model("contenttypes", "ContentType")

    user_ct = ContentType.objects.filter(app_label="auth", model="user").first()
    if user_ct:
        Permission.objects.filter(codename=PERMISSION_CODENAME, content_type=user_ct).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_add_discord_id"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(create_permission, delete_permission),
    ]
