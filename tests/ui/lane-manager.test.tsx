import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import LaneManager from "@/components/kanban/LaneManager";
import { emptyWorkspace, makeProject, makeStages, makeTask, renderWorkspace } from "./harness";

const project = makeProject();
const stages = makeStages(project.id);
const [backlog, progress, blocked, done] = stages;

function setup(overrides: Partial<Parameters<typeof emptyWorkspace>[0]> = {}) {
  return renderWorkspace(
    <LaneManager project={project} />,
    emptyWorkspace({ projects: [project], stages, ...overrides }),
  );
}

/** The lane names as listed, top to bottom. */
function laneNames() {
  return screen
    .getAllByRole("listitem")
    .map((row) => row.querySelector("p")?.textContent);
}

const created = {
  id: "44444444-4444-4444-8444-444444444444",
  projectId: project.id,
  name: "Review",
  kind: "active" as const,
  sortOrder: 3,
  createdAt: "2026-03-02T09:00:00.000Z",
};

async function addReview() {
  await userEvent.click(await screen.findByRole("button", { name: "Add lane" }));
  const dialog = screen.getByRole("dialog", { name: "Add a lane" });
  await userEvent.type(within(dialog).getByLabelText("Lane name"), "Review");
  await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
}

describe("LaneManager", () => {
  test("lists lanes in board order with kind and limit", async () => {
    const shuffled = [
      { ...done, sortOrder: 3 },
      { ...progress, sortOrder: 1, wipLimit: 3 },
      { ...backlog, sortOrder: 0 },
      { ...blocked, sortOrder: 2 },
    ];
    setup({ stages: shuffled });
    await screen.findAllByRole("listitem");
    expect(laneNames()).toEqual(["Backlog", "In Progress", "Blocked", "Done"]);
    const rows = screen.getAllByRole("listitem");
    expect(rows[1]).toHaveTextContent("active · limit 3");
    expect(rows[0]).toHaveTextContent("backlog");
    expect(rows[0]).not.toHaveTextContent("limit");
  });

  test("Move up is disabled on the first lane and Move down on the last", async () => {
    setup();
    expect(await screen.findByRole("button", { name: "Move Backlog up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Backlog down" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move Done down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Done up" })).toBeEnabled();
  });

  test("Move down and Move up send the full new order", async () => {
    const { mock } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Move Backlog down" }));
    await waitFor(() =>
      expect(mock.calls.find((c) => c.url === "/api/stages/reorder")?.body).toEqual({
        projectId: project.id,
        ids: [progress.id, backlog.id, blocked.id, done.id],
      }),
    );
    // The list re-renders in the new order, so the same lane now moves back up.
    await userEvent.click(await screen.findByRole("button", { name: "Move Backlog up" }));
    await waitFor(() =>
      expect(mock.calls.filter((c) => c.url === "/api/stages/reorder")[1]?.body).toEqual({
        projectId: project.id,
        ids: [backlog.id, progress.id, blocked.id, done.id],
      }),
    );
  });

  test("Rename saves through the dialog", async () => {
    const { mock } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Rename Blocked" }));
    const dialog = screen.getByRole("dialog", { name: 'Rename "Blocked"' });
    const input = within(dialog).getByLabelText("Lane name");
    await userEvent.clear(input);
    await userEvent.type(input, "Waiting");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mock.calls.find((c) => c.url === `/api/stages/${blocked.id}`)).toMatchObject({
        method: "PATCH",
        body: { name: "Waiting" },
      }),
    );
    expect(await screen.findByRole("button", { name: "Rename Waiting" })).toBeInTheDocument();
  });

  test("Limit saves a limit and No limit clears it", async () => {
    const { mock } = setup({
      stages: [stages[0], { ...stages[1], wipLimit: 2 }, stages[2], stages[3]],
      tasks: [makeTask({ projectId: project.id, stageId: progress.id })],
    });
    await userEvent.click(await screen.findByRole("button", { name: "Limit for Backlog" }));
    await userEvent.type(screen.getByRole("spinbutton"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mock.calls.find((c) => c.url === `/api/stages/${backlog.id}`)?.body).toEqual({ wipLimit: 5 }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Limit for In Progress" }));
    const dialog = screen.getByRole("dialog", { name: "Limit for In Progress" });
    expect(dialog).toHaveAccessibleDescription("1 open card here. A lower limit starts at 1.");
    await userEvent.click(within(dialog).getByRole("button", { name: "No limit" }));
    await waitFor(() =>
      expect(mock.calls.find((c) => c.url === `/api/stages/${progress.id}`)?.body).toEqual({ wipLimit: null }),
    );
  });

  test("changing the kind patches it and never offers done", async () => {
    const { mock } = setup();
    const select = await screen.findByLabelText("Blocked behaves as");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "backlog",
      "active",
      "blocked",
    ]);
    await userEvent.selectOptions(select, "active");
    await waitFor(() =>
      expect(mock.calls.find((c) => c.url === `/api/stages/${blocked.id}`)?.body).toEqual({ kind: "active" }),
    );
  });

  test("the Done lane has no Remove and no kind change", async () => {
    setup();
    await screen.findByRole("button", { name: "Rename Done" });
    expect(screen.queryByRole("button", { name: "Remove Done" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Done behaves as")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Backlog" })).toBeInTheDocument();
  });

  test("the last lane that is not done cannot be removed", async () => {
    setup({ stages: [stages[1], stages[3]] });
    await screen.findByRole("button", { name: "Rename In Progress" });
    expect(screen.queryByRole("button", { name: "Remove In Progress" })).not.toBeInTheDocument();
  });

  test("Remove asks where its tasks go, counting the lane's tasks", async () => {
    const { mock } = setup({
      tasks: [
        makeTask({ id: "a", projectId: project.id, stageId: backlog.id }),
        makeTask({ id: "b", projectId: project.id, stageId: backlog.id }),
        makeTask({ id: "c", projectId: project.id, stageId: progress.id }),
      ],
    });
    await userEvent.click(await screen.findByRole("button", { name: "Remove Backlog" }));
    const dialog = screen.getByRole("dialog", { name: "Remove “Backlog”" });
    expect(within(dialog).getByText("2 tasks need a new column first.")).toBeInTheDocument();
    const choices = within(within(dialog).getByLabelText("Move tasks to")).getAllByRole("option");
    expect(choices.map((o) => o.textContent)).toEqual(["Choose a column…", "In Progress", "Blocked", "Done"]);
    await userEvent.selectOptions(within(dialog).getByLabelText("Move tasks to"), progress.id);
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove column" }));
    await waitFor(() =>
      expect(
        mock.calls.some((c) => c.method === "DELETE" && c.url === `/api/stages/${backlog.id}?moveTo=${progress.id}`),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Rename Backlog" })).not.toBeInTheDocument());
  });

  test("after addStage the project's stages are refetched and replaced", async () => {
    // The server put the new lane before Done and shifted Done after it.
    const fresh = [backlog, progress, blocked, created, { ...done, sortOrder: 4 }];
    const { mock } = setup();
    mock.respondNext(`/api/projects/${project.id}/stages`, created, "POST");
    mock.respondNext(`/api/projects/${project.id}/stages`, fresh, "GET");
    await addReview();
    await waitFor(() =>
      expect(mock.calls.find((c) => c.method === "POST")?.body).toEqual({ name: "Review", kind: "active" }),
    );
    await waitFor(() => expect(laneNames()).toEqual(["Backlog", "In Progress", "Blocked", "Review", "Done"]));
    // Replaced, not appended: no lane appears twice.
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  test("addStage appends the created lane when the refetch fails", async () => {
    const { mock } = setup();
    mock.respondNext(`/api/projects/${project.id}/stages`, { ...created, sortOrder: 4 }, "POST");
    mock.respondNext(`/api/projects/${project.id}/stages`, { error: "nope" }, "GET");
    await addReview();
    expect(await screen.findByRole("button", { name: "Rename Review" })).toBeInTheDocument();
    expect(laneNames()).toEqual(["Backlog", "In Progress", "Blocked", "Done", "Review"]);
  });
});
