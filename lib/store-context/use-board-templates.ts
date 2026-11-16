"use client";

import { useCallback, useMemo, useState } from "react";
import type { BoardTemplate } from "../board-templates";
import type { StageInput } from "../types";
import { request } from "./request";

export type BoardTemplatesApi = {
  /** Templates the user saved. Built-ins live in BOARD_TEMPLATES. */
  customTemplates: BoardTemplate[];
  setCustomTemplates: React.Dispatch<React.SetStateAction<BoardTemplate[]>>;
  saveBoardTemplate: (name: string, stages: StageInput[]) => Promise<BoardTemplate | null>;
  deleteBoardTemplate: (id: string) => Promise<void>;
};

export function useBoardTemplates(onError: (message: string) => void): BoardTemplatesApi {
  const [customTemplates, setCustomTemplates] = useState<BoardTemplate[]>([]);

  const saveBoardTemplate = useCallback(
    async (name: string, stages: StageInput[]) => {
      try {
        const saved = await request<BoardTemplate>("/api/board-templates", {
          method: "POST",
          body: JSON.stringify({ name, stages: stages.map((s) => ({ name: s.name, kind: s.kind })) }),
        });
        setCustomTemplates((prev) => [...prev, saved]);
        return saved;
      } catch (error) {
        onError((error as Error).message);
        return null;
      }
    },
    [onError],
  );

  const deleteBoardTemplate = useCallback(
    async (id: string) => {
      let before: BoardTemplate[] = [];
      setCustomTemplates((prev) => {
        before = prev;
        return prev.filter((t) => t.id !== id);
      });
      try {
        await request(`/api/board-templates/${id}`, { method: "DELETE" });
      } catch (error) {
        setCustomTemplates(before);
        onError((error as Error).message);
      }
    },
    [onError],
  );

  return useMemo(
    () => ({ customTemplates, setCustomTemplates, saveBoardTemplate, deleteBoardTemplate }),
    [customTemplates, saveBoardTemplate, deleteBoardTemplate],
  );
}
