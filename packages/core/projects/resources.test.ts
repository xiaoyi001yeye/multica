import { describe, expect, it } from "vitest";
import type { ProjectResource } from "../types";
import {
  gitProviderFromUrl,
  localPathSummary,
  resourcePositionSwap,
} from "./resources";

describe("project resource presentation", () => {
  it.each([
    ["https://github.com/multica-ai/multica.git", "github"],
    ["git@gitlab.com:group/repo.git", "gitlab"],
    ["ssh://git@gitlab.example.com:2222/group/repo.git", "self_hosted"],
    ["https://code.example.com/team/repo", "self_hosted"],
  ] as const)("classifies %s as %s", (url, provider) => {
    expect(gitProviderFromUrl(url)).toBe(provider);
  });

  it.each([
    ["/Users/me/code/multica", "code/multica"],
    ["C:\\Users\\me\\code\\multica", "code/multica"],
    ["/repo", "repo"],
  ])("summarizes %s", (path, summary) => {
    expect(localPathSummary(path)).toBe(summary);
  });
});

describe("resourcePositionSwap", () => {
  const resource = (
    id: string,
    resourceType: ProjectResource["resource_type"],
    position: number,
    createdAt: string,
  ): ProjectResource => ({
    id,
    project_id: "project",
    workspace_id: "workspace",
    resource_type: resourceType,
    resource_ref:
      resourceType === "github_repo"
        ? { url: `https://example.com/${id}.git` }
        : { local_path: `/${id}`, daemon_id: id },
    label: null,
    position,
    created_at: createdAt,
    created_by: null,
  });

  const resources = [
    resource("repo-a", "github_repo", 0, "2026-01-01T00:00:00Z"),
    resource("local-a", "local_directory", 1, "2026-01-01T00:00:01Z"),
    resource("repo-b", "github_repo", 2, "2026-01-01T00:00:02Z"),
  ];

  it("swaps unified positions with the adjacent resource in the same group", () => {
    expect(resourcePositionSwap(resources, "repo-a", "down")).toEqual([
      { resourceId: "repo-a", position: 2 },
      { resourceId: "repo-b", position: 0 },
    ]);
  });

  it("returns no updates at a group edge", () => {
    expect(resourcePositionSwap(resources, "repo-a", "up")).toEqual([]);
    expect(resourcePositionSwap(resources, "local-a", "down")).toEqual([]);
  });
});
