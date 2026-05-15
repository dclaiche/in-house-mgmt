import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


CURRENT_USER_URL = "/api/auth/user/"


def impersonate_url(pk):
    return f"/api/management/users/{pk}/impersonate/"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _set_impersonation_session(api_client, impersonator_pk):
    """Inject _impersonator_id into the test client session."""
    session = api_client.session
    session["_impersonator_id"] = impersonator_pk
    session.save()


# ---------------------------------------------------------------------------
# POST  /api/management/users/<pk>/impersonate/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStartImpersonation:
    """POST — admin starts impersonating a user."""

    def test_admin_can_impersonate_regular_user(self, authenticated_client, regular_user):
        response = authenticated_client.post(impersonate_url(regular_user.pk))
        assert response.status_code == 200

    def test_cannot_impersonate_if_already_impersonating(self, api_client, admin_user, regular_user):
        api_client.force_authenticate(user=admin_user)
        _set_impersonation_session(api_client, admin_user.pk)

        response = api_client.post(impersonate_url(regular_user.pk))

        assert response.status_code == 400
        assert "Already impersonating" in response.json()["detail"]

    def test_cannot_impersonate_superuser(self, authenticated_client, db):
        superuser = User.objects.create_superuser(username="super2", password="pw")
        response = authenticated_client.post(impersonate_url(superuser.pk))
        assert response.status_code == 400

    def test_cannot_impersonate_yourself(self, authenticated_client, admin_user):
        response = authenticated_client.post(impersonate_url(admin_user.pk))
        assert response.status_code == 400

    def test_target_not_found_returns_404(self, authenticated_client):
        response = authenticated_client.post(impersonate_url(99999))
        assert response.status_code == 404

    def test_nonadmin_returns_403(self, nonadmin_client, regular_user):
        other = User.objects.create_user(username="other", password="pw")
        response = nonadmin_client.post(impersonate_url(other.pk))
        assert response.status_code == 403

    def test_unauthenticated_returns_403(self, api_client, regular_user):
        response = api_client.post(impersonate_url(regular_user.pk))
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# DELETE  /api/management/users/<pk>/impersonate/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStopImpersonation:
    """DELETE — stops active impersonation and restores the original admin."""

    def test_stops_impersonation_successfully(self, api_client, admin_user, regular_user):
        api_client.force_authenticate(user=regular_user)
        _set_impersonation_session(api_client, admin_user.pk)

        response = api_client.delete(impersonate_url(regular_user.pk))

        assert response.status_code == 200
        assert admin_user.username in response.json()["detail"]

    def test_returns_400_when_not_impersonating(self, api_client, regular_user):
        api_client.force_authenticate(user=regular_user)

        response = api_client.delete(impersonate_url(regular_user.pk))

        assert response.status_code == 400

    def test_returns_400_for_wrong_pk(self, api_client, admin_user, regular_user):
        other = User.objects.create_user(username="other", password="pw")
        api_client.force_authenticate(user=regular_user)
        _set_impersonation_session(api_client, admin_user.pk)

        # We're impersonating regular_user but try to DELETE with other's pk
        response = api_client.delete(impersonate_url(other.pk))

        assert response.status_code == 400

    def test_unauthenticated_returns_403(self, api_client, regular_user):
        response = api_client.delete(impersonate_url(regular_user.pk))
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# GET  /api/auth/user/  — is_impersonating flag
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCurrentUserIsImpersonating:
    """GET /api/auth/user/ — is_impersonating reflects session state."""

    def test_false_when_not_impersonating(self, api_client, regular_user):
        api_client.force_authenticate(user=regular_user)

        response = api_client.get(CURRENT_USER_URL)

        assert response.status_code == 200
        assert response.json()["is_impersonating"] is False

    def test_true_when_impersonating(self, api_client, admin_user, regular_user):
        api_client.force_authenticate(user=regular_user)
        _set_impersonation_session(api_client, admin_user.pk)

        response = api_client.get(CURRENT_USER_URL)

        assert response.status_code == 200
        assert response.json()["is_impersonating"] is True

    def test_unauthenticated_returns_403(self, api_client):
        response = api_client.get(CURRENT_USER_URL)
        assert response.status_code == 403
