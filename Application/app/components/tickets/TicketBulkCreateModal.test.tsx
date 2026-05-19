import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, userEvent, waitFor } from "../../../test-utils/render";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { TicketBulkCreateModal } from "./TicketBulkCreateModal";
import { type TicketTemplate } from "./ticket-utils";

function makeTemplate(overrides: Partial<TicketTemplate> = {}): TicketTemplate {
  return {
    id: 10,
    name: "Welcome",
    owner_id: null,
    is_global: true,
    forked_from_id: null,
    forked_from_name: null,
    can_edit: false,
    title_template: "Hi {{contact.display_name}}",
    description_template: "Welcome body",
    ticket_type: "INTRODUCTION",
    default_priority: 3,
    requires_contact: false,
    requires_event: false,
    created_at: "",
    modified_at: "",
    ...overrides,
  };
}

const server = setupServer();
let bulkPayloads: Array<Record<string, unknown>> = [];

beforeEach(() => {
  bulkPayloads = [];
  server.listen({ onUnhandledRequest: "warn" });
  server.use(
    http.get("/api/contacts/:id/", ({ params }) =>
      HttpResponse.json({
        id: Number(params.id),
        full_name: "Alice",
        discord_id: "abc",
        email: "",
        phone: "",
      })
    ),
    http.post("/api/tickets/bulk/", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      bulkPayloads.push(body);
      return HttpResponse.json({ created_count: 1 }, { status: 201 });
    })
  );
});

afterEach(() => {
  server.close();
});

const defaultProps = {
  opened: true,
  onClose: vi.fn(),
  contactIds: [42],
  onSuccess: vi.fn(),
};

describe("TicketBulkCreateModal save-as-template", () => {
  it("does not show the save-as-template block when the form is untouched", async () => {
    const template = makeTemplate();
    render(<TicketBulkCreateModal {...defaultProps} initialTemplate={template} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Hi {{contact.display_name}}")).toBeInTheDocument();
    });
    expect(screen.queryByText(/save as a new personal template/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/update.*with these edits/i)).not.toBeInTheDocument();
  });

  it("blank form: typing a title surfaces the save-as-template option with a seeded name", async () => {
    const user = userEvent.setup();
    render(<TicketBulkCreateModal {...defaultProps} />);

    const titleInput = screen.getByLabelText(/title template/i);
    await user.type(titleInput, "New thing");

    expect(screen.getByText(/save as a new personal template/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/name this template/i)).toHaveValue("New thing");
  });

  it("shared loaded + edited: submits save_template with mode=create and seeded copy name", async () => {
    const user = userEvent.setup();
    const template = makeTemplate({ id: 10, name: "Welcome", is_global: true });
    render(<TicketBulkCreateModal {...defaultProps} initialTemplate={template} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Hi {{contact.display_name}}")).toBeInTheDocument();
    });

    const titleInput = screen.getByLabelText(/title template/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Tweaked");

    const checkbox = screen.getByRole("checkbox", { name: /save as a new personal template/i });
    await user.click(checkbox);
    expect(screen.getByPlaceholderText(/name this template/i)).toHaveValue("Welcome (my copy)");

    await user.click(screen.getByRole("button", { name: /create tickets/i }));

    await waitFor(() => {
      expect(bulkPayloads).toHaveLength(1);
    });
    expect(bulkPayloads[0]).toMatchObject({
      template_id: 10,
      save_template: { mode: "create", name: "Welcome (my copy)" },
    });
  });

  it("personal loaded + edited: shows Update label and submits mode=update with target_id", async () => {
    const user = userEvent.setup();
    const template = makeTemplate({
      id: 22,
      name: "My check-in",
      is_global: false,
      owner_id: 7,
      can_edit: true,
    });
    render(<TicketBulkCreateModal {...defaultProps} initialTemplate={template} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Hi {{contact.display_name}}")).toBeInTheDocument();
    });

    const titleInput = screen.getByLabelText(/title template/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Updated");

    expect(screen.getByText(/update/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/name this template/i)).not.toBeInTheDocument();

    const checkbox = screen.getByRole("checkbox", { name: /update/i });
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: /create tickets/i }));

    await waitFor(() => {
      expect(bulkPayloads).toHaveLength(1);
    });
    expect(bulkPayloads[0]).toMatchObject({
      template_id: 22,
      save_template: { mode: "update", target_id: 22 },
    });
  });

  it("does not include save_template when the checkbox is left off", async () => {
    const user = userEvent.setup();
    render(<TicketBulkCreateModal {...defaultProps} />);

    const titleInput = screen.getByLabelText(/title template/i);
    await user.type(titleInput, "Just one-off");

    await user.click(screen.getByRole("button", { name: /create tickets/i }));

    await waitFor(() => {
      expect(bulkPayloads).toHaveLength(1);
    });
    expect(bulkPayloads[0]).not.toHaveProperty("save_template");
  });
});
