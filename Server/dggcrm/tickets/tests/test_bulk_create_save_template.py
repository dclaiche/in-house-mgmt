import pytest
from django.contrib.auth.models import Permission
from rest_framework.test import APIClient

from dggcrm.contacts.models import Contact
from dggcrm.tickets.models import Ticket, TicketTemplate, TicketType


@pytest.fixture
def bulk_user(regular_user):
    regular_user.user_permissions.add(Permission.objects.get(codename="add_ticket"))
    return regular_user


@pytest.fixture
def two_contacts(db):
    return [
        Contact.objects.create(full_name="Alice Example", email="alice@example.com"),
        Contact.objects.create(full_name="Bob Example", email="bob@example.com"),
    ]


@pytest.fixture
def shared_template(db):
    return TicketTemplate.objects.create(
        name="Welcome Volunteer",
        title_template="Welcome {{contact.full_name}}!",
        description_template="Hi {{contact.full_name}}, glad to have you.",
        ticket_type=TicketType.INTRODUCTION,
        default_priority=3,
    )


@pytest.fixture
def my_template(db, regular_user):
    return TicketTemplate.objects.create(
        name="My check-in",
        owner=regular_user,
        title_template="{{contact.full_name}} — check-in",
        description_template="Just checking in.",
        ticket_type=TicketType.UNKNOWN,
        default_priority=4,
    )


@pytest.mark.django_db
class TestBulkCreateBasic:
    def setup_method(self):
        self.client = APIClient()

    def test_blank_form_no_save_template(self, bulk_user, two_contacts):
        self.client.force_authenticate(user=bulk_user)
        response = self.client.post(
            "/api/tickets/bulk/",
            {
                "contact_ids": [c.id for c in two_contacts],
                "title": "Hand-typed title",
                "description": "Hand-typed body",
                "ticket_type": TicketType.UNKNOWN,
                "priority": 3,
            },
            format="json",
        )
        assert response.status_code == 201
        assert response.data["created_count"] == 2
        assert "template" not in response.data


@pytest.mark.django_db
class TestSaveTemplateCreate:
    def setup_method(self):
        self.client = APIClient()

    def test_create_personal_from_blank_form(self, bulk_user, two_contacts):
        self.client.force_authenticate(user=bulk_user)
        response = self.client.post(
            "/api/tickets/bulk/",
            {
                "contact_ids": [c.id for c in two_contacts],
                "title": "{{contact.full_name}} — Outreach",
                "description": "Hello there",
                "ticket_type": TicketType.RECRUIT,
                "priority": 2,
                "save_template": {"mode": "create", "name": "My outreach template"},
            },
            format="json",
        )
        assert response.status_code == 201
        assert response.data["created_count"] == 2
        assert response.data["template"]["action"] == "created"

        saved = TicketTemplate.objects.get(id=response.data["template"]["id"])
        assert saved.owner_id == bulk_user.id
        assert saved.forked_from_id is None
        assert saved.title_template == "{{contact.full_name}} — Outreach"
        assert saved.description_template == "Hello there"
        assert saved.ticket_type == TicketType.RECRUIT
        assert saved.default_priority == 2

    def test_create_personal_from_shared_sets_forked_from(self, bulk_user, two_contacts, shared_template):
        self.client.force_authenticate(user=bulk_user)
        response = self.client.post(
            "/api/tickets/bulk/",
            {
                "contact_ids": [c.id for c in two_contacts],
                "template_id": shared_template.id,
                "title": "Tweaked: {{contact.full_name}}!",
                "description": "Tweaked body",
                "ticket_type": TicketType.INTRODUCTION,
                "priority": 3,
                "save_template": {"mode": "create", "name": "Welcome (my copy)"},
            },
            format="json",
        )
        assert response.status_code == 201
        assert response.data["template"]["action"] == "created"

        saved = TicketTemplate.objects.get(id=response.data["template"]["id"])
        assert saved.owner_id == bulk_user.id
        assert saved.forked_from_id == shared_template.id
        assert saved.title_template == "Tweaked: {{contact.full_name}}!"

    def test_create_mode_requires_name(self, bulk_user, two_contacts):
        self.client.force_authenticate(user=bulk_user)
        response = self.client.post(
            "/api/tickets/bulk/",
            {
                "contact_ids": [c.id for c in two_contacts],
                "title": "x",
                "description": "y",
                "ticket_type": TicketType.UNKNOWN,
                "priority": 3,
                "save_template": {"mode": "create"},
            },
            format="json",
        )
        assert response.status_code == 400
        assert "save_template" in response.data


