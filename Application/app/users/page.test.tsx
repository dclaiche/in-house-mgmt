import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "../../test-utils/render";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { SubOrgUser } from "./types";

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

import UsersPage from "./page";

let mockUsers: SubOrgUser[] = [];
let patchedBodies: Array<{ id: number; body: Record<string, unknown> }> = [];

const server = setupServer();

beforeEach(() => {
  mockUserState.user = {
    id: 99,
    username: "manager",
    email: "manager@example.com",
    first_name: "Manager",
    last_name: "Person",
    groups: ["ORGANIZER"],
    email_addresses: [],
    social_accounts: [],
    timezone: "",
    can_manage_users: true,
  };
  patchedBodies = [];
  mockUsers = [
    {
      id: 1,
      username: "helper-one",
      first_name: "Helper",
      last_name: "One",
      groups: ["HELPER"],
      primary_email: "h1@example.com",
      discord_ids: [{ id: 11, discord_id: "111", active: true }],
      is_active: true,
      last_login: null,
    },
    {
      id: 2,
      username: "trainee-one",
      first_name: "Trainee",
      last_name: "Two",
      groups: ["TRAINEE"],
      primary_email: "t1@example.com",
      discord_ids: [{ id: 22, discord_id: "222", active: true }],
      is_active: false,
      last_login: "2026-04-01T12:00:00Z",
    },
  ];
  server.listen({ onUnhandledRequest: "warn" });
  server.use(
    http.get("/api/users/", () =>
      HttpResponse.json({ count: mockUsers.length, next: null, previous: null, results: mockUsers })
    ),
    http.patch<{ id: string }>("/api/users/:id/", async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      patchedBodies.push({ id: Number(params.id), body });
      const u = mockUsers.find((x) => x.id === Number(params.id));
      if (u) {
        if (typeof body.is_active === "boolean") u.is_active = body.is_active;
        if (typeof body.role === "string") u.groups = [body.role as string];
      }
      return HttpResponse.json(u);
    })
  );
});

afterEach(() => {
  server.close();
});

describe("UsersPage", () => {
  it("renders the list of sub-organizer users", async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByText("Helper One")).toBeInTheDocument();
      expect(screen.getByText("Trainee Two")).toBeInTheDocument();
    });
  });

  it("toggles a user's active state via PATCH", async () => {
    render(<UsersPage />);
    await waitFor(() => screen.getByText("Helper One"));

    const rowMenus = screen.getAllByLabelText("Row actions");
    fireEvent.click(rowMenus[0]);
    const deactivate = await screen.findByRole("menuitem", { name: /Deactivate/i });
    fireEvent.click(deactivate);

    await waitFor(() => {
      expect(patchedBodies).toEqual([{ id: 1, body: { is_active: false } }]);
    });
  });

  it("redirects when user lacks manage_users perm", async () => {
    mockUserState.user = { ...mockUserState.user, groups: [], can_manage_users: false };
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.queryByText("Helper One")).not.toBeInTheDocument();
    });
  });
});
