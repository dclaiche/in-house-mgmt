import pytest
from django.contrib.auth import get_user_model

from dggcrm.accounts.models import DiscordID
from dggcrm.contacts.models import Contact

User = get_user_model()


def _results(response):
    data = response.json()
    if isinstance(data, list):
        return data
    return data.get("results", [])


def _by_id(rows, contact_id):
    return next(r for r in rows if r["id"] == contact_id)


@pytest.fixture
def authed_client(admin_user):
    from rest_framework.test import APIClient

    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.mark.django_db
class TestContactPromotionStateFields:
    def test_contact_without_discord_id_is_not_promotable(self, authed_client):
        Contact.objects.create(full_name="No Discord", email="no@x.test")
        response = authed_client.get("/api/contacts/")
        row = _by_id(_results(response), Contact.objects.get(full_name="No Discord").id)
        assert row["is_user"] is False
        assert row["is_promotable"] is False

    def test_contact_with_discord_id_and_no_linked_user_is_promotable(self, authed_client):
        c = Contact.objects.create(full_name="Has Discord", email="hd@x.test", discord_id="555")
        response = authed_client.get("/api/contacts/")
        row = _by_id(_results(response), c.id)
        assert row["is_user"] is False
        assert row["is_promotable"] is True

    def test_contact_whose_discord_id_is_linked_to_user_is_marked_already_a_user(self, authed_client):
        c = Contact.objects.create(full_name="Already User", email="al@x.test", discord_id="777")
        u = User.objects.create_user(username="alreadyhere")
        DiscordID.objects.create(user=u, discord_id="777", active=True)
        response = authed_client.get("/api/contacts/")
        row = _by_id(_results(response), c.id)
        assert row["is_user"] is True
        assert row["is_promotable"] is False
