import type { Project } from "../core/types.js";
import { select } from "../ui/prompts.js";
import { relativeTime } from "../ui/format.js";

export async function pickProject(projects: Project[], message: string): Promise<Project | null> {
  if (projects.length === 0) return null;
  const chosen = await select({
    message,
    choices: projects.map((project) => ({
      value: project.githubRepoId,
      label: project.fullName,
      hint: project.scan
        ? `${project.scan.findingCount} findings, scanned ${relativeTime(project.scan.finishedAt ?? project.scan.createdAt)}`
        : "never scanned",
    })),
  });
  return projects.find((project) => project.githubRepoId === chosen) ?? null;
}
