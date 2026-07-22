import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@multica/core/i18n/react";
import type { ProjectResource } from "@multica/core/types";
import enCommon from "../../locales/en/common.json";
import enProjects from "../../locales/en/projects.json";

const TEST_RESOURCES = { en: { common: enCommon, projects: enProjects } };

const mockApi = vi.hoisted(() => ({
  listProjectResources: vi.fn(),
  listRuntimes: vi.fn(),
  updateProjectResource: vi.fn(),
  deleteProjectResource: vi.fn(),
  createProjectResource: vi.fn(),
  updateWorkspace: vi.fn(),
}));
const mockPlatform = vi.hoisted(() => ({
  desktop: false,
  daemonRunning: false,
  checkRepositoryAccess: vi.fn(),
}));

vi.mock("@multica/core/api", () => ({ api: mockApi }));
vi.mock("@multica/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@multica/core/paths", () => ({
  useCurrentWorkspace: () => ({
    id: "ws-1",
    name: "Workspace",
    repos: [],
  }),
}));
vi.mock("../../platform", () => ({
  isDesktopShell: () => mockPlatform.desktop,
  useLocalDaemonStatus: () => ({
    daemonId: mockPlatform.desktop ? "daemon-local" : null,
    deviceName: null,
    running: mockPlatform.daemonRunning,
  }),
  checkRepositoryAccess: mockPlatform.checkRepositoryAccess,
  pickDirectory: () => Promise.resolve({ ok: false, reason: "unsupported" }),
  validateLocalDirectory: () => Promise.resolve({ ok: false, reason: "unsupported" }),
}));

import { ProjectResourcesSection } from "./project-resources-section";

const repository: ProjectResource = {
  id: "resource-1",
  project_id: "project-1",
  workspace_id: "ws-1",
  resource_type: "github_repo",
  resource_ref: {
    url: "git@gitlab.com:group/repo.git",
    provider: "gitlab",
    ref: "release/v2",
    default_branch_hint: "main",
    role: "backend",
  },
  label: "API",
  position: 0,
  created_at: "2026-01-01T00:00:00Z",
  created_by: null,
};

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui = () => (
    <QueryClientProvider client={client}>
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <ProjectResourcesSection projectId="project-1" />
      </I18nProvider>
    </QueryClientProvider>
  );
  const rendered = render(ui());
  return { ...rendered, rerenderSection: () => rendered.rerender(ui()) };
}

