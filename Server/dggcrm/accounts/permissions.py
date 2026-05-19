from rest_framework.permissions import BasePermission

ORGANIZER_GROUP = "ORGANIZER"
HELPER_GROUP = "HELPER"
TRAINEE_GROUP = "TRAINEE"

MANAGEABLE_USER_GROUPS = (ORGANIZER_GROUP, HELPER_GROUP, TRAINEE_GROUP)

MANAGE_USERS_PERM = "auth.manage_users"


def can_manage_users(user) -> bool:
    if not user.is_authenticated:
        return False
    return user.is_superuser or user.has_perm(MANAGE_USERS_PERM)


class CanManageUsers(BasePermission):
    def has_permission(self, request, view):
        return can_manage_users(request.user)
