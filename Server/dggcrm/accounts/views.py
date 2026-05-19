from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount
from auditlog.models import LogEntry
from django.contrib.auth import get_user_model, login
from django.contrib.auth.models import Group
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Q
from rest_framework import filters, generics, mixins, permissions, status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet

from config.pagination import StandardPagination
from dggcrm.contacts.models import Contact
from dggcrm.contacts.permissions import get_contact_visibility_filter
from dggcrm.discord.permissions import DISCORD_BOT_GROUP

from .models import DiscordID, UserPreferences
from .permissions import (
    MANAGEABLE_USER_GROUPS,
    ORGANIZER_GROUP,
    CanManageUsers,
    can_manage_users,
)
from .serializers import (
    ContactPromotionSerializer,
    DiscordIDSerializer,
    GroupSerializer,
    ManagedUserSerializer,
    SocialAccountSerializer,
    UpdateUserSerializer,
    UserDetailsSerializer,
    UserPreferencesSerializer,
    UserRoleUpdateSerializer,
    UserSearchSerializer,
    UserSerializer,
    split_full_name,
    unique_username_from_full_name,
)


class UserViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    GenericViewSet,
):
    """
    Unified user endpoint at /api/users/.

    - list/retrieve are open to any authenticated user (preserves the
      assignee-picker behavior of the former UserSearchView). Pass
      `?groups=HELPER,TRAINEE,ORGANIZER` to restrict the list to specific
      groups (the /users management screen uses this).
    - create / partial_update require the `manage_users` perm. Writes are
      additionally restricted to non-admin sub-org users so an organizer
      cannot deactivate an admin.
    - `manage_users` requesters get the richer ManagedUserSerializer shape;
      everyone else gets the lightweight UserSearchSerializer.
    """

    pagination_class = StandardPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["username", "first_name", "last_name"]
    ordering_fields = ["username", "first_name", "last_name"]
    ordering = ["username"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update"):
            return [IsAuthenticated(), CanManageUsers()]
        return [IsAuthenticated()]

    def get_queryset(self):
        User = get_user_model()
        qs = User.objects.all()

        if self.action in ("update", "partial_update"):
            qs = (
                qs.exclude(is_superuser=True)
                .exclude(groups__name=DISCORD_BOT_GROUP)
                .filter(groups__name__in=MANAGEABLE_USER_GROUPS)
                .distinct()
            )
            if not self.request.user.is_superuser:
                qs = qs.exclude(groups__name=ORGANIZER_GROUP)
        else:
            params = self.request.query_params
            groups_param = params.get("groups")
            include_admins = params.get("include_admins") == "true"
            if groups_param or include_admins:
                q = Q()
                if groups_param:
                    requested = [g.strip() for g in groups_param.split(",") if g.strip()]
                    if requested:
                        q |= Q(groups__name__in=requested)
                if include_admins:
                    q |= Q(is_superuser=True)
                qs = qs.filter(q).distinct()

        if can_manage_users(self.request.user):
            qs = qs.prefetch_related("discord_ids", "groups")
        return qs.order_by("username")

    def get_serializer_class(self):
        if self.action == "create":
            return ContactPromotionSerializer
        if self.action in ("update", "partial_update"):
            return UserRoleUpdateSerializer
        if can_manage_users(self.request.user):
            return ManagedUserSerializer
        return UserSearchSerializer

    def create(self, request, *args, **kwargs):
        items = request.data if isinstance(request.data, list) else [request.data]

        created, skipped, errors = [], [], []
        with transaction.atomic():
            for index, item in enumerate(items):
                result = self._promote_one(item, index)
                bucket = result.pop("_bucket")
                if bucket == "created":
                    created.append(result)
                elif bucket == "skipped":
                    skipped.append(result)
                else:
                    errors.append(result)

        return Response(
            {"created": created, "skipped": skipped, "errors": errors},
            status=status.HTTP_201_CREATED,
        )

    def _promote_one(self, item, index):
        serializer = ContactPromotionSerializer(data=item, context={"user": self.request.user})
        if not serializer.is_valid():
            return {"_bucket": "errors", "index": index, "input": item, "errors": serializer.errors}

        contact_id = serializer.validated_data["contact_id"]
        role = serializer.validated_data["role"]

        visibility = get_contact_visibility_filter(self.request.user)
        try:
            contact = Contact.objects.filter(visibility).distinct().get(pk=contact_id)
        except Contact.DoesNotExist:
            return {
                "_bucket": "errors",
                "index": index,
                "contact_id": contact_id,
                "errors": {"contact_id": ["Contact not found."]},
            }

        if not contact.discord_id:
            return {
                "_bucket": "errors",
                "index": index,
                "contact_id": contact_id,
                "errors": {"discord_id": ["Discord ID required."]},
            }

        if DiscordID.objects.filter(discord_id=contact.discord_id).exists():
            return {
                "_bucket": "skipped",
                "index": index,
                "contact_id": contact_id,
                "reason": "already_a_user",
            }

        first_name, last_name = split_full_name(contact.full_name)
        username = unique_username_from_full_name(contact.full_name)

        User = get_user_model()
        # The OAuth adapter resolves non-Discord logins via both User.email
        # and verified EmailAddress rows, so either kind of collision would
        # let a future social login attach to the wrong account. A verified
        # EmailAddress would also collide with allauth's unique_verified_email
        # constraint when we create the row below. Skip attaching the email
        # if any existing user already owns it through either path.
        attach_email = bool(contact.email) and not (
            User.objects.filter(email=contact.email).exists()
            or EmailAddress.objects.filter(email=contact.email, verified=True).exists()
        )

        user = User.objects.create(
            username=username,
            email=contact.email if attach_email else "",
            first_name=first_name,
            last_name=last_name,
            is_active=True,
        )

        user.set_unusable_password()
        user.save(update_fields=["password"])

        if attach_email:
            EmailAddress.objects.create(
                user=user,
                email=contact.email,
                primary=True,
                verified=True,
            )
        DiscordID.objects.create(user=user, discord_id=contact.discord_id, active=True)
        group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(group)

        return {
            "_bucket": "created",
            "index": index,
            "contact_id": contact_id,
            "user": ManagedUserSerializer(user).data,
        }

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = UserRoleUpdateSerializer(instance, data=request.data, partial=True, context={"user": request.user})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ManagedUserSerializer(instance).data, status=status.HTTP_200_OK)


