import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "../../../test-utils/render";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const { mockUserState } = vi.hoisted(() => ({
  mockUserState: {
    user: {
      id: 99,
      username: "manager",
      email: "manager@example.com",
      first_name: "Manager",
      last_name: "Person",
      groups: ["ORGANIZER"] as string[],
      email_addresses: [],
      social_accounts: [],
      timezone: "",
      can_manage_users: true,
    },
  },
}));

vi.mock("@/app/components/provider/UserContext", () => ({
  useUser: () => ({ user: mockUserState.user, loading: false, refresh: vi.fn() }),
}));

import PromoteContactsModal from "./PromoteContactsModal";

const baseContacts = [
  {
    id: 1,
    full_name: "Promotable Pat",
    email: "pat@example.com",
    phone: "",
    discord_id: "111",
    tags: [],
    is_user: false,
    is_promotable: true,
  },
  {
    id: 2,
    full_name: "Already User",
    email: "al@example.com",
    phone: "",
    discord_id: "222",
    tags: [],
    is_user: true,
    is_promotable: false,
  },
  {
    id: 3,
    full_name: "Discordless Drew",
    email: "drew@example.com",
    phone: "",
    discord_id: "",
    tags: [],
    is_user: false,
    is_promotable: false,
  },
];

let promotionBodies: unknown[] = [];

const server = setupServer();

beforeEach(() => {
  promotionBodies = [];
  server.listen({ onUnhandledRequest: "warn" });
  server.use(
    http.get("/api/contacts/", () =>
      HttpResponse.json({
        count: baseContacts.length,
        next: null,
        previous: null,
        results: baseContacts,
      })
    ),
    http.get("/api/tags/", () => HttpResponse.json([])),
    http.get("/api/event-categories/", () => HttpResponse.json({ results: [] })),
    http.post("/api/users/", async ({ request }) => {
      const body = await request.json();
      promotionBodies.push(body);
      return HttpResponse.json({
        created: [{ contact_id: 1, user: { username: "promotable-pat" } }],
        skipped: [],
        errors: [],
      });
    })
  );
});

afterEach(() => {
  server.close();
});

describe("PromoteContactsModal", () => {
  function setup() {
    const onClose = vi.fn();
    const onPromoted = vi.fn();
    render(<PromoteContactsModal opened={true} onClose={onClose} onPromoted={onPromoted} />);
    return { onClose, onPromoted };
  }

  it("loads contacts on open and displays them", async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText("Promotable Pat")).toBeInTheDocument();
      expect(screen.getByText("Already User")).toBeInTheDocument();
      expect(screen.getByText("Discordless Drew")).toBeInTheDocument();
    });
  });

  it("disables the checkbox for an already-user contact", async () => {
    setup();
    await waitFor(() => screen.getByText("Already User"));
    const checkboxes = screen.getAllByRole("checkbox");
    // header + 3 rows
    expect(checkboxes).toHaveLength(4);
    expect(checkboxes[2]).toBeDisabled();
  });

  it("disables the checkbox for a contact without a Discord ID", async () => {
    setup();
    await waitFor(() => screen.getByText("Discordless Drew"));
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[3]).toBeDisabled();
  });

  it("submits selected contact ids with the chosen role", async () => {
    const { onPromoted } = setup();
    await waitFor(() => screen.getByText("Promotable Pat"));
    const checkboxes = screen.getAllByRole("checkbox");
    // index 1 = first row (Promotable Pat)
    fireEvent.click(checkboxes[1]);

    fireEvent.click(screen.getByRole("button", { name: /Promote 1 contact/i }));

    await waitFor(() => {
      expect(promotionBodies).toEqual([[{ contact_id: 1, role: "HELPER" }]]);
      expect(onPromoted).toHaveBeenCalled();
    });
  });

  it("disables the submit button when nothing is selected", async () => {
    setup();
    await waitFor(() => screen.getByText("Promotable Pat"));
    const submitButton = screen.getByRole("button", { name: /Promote/i });
    expect(submitButton).toBeDisabled();
  });
});
