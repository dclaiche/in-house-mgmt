import pytest
from rest_framework.test import APIClient

from dggcrm.tickets.models import TicketTemplate


@pytest.fixture
def global_template(db):
    return TicketTemplate.objects.create(
        name="Welcome Volunteer",
        title_template="Welcome {{contact.display_name}}!",
        description_template="Hi {{contact.display_name}}",
    )


@pytest.fixture
def my_template(db, regular_user):
    return TicketTemplate.objects.create(
        name="My personal template",
        owner=regular_user,
        title_template="Hello {{contact.display_name}}",
    )


@pytest.fixture
def other_users_template(db, other_user):
    return TicketTemplate.objects.create(
        name="Other user's template",
        owner=other_user,
        title_template="Other",
    )


@pytest.mark.django_db
class TestTemplateVisibility:
    def setup_method(self):
        self.client = APIClient()

    def test_organizer_sees_globals_and_own(self, regular_user, global_template, my_template, other_users_template):
        self.client.force_authenticate(user=regular_user)
        response = self.client.get("/api/ticket-templates/")
        assert response.status_code == 200
        ids = {t["id"] for t in response.data["results"]}
        assert global_template.id in ids
        assert my_template.id in ids
        assert other_users_template.id not in ids

    def test_admin_does_not_see_other_users_personals(self, admin_user, global_template, other_users_template):
        admin_template = TicketTemplate.objects.create(
            name="Admin's personal",
            owner=admin_user,
            title_template="Admin",
        )
        self.client.force_authenticate(user=admin_user)
        response = self.client.get("/api/ticket-templates/")
        assert response.status_code == 200
        ids = {t["id"] for t in response.data["results"]}
        assert global_template.id in ids
        assert admin_template.id in ids
        assert other_users_template.id not in ids

    def test_retrieving_other_users_personal_is_404(self, regular_user, other_users_template):
        self.client.force_authenticate(user=regular_user)
        response = self.client.get(f"/api/ticket-templates/{other_users_template.id}/")
        assert response.status_code == 404


@pytest.mark.django_db
class TestTemplateCreate:
    def setup_method(self):
        self.client = APIClient()

    def test_organizer_create_forces_owner_self(self, regular_user):
        self.client.force_authenticate(user=regular_user)
        response = self.client.post(
            "/api/ticket-templates/",
            {"name": "My new template", "title_template": "hi"},
            format="json",
        )
        assert response.status_code == 201
        assert response.data["owner_id"] == regular_user.id
        assert response.data["is_global"] is False

    def test_organizer_cannot_force_global(self, regular_user):
        self.client.force_authenticate(user=regular_user)
        response = self.client.post(
            "/api/ticket-templates/",
            {"name": "Sneaky global", "is_global": True, "title_template": "x"},
            format="json",
        )
        assert response.status_code == 400
        assert "is_global" in response.data
        assert not TicketTemplate.objects.filter(name="Sneaky global").exists()

    def test_organizer_explicit_is_global_false_creates_personal(self, regular_user):
        self.client.force_authenticate(user=regular_user)
        response = self.client.post(
            "/api/ticket-templates/",
            {"name": "Explicit personal", "is_global": False, "title_template": "x"},
            format="json",
        )
        assert response.status_code == 201
        assert response.data["owner_id"] == regular_user.id
        assert response.data["is_global"] is False

    def test_admin_can_create_global(self, admin_user):
        self.client.force_authenticate(user=admin_user)
        response = self.client.post(
            "/api/ticket-templates/",
            {"name": "Admin global", "is_global": True, "title_template": "x"},
            format="json",
        )
        assert response.status_code == 201
        assert response.data["owner_id"] is None
        assert response.data["is_global"] is True

    def test_admin_create_without_is_global_creates_personal(self, admin_user):
        self.client.force_authenticate(user=admin_user)
        response = self.client.post(
            "/api/ticket-templates/",
            {"name": "Admin personal", "title_template": "x"},
            format="json",
        )
        assert response.status_code == 201
        assert response.data["owner_id"] == admin_user.id


