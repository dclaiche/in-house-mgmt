import pytest
from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model

from dggcrm.accounts.models import DiscordID
from dggcrm.contacts.models import Contact

User = get_user_model()
ENDPOINT = "/api/users/"


@pytest.fixture
def promotable_contact(db):
    return Contact.objects.create(
        full_name="Pat Q. Example",
        email="pat@example.test",
        discord_id="111111111111111111",
    )


@pytest.fixture
def contact_without_discord(db):
    return Contact.objects.create(full_name="No Discord", email="no@example.test")


@pytest.mark.django_db
class TestPromoteSingle:
    def test_creates_user_and_links_discord(self, manager_client, promotable_contact, sample_groups):
        response = manager_client.post(
            ENDPOINT,
            data={"contact_id": promotable_contact.id, "role": "HELPER"},
            format="json",
        )
        assert response.status_code == 201
        body = response.json()
        assert len(body["created"]) == 1
        assert body["skipped"] == []
        assert body["errors"] == []

        created = body["created"][0]
        assert created["contact_id"] == promotable_contact.id
        new_user = User.objects.get(username=created["user"]["username"])
        assert new_user.is_active is True
        assert new_user.first_name == "Pat"
        assert new_user.last_name == "Q. Example"
        assert new_user.email == promotable_contact.email
        assert {g.name for g in new_user.groups.all()} == {"HELPER"}
        assert DiscordID.objects.filter(user=new_user, discord_id=promotable_contact.discord_id).exists()

    def test_promoted_user_has_unusable_password(self, manager_client, promotable_contact, sample_groups):
        """Promoted users authenticate via Discord/email OAuth, never password.
        A usable (random) password would still satisfy authenticate() and could
        be reached via password-reset flows."""
        response = manager_client.post(
            ENDPOINT,
            data={"contact_id": promotable_contact.id, "role": "HELPER"},
            format="json",
        )
        assert response.status_code == 201
        new_user = User.objects.get(username=response.json()["created"][0]["user"]["username"])
        assert new_user.has_usable_password() is False

    def test_username_derived_from_full_name(self, manager_client, promotable_contact, sample_groups):
        response = manager_client.post(
            ENDPOINT,
            data={"contact_id": promotable_contact.id, "role": "HELPER"},
            format="json",
        )
        username = response.json()["created"][0]["user"]["username"]
        assert username == "pat-q-example"

    def test_username_collision_uses_numeric_suffix(self, manager_client, promotable_contact, sample_groups):
        User.objects.create_user(username="pat-q-example")
        response = manager_client.post(
            ENDPOINT,
            data={"contact_id": promotable_contact.id, "role": "HELPER"},
            format="json",
        )
        username = response.json()["created"][0]["user"]["username"]
        assert username == "pat-q-example-2"

    def test_rejects_contact_without_discord_id(self, manager_client, contact_without_discord, sample_groups):
        response = manager_client.post(
            ENDPOINT,
            data={"contact_id": contact_without_discord.id, "role": "HELPER"},
            format="json",
        )
        assert response.status_code == 201
        body = response.json()
        assert body["created"] == []
        assert body["skipped"] == []
        assert len(body["errors"]) == 1
        assert body["errors"][0]["errors"] == {"discord_id": ["Discord ID required."]}
        assert User.objects.filter(username__startswith="no-discord").count() == 0

    def test_skips_contact_already_linked_by_discord(self, manager_client, promotable_contact, sample_groups):
        existing = User.objects.create_user(username="alreadyhere")
        DiscordID.objects.create(user=existing, discord_id=promotable_contact.discord_id, active=True)

        response = manager_client.post(
            ENDPOINT,
            data={"contact_id": promotable_contact.id, "role": "HELPER"},
            format="json",
        )
        body = response.json()
        assert body["created"] == []
        assert len(body["skipped"]) == 1
        assert body["skipped"][0]["reason"] == "already_a_user"

    def test_does_not_skip_on_email_collision_alone(self, manager_client, promotable_contact, sample_groups):
        """Discord ID is the ONLY identity match; matching email shouldn't block.
        Promotion still proceeds, but the new user's email is blanked so the
        OAuth adapter's User.email fallback can't attach a later social login
        to the wrong account."""
        other = User.objects.create_user(username="other", email=promotable_contact.email)
        EmailAddress.objects.create(
            user=other,
            email=promotable_contact.email,
            primary=True,
            verified=True,
        )

        response = manager_client.post(
            ENDPOINT,
            data={"contact_id": promotable_contact.id, "role": "HELPER"},
            format="json",
        )
        body = response.json()
        assert len(body["created"]) == 1
        assert body["skipped"] == []
        new_username = body["created"][0]["user"]["username"]
        new_user = User.objects.get(username=new_username)
        assert new_user.email == ""
        assert not EmailAddress.objects.filter(user=new_user).exists()
        # The other user's email/EmailAddress remain untouched.
        other.refresh_from_db()
        assert other.email == promotable_contact.email

    def test_does_not_collide_with_orphan_verified_emailaddress(
        self, manager_client, promotable_contact, sample_groups
    ):
        """allauth allows a User with blank User.email to still own a verified
        EmailAddress, and that address also acts as identity for OAuth. The
        promotion path must skip attaching the email in this case — otherwise
        the EmailAddress.create() at the end of _promote_one would crash on
        allauth's unique_verified_email constraint."""
        other = User.objects.create_user(username="other")  # User.email is ""
        EmailAddress.objects.create(
            user=other,
            email=promotable_contact.email,
            primary=True,
            verified=True,
        )

        response = manager_client.post(
            ENDPOINT,
            data={"contact_id": promotable_contact.id, "role": "HELPER"},
            format="json",
        )
        assert response.status_code == 201
        body = response.json()
        assert len(body["created"]) == 1
        new_username = body["created"][0]["user"]["username"]
        new_user = User.objects.get(username=new_username)
        assert new_user.email == ""
        assert not EmailAddress.objects.filter(user=new_user).exists()

    def test_missing_contact_returns_error_row(self, manager_client, sample_groups):
        response = manager_client.post(
            ENDPOINT,
            data={"contact_id": 999999, "role": "HELPER"},
            format="json",
        )
        body = response.json()
        assert body["created"] == []
        assert len(body["errors"]) == 1
        assert body["errors"][0]["errors"] == {"contact_id": ["Contact not found."]}


