import type {
  GitRepositoryProvider,
  ProjectResource,
} from "../types";

export function gitProviderFromUrl(url: string): GitRepositoryProvider {
  const trimmed = url.trim();
  let host = "";
  try {
    host = new URL(trimmed).hostname;
  } catch {
    const beforePath = trimmed.split(":", 1)[0] ?? "";
    host = beforePath.includes("@")
      ? (beforePath.split("@").pop() ?? "")
      : beforePath;
  }
  switch (host.toLowerCase()) {
    case "github.com":
      return "github";
    case "gitlab.com":
      return "gitlab";
    default:
      return "self_hosted";
  }
}

export function localPathSummary(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.slice(-2).join("/") || path;
}

export function resourcePositionSwap(
  resources: readonly ProjectResource[],
  resourceId: string,
  direction: "up" | "down",
): Array<{ resourceId: string; position: number }> {
  const current = resources.find((resource) => resource.id === resourceId);
  if (!current) return [];
  const group = resources
    .filter((resource) => resource.resource_type === current.resource_type)
    .toSorted(
      (a, b) =>
        a.position - b.position || a.created_at.localeCompare(b.created_at),
    );
  const index = group.findIndex((resource) => resource.id === resourceId);
  const adjacent = group[index + (direction === "up" ? -1 : 1)];
  if (!adjacent) return [];
  return [
    { resourceId: current.id, position: adjacent.position },
    { resourceId: adjacent.id, position: current.position },
  ];
}
