import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "../../../test-utils/render";
import TemplateForm, { type TemplateFormValues } from "./TemplateForm";
import { type TicketTemplate } from "@/app/components/tickets/ticket-utils";

const EMPTY_VALUES: TemplateFormValues = {
  name: "",
  ticket_type: "UNKNOWN",
  default_priority: 3,
  requires_contact: false,
  requires_event: false,
  title_template: "",
  description_template: "",
};

function makeTemplate(overrides: Partial<TicketTemplate> = {}): TicketTemplate {
  return {
    id: 1,
    name: "Welcome",
    owner_id: null,
    is_global: true,
    forked_from_id: null,
    forked_from_name: null,
    can_edit: false,
    title_template: "Hi {{contact.display_name}}",
    description_template: "Body",
    ticket_type: "INTRODUCTION",
    default_priority: 3,
    requires_contact: false,
    requires_event: false,
    created_at: "",
    modified_at: "",
    ...overrides,
  };
}

describe("TemplateForm", () => {
  it("shows the Create button in create mode", () => {
    render(
      <TemplateForm
        mode="create"
        template={null}
        initialValues={EMPTY_VALUES}
        editable
        scope="personal"
        isAdmin={false}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /create template/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it("organizer viewing shared: form is read-only, no Save or Delete", () => {
    const template = makeTemplate();
    render(
      <TemplateForm
        mode="edit"
        template={template}
        initialValues={{
          name: template.name,
          ticket_type: template.ticket_type,
          default_priority: template.default_priority,
          requires_contact: template.requires_contact,
          requires_event: template.requires_event,
          title_template: template.title_template,
          description_template: template.description_template,
        }}
        editable={false}
        scope="global"
        isAdmin={false}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it("organizer viewing own personal: Save and Delete available", () => {
    const template = makeTemplate({
      is_global: false,
      owner_id: 99,
      can_edit: true,
    });
    render(
      <TemplateForm
        mode="edit"
        template={template}
        initialValues={{
          name: template.name,
          ticket_type: template.ticket_type,
          default_priority: template.default_priority,
          requires_contact: template.requires_contact,
          requires_event: template.requires_event,
          title_template: template.title_template,
          description_template: template.description_template,
        }}
        editable
        scope="personal"
        isAdmin={false}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
  });

  it("admin viewing shared: editable and shows the downstream-fork warning", () => {
    const template = makeTemplate({ can_edit: true });
    render(
      <TemplateForm
        mode="edit"
        template={template}
        initialValues={{
          name: template.name,
          ticket_type: template.ticket_type,
          default_priority: template.default_priority,
          requires_contact: template.requires_contact,
          requires_event: template.requires_event,
          title_template: template.title_template,
          description_template: template.description_template,
        }}
        editable
        scope="global"
        isAdmin
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/will affect every organizer/i)).toBeInTheDocument();
  });

  it("admin creating shared: warning explains the template will be shared", () => {
    render(
      <TemplateForm
        mode="create"
        template={null}
        initialValues={EMPTY_VALUES}
        editable
        scope="global"
        isAdmin
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/available to every organizer/i)).toBeInTheDocument();
    expect(screen.queryByText(/will affect every organizer/i)).not.toBeInTheDocument();
  });

  it("forked-from origin line renders when forked_from_id is set", () => {
    const template = makeTemplate({
      is_global: false,
      owner_id: 99,
      can_edit: true,
      forked_from_id: 1,
      forked_from_name: "Original",
    });
    render(
      <TemplateForm
        mode="edit"
        template={template}
        initialValues={{
          name: template.name,
          ticket_type: template.ticket_type,
          default_priority: template.default_priority,
          requires_contact: template.requires_contact,
          requires_event: template.requires_event,
          title_template: template.title_template,
          description_template: template.description_template,
        }}
        editable
        scope="personal"
        isAdmin={false}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/forked from original/i)).toBeInTheDocument();
  });

  it("calls onSubmit with the current values when Save is clicked", async () => {
    const onSubmit = vi.fn();
    render(
      <TemplateForm
        mode="create"
        template={null}
        initialValues={EMPTY_VALUES}
        editable
        scope="personal"
        isAdmin={false}
        submitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/name/i), "New");
    await user.click(screen.getByRole("button", { name: /create template/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New", ticket_type: "UNKNOWN" })
    );
  });
});
