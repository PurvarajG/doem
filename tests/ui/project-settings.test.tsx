import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import ProjectSettings from "@/components/ProjectSettings";
import { emptyWorkspace, makeProject, makeStages, makeTask, renderWorkspace } from "./harness";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const project = makeProject();

function setup(project_ = project, tasks = [makeTask({ projectId: project_.id })]) {
  const onClose = vi.fn();
  const r = renderWorkspace(
    <ProjectSettings project={project_} onClose={onClose} />,
    emptyWorkspace({ projects: [project_], tasks }),
  );
  return { ...r, onClose };
}

describe("ProjectSettings", () => {
  test("saves the board's columns as a named template", async () => {
    const stages = makeStages(project.id);
    const { mock } = renderWorkspace(
      <ProjectSettings project={project} onClose={vi.fn()} />,
      emptyWorkspace({ projects: [project], tasks: [], stages }),
    );
    mock.respondNext("/api/board-templates", {
      id: "55555555-5555-4555-8555-555555555555",
      name: "My board",
      stages: stages.map((s) => ({ name: s.name, kind: s.kind })),
      custom: true,
    }, "POST");

    await userEvent.click(await screen.findByRole("button", { name: "Save these columns as a template" }));
    const field = screen.getByLabelText("Template name");
    await userEvent.clear(field);
    await userEvent.type(field, "My board{Enter}");

    expect(await screen.findByRole("status")).toHaveTextContent('Saved "My board"');
    expect(mock.calls).toContainEqual({
      url: "/api/board-templates",
      method: "POST",
      body: { name: "My board", stages: stages.map((s) => ({ name: s.name, kind: s.kind })) },
    });
    expect(screen.getByRole("option", { name: /^My board:/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete template My board" })).toBeInTheDocument();
  });

  test("rename saves the trimmed name; blank is ignored", async () => {
    const { mock } = setup();
    const input = await screen.findByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.type(input, "  Shop  ");
    await userEvent.tab();
    await waitFor(() => expect(mock.calls.some((c) => c.method === "PATCH" && (c.body as { name?: string }).name === "Shop")).toBe(true));

    const before = mock.calls.length;
    await userEvent.clear(input);
    await userEvent.type(input, "   ");
    await userEvent.tab();
    expect(mock.calls.length).toBe(before);
  });

  test("colour swatch reports aria-pressed and saves the choice", async () => {
    const { mock } = setup();
    const selected = await screen.findByRole("button", { name: /Use colour #0052ff/ });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    const other = screen.getByRole("button", { name: /Use colour #7c3aed/ });
    expect(other).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(other);
    await waitFor(() =>
      expect(mock.calls.some((c) => (c.body as { color?: string })?.color === "#7c3aed")).toBe(true),
    );
  });

  test("archived switch flips", async () => {
    const { mock } = setup();
    const sw = await screen.findByRole("switch", { name: "Archived" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    await waitFor(() =>
      expect(mock.calls.some((c) => (c.body as { archived?: boolean })?.archived === true)).toBe(true),
    );
  });

  test("delete asks in a dialog; Cancel keeps the project", async () => {
    const { mock, onClose } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Delete this project" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete Website?" });
    expect(dialog).toHaveAccessibleDescription(/1 task keeps existing/);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mock.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  test("confirming deletes, closes and routes to /all", async () => {
    push.mockClear();
    const { mock, onClose } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Delete this project" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete Website" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/all"));
    expect(mock.calls.some((c) => c.method === "DELETE" && c.url.includes(project.id))).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });
});