@pytest.mark.django_db
class TestSaveTemplateUpdate:
    def setup_method(self):
        self.client = APIClient()

    def test_update_own_personal_template(self, bulk_user, two_contacts, my_template):
        self.client.force_authenticate(user=bulk_user)
        response = self.client.post(
            "/api/tickets/bulk/",
            {
                "contact_ids": [c.id for c in two_contacts],
                "template_id": my_template.id,
                "title": "Updated: {{contact.full_name}}",
                "description": "Updated body",
                "ticket_type": TicketType.UNKNOWN,
                "priority": 4,
                "save_template": {"mode": "update", "target_id": my_template.id},
            },
            format="json",
        )
        assert response.status_code == 201
        assert response.data["template"]["action"] == "updated"
        assert response.data["template"]["id"] == my_template.id

        my_template.refresh_from_db()
        assert my_template.title_template == "Updated: {{contact.full_name}}"
        assert my_template.description_template == "Updated body"

    def test_cannot_update_other_users_template(self, bulk_user, two_contacts, other_user):
        target = TicketTemplate.objects.create(name="Other's", owner=other_user, title_template="other")
        self.client.force_authenticate(user=bulk_user)
        response = self.client.post(
            "/api/tickets/bulk/",
            {
                "contact_ids": [c.id for c in two_contacts],
                "title": "x",
                "description": "y",
                "ticket_type": TicketType.UNKNOWN,
                "priority": 3,
                "save_template": {"mode": "update", "target_id": target.id},
            },
            format="json",
        )
        assert response.status_code == 400
        assert "save_template" in response.data

    def test_cannot_update_a_global_template(self, bulk_user, two_contacts, shared_template):
        self.client.force_authenticate(user=bulk_user)
        response = self.client.post(
            "/api/tickets/bulk/",
            {
                "contact_ids": [c.id for c in two_contacts],
                "template_id": shared_template.id,
                "title": "x",
                "description": "y",
                "ticket_type": TicketType.INTRODUCTION,
                "priority": 3,
                "save_template": {"mode": "update", "target_id": shared_template.id},
            },
            format="json",
        )
        assert response.status_code == 400


@pytest.mark.django_db
class TestSaveTemplateForkInheritsRequires:
    def setup_method(self):
        self.client = APIClient()

    def test_personal_fork_inherits_requires_flags(self, bulk_user, two_contacts):
        source = TicketTemplate.objects.create(
            name="Requires-contact source",
            title_template="Hi {{contact.full_name}}",
            description_template="Body",
            ticket_type=TicketType.INTRODUCTION,
            default_priority=3,
            requires_contact=True,
            requires_event=False,
        )
        self.client.force_authenticate(user=bulk_user)
        response = self.client.post(
            "/api/tickets/bulk/",
            {
                "contact_ids": [c.id for c in two_contacts],
                "template_id": source.id,
                "title": "Tweaked",
                "description": "Tweaked",
                "ticket_type": TicketType.INTRODUCTION,
                "priority": 3,
                "save_template": {"mode": "create", "name": "My copy"},
            },
            format="json",
        )
        assert response.status_code == 201
        saved = TicketTemplate.objects.get(id=response.data["template"]["id"])
        assert saved.requires_contact is True
        assert saved.requires_event is False
        assert saved.forked_from_id == source.id

    def test_blank_form_create_does_not_set_requires(self, bulk_user, two_contacts):
        self.client.force_authenticate(user=bulk_user)
        response = self.client.post(
            "/api/tickets/bulk/",
            {
                "contact_ids": [c.id for c in two_contacts],
                "title": "x",
                "description": "y",
                "ticket_type": TicketType.UNKNOWN,
                "priority": 3,
                "save_template": {"mode": "create", "name": "From scratch"},
            },
            format="json",
        )
        assert response.status_code == 201
        saved = TicketTemplate.objects.get(id=response.data["template"]["id"])
        assert saved.requires_contact is False
        assert saved.requires_event is False


@pytest.mark.django_db
class TestSaveTemplateNameCollision:
    def setup_method(self):
        self.client = APIClient()

    def test_create_with_existing_personal_name_returns_400(self, bulk_user, two_contacts):
        TicketTemplate.objects.create(name="Duplicate", owner=bulk_user, title_template="prior")
        self.client.force_authenticate(user=bulk_user)
        response = self.client.post(
            "/api/tickets/bulk/",
            {
                "contact_ids": [c.id for c in two_contacts],
                "title": "x",
                "description": "y",
                "ticket_type": TicketType.UNKNOWN,
                "priority": 3,
                "save_template": {"mode": "create", "name": "Duplicate"},
            },
            format="json",
        )
        assert response.status_code == 400
        assert "save_template" in response.data


@pytest.mark.django_db
class TestTemplateIdVisibility:
    def setup_method(self):
        self.client = APIClient()

    def test_cannot_render_with_another_users_personal_template(self, bulk_user, two_contacts, other_user):
        other_template = TicketTemplate.objects.create(
            name="Other personal",
            owner=other_user,
            title_template="Hi {{contact.full_name}}",
            ticket_type=TicketType.RECRUIT,
            default_priority=2,
        )
        self.client.force_authenticate(user=bulk_user)
        response = self.client.post(
            "/api/tickets/bulk/",
            {
                "contact_ids": [c.id for c in two_contacts],
                "template_id": other_template.id,
                "title": "x",
                "description": "y",
                "ticket_type": TicketType.UNKNOWN,
                "priority": 3,
            },
            format="json",
        )
        assert response.status_code == 400
        assert "template_id" in response.data


@pytest.mark.django_db
class TestSaveTemplateTransaction:
    def setup_method(self):
        self.client = APIClient()

    def test_template_not_saved_if_validation_fails(self, bulk_user):
        """Bad contact_ids → request fails with no template side-effect."""
        self.client.force_authenticate(user=bulk_user)
        response = self.client.post(
            "/api/tickets/bulk/",
            {
                "contact_ids": [],
                "title": "x",
                "description": "y",
                "ticket_type": TicketType.UNKNOWN,
                "priority": 3,
                "save_template": {"mode": "create", "name": "Should not exist"},
            },
            format="json",
        )
        assert response.status_code == 400
        assert not TicketTemplate.objects.filter(name="Should not exist").exists()
        assert Ticket.objects.count() == 0
