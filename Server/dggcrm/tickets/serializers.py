from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from dggcrm.contacts.models import Contact
from dggcrm.events.models import Event

from .models import Ticket, TicketAsks, TicketComment, TicketStatus, TicketTemplate, TicketType
from .permissions import can_change_ticket_status
from .template_context import build_template_context, render_ticket_from_template

User = get_user_model()


def _visible_templates(request):
    """Queryset for templates the requester may load. Defaults to none when there is no request."""
    if request and request.user.is_authenticated:
        return TicketTemplate.objects.for_user(request.user)
    return TicketTemplate.objects.none()


class TicketSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_ticket_status_display", read_only=True)
    type_display = serializers.CharField(source="get_ticket_type_display", read_only=True)
    assigned_to_username = serializers.CharField(source="assigned_to.username", read_only=True)
    reported_by_username = serializers.CharField(source="reported_by.username", read_only=True)
    contact_display = serializers.CharField(source="contact", read_only=True)
    event_display = serializers.CharField(source="event", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    # Only fields that are editable by the user
    editable_fields = serializers.SerializerMethodField()
    template_id = serializers.PrimaryKeyRelatedField(
        queryset=TicketTemplate.objects.none(),
        source="template",
        write_only=True,
        required=False,
        help_text="Template ID to use for rendering title and description",
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["template_id"].queryset = _visible_templates(self.context.get("request"))

    class Meta:
        model = Ticket
        fields = "__all__"
        read_only_fields = [
            "id",
            "created_at",
            "modified_at",
            "reported_by",
            "template",
            "assigned_to",
            "ticket_status",
        ]

    def update(self, instance, validated_data):
        # Remove assigned_to and ticket_status - only editable via /assign and /status endpoints
        validated_data.pop("assigned_to", None)
        validated_data.pop("ticket_status", None)

        return super().update(instance, validated_data)

    def get_editable_fields(self, ticket):
        request = self.context.get("request")
        user = request.user if request else None

        if not user or not user.is_authenticated:
            return []

        fields = set()

        # Base rule: model-level change permission for non-field-specific edits
        # (title, description, priority, ticket_type, contact, event)
        if user.has_perm("tickets.change_ticket"):
            fields.update(
                {
                    f.name
                    for f in ticket._meta.fields
                    if f.name
                    not in {
                        "id",
                        "created_at",
                        "modified_at",
                        "reported_by",
                        "assigned_to",
                        "ticket_status",
                    }
                }
            )

        # Field-level permissions - these fields are only editable via dedicated endpoints
        # but we include them in editable_fields so the UI shows them as enabled
        if user.has_perm("tickets.assign_ticket"):
            fields.add("assigned_to")

        if can_change_ticket_status(user, ticket):
            fields.add("ticket_status")

        return sorted(fields)

    def create(self, validated_data):
        template = validated_data.pop("template", None)
        request = self.context.get("request")
        user = request.user if request else None

        if template:
            contact = validated_data.get("contact")
            event = validated_data.get("event")

            context = build_template_context(contact=contact, event=event, user=user)
            title, description = render_ticket_from_template(template, context)

            validated_data["title"] = title or validated_data.get("title", "")
            validated_data["description"] = description or validated_data.get("description", "")

            if not validated_data.get("ticket_type"):
                validated_data["ticket_type"] = template.ticket_type
            if not validated_data.get("priority"):
                validated_data["priority"] = template.default_priority

        return super().create(validated_data)


class TicketClaimSerializer(serializers.Serializer):
    pass


class TicketCommentSerializer(serializers.ModelSerializer):
    author_display = serializers.CharField(
        source="author.get_full_name",
        read_only=True,
    )

    class Meta:
        model = TicketComment
        fields = [
            "id",
            "ticket",
            "author",
            "author_display",
            "message",
            "created_at",
            "modified_at",
        ]
        read_only_fields = ["author", "created_at", "modified_at"]


class TicketTimelineSerializer(serializers.Serializer):
    type = serializers.CharField()
    created_at = serializers.DateTimeField()
    actor_display = serializers.CharField(allow_null=True)
    actor_id = serializers.IntegerField(allow_null=True)
    message = serializers.CharField(allow_null=True, required=False)
    changes = serializers.JSONField(allow_null=True, required=False)


class SaveTemplateOptionsSerializer(serializers.Serializer):
    MODE_CREATE = "create"
    MODE_UPDATE = "update"

    mode = serializers.ChoiceField(choices=[MODE_CREATE, MODE_UPDATE])
    name = serializers.CharField(required=False, allow_blank=False, max_length=100)
    target_id = serializers.IntegerField(required=False)

    def validate(self, attrs):
        if attrs["mode"] == self.MODE_CREATE and not attrs.get("name"):
            raise serializers.ValidationError({"name": "Required when mode is 'create'."})
        if attrs["mode"] == self.MODE_UPDATE and not attrs.get("target_id"):
            raise serializers.ValidationError({"target_id": "Required when mode is 'update'."})
        return attrs


class BulkTicketCreateSerializer(serializers.Serializer):
    contact_ids = serializers.ListField(
        child=serializers.IntegerField(),
        allow_empty=False,
        write_only=True,
        help_text="List of contact IDs to create tickets for",
    )
    event_id = serializers.IntegerField(required=False, allow_null=True, help_text="Optional event ID")
    ticket_type = serializers.ChoiceField(choices=TicketType.choices, required=False)
    assigned_to_id = serializers.IntegerField(required=False, allow_null=True)
    title = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    priority = serializers.ChoiceField(
        choices=Ticket.Priority.choices,
        allow_null=True,
        default=Ticket.Priority.P3,
    )
    template_id = serializers.PrimaryKeyRelatedField(
        queryset=TicketTemplate.objects.none(),
        required=False,
        allow_null=True,
        help_text="Template ID to use for rendering title and description",
    )
    save_template = SaveTemplateOptionsSerializer(required=False, allow_null=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["template_id"].queryset = _visible_templates(self.context.get("request"))

    def validate_priority(self, value):
        return value if value is not None else Ticket.Priority.P3

    def validate(self, attrs):
        template = attrs.get("template_id")
        if template:
            contact_ids = attrs.get("contact_ids", [])
            event_id = attrs.get("event_id")

            if template.requires_contact and not contact_ids:
                raise serializers.ValidationError({"contact_ids": "This template requires at least one contact."})

            if template.requires_event and not event_id:
                raise serializers.ValidationError({"event_id": "This template requires an event."})

        save_template = attrs.get("save_template")
        if save_template:
            user_id = self.context["request"].user.id
            if save_template["mode"] == SaveTemplateOptionsSerializer.MODE_UPDATE:
                target = TicketTemplate.objects.filter(id=save_template["target_id"], owner_id=user_id).first()
                if not target:
                    raise serializers.ValidationError(
                        {"save_template": "You can only update personal templates that you own."}
                    )
            elif save_template["mode"] == SaveTemplateOptionsSerializer.MODE_CREATE:
                # Reject (name, owner) collisions before the DB constraint produces a 500.
                if TicketTemplate.objects.filter(name=save_template["name"], owner_id=user_id).exists():
                    raise serializers.ValidationError(
                        {"save_template": "A personal template with this name already exists."}
                    )

        return attrs

    def create(self, validated_data):
        contact_ids = validated_data.pop("contact_ids")
        event_id = validated_data.pop("event_id", None)
        assigned_to_id = validated_data.pop("assigned_to_id", None)
        template = validated_data.pop("template_id", None)
        save_template_opts = validated_data.pop("save_template", None)

        event = Event.objects.filter(id=event_id).first() if event_id else None
        assigned_to = User.objects.filter(id=assigned_to_id).first() if assigned_to_id else None
        request_user = self.context.get("request").user if self.context.get("request") else None

        contacts = {c.id: c for c in Contact.objects.filter(id__in=contact_ids)}

        # Raw (unrendered) title/description — preserved for save_template so we
        # store the template syntax, not the per-contact rendered output.
        raw_title = validated_data.pop("title", "")
        raw_description = validated_data.pop("description", "")

        with transaction.atomic():
            tickets = []
            for contact_id in contact_ids:
                contact = contacts.get(contact_id)
                if not contact:
                    continue

                title = raw_title
                description = raw_description
                if template:
                    context = build_template_context(contact=contact, event=event, user=request_user)
                    rendered_title, rendered_description = render_ticket_from_template(template, context)
                    title = rendered_title or title
                    description = rendered_description or description

                ticket_kwargs = {
                    **validated_data,
                    "contact": contact,
                    "event": event,
                    "assigned_to": assigned_to,
                    "ticket_status": TicketStatus.OPEN if not assigned_to else TicketStatus.TODO,
                    "reported_by": request_user,
                    "template": template,
                    "title": title,
                    "description": description,
                }

                if template and "ticket_type" not in validated_data:
                    ticket_kwargs["ticket_type"] = template.ticket_type
                if template and "priority" not in validated_data:
                    ticket_kwargs["priority"] = template.default_priority

                tickets.append(Ticket(**ticket_kwargs))

            created_tickets = Ticket.objects.bulk_create(tickets)
            saved_template, template_action = self._apply_save_template(
                save_template_opts,
                raw_title=raw_title,
                raw_description=raw_description,
                ticket_type=validated_data.get("ticket_type")
                or (template.ticket_type if template else TicketType.UNKNOWN),
                priority=validated_data.get("priority", Ticket.Priority.P3),
                forked_from=template,
                request_user=request_user,
            )

        return {
            "tickets": created_tickets,
            "saved_template": saved_template,
            "template_action": template_action,
        }

    def _apply_save_template(
        self,
        opts,
        *,
        raw_title,
        raw_description,
        ticket_type,
        priority,
        forked_from,
        request_user,
    ):
        if not opts:
            return None, None

        if opts["mode"] == SaveTemplateOptionsSerializer.MODE_CREATE:
            saved = TicketTemplate.objects.create(
                name=opts["name"],
                owner=request_user,
                forked_from=forked_from,
                title_template=raw_title,
                description_template=raw_description,
                ticket_type=ticket_type,
                default_priority=priority,
                requires_contact=forked_from.requires_contact if forked_from else False,
                requires_event=forked_from.requires_event if forked_from else False,
            )
            return saved, "created"

        # MODE_UPDATE — ownership already verified in validate()
        saved = TicketTemplate.objects.get(id=opts["target_id"])
        saved.title_template = raw_title
        saved.description_template = raw_description
        saved.ticket_type = ticket_type
        saved.default_priority = priority
        saved.save()
        return saved, "updated"


class TicketTypeSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()


class TicketAskStatusSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()


class TicketAskSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketAsks
        fields = [
            "id",
            "ticket",
            "contact",
            "status",
            "created_at",
            "edited_at",
        ]
        read_only_fields = ["id", "contact", "ticket", "created_at", "edited_at"]


class TicketTemplateSerializer(serializers.ModelSerializer):
    owner_id = serializers.PrimaryKeyRelatedField(source="owner", read_only=True)
    is_global = serializers.BooleanField(required=False, default=False)
    forked_from_id = serializers.PrimaryKeyRelatedField(source="forked_from", read_only=True)
    forked_from_name = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = TicketTemplate
        fields = [
            "id",
            "name",
            "owner_id",
            "is_global",
            "forked_from_id",
            "forked_from_name",
            "can_edit",
            "title_template",
            "description_template",
            "ticket_type",
            "default_priority",
            "requires_contact",
            "requires_event",
            "created_at",
            "modified_at",
        ]
        read_only_fields = ["id", "created_at", "modified_at"]

    def get_forked_from_name(self, template):
        return template.forked_from.name if template.forked_from_id else None

    def get_can_edit(self, template):
        request = self.context.get("request")
        user = request.user if request else None
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        return template.owner_id == user.id

    def validate_is_global(self, value):
        if value and not self.context["request"].user.is_superuser:
            raise serializers.ValidationError("Only admins can create global templates.")
        return value

    def validate(self, attrs):
        # Determine the owner the row will land with so we can reject (name, owner)
        # collisions before hitting the DB constraint and producing a 500.
        user = self.context["request"].user
        if self.instance is not None:
            owner_id = self.instance.owner_id
        elif attrs.get("is_global"):
            owner_id = None
        else:
            owner_id = user.id

        name = attrs.get("name") or (self.instance.name if self.instance else None)
        if name is not None:
            qs = TicketTemplate.objects.filter(name=name, owner_id=owner_id)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                label = "global" if owner_id is None else "personal"
                raise serializers.ValidationError({"name": f"A {label} template with this name already exists."})
        return attrs

    def update(self, instance, validated_data):
        validated_data.pop("is_global", None)
        return super().update(instance, validated_data)


class AssignTicketSerializer(serializers.Serializer):
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        allow_null=True,
        help_text="User ID to assign to, or null to unassign",
    )


class StatusUpdateSerializer(serializers.Serializer):
    ticket_status = serializers.ChoiceField(
        choices=TicketStatus.choices,
        help_text="New ticket status",
    )
