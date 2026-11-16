import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { parsedChips } from "@/components/BrainDumpPreview";
import ArchivedProjects from "@/components/settings/ArchivedProjects";
import { parseQuickAdd } from "@/lib/parse";
import { emptyWorkspace, makeProject, makeTask, renderWorkspace } from "./harness";

const health = makeProject({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Health",
  archived: true,
});
const garden = makeProject({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Garden",
  archived: true,
});
const website = makeProject({ name: "Website" });

const tasks = [
  makeTask({ id: "10000000-0000-4000-8000-000000000001", projectId: health.id }),
  makeTask({ id: "10000000-0000-4000-8000-000000000002", projectId: health.id }),
  makeTask({ id: "10000000-0000-4000-8000-000000000003", projectId: garden.id }),
  makeTask({ id: "10000000-0000-4000-8000-000000000004", projectId: website.id }),
];

describe("ArchivedProjects", () => {
  test("lists archived projects with task counts and leaves active ones out", async () => {
    renderWorkspace(<ArchivedProjects />, emptyWorkspace({ projects: [health, garden, website], tasks }));
    const healthRow = (await screen.findByText("Health")).closest("li")!;
    expect(within(healthRow).getByText("2 tasks")).toBeTruthy();
    const gardenRow = screen.getByText("Garden").closest("li")!;
    expect(within(gardenRow).getByText("1 task")).toBeTruthy();
    expect(screen.queryByText("Website")).toBeNull();
  });

  test("Un-archive patches the project and the row disappears", async () => {
    const { mock } = renderWorkspace(
      <ArchivedProjects />,
      emptyWorkspace({ projects: [health, garden], tasks }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Un-archive Health" }));
    await waitFor(() => expect(screen.queryByText("Health")).toBeNull());
    expect(mock.calls).toContainEqual({
      url: `/api/projects/${health.id}`,
      method: "PATCH",
      body: { archived: false },
    });
    expect(screen.getByText("Garden")).toBeTruthy();
  });

  test("shows a quiet line when nothing is archived", async () => {
    renderWorkspace(<ArchivedProjects />, emptyWorkspace({ projects: [website], tasks }));
    expect(await screen.findByText("No archived projects.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("parsedChips with archived projects", () => {
  const parse = (line: string) => parseQuickAdd(line, new Date());

  test("a #name that only matches an archived project is unknown", () => {
    const r = parsedChips(parse("call GP #health"), [health, website]);
    expect(r.unknownProject).toBe("health");
    expect(r.chips.some((c) => c.key === "project")).toBe(false);
  });

  test("an active project still matches, even when an archived one shares its name", () => {
    const active = makeProject({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Health" });
    const r = parsedChips(parse("call GP #health"), [health, active]);
    expect(r.unknownProject).toBeNull();
    expect(r.chips.find((c) => c.key === "project")?.text).toBe("Health");
  });
});
