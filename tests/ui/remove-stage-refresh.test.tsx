import { useEffect } from "react";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import LaneManager from "@/components/kanban/LaneManager";
import { useTasks } from "@/lib/store-context";
import { emptyWorkspace, makeProject, makeStages, makeTask, renderWorkspace } from "./harness";

const project = makeProject();
const stages = makeStages(project.id);
const [backlog, , blocked, done] = stages;
const ID = "11111111-1111-4111-8111-111111111111";
const NEXT = "99999999-9999-4999-8999-999999999999";

let api: ReturnType<typeof useTasks>;
function Probe() {
  const value = useTasks();
  useEffect(() => {
    api = value;
  });
  return (
    <div>
      {value.tasks.map((t) => (
        <span key={t.id} data-testid={`task-${t.id}`}>
          {JSON.stringify({ stageId: t.stageId, status: t.status })}
        </span>
      ))}
    </div>
  );
}

function setup() {
  const task = makeTask({ id: ID, projectId: project.id, stageId: backlog.id });
  const r = renderWorkspace(
    <>
      <LaneManager project={project} />
      <Probe />
    </>,
    emptyWorkspace({ tasks: [task], projects: [project], stages }),
  );
  return { ...r, task };
}

const taskState = (id: string) => JSON.parse(screen.getByTestId(`task-${id}`).textContent ?? "null");
const taskListReads = () =>
  vi.mocked(fetch).mock.calls.filter(([url, init]) => url === "/api/tasks" && (init?.method ?? "GET") === "GET").length;

async function removeBacklogInto(destinationId: string) {
  await userEvent.click(await screen.findByRole("button", { name: "Remove Backlog" }));
  const dialog = screen.getByRole("dialog", { name: "Remove “Backlog”" });
  await userEvent.selectOptions(within(dialog).getByLabelText("Move tasks to"), destinationId);
  await userEvent.click(within(dialog).getByRole("button", { name: "Remove column" }));
}

describe("removing a lane refreshes tasks", () => {
  test("tasks and a spawned occurrence match the server after the lane is removed", async () => {
    const { mock, task } = setup();
    await waitFor(() => expect(taskState(ID).stageId).toBe(backlog.id));
    const readsBefore = taskListReads();

    // What the server holds after moving Backlog into Done: the task completed
    // there, and its next occurrence spawned in Blocked.
    mock.respondNext(`/api/stages/${backlog.id}`, { ok: true }, "DELETE");
    mock.respondNext(
      "/api/tasks",
      [
        { ...task, stageId: done.id, status: "done", completedAt: "2026-03-02T09:00:00.000Z" },
        makeTask({ id: NEXT, projectId: project.id, stageId: blocked.id, scheduled: "2026-03-08" }),
      ],
      "GET",
    );
    await removeBacklogInto(done.id);

    await waitFor(() => expect(screen.queryByRole("button", { name: "Rename Backlog" })).not.toBeInTheDocument());
    await waitFor(() => expect(taskState(ID)).toEqual({ stageId: done.id, status: "done" }));
    expect(taskState(NEXT)).toEqual({ stageId: blocked.id, status: "open" });
    expect(taskListReads()).toBe(readsBefore + 1);
  });

  test("a failed removal does not refetch tasks, keeps the lane and rejects", async () => {
    const { mock } = setup();
    await waitFor(() => expect(taskState(ID).stageId).toBe(backlog.id));
    await screen.findByRole("button", { name: "Rename Backlog" });
    const readsBefore = taskListReads();

    mock.failNext(`/api/stages/${backlog.id}`, 409, "That column can't be removed");
    let thrown: unknown;
    await act(async () => {
      await api.removeStage(backlog.id, done.id).catch((e: unknown) => (thrown = e));
    });

    expect((thrown as Error).message).toBe("That column can't be removed");
    expect(taskListReads()).toBe(readsBefore);
    expect(taskState(ID).stageId).toBe(backlog.id);
    expect(screen.getByRole("button", { name: "Rename Backlog" })).toBeInTheDocument();
    expect(api.error).toBe("That column can't be removed");
  });

  test("a failed refetch after a successful removal keeps local tasks and does not throw", async () => {
    const { mock } = setup();
    await waitFor(() => expect(taskState(ID).stageId).toBe(backlog.id));
    await screen.findByRole("button", { name: "Rename Backlog" });

    mock.respondNext(`/api/stages/${backlog.id}`, { ok: true }, "DELETE");
    mock.failNext("/api/tasks", 500, "boom");
    await act(async () => {
      await expect(api.removeStage(backlog.id, done.id)).resolves.toBeUndefined();
    });

    await waitFor(() => expect(screen.queryByRole("button", { name: "Rename Backlog" })).not.toBeInTheDocument());
    expect(taskState(ID).stageId).toBe(backlog.id);
    expect(api.error).toBeNull();
  });
});
