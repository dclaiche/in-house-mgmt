import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group

User = get_user_model()
ENDPOINT = "/api/users/"
SUB_ORG_ENDPOINT = "/api/users/?groups=HELPER,TRAINEE,ORGANIZER"


def _results(response):
    data = response.json()
    if isinstance(data, list):
        return data
    return data.get("results", [])


@pytest.mark.django_db
class TestUserViewSetListPlainAuth:
    """The endpoint must keep behaving like the old UserSearchView for plain
    authenticated callers (tickets/events assignee pickers)."""

    def test_unauthenticated_rejected(self, api_client):
        response = api_client.get(ENDPOINT)
        assert response.status_code == 403

    def test_returns_lightweight_shape_for_non_manager(self, nonadmin_client, regular_user):
        response = nonadmin_client.get(ENDPOINT)
        assert response.status_code == 200
        results = _results(response)
        assert len(results) >= 1
        sample = next(u for u in results if u["id"] == regular_user.id)
        assert set(sample.keys()) == {"id", "username", "first_name", "last_name"}

    def test_search_filter_works_for_non_manager(self, nonadmin_client, db):
        User.objects.create_user(username="needle", first_name="Findme")
        User.objects.create_user(username="haystack")
        response = nonadmin_client.get(f"{ENDPOINT}?search=needle")
        assert response.status_code == 200
        usernames = {u["username"] for u in _results(response)}
        assert "needle" in usernames
        assert "haystack" not in usernames


@pytest.mark.django_db
class TestUserViewSetListManagerDefault:
    """Without `?groups=` filter, a manager sees ALL users (preserves assignee-
    picker behavior for callers that use /api/users/?search=)."""

    def test_returns_managed_shape_for_manager(self, manager_client, manager_user):
        response = manager_client.get(ENDPOINT)
        assert response.status_code == 200
        results = _results(response)
        sample = next(u for u in results if u["id"] == manager_user.id)
        expected_keys = {
            "id",
            "username",
            "first_name",
            "last_name",
            "groups",
            "primary_email",
            "discord_ids",
            "is_superuser",
            "is_active",
            "last_login",
        }
        assert set(sample.keys()) == expected_keys

    def test_includes_superusers_by_default(self, manager_client, admin_user):
        response = manager_client.get(ENDPOINT)
        ids = {u["id"] for u in _results(response)}
        assert admin_user.id in ids

    def test_includes_users_outside_sub_org_groups(self, manager_client):
        floater = User.objects.create_user(username="floater")
        response = manager_client.get(ENDPOINT)
        ids = {u["id"] for u in _results(response)}
        assert floater.id in ids


@pytest.mark.django_db
class TestUserViewSetListManagerGroupsFilter:
    """`?groups=` opts in to the sub-org scoped list used by /users."""

    def test_filters_to_requested_groups(self, manager_client, admin_user, sample_groups):
        helper_group = next(g for g in sample_groups if g.name == "HELPER")
        helper = User.objects.create_user(username="alice")
        helper.groups.add(helper_group)
        unrelated = User.objects.create_user(username="floater")

        response = manager_client.get(SUB_ORG_ENDPOINT)
        ids = {u["id"] for u in _results(response)}
        assert helper.id in ids
        assert admin_user.id not in ids
        assert unrelated.id not in ids

    def test_includes_inactive_users(self, manager_client, sample_groups):
        helper_group = next(g for g in sample_groups if g.name == "HELPER")
        deactivated = User.objects.create_user(username="deactivated", is_active=False)
        deactivated.groups.add(helper_group)

        response = manager_client.get(SUB_ORG_ENDPOINT)
        ids = {u["id"] for u in _results(response)}
        assert deactivated.id in ids

    def test_discord_bot_group_excluded_implicitly(self, manager_client, sample_groups):
        bot_group, _ = Group.objects.get_or_create(name="DISCORD_BOT")
        bot_user = User.objects.create_user(username="bot")
        bot_user.groups.add(bot_group)

        response = manager_client.get(SUB_ORG_ENDPOINT)
        ids = {u["id"] for u in _results(response)}
        assert bot_user.id not in ids

    def test_include_admins_adds_superusers(self, manager_client, admin_user, sample_groups):
        """`include_admins=true` keeps the groups filter for sub-org users
        but unions in superusers, so the /users page can show them with
        disabled controls instead of looking like they're missing."""
        helper_group = next(g for g in sample_groups if g.name == "HELPER")
        helper = User.objects.create_user(username="alice")
        helper.groups.add(helper_group)
        floater = User.objects.create_user(username="floater")

        response = manager_client.get(f"{SUB_ORG_ENDPOINT}&include_admins=true")
        ids = {u["id"] for u in _results(response)}
        assert helper.id in ids
        assert admin_user.id in ids
        assert floater.id not in ids