class SocialConnectionDeleteView(generics.DestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SocialAccountSerializer
    lookup_field = "provider"

    def get_queryset(self):
        return SocialAccount.objects.filter(user=self.request.user)


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserDetailsSerializer(request.user)
        data = serializer.data
        data["is_impersonating"] = "_impersonator_id" in request.session
        return Response(data)

    def patch(self, request):
        serializer = UserDetailsSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class UserPreferencesView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        preferences, _ = UserPreferences.objects.get_or_create(user=request.user)
        serializer = UserPreferencesSerializer(
            preferences,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class GroupListView(generics.ListAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = GroupSerializer
    queryset = Group.objects.exclude(name=DISCORD_BOT_GROUP).order_by("name")
    pagination_class = None


class ManagedUserViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    GenericViewSet,
):
    permission_classes = [IsAdminUser]
    serializer_class = ManagedUserSerializer
    pagination_class = StandardPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ["username", "first_name", "last_name"]
    ordering_fields = ["username", "first_name", "last_name"]
    ordering = ["username"]

    def get_queryset(self):
        User = get_user_model()
        return User.objects.all().order_by("username").prefetch_related("discord_ids")

    def get_serializer_class(self):
        if self.action == "create":
            return UserSerializer
        if self.action in ["partial_update", "update"]:
            return UpdateUserSerializer
        return ManagedUserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            ManagedUserSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = UpdateUserSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        new_email = serializer.validated_data.get("email")
        if "email" in request.data:
            has_discord = DiscordID.objects.filter(user=instance).exists()
            if not has_discord and (new_email is None or new_email == ""):
                return Response(
                    {"detail": ["Cannot remove email. User would have no authentication method."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            instance.email = new_email if new_email else ""
            instance.save(update_fields=["email"])
            EmailAddress.objects.filter(user=instance, primary=True).delete()
            if new_email:
                EmailAddress.objects.create(
                    user=instance,
                    email=new_email,
                    primary=True,
                    verified=True,
                )

        new_discord_id = serializer.validated_data.get("discord_id")
        if "discord_id" in request.data:
            has_email = EmailAddress.objects.filter(user=instance, primary=True).exists()
            if not has_email and (new_discord_id is None or new_discord_id.strip() == ""):
                return Response(
                    {"detail": ["Cannot remove Discord ID. User would have no authentication method."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            DiscordID.objects.filter(user=instance).delete()
            if new_discord_id.strip():
                DiscordID.objects.create(
                    user=instance,
                    discord_id=new_discord_id.strip(),
                    active=True,
                )

        groups = serializer.validated_data.get("groups")
        if groups is not None:
            instance.groups.clear()
            for group_name in groups:
                try:
                    group = Group.objects.get(name=group_name)
                    instance.groups.add(group)
                except Group.DoesNotExist:
                    pass

        return Response(ManagedUserSerializer(instance).data, status=status.HTTP_200_OK)


class ToggleUserActiveView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk=None):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if user.id == request.user.id:
            return Response(
                {"detail": "You cannot disable yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_active = not user.is_active
        user.save(update_fields=["is_active"])

        return Response(
            {"id": user.id, "username": user.username, "is_active": user.is_active},
            status=status.HTTP_200_OK,
        )


class DiscordIDViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    GenericViewSet,
):
    permission_classes = [IsAdminUser]
    serializer_class = DiscordIDSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        user_id = self.request.query_params.get("user")
        if user_id:
            return DiscordID.objects.filter(user_id=user_id)
        return DiscordID.objects.all()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        user = instance.user
        has_email = EmailAddress.objects.filter(user=user, primary=True).exists()
        has_other_discord = DiscordID.objects.filter(user=user).exclude(pk=instance.pk).exists()
        if not has_email and not has_other_discord:
            return Response(
                {"detail": ["Cannot remove Discord ID. User would have no authentication method."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ImpersonateView(APIView):
    def get_permissions(self):
        if self.request.method in ("DELETE",):
            return [IsAuthenticated()]
        return [IsAdminUser()]

    def post(self, request, pk=None):
        if "_impersonator_id" in request.session:
            return Response(
                {"detail": "Already impersonating a user. Stop impersonation first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        User = get_user_model()

        try:
            target_user = User.objects.get(pk=pk)
            if target_user.is_superuser:
                return Response({"detail": "You may not impersonate a superuser."}, status=status.HTTP_400_BAD_REQUEST)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if target_user.pk == request.user.pk:
            return Response(
                {"detail": "You cannot impersonate yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        impersonator_pk = request.user.pk
        impersonator = request.user
        login(request, target_user, backend="django.contrib.auth.backends.ModelBackend")
        request.session["_impersonator_id"] = impersonator_pk

        LogEntry.objects.create(
            content_type=ContentType.objects.get_for_model(User),
            object_pk=str(target_user.pk),
            object_repr=target_user.username,
            action=LogEntry.Action.ACCESS,
            actor=impersonator,
            additional_data={"impersonation": "started", "impersonator": impersonator.username},
        )

        return Response({"detail": f"Now impersonating {target_user.username}."})

    def delete(self, request, pk=None):
        impersonator_id = request.session.get("_impersonator_id")
        if impersonator_id is None:
            return Response(
                {"detail": "Not currently impersonating anyone."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.user.pk != pk:
            return Response(
                {"detail": "Not impersonating this user."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        User = get_user_model()
        try:
            original_user = User.objects.get(pk=impersonator_id)
        except User.DoesNotExist:
            return Response({"detail": "Original user not found."}, status=status.HTTP_404_NOT_FOUND)

        if not original_user.is_staff:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        impersonated_user = request.user
        # login() flushes the session (different user), so _impersonator_id is already gone
        login(request, original_user, backend="django.contrib.auth.backends.ModelBackend")

        LogEntry.objects.create(
            content_type=ContentType.objects.get_for_model(User),
            object_pk=str(impersonated_user.pk),
            object_repr=impersonated_user.username,
            action=LogEntry.Action.ACCESS,
            actor=original_user,
            additional_data={"impersonation": "stopped", "impersonator": original_user.username},
        )

        return Response({"detail": f"Stopped impersonating. Returned to {original_user.username}."})
