export interface SessionSummary {
  id: string;
  lastModified: number;
  summary: string;
  worktree?: { name: string; path: string };
  messageCount: number;
  isCurrentWorkspace: boolean;
}
