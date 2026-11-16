/**
 * What deleting a project does to its tasks. Shared by every delete
 * confirmation so the sidebar and Project settings say the same thing.
 */
export function projectDeleteConsequence(affected: number): string {
  if (affected === 0) return "This project has no tasks.";
  if (affected === 1) {
    return "1 task keeps existing, but it moves to no project and loses its column.";
  }
  return `${affected} tasks keep existing, but they move to no project and lose their column.`;
}
