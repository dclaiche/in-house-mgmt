import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "../../../test-utils/render";
import TemplatesTable from "./TemplatesTable";
import { type TicketTemplate } from "@/app/components/tickets/ticket-utils";

function makeTemplate(overrides: Partial<TicketTemplate> = {}): TicketTemplate {
  return {
    id: 1,
    name: "Welcome",
    owner_id: null,
    is_global: true,
    forked_from_id: null,
    forked_from_name: null,
    can_edit: false,
    title_template: "",
    description_template: "",
    ticket_type: "INTRODUCTION",
    default_priority: 3,
    requires_contact: false,
    requires_event: false,
    created_at: "",
    modified_at: "",
    ...overrides,
  };
}

describe("TemplatesTable", () => {
  it("renders an empty state for shared and mine sections", () => {
    const { rerender } = render(
      <TemplatesTable templates={[]} variant="shared" onUse={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByText(/no shared templates/i)).toBeInTheDocument();

    rerender(<TemplatesTable templates={[]} variant="mine" onUse={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/no personal templates/i)).toBeInTheDocument();
  });

  it("hides edit and delete actions when can_edit is false", () => {
    render(
      <TemplatesTable
        templates={[makeTemplate({ can_edit: false })]}
        variant="shared"
        onUse={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /use/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("shows edit and delete actions when can_edit is true", () => {
    render(
      <TemplatesTable
        templates={[makeTemplate({ can_edit: true })]}
        variant="mine"
        onUse={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole("link", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("renders the forked-from origin line", () => {
    render(
      <TemplatesTable
        templates={[
          makeTemplate({
            id: 5,
            name: "My copy",
            is_global: false,
            owner_id: 7,
            forked_from_id: 1,
            forked_from_name: "Welcome",
            can_edit: true,
          }),
        ]}
        variant="mine"
        onUse={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText(/forked from welcome/i)).toBeInTheDocument();
  });

  it("renders 'forked from a deleted template' when the origin name is null", () => {
    render(
      <TemplatesTable
        templates={[
          makeTemplate({
            id: 5,
            name: "Orphan fork",
            is_global: false,
            owner_id: 7,
            forked_from_id: 999,
            forked_from_name: null,
            can_edit: true,
          }),
        ]}
        variant="mine"
        onUse={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText(/forked from a deleted template/i)).toBeInTheDocument();
  });

  it("invokes onUse with the template when the Use button is clicked", async () => {
    const onUse = vi.fn();
    const template = makeTemplate();
    render(
      <TemplatesTable templates={[template]} variant="shared" onUse={onUse} onDelete={vi.fn()} />
    );
    await userEvent.setup().click(screen.getByRole("button", { name: /use/i }));
    expect(onUse).toHaveBeenCalledWith(template);
  });
});
