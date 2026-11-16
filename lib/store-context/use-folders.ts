"use client";

import { useCallback, useMemo, useState } from "react";
import type { Folder, Project } from "../types";
import { request } from "./request";

export type FoldersApi = {
  folders: Folder[];
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
  addFolder: (name: string) => Promise<Folder | null>;
  renameFolder: (id: string, name: string) => Promise<void>;
  /** Removes the folder; its projects move back to the top level. */
  deleteFolder: (id: string) => Promise<void>;
};

export function useFolders(
  onError: (message: string) => void,
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>,
): FoldersApi {
  const [folders, setFolders] = useState<Folder[]>([]);

  const addFolder = useCallback(
    async (name: string) => {
      try {
        const folder = await request<Folder>("/api/folders", {
          method: "POST",
          body: JSON.stringify({ name }),
        });
        setFolders((prev) => [...prev, folder]);
        return folder;
      } catch (error) {
        onError((error as Error).message);
        return null;
      }
    },
    [onError],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      let before: Folder[] = [];
      setFolders((prev) => {
        before = prev;
        return prev.map((f) => (f.id === id ? { ...f, name } : f));
      });
      try {
        await request(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      } catch (error) {
        setFolders(before);
        onError((error as Error).message);
      }
    },
    [onError],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      let beforeFolders: Folder[] = [];
      let beforeProjects: Project[] = [];
      setFolders((prev) => {
        beforeFolders = prev;
        return prev.filter((f) => f.id !== id);
      });
      setProjects((prev) => {
        beforeProjects = prev;
        return prev.map((p) => (p.folderId === id ? { ...p, folderId: undefined } : p));
      });
      try {
        await request(`/api/folders/${id}`, { method: "DELETE" });
      } catch (error) {
        setFolders(beforeFolders);
        setProjects(beforeProjects);
        onError((error as Error).message);
      }
    },
    [onError, setProjects],
  );

  return useMemo(
    () => ({ folders, setFolders, addFolder, renameFolder, deleteFolder }),
    [folders, addFolder, renameFolder, deleteFolder],
  );
}
