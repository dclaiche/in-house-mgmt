import pytest
from django.contrib.auth import get_user_model

User = get_user_model()
ENDPOINT_FMT = "/api/users/{user_id}/"


@pytest.fixture
def helper(db, sample_groups):
    helper_group = next(g for g in sample_groups if g.name == "HELPER")
    user = User.objects.create_user(username="helper1", is_active=True)
    user.groups.add(helper_group)
    return user


@pytest.fixture
def organizer_target(db, sample_groups):
    organizer_group = next(g for g in sample_groups if g.name == "ORGANIZER")
    user = User.objects.create_user(username="other_organizer", is_active=True)
    user.groups.add(organizer_group)
    return user


@pytest.mark.django_db
class TestPartialUpdate:
    def test_changes_role(self, manager_client, helper, sample_groups):
        response = manager_client.patch(
            ENDPOINT_FMT.format(user_id=helper.id),
            data={"role": "TRAINEE"},
            format="json",
        )
        assert response.status_code == 200
        helper.refresh_from_db()
        assert {g.name for g in helper.groups.all()} == {"TRAINEE"}

    def test_admin_can_change_role_to_organizer(self, authenticated_client, helper, sample_groups):
        response = authenticated_client.patch(
            ENDPOINT_FMT.format(user_id=helper.id),
            data={"role": "ORGANIZER"},
            format="json",
        )
        assert response.status_code == 200
        helper.refresh_from_db()
        assert {g.name for g in helper.groups.all()} == {"ORGANIZER"}

    def test_non_admin_manager_cannot_change_role_to_organizer(self, manager_client, helper, sample_groups):
        response = manager_client.patch(
            ENDPOINT_FMT.format(user_id=helper.id),
            data={"role": "ORGANIZER"},
            format="json",
        )
        assert response.status_code == 400
        helper.refresh_from_db()
        assert {g.name for g in helper.groups.all()} == {"HELPER"}

    def test_changing_role_clears_prior_role_only(self, manager_client, helper, sample_groups):
        from django.contrib.auth.models import Group

        unrelated, _ = Group.objects.get_or_create(name="UNRELATED")
        helper.groups.add(unrelated)

        manager_client.patch(
            ENDPOINT_FMT.format(user_id=helper.id),
            data={"role": "TRAINEE"},
            format="json",
        )
        helper.refresh_from_db()
        assert {g.name for g in helper.groups.all()} == {"TRAINEE", "UNRELATED"}

    def test_deactivates_user(self, manager_client, helper):
        response = manager_client.patch(
            ENDPOINT_FMT.format(user_id=helper.id),
            data={"is_active": False},
            format="json",
        )
        assert response.status_code == 200
        helper.refresh_from_db()
        assert helper.is_active is False

    def test_reactivates_user(self, manager_client, sample_groups):
        helper_group = next(g for g in sample_groups if g.name == "HELPER")
        user = User.objects.create_user(username="dormant", is_active=False)
        user.groups.add(helper_group)

        response = manager_client.patch(
            ENDPOINT_FMT.format(user_id=user.id),
            data={"is_active": True},
            format="json",
        )
        assert response.status_code == 200
        user.refresh_from_db()
        assert user.is_active is True

    def test_combined_role_and_active_update(self, manager_client, helper):
        response = manager_client.patch(
            ENDPOINT_FMT.format(user_id=helper.id),
            data={"role": "TRAINEE", "is_active": False},
            format="json",
        )
        assert response.status_code == 200
        helper.refresh_from_db()
        assert helper.is_active is False
        assert {g.name for g in helper.groups.all()} == {"TRAINEE"}

    def test_invalid_role_rejected(self, manager_client, helper):
        response = manager_client.patch(
            ENDPOINT_FMT.format(user_id=helper.id),
            data={"role": "NOT_A_ROLE"},
            format="json",
        )
        assert response.status_code == 400


@pytest.mark.django_db
class TestPartialUpdatePermissions:
    def test_unauthenticated_rejected(self, api_client, helper):
        response = api_client.patch(
            ENDPOINT_FMT.format(user_id=helper.id),
            data={"is_active": False},
            format="json",
        )
        assert response.status_code == 403

    def test_non_manager_rejected(self, nonadmin_client, helper):
        response = nonadmin_client.patch(
            ENDPOINT_FMT.format(user_id=helper.id),
            data={"is_active": False},
            format="json",
        )
        assert response.status_code == 403

    def test_cannot_patch_admin_user(self, manager_client, admin_user):
        """Writes are scoped to sub-org users; managers cannot deactivate or
        change the role of a superuser even by knowing the id."""
        response = manager_client.patch(
            ENDPOINT_FMT.format(user_id=admin_user.id),
            data={"is_active": False},
            format="json",
        )
        assert response.status_code == 404
        admin_user.refresh_from_db()
        assert admin_user.is_active is True

    def test_cannot_patch_user_outside_sub_org_groups(self, manager_client):
        floater = User.objects.create_user(username="floater")
        response = manager_client.patch(
            ENDPOINT_FMT.format(user_id=floater.id),
            data={"is_active": False},
            format="json",
        )
        assert response.status_code == 404

    def test_non_admin_cannot_deactivate_organizer(self, manager_client, organizer_target):
        response = manager_client.patch(
            ENDPOINT_FMT.format(user_id=organizer_target.id),
            data={"is_active": False},
            format="json",
        )
        assert response.status_code == 404
        organizer_target.refresh_from_db()
        assert organizer_target.is_active is True

    def test_non_admin_cannot_change_role_of_organizer(self, manager_client, organizer_target):
        response = manager_client.patch(
            ENDPOINT_FMT.format(user_id=organizer_target.id),
            data={"role": "HELPER"},
            format="json",
        )
        assert response.status_code == 404
        organizer_target.refresh_from_db()
        assert {g.name for g in organizer_target.groups.all()} == {"ORGANIZER"}

    def test_admin_can_deactivate_organizer(self, authenticated_client, organizer_target):
        response = authenticated_client.patch(
            ENDPOINT_FMT.format(user_id=organizer_target.id),
            data={"is_active": False},
            format="json",
        )
        assert response.status_code == 200
        organizer_target.refresh_from_db()
        assert organizer_target.is_active is False
