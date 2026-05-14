import { render, screen } from "@testing-library/react";
import userEvent, { UserEvent } from "@testing-library/user-event";
import { vi, expect, describe, it, beforeAll, afterEach, afterAll } from "vitest";
import { MantineProvider } from "@mantine/core";
import ContactsPage from "./page";
import { setupServer } from "msw/node";
import { HttpResponse, http } from "msw";

// mock tags used to test tag filtering
const mockTags = [
  { id: 0, name: "TAG_0", color: "red" },
  { id: 1, name: "TAG_1", color: "blue" },
  { id: 2, name: "TAG_2", color: "orange" },
];

// mock contact used to verify that fetched contacts are listed
// full_name is set in the handler from the search parameters
const mockContact = {
  id: 1,
  discord_id: "discord",
  email: "timmy@example.com",
  phone: "666666666",
  tags: mockTags,
};

// mock category used to test category filtering
const mockCategory = {
  id: 1,
  name: "Canvassing",
  description: "The Mock Category for Canvassing",
  created_at: "2026-05-07T14:32:26.404646Z",
  modified_at: "2026-05-07T14:32:26.404646Z",
};

const server = setupServer(
  http.get("/api/tags", () => HttpResponse.json(mockTags)),
  http.get("/api/event-categories", () => HttpResponse.json({ results: [mockCategory] })),
  http.get("/api/contacts", ({ request }) => {
    const match = /\?(.*)/.exec(request.url);
    const params = new URLSearchParams(match?.at(1) ?? "");
    params.sort();
    const full_name = `Contact Name with Params(${params})`;

    return HttpResponse.json({
      results: [
        {
          ...mockContact,
          full_name,
        },
      ],
      count: 1,
      next: null,
      previous: null,
    });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * Enter text into a textbox. Does not clear previous text.
 *
 * @param user - UserEvent entering the text
 * @param name - name of the textbox being entered
 * @param text - text that the user is entering
 */
async function enterText(user: UserEvent, name: string, text: string): Promise<void> {
  if (text) {
    const input = await screen.findByRole("textbox", { name });
    await user.click(input);
    await user.keyboard(text);
  }
}

/**
 * Select options for a select. Does not unselect already selected options.
 *
 * @param user UserEvent selecting the options
 * @param name name of the select being entered
 * @param values values
 */
async function selectOptions(user: UserEvent, name: string, options: string[]) {
  const select = await screen.findByRole("textbox", { name });
  await user.click(select);

  for (const option of options) {
    const elem = await screen.findByRole("option", { name: option });
    await user.click(elem);
  }
}

/**
 * Select range for a range selector. Since it works by counting arrow keys presses
 * without checking initial values, it only works for selectors at full range.
 *
 * @param user UserEvent selecting the range
 * @param name Name of the range slider
 * @param range Range to input
 */
async function selectRange(user: UserEvent, name: string, range: number[]) {
  // focus on title
  await user.click(await screen.findByText(name));
  // tab to left slider
  await user.tab();
  // press right range[0] times
  if (range[0] > 0) {
    await user.keyboard("[ArrowRight]".repeat(range[0]));
  }
  // tab to right slider
  await user.tab();
  // press left 20 - range[1] times
  if (range[1] < 20) {
    await user.keyboard("[ArrowLeft]".repeat(20 - range[1]));
  }
}

describe("ContactsPage", () => {
  describe("Search Contacts", () => {
    describe("Contacts Filter", () => {
      it.each([
        [
          // empty
          {
            search: "",
            startDate: null,
            endDate: null,
            tagMode: "Any of",
            tagIds: [],
            category: null,
            events: [0, 20],
            tickets: [0, 20],
          },
          new URLSearchParams(),
        ],
        [
          // use all fields
          {
            search: "hello",
            startDate: "2026-10-30",
            endDate: "2026-11-05",
            tagMode: "All of",
            tagIds: ["TAG_0", "TAG_1", "TAG_2"],
            category: "Canvassing",
            events: [10, 19],
            tickets: [1, 5],
          },
          new URLSearchParams({
            search: "hello",
            start_date: "2026-10-30",
            end_date: "2026-11-05",
            tag_mode: "all",
            tag_ids: "0,1,2",
            event_category_id: "1",
            min_events: "10",
            max_events: "19",
            min_tickets: "1",
            max_tickets: "5",
          }),
        ],
        [
          // max fields with value 0
          {
            search: "hello",
            startDate: null,
            endDate: null,
            tagMode: "Any of",
            tagIds: [],
            category: null,
            events: [0, 0],
            tickets: [0, 0],
          },
          new URLSearchParams({
            search: "hello",
            max_events: "0",
            max_tickets: "0",
          }),
        ],
        [
          // min fields with value 20
          {
            search: "hello",
            startDate: null,
            endDate: null,
            tagMode: "Any of",
            tagIds: [],
            category: null,
            events: [20, 20],
            tickets: [20, 20],
          },
          new URLSearchParams({
            search: "hello",
            min_events: "20",
            min_tickets: "20",
          }),
        ],
        [
          // extra white space
          {
            search: "  hello  ",
            startDate: null,
            endDate: null,
            tagMode: "Any of",
            tagIds: [],
            category: null,
            events: [0, 20],
            tickets: [0, 20],
          },
          new URLSearchParams({
            search: "hello",
          }),
        ],
      ])(
        "fetches contacts with %s using query of %s",
        async (inputs, expectedParams) => {
          const user = userEvent.setup();

          render(
            <MantineProvider env="test">
              <ContactsPage />
            </MantineProvider>
          );

          // enter info into the filter
          await enterText(user, "Search", inputs.search);
          if (inputs.startDate !== null) {
            await enterText(user, "Start Date", inputs.startDate);
          }
          if (inputs.endDate !== null) {
            await enterText(user, "End Date", inputs.endDate);
          }

          await selectRange(user, "# of Events Attended", inputs.events);
          await selectRange(user, "# of Closed Tickets", inputs.tickets);

          await selectOptions(user, "Tags", [inputs.tagMode]);
          await selectOptions(user, "Tag Ids", inputs.tagIds);
          if (inputs.category !== null) {
            await selectOptions(user, "Event Category", [inputs.category]);
          }

          // sort URLSearchParams so that we can compare them
          expectedParams.sort();

          await vi.waitFor(async () =>
            // check that the mock contact with name containing parameters is displayed
            expect(screen.getByText(/Contact Name/)).toHaveTextContent(`Params(${expectedParams})`)
          );
        },
        20000
      );
    });

    describe("Reset Filter Button", () => {
      it("Resets the filter to default values", async () => {
        const user = userEvent.setup();

        render(
          <MantineProvider env="test">
            <ContactsPage />
          </MantineProvider>
        );

        // enter info into the filter
        await enterText(user, "Search", "Timmy");
        await enterText(user, "Start Date", "2026-11-11");
        await enterText(user, "End Date", "2026-12-12");

        await selectRange(user, "# of Events Attended", [2, 12]);
        await selectRange(user, "# of Closed Tickets", [1, 3]);

        await selectOptions(user, "Tags", ["All of"]);
        await selectOptions(user, "Tag Ids", ["TAG_0", "TAG_2"]);
        await selectOptions(user, "Event Category", ["Canvassing"]);

        await vi.waitFor(async () => {
          // check that the filter is populated
          expect(screen.getByRole("textbox", { name: "Search" })).toHaveValue("Timmy");
          expect(screen.getByRole("textbox", { name: "Start Date" })).toHaveValue(
            "November 11, 2026"
          );
          expect(screen.getByRole("textbox", { name: "End Date" })).toHaveValue(
            "December 12, 2026"
          );

          expect(screen.getByRole("textbox", { name: "Tags" })).toHaveValue("All of");

          await user.click(screen.getByRole("textbox", { name: "Tag Ids" }));
          expect(screen.getByRole("option", { name: "TAG_0" }).ariaSelected).toBe("true");
          expect(screen.getByRole("option", { name: "TAG_1" }).ariaSelected).toBe("false");
          expect(screen.getByRole("option", { name: "TAG_2" }).ariaSelected).toBe("true");

          expect(screen.getByRole("textbox", { name: "Event Category" })).toHaveValue("Canvassing");

          const [minEvent, maxEvent] = screen
            .getByText("# of Events Attended")
            .parentElement!.querySelectorAll(
              'input[type="hidden"]'
            ) as NodeListOf<HTMLInputElement>;
          expect(minEvent.value).toBe("2");
          expect(maxEvent.value).toBe("12");

          const [minTickets, maxTickets] = screen
            .getByText("# of Closed Tickets")
            .parentElement!.querySelectorAll(
              'input[type="hidden"]'
            ) as NodeListOf<HTMLInputElement>;
          expect(minTickets.value).toBe("1");
          expect(maxTickets.value).toBe("3");

          // check that the mock contact with non-empty parameters is displayed
          expect(screen.getByText(/Contact Name/)).toHaveTextContent(/Params\(.+\)/);
        });

        await user.click(await screen.findByRole("button", { name: "Reset" }));

        await vi.waitFor(async () => {
          expect(screen.getByRole("textbox", { name: "Search" })).toHaveValue("");
          expect(screen.getByRole("textbox", { name: "Start Date" })).toHaveValue("");
          expect(screen.getByRole("textbox", { name: "End Date" })).toHaveValue("");
          expect(screen.getByRole("textbox", { name: "Tags" })).toHaveValue("Any of");

          await user.click(screen.getByRole("textbox", { name: "Tag Ids" }));
          expect(screen.getByRole("option", { name: "TAG_0" }).ariaSelected).toBe("false");
          expect(screen.getByRole("option", { name: "TAG_1" }).ariaSelected).toBe("false");
          expect(screen.getByRole("option", { name: "TAG_2" }).ariaSelected).toBe("false");

          expect(screen.getByRole("textbox", { name: "Event Category" })).toHaveValue("");

          const [minEvent, maxEvent] = screen
            .getByText("# of Events Attended")
            .parentElement!.querySelectorAll(
              'input[type="hidden"]'
            ) as NodeListOf<HTMLInputElement>;
          expect(minEvent.value).toBe("0");
          expect(maxEvent.value).toBe("20");

          const [minTickets, maxTickets] = screen
            .getByText("# of Closed Tickets")
            .parentElement!.querySelectorAll(
              'input[type="hidden"]'
            ) as NodeListOf<HTMLInputElement>;
          expect(minTickets.value).toBe("0");
          expect(maxTickets.value).toBe("20");

          // check that the mock contact with empty parameters is displayed
          const contactName = screen.getByText(/Contact Name/);
          expect(contactName).toHaveTextContent(/Params\(\)/);
        });
      }, 20000);
    });
  });
});