describe("ProjectResourcesSection", () => {
  beforeEach(() => {
    Object.values(mockApi).forEach((mock) => mock.mockReset());
    mockApi.listProjectResources.mockResolvedValue({ resources: [repository], total: 1 });
    mockApi.listRuntimes.mockResolvedValue([]);
    mockApi.updateProjectResource.mockImplementation(
      (_projectId: string, _resourceId: string, data: Record<string, unknown>) =>
        Promise.resolve({ ...repository, ...data }),
    );
    mockApi.deleteProjectResource.mockResolvedValue(undefined);
    mockApi.createProjectResource.mockImplementation(() => {
      const local = {
        ...repository,
        id: "local-1",
        resource_type: "local_directory",
        resource_ref: {
          local_path: "/srv/project",
          daemon_id: "daemon-1",
          label: "Project",
        },
      };
      mockApi.listProjectResources.mockResolvedValue({
        resources: [repository, local],
        total: 2,
      });
      return Promise.resolve(local);
    });
    mockPlatform.desktop = false;
    mockPlatform.daemonRunning = false;
    mockPlatform.checkRepositoryAccess.mockReset();
    mockPlatform.checkRepositoryAccess.mockResolvedValue({
      status: "not_checked",
    });
  });

  it("shows and edits checkout ref, provider, role, and default branch metadata", async () => {
    renderSection();
    expect(await screen.findByText("GitLab")).toBeInTheDocument();
    expect(screen.getByText("backend")).toBeInTheDocument();
    expect(screen.getByText("release/v2")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Edit"));
    fireEvent.change(
      screen.getByPlaceholderText("Checkout branch, tag, or commit"),
      { target: { value: "feature/resources" } },
    );
    fireEvent.change(screen.getByPlaceholderText("Default branch"), {
      target: { value: "develop" },
    });
    fireEvent.change(screen.getByDisplayValue("backend"), {
      target: { value: "docs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockApi.updateProjectResource).toHaveBeenCalledWith(
        "project-1",
        "resource-1",
        expect.objectContaining({
          resource_ref: expect.objectContaining({
            url: "git@gitlab.com:group/repo.git",
            ref: "feature/resources",
            default_branch_hint: "develop",
            role: "docs",
          }),
        }),
      );
    });
  });

  it("removes a repository from the project", async () => {
    renderSection();
    await screen.findByText("GitLab");
    fireEvent.click(screen.getByLabelText("Remove"));
    await waitFor(() => {
      expect(mockApi.deleteProjectResource).toHaveBeenCalledWith(
        "project-1",
        "resource-1",
      );
    });
  });

  it("checks repository access through the running desktop daemon", async () => {
    mockPlatform.desktop = true;
    mockPlatform.daemonRunning = true;
    mockPlatform.checkRepositoryAccess.mockResolvedValue({
      status: "auth_required",
      checkedAt: "2026-07-22T00:00:00Z",
    });

    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Not checked" }));

    expect(await screen.findByText("Auth required")).toBeInTheDocument();
    expect(mockPlatform.checkRepositoryAccess).toHaveBeenCalledWith(
      "git@gitlab.com:group/repo.git",
    );
  });

  it("tracks desktop daemon availability and clears a failed access check", async () => {
    mockPlatform.desktop = true;
    mockPlatform.daemonRunning = false;
    mockPlatform.checkRepositoryAccess.mockRejectedValue(new Error("gone"));

    const view = renderSection();
    expect(await screen.findByRole("button", { name: "Daemon offline" })).toBeDisabled();

    mockPlatform.daemonRunning = true;
    view.rerenderSection();
    const check = await screen.findByRole("button", { name: "Not checked" });
    fireEvent.click(check);
    expect(await screen.findByRole("button", { name: "Network failed" })).toBeEnabled();

    mockPlatform.daemonRunning = false;
    view.rerenderSection();
    expect(await screen.findByRole("button", { name: "Daemon offline" })).toBeDisabled();
  });

  it("renders an unknown resource type instead of dropping it", async () => {
    mockApi.listProjectResources.mockResolvedValue({
      resources: [
        {
          ...repository,
          id: "resource-new",
          resource_type: "design_file",
          resource_ref: { document_id: "doc-1" },
          label: "Design source",
        },
      ],
      total: 1,
    });

    renderSection();
    expect(await screen.findByText("Other resources")).toBeInTheDocument();
    expect(screen.getByText("Design source")).toBeInTheDocument();
    expect(screen.getByText("design_file")).toBeInTheDocument();
  });

  it("lets web bind an offline local runtime and excludes cloud runtimes", async () => {
    mockApi.listRuntimes.mockResolvedValue([
      {
        id: "runtime-local",
        workspace_id: "ws-1",
        daemon_id: "daemon-1",
        name: "Laptop",
        runtime_mode: "local",
        provider: "codex",
        launch_header: "",
        status: "offline",
        device_info: "",
        metadata: {},
        owner_id: null,
        visibility: "private",
        last_seen_at: null,
        created_at: "",
        updated_at: "",
      },
      {
        id: "runtime-cloud",
        workspace_id: "ws-1",
        daemon_id: null,
        name: "Cloud worker",
        runtime_mode: "cloud",
        provider: "codex",
        launch_header: "",
        status: "online",
        device_info: "",
        metadata: {},
        owner_id: null,
        visibility: "private",
        last_seen_at: null,
        created_at: "",
        updated_at: "",
      },
    ]);

    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Add resource" }));
    fireEvent.click(screen.getByRole("button", { name: "Local directory" }));
    expect(await screen.findByText("Laptop · offline")).toBeInTheDocument();
    expect(screen.queryByText(/Cloud worker/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "daemon-1" },
    });
    fireEvent.change(screen.getByPlaceholderText("/absolute/path/to/project"), {
      target: { value: "/srv/project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add local directory" }));

    await waitFor(() => {
      expect(mockApi.createProjectResource).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({
          resource_type: "local_directory",
          resource_ref: expect.objectContaining({
            local_path: "/srv/project",
            daemon_id: "daemon-1",
          }),
        }),
      );
    });
    expect(await screen.findByText("Unverified")).toBeInTheDocument();
  });
});
