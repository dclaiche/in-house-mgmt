from rest_framework import serializers

from .models import Contact, Tag, TagAssignments


class ContactSerializer(serializers.ModelSerializer):
    tags = serializers.SerializerMethodField()
    is_user = serializers.BooleanField(read_only=True, default=False)
    is_promotable = serializers.SerializerMethodField()

    class Meta:
        model = Contact
        fields = "__all__"
        read_only_fields = [
            "id",
            "created_at",
            "modified_at",
        ]

    def get_tags(self, obj):
        """Get tags for this person"""
        assigned_tags = TagAssignments.objects.filter(contact_id=obj).select_related("tag")
        return [{"id": at.tag.id, "name": at.tag.name, "color": at.tag.color} for at in assigned_tags]

    def get_is_promotable(self, obj) -> bool:
        return bool(obj.discord_id) and not getattr(obj, "is_user", False)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("discord_id") is None:
            data["discord_id"] = ""
        return data


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = "__all__"
        read_only_fields = ["id", "created_at", "modified_at"]


class TagAssignmentSerializer(serializers.ModelSerializer):
    contact_id = serializers.PrimaryKeyRelatedField(
        queryset=Contact.objects.all(),
        source="contact",
    )
    tag_name = serializers.SlugRelatedField(
        queryset=Tag.objects.all(),
        slug_field="name",
        source="tag",
    )

    class Meta:
        model = TagAssignments
        fields = [
            "id",
            "contact_id",
            "tag_name",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
        ]
