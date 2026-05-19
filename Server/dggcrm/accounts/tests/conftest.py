import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission

User = get_user_model()


@pytest.fixture
def api_client():
    """Returns a DRF API test client."""
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def regular_user(db):
    """Returns a regular (non-admin) user."""
    return User.objects.create_user(username="regular", password="testpass123")


@pytest.fixture
def admin_user(db):
    """Returns an admin (superuser) user."""
    return User.objects.create_superuser(username="admin", password="testpass123")


@pytest.fixture
def authenticated_client(api_client, admin_user):
    """Returns an authenticated API client with admin user."""
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def nonadmin_client(api_client, regular_user):
    """Returns an authenticated API client with regular user."""
    api_client.force_authenticate(user=regular_user)
    return api_client


@pytest.fixture
def manager_user(db, sample_groups):
    """Non-superuser with manage_users (via ORGANIZER group) plus
    view_all_contacts so promotion lookups succeed for the typical case."""
    organizer = next(g for g in sample_groups if g.name == "ORGANIZER")
    user = User.objects.create_user(username="manager", password="testpass123")
    user.groups.add(organizer)
    user.user_permissions.add(Permission.objects.get(codename="view_all_contacts"))
    return user


@pytest.fixture
def manager_client(api_client, manager_user):
    """Authenticated API client holding manage_users perm via ORGANIZER group."""
    api_client.force_authenticate(user=manager_user)
    return api_client


@pytest.fixture
def manager_user_no_contact_access(db, sample_groups):
    """Manager with manage_users but NO contact visibility. Used to verify
    that promotion respects the contact ACL."""
    organizer = next(g for g in sample_groups if g.name == "ORGANIZER")
    user = User.objects.create_user(username="limited_manager", password="testpass123")
    user.groups.add(organizer)
    return user


@pytest.fixture
def manager_client_no_contact_access(api_client, manager_user_no_contact_access):
    api_client.force_authenticate(user=manager_user_no_contact_access)
    return api_client


@pytest.fixture
def sample_group(db):
    """Returns the ORGANIZER group (created by accounts migration 0003 if missing)."""
    group, _ = Group.objects.get_or_create(name="ORGANIZER")
    return group


@pytest.fixture
def sample_groups(db):
    """Returns ORGANIZER, HELPER, TRAINEE groups (creating any that are missing)."""
    groups = []
    for name in ["ORGANIZER", "HELPER", "TRAINEE"]:
        group, _ = Group.objects.get_or_create(name=name)
        groups.append(group)
    return groups