@pytest.mark.django_db
class TestTemplateUpdateDelete:
    def setup_method(self):
        self.client = APIClient()

    def test_organizer_can_update_own_personal(self, regular_user, my_template):
        self.client.force_authenticate(user=regular_user)
        response = self.client.patch(
            f"/api/ticket-templates/{my_template.id}/",
            {"title_template": "Updated"},
            format="json",
        )
        assert response.status_code == 200
        my_template.refresh_from_db()
        assert my_template.title_template == "Updated"

    def test_organizer_cannot_update_global(self, regular_user, global_template):
        self.client.force_authenticate(user=regular_user)
        response = self.client.patch(
            f"/api/ticket-templates/{global_template.id}/",
            {"title_template": "Hijacked"},
            format="json",
        )
        assert response.status_code == 403

    def test_organizer_cannot_delete_global(self, regular_user, global_template):
        self.client.force_authenticate(user=regular_user)
        response = self.client.delete(f"/api/ticket-templates/{global_template.id}/")
        assert response.status_code == 403

    def test_organizer_cannot_promote_own_personal_to_global(self, regular_user, my_template):
        self.client.force_authenticate(user=regular_user)
        response = self.client.patch(
            f"/api/ticket-templates/{my_template.id}/",
            {"is_global": True},
            format="json",
        )
        assert response.status_code == 400
        assert "is_global" in response.data
        my_template.refresh_from_db()
        assert my_template.owner_id == regular_user.id

    def test_admin_can_update_global(self, admin_user, global_template):
        self.client.force_authenticate(user=admin_user)
        response = self.client.patch(
            f"/api/ticket-templates/{global_template.id}/",
            {"title_template": "Admin edit"},
            format="json",
        )
        assert response.status_code == 200

    def test_admin_can_delete_global(self, admin_user, global_template):
        self.client.force_authenticate(user=admin_user)
        response = self.client.delete(f"/api/ticket-templates/{global_template.id}/")
        assert response.status_code == 204
        assert not TicketTemplate.objects.filter(id=global_template.id).exists()


@pytest.mark.django_db
class TestTemplateConstraints:
    def test_two_users_can_share_personal_name(self, regular_user, other_user):
        TicketTemplate.objects.create(name="Same", owner=regular_user, title_template="a")
        TicketTemplate.objects.create(name="Same", owner=other_user, title_template="b")

    def test_global_and_personal_can_share_name(self, regular_user, global_template):
        TicketTemplate.objects.create(name=global_template.name, owner=regular_user, title_template="copy")


@pytest.mark.django_db
class TestNameCollisionReturns400:
    def setup_method(self):
        self.client = APIClient()

    def test_organizer_cannot_create_duplicate_personal_name(self, regular_user, my_template):
        self.client.force_authenticate(user=regular_user)
        response = self.client.post(
            "/api/ticket-templates/",
            {"name": my_template.name, "title_template": "dup"},
            format="json",
        )
        assert response.status_code == 400
        assert "name" in response.data

    def test_admin_cannot_create_duplicate_global_name(self, admin_user, global_template):
        self.client.force_authenticate(user=admin_user)
        response = self.client.post(
            "/api/ticket-templates/",
            {"name": global_template.name, "is_global": True, "title_template": "dup"},
            format="json",
        )
        assert response.status_code == 400
        assert "name" in response.data

    def test_renaming_to_existing_personal_name_returns_400(self, regular_user):
        TicketTemplate.objects.create(name="A", owner=regular_user, title_template="a")
        b = TicketTemplate.objects.create(name="B", owner=regular_user, title_template="b")
        self.client.force_authenticate(user=regular_user)
        response = self.client.patch(f"/api/ticket-templates/{b.id}/", {"name": "A"}, format="json")
        assert response.status_code == 400
        assert "name" in response.data

    def test_two_users_can_keep_same_personal_name(self, regular_user, other_user):
        TicketTemplate.objects.create(name="Same", owner=other_user, title_template="x")
        self.client.force_authenticate(user=regular_user)
        response = self.client.post(
            "/api/ticket-templates/",
            {"name": "Same", "title_template": "y"},
            format="json",
        )
        assert response.status_code == 201


@pytest.mark.django_db
class TestForkedFromSurvival:
    def test_fork_survives_upstream_delete(self, regular_user, global_template):
        fork = TicketTemplate.objects.create(
            name="My copy",
            owner=regular_user,
            forked_from=global_template,
            title_template="forked",
        )
        global_template.delete()
        fork.refresh_from_db()
        assert fork.forked_from_id is None


@pytest.mark.django_db
class TestSerializerCanEdit:
    def setup_method(self):
        self.client = APIClient()

    def test_can_edit_true_for_owner(self, regular_user, my_template):
        self.client.force_authenticate(user=regular_user)
        response = self.client.get(f"/api/ticket-templates/{my_template.id}/")
        assert response.status_code == 200
        assert response.data["can_edit"] is True

    def test_can_edit_false_for_organizer_on_global(self, regular_user, global_template):
        self.client.force_authenticate(user=regular_user)
        response = self.client.get(f"/api/ticket-templates/{global_template.id}/")
        assert response.status_code == 200
        assert response.data["can_edit"] is False

    def test_can_edit_true_for_admin_on_global(self, admin_user, global_template):
        self.client.force_authenticate(user=admin_user)
        response = self.client.get(f"/api/ticket-templates/{global_template.id}/")
        assert response.status_code == 200
        assert response.data["can_edit"] is True