@pytest.mark.django_db
class TestPromoteBulk:
    def test_list_body_promotes_all_eligible(self, manager_client, sample_groups):
        a = Contact.objects.create(full_name="Alice A", email="a@x.test", discord_id="100")
        b = Contact.objects.create(full_name="Bob B", email="b@x.test", discord_id="200")

        response = manager_client.post(
            ENDPOINT,
            data=[
                {"contact_id": a.id, "role": "HELPER"},
                {"contact_id": b.id, "role": "TRAINEE"},
            ],
            format="json",
        )
        body = response.json()
        assert len(body["created"]) == 2
        usernames = {row["user"]["username"] for row in body["created"]}
        assert usernames == {"alice-a", "bob-b"}

    def test_mixed_body_partitions_created_skipped_errors(self, manager_client, sample_groups):
        ok = Contact.objects.create(full_name="OK Person", email="ok@x.test", discord_id="300")
        no_dc = Contact.objects.create(full_name="No DC", email="nodc@x.test")
        already = Contact.objects.create(full_name="Already User", email="al@x.test", discord_id="400")
        existing = User.objects.create_user(username="existing")
        DiscordID.objects.create(user=existing, discord_id="400")

        response = manager_client.post(
            ENDPOINT,
            data=[
                {"contact_id": ok.id, "role": "HELPER"},
                {"contact_id": no_dc.id, "role": "HELPER"},
                {"contact_id": already.id, "role": "HELPER"},
            ],
            format="json",
        )
        body = response.json()
        assert len(body["created"]) == 1
        assert len(body["skipped"]) == 1
        assert len(body["errors"]) == 1
        assert body["created"][0]["contact_id"] == ok.id
        assert body["skipped"][0]["contact_id"] == already.id
        assert body["errors"][0]["contact_id"] == no_dc.id


@pytest.mark.django_db
class TestPromoteContactVisibility:
    """A manager with manage_users but no contact visibility cannot promote
    contacts they can't see, even by guessing the id."""

    def test_invisible_contact_returns_not_found(
        self,
        manager_client_no_contact_access,
        promotable_contact,
        sample_groups,
    ):
        response = manager_client_no_contact_access.post(
            ENDPOINT,
            data={"contact_id": promotable_contact.id, "role": "HELPER"},
            format="json",
        )
        body = response.json()
        assert body["created"] == []
        assert len(body["errors"]) == 1
        assert body["errors"][0]["errors"] == {"contact_id": ["Contact not found."]}
        # And no User was created as a side effect.
        assert not User.objects.filter(username__startswith="pat-q").exists()


@pytest.mark.django_db
class TestPromotePermissions:
    def test_unauthenticated_rejected(self, api_client, promotable_contact):
        response = api_client.post(
            ENDPOINT,
            data={"contact_id": promotable_contact.id, "role": "HELPER"},
            format="json",
        )
        assert response.status_code == 403

    def test_non_manager_authenticated_rejected(self, nonadmin_client, promotable_contact):
        response = nonadmin_client.post(
            ENDPOINT,
            data={"contact_id": promotable_contact.id, "role": "HELPER"},
            format="json",
        )
        assert response.status_code == 403

    def test_admin_can_promote(self, authenticated_client, promotable_contact, sample_groups):
        response = authenticated_client.post(
            ENDPOINT,
            data={"contact_id": promotable_contact.id, "role": "ORGANIZER"},
            format="json",
        )
        assert response.status_code == 201
        assert len(response.json()["created"]) == 1


@pytest.mark.django_db
class TestPromoteOrganizerRoleRestriction:
    def test_non_admin_manager_cannot_promote_to_organizer(self, manager_client, promotable_contact, sample_groups):
        response = manager_client.post(
            ENDPOINT,
            data={"contact_id": promotable_contact.id, "role": "ORGANIZER"},
            format="json",
        )
        body = response.json()
        assert body["created"] == []
        assert len(body["errors"]) == 1
        assert "role" in body["errors"][0]["errors"]
        assert not User.objects.filter(username__startswith="pat-q").exists()

    def test_admin_can_promote_to_organizer(self, authenticated_client, promotable_contact, sample_groups):
        response = authenticated_client.post(
            ENDPOINT,
            data={"contact_id": promotable_contact.id, "role": "ORGANIZER"},
            format="json",
        )
        body = response.json()
        assert len(body["created"]) == 1
        new_user = User.objects.get(username=body["created"][0]["user"]["username"])
        assert {g.name for g in new_user.groups.all()} == {"ORGANIZER"}
