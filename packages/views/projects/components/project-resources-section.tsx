"use client";

import { useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FolderGit,
  FolderOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@multica/core/api";
import { useWorkspaceId } from "@multica/core/hooks";
import { useCurrentWorkspace } from "@multica/core/paths";
import {
  gitProviderFromUrl,
  localPathSummary,
  projectResourcesOptions,
  useCreateProjectResource,
  useDeleteProjectResource,
  useMoveProjectResource,
  useUpdateProjectResource,
} from "@multica/core/projects";
import { runtimeListOptions } from "@multica/core/runtimes";
import { workspaceKeys } from "@multica/core/workspace/queries";
import type {
  AgentRuntime,
  GitRepositoryRole,
  GithubRepoResourceRef,
  LocalDirectoryResourceRef,
  ProjectResource,
  Workspace,
} from "@multica/core/types";
import { Button } from "@multica/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@multica/ui/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@multica/ui/components/ui/tooltip";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../../i18n";
import {
  checkRepositoryAccess,
  isDesktopShell,
  pickDirectory,
  type RepositoryAccessStatus,
  useLocalDaemonStatus,
  validateLocalDirectory,
  type ValidateLocalDirectoryResult,
} from "../../platform";

const REPOSITORY_ROLES: GitRepositoryRole[] = [
  "frontend",
  "backend",
  "docs",
  "infra",
  "other",
];

function isGithubRef(resource: ProjectResource): resource is ProjectResource & {
  resource_ref: GithubRepoResourceRef;
} {
  return resource.resource_type === "github_repo";
}

function isLocalDirectoryRef(
  resource: ProjectResource,
): resource is ProjectResource & { resource_ref: LocalDirectoryResourceRef } {
  return resource.resource_type === "local_directory";
}

export function ProjectResourcesSection({ projectId }: { projectId: string }) {
  const { t } = useT("projects");
  const wsId = useWorkspaceId();
  const workspace = useCurrentWorkspace();
  const queryClient = useQueryClient();
  const daemonStatus = useLocalDaemonStatus();
  const desktop = isDesktopShell();
  const [open, setOpen] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const { data: resources = [] } = useQuery(
    projectResourcesOptions(wsId, projectId),
  );
  const { data: runtimes = [] } = useQuery(runtimeListOptions(wsId));
  const createResource = useCreateProjectResource(wsId, projectId);
  const updateResource = useUpdateProjectResource(wsId, projectId);
  const deleteResource = useDeleteProjectResource(wsId, projectId);
  const moveResource = useMoveProjectResource(wsId, projectId);

  const repositories = resources.filter(isGithubRef);
  const localDirectories = resources.filter(isLocalDirectoryRef);
  const unknownResources = resources.filter(
    (resource) => !isGithubRef(resource) && !isLocalDirectoryRef(resource),
  );
  const runtimeMachines = useMemo(() => localRuntimeMachines(runtimes), [runtimes]);

  const remove = async (resource: ProjectResource) => {
    try {
      await deleteResource.mutateAsync(resource.id);
      toast.success(t(($) => $.resources.toast_removed));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t(($) => $.resources.toast_remove_failed),
      );
    }
  };

  const move = async (
    resourceId: string,
    direction: "up" | "down",
  ) => {
    try {
      await moveResource.mutateAsync({ resourceId, direction });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t(($) => $.resources.toast_reorder_failed),
      );
    }
  };

  const saveWorkspaceRepository = async (url: string) => {
    if (!workspace || workspace.repos?.some((repo) => repo.url === url)) return;
    const updated = await api.updateWorkspace(workspace.id, {
      repos: [...(workspace.repos ?? []), { url }],
    });
    queryClient.setQueryData<Workspace[]>(workspaceKeys.list(), (old) =>
      old?.map((item) => (item.id === updated.id ? updated : item)),
    );
  };

  return (
    <div>
      <button
        type="button"
        className={cn(
          "mb-2 flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-accent/70",
          !open && "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => setOpen((value) => !value)}
      >
        {t(($) => $.resources.section_header)}
        <ChevronRight
          className={cn(
            "size-3 shrink-0 stroke-[2.5] text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="space-y-3 pl-2">
          {resources.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t(($) => $.resources.empty)}
            </p>
          )}

          {repositories.length > 0 && (
            <ResourceGroup title={t(($) => $.resources.repositories_group)}>
              {repositories.map((resource, index) => (
                <RepositoryRow
                  key={resource.id}
                  resource={resource}
                  hasLocalFallback={localDirectories.length > 0}
                  canMoveUp={index > 0}
                  canMoveDown={index < repositories.length - 1}
                  canCheckAccess={desktop && daemonStatus.running}
                  onMove={move}
                  onRemove={() => remove(resource)}
                  onUpdate={(data) =>
                    updateResource.mutateAsync({ resourceId: resource.id, data })
                  }
                />
              ))}
            </ResourceGroup>
          )}

          {localDirectories.length > 0 && (
            <ResourceGroup title={t(($) => $.resources.local_directories_group)}>
              {localDirectories.map((resource, index) => (
                <LocalDirectoryRow
                  key={resource.id}
                  resource={resource}
                  desktop={desktop}
                  localDaemonId={daemonStatus.daemonId}
                  machine={runtimeMachines.find(
                    (runtime) => runtime.daemonId === resource.resource_ref.daemon_id,
                  )}
                  canMoveUp={index > 0}
                  canMoveDown={index < localDirectories.length - 1}
                  onMove={move}
                  onRemove={() => remove(resource)}
                  onUpdate={(data) =>
                    updateResource.mutateAsync({ resourceId: resource.id, data })
                  }
                />
              ))}
            </ResourceGroup>
          )}

          {unknownResources.length > 0 && (
            <ResourceGroup title={t(($) => $.resources.other_resources_group)}>
              {unknownResources.map((resource) => (
                <UnknownResourceRow
                  key={resource.id}
                  resource={resource}
                />
              ))}
            </ResourceGroup>
          )}

          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-3" />
                  {t(($) => $.resources.add_button)}
                </Button>
              }
            />
            <PopoverContent align="start" className="w-80 p-3">
              <AddResourceForm
                desktop={desktop}
                workspaceRepos={workspace?.repos ?? []}
                runtimes={runtimeMachines}
                localDaemonId={daemonStatus.daemonId}
                localDaemonRunning={daemonStatus.running}
                existingLocalDaemonIds={new Set(
                  localDirectories.map((resource) => resource.resource_ref.daemon_id),
                )}
                pending={createResource.isPending}
                onCreate={async (data, saveToWorkspace) => {
                  let created: ProjectResource;
                  try {
                    created = await createResource.mutateAsync(data);
                    setAddOpen(false);
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : t(($) => $.resources.toast_save_failed),
                    );
                    return;
                  }
                  if (
                    saveToWorkspace &&
                    created.resource_type === "github_repo" &&
                    isGithubRef(created)
                  ) {
                    try {
                      await saveWorkspaceRepository(created.resource_ref.url);
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : t(($) => $.resources.toast_workspace_save_failed),
                      );
                    }
                  }
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}

function ResourceGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h4 className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function UnknownResourceRow({
  resource,
}: {
  resource: ProjectResource;
}) {
  return (
    <div className="group flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1.5 hover:border-border hover:bg-accent/30">
      <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">
          {resource.label || resource.resource_type}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {resource.resource_type}
        </div>
      </div>
    </div>
  );
}

interface RowActionsProps {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: "up" | "down") => void;
  onEdit?: () => void;
  onRemove: () => void;
}

function RowActions({
  canMoveUp,
  canMoveDown,
  onMove,
  onEdit,
  onRemove,
}: RowActionsProps) {
  const { t } = useT("projects");
  return (
    <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <IconButton
        label={t(($) => $.resources.move_up)}
        disabled={!canMoveUp}
        onClick={() => onMove("up")}
      >
        <ArrowUp className="size-3" />
      </IconButton>
      <IconButton
        label={t(($) => $.resources.move_down)}
        disabled={!canMoveDown}
        onClick={() => onMove("down")}
      >
        <ArrowDown className="size-3" />
      </IconButton>
      {onEdit && (
        <IconButton label={t(($) => $.resources.edit_tooltip)} onClick={onEdit}>
          <Pencil className="size-3" />
        </IconButton>
      )}
      <IconButton label={t(($) => $.resources.remove_tooltip)} onClick={onRemove}>
        <Trash2 className="size-3" />
      </IconButton>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

interface RepositoryRowProps {
  resource: ProjectResource & { resource_ref: GithubRepoResourceRef };
  hasLocalFallback: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canCheckAccess: boolean;
  onMove: (resourceId: string, direction: "up" | "down") => Promise<void>;
  onRemove: () => void;
  onUpdate: (data: {
    resource_ref?: GithubRepoResourceRef;
    label?: string | null;
  }) => Promise<unknown>;
}

function RepositoryRow({
  resource,
  hasLocalFallback,
  canMoveUp,
  canMoveDown,
  canCheckAccess,
  onMove,
  onRemove,
  onUpdate,
}: RepositoryRowProps) {
  const { t } = useT("projects");
  const [editing, setEditing] = useState(false);
  const [access, setAccess] = useState<RepositoryAccessStatus>(
    canCheckAccess || !isDesktopShell() ? "not_checked" : "daemon_offline",
  );
  const [checking, setChecking] = useState(false);
  const ref = resource.resource_ref;
  const provider = ref.provider ?? gitProviderFromUrl(ref.url);
  const desktop = isDesktopShell();

  useEffect(() => {
    setAccess((current) => {
      if (!desktop) return "not_checked";
      if (!canCheckAccess) return "daemon_offline";
      return current === "daemon_offline" ? "not_checked" : current;
    });
  }, [canCheckAccess, desktop]);

  const check = async () => {
    setChecking(true);
    try {
      const result = await checkRepositoryAccess(ref.url);
      setAccess(result.status);
    } catch {
      setAccess("network_failed");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="group rounded-md border border-transparent px-1.5 py-1.5 hover:border-border hover:bg-accent/30">
      <div className="flex items-start gap-2">
        <FolderGit className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-xs font-medium hover:underline"
                >
                  {resource.label || ref.url}
                </a>
              }
            />
            <TooltipContent side="top" className="max-w-sm break-all">
              {ref.url}
            </TooltipContent>
          </Tooltip>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
            <span>{providerLabel(provider)}</span>
            {ref.role && <Pill>{ref.role}</Pill>}
            {ref.default_branch_hint && <Pill>{ref.default_branch_hint}</Pill>}
            {hasLocalFallback && <Pill>{t(($) => $.resources.remote_fallback)}</Pill>}
            <button
              type="button"
              onClick={() => void check()}
              disabled={checking || !canCheckAccess}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 hover:bg-accent disabled:cursor-default",
                access === "accessible" && "text-success",
                (access === "auth_required" || access === "not_found") &&
                  "text-destructive",
              )}
            >
              <RefreshCw className={cn("size-2.5", checking && "animate-spin")} />
              {accessLabel(access, t)}
            </button>
          </div>
        </div>
        <RowActions
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMove={(direction) => void onMove(resource.id, direction)}
          onEdit={() => setEditing(true)}
          onRemove={onRemove}
        />
      </div>
      {editing && (
        <RepositoryEditForm
          resource={resource}
          onCancel={() => setEditing(false)}
          onSave={async (data) => {
            await onUpdate(data);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function RepositoryEditForm({
  resource,
  onCancel,
  onSave,
}: {
  resource: ProjectResource & { resource_ref: GithubRepoResourceRef };
  onCancel: () => void;
  onSave: (data: {
    resource_ref: GithubRepoResourceRef;
    label: string | null;
  }) => Promise<void>;
}) {
  const { t } = useT("projects");
  const ref = resource.resource_ref;
  const [label, setLabel] = useState(resource.label ?? "");
  const [branch, setBranch] = useState(ref.default_branch_hint ?? "");
  const [role, setRole] = useState<GitRepositoryRole | "">(ref.role ?? "");
  const [guide, setGuide] = useState(ref.pr_creation_guide ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="mt-2 space-y-2 border-t pt-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          await onSave({
            label: label.trim() || null,
            resource_ref: {
              ...ref,
              provider: ref.provider ?? gitProviderFromUrl(ref.url),
              default_branch_hint: branch.trim() || undefined,
              role: role || undefined,
              pr_creation_guide: guide.trim() || undefined,
            },
          });
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : t(($) => $.resources.toast_save_failed),
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="truncate text-[10px] text-muted-foreground">{ref.url}</div>
      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder={t(($) => $.resources.description_placeholder)}
        className="h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
          placeholder={t(($) => $.resources.default_branch_placeholder)}
          className="h-7 rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as GitRepositoryRole | "")}
          className="h-7 rounded-md border bg-background px-2 text-xs"
        >
          <option value="">{t(($) => $.resources.role_none)}</option>
          {REPOSITORY_ROLES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={guide}
        onChange={(event) => setGuide(event.target.value)}
        placeholder={t(($) => $.resources.pr_guide_placeholder)}
        rows={2}
        className="w-full resize-none rounded-md border bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <FormActions saving={saving} onCancel={onCancel} />
    </form>
  );
}

interface RuntimeMachine {
  daemonId: string;
  name: string;
  online: boolean;
}

interface LocalDirectoryRowProps {
  resource: ProjectResource & { resource_ref: LocalDirectoryResourceRef };
  desktop: boolean;
  localDaemonId: string | null;
  machine?: RuntimeMachine;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (resourceId: string, direction: "up" | "down") => Promise<void>;
  onRemove: () => void;
  onUpdate: (data: { resource_ref: LocalDirectoryResourceRef }) => Promise<unknown>;
}

function LocalDirectoryRow({
  resource,
  desktop,
  localDaemonId,
  machine,
  canMoveUp,
  canMoveDown,
  onMove,
  onRemove,
  onUpdate,
}: LocalDirectoryRowProps) {
  const { t } = useT("projects");
  const [editing, setEditing] = useState(false);
  const ref = resource.resource_ref;
  const isThisMachine = localDaemonId !== null && ref.daemon_id === localDaemonId;
  const label = ref.label || resource.label || localPathSummary(ref.local_path);

  return (
    <div className="group rounded-md border border-transparent px-1.5 py-1.5 hover:border-border hover:bg-accent/30">
      <div className="flex items-start gap-2">
        <FolderOpen className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium" title={label}>
            {label}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {localPathSummary(ref.local_path)} · {machine?.name ?? shortDaemonId(ref.daemon_id)}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
            <Pill>
              {isThisMachine
                ? t(($) => $.resources.used_on_this_machine)
                : t(($) => $.resources.bound_to_other_daemon)}
            </Pill>
            {machine?.online === false && <Pill>{t(($) => $.resources.unverified)}</Pill>}
          </div>
        </div>
        <RowActions
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMove={(direction) => void onMove(resource.id, direction)}
          onEdit={() => setEditing(true)}
          onRemove={onRemove}
        />
      </div>
      {editing && (
        <LocalDirectoryEditForm
          resource={resource}
          allowPicker={desktop && isThisMachine}
          onCancel={() => setEditing(false)}
          onSave={async (nextRef) => {
            await onUpdate({ resource_ref: nextRef });
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function LocalDirectoryEditForm({
  resource,
  allowPicker,
  onCancel,
  onSave,
}: {
  resource: ProjectResource & { resource_ref: LocalDirectoryResourceRef };
  allowPicker: boolean;
  onCancel: () => void;
  onSave: (ref: LocalDirectoryResourceRef) => Promise<void>;
}) {
  const { t } = useT("projects");
  const ref = resource.resource_ref;
  const [label, setLabel] = useState(ref.label ?? resource.label ?? "");
  const [path, setPath] = useState(ref.local_path);
  const [saving, setSaving] = useState(false);

  const choose = async () => {
    const picked = await pickDirectory(path);
    if (!picked.ok || !picked.path) return;
    const validation = await validateLocalDirectory(picked.path);
    if (!validation.ok) {
      toast.error(localValidationMessage(validation, t));
      return;
    }
    setPath(picked.path);
    if (!label.trim() && picked.basename) setLabel(picked.basename);
  };

  return (
    <form
      className="mt-2 space-y-2 border-t pt-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          await onSave({
            ...ref,
            local_path: path.trim(),
            label: label.trim() || undefined,
          });
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : t(($) => $.resources.toast_save_failed),
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder={t(($) => $.resources.local_label_placeholder)}
        className="h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="flex gap-1.5">
        <input
          value={path}
          onChange={(event) => setPath(event.target.value)}
          readOnly={allowPicker}
          className="h-7 min-w-0 flex-1 rounded-md border bg-transparent px-2 font-mono text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {allowPicker && (
          <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => void choose()}>
            {t(($) => $.resources.choose_directory)}
          </Button>
        )}
      </div>
      <FormActions saving={saving} onCancel={onCancel} />
    </form>
  );
}

function AddResourceForm({
  desktop,
  workspaceRepos,
  runtimes,
  localDaemonId,
  localDaemonRunning,
  existingLocalDaemonIds,
  pending,
  onCreate,
}: {
  desktop: boolean;
  workspaceRepos: Array<{ url: string }>;
  runtimes: RuntimeMachine[];
  localDaemonId: string | null;
  localDaemonRunning: boolean;
  existingLocalDaemonIds: Set<string>;
  pending: boolean;
  onCreate: (
    data:
      | { resource_type: "github_repo"; resource_ref: GithubRepoResourceRef; label?: string }
      | { resource_type: "local_directory"; resource_ref: LocalDirectoryResourceRef },
    saveToWorkspace: boolean,
  ) => Promise<void>;
}) {
  const { t } = useT("projects");
  const [type, setType] = useState<"repo" | "local">("repo");
  const [search, setSearch] = useState("");
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [role, setRole] = useState<GitRepositoryRole | "">("");
  const [description, setDescription] = useState("");
  const [saveToWorkspace, setSaveToWorkspace] = useState(false);
  const [daemonId, setDaemonId] = useState(localDaemonId ?? "");
  const [localPath, setLocalPath] = useState("");
  const [localLabel, setLocalLabel] = useState("");
  const selectedRuntime = runtimes.find((runtime) => runtime.daemonId === daemonId);
  const filteredRepos = workspaceRepos.filter((repo) =>
    repo.url.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const pick = async () => {
    const picked = await pickDirectory(localPath || undefined);
    if (!picked.ok || !picked.path) return;
    const validation = await validateLocalDirectory(picked.path);
    if (!validation.ok) {
      toast.error(localValidationMessage(validation, t));
      return;
    }
    setLocalPath(picked.path);
    setLocalLabel(picked.basename ?? "");
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted/60 p-0.5">
        <TypeTab active={type === "repo"} onClick={() => setType("repo")}>
          {t(($) => $.resources.repository_tab)}
        </TypeTab>
        <TypeTab active={type === "local"} onClick={() => setType("local")}>
          {t(($) => $.resources.local_directory_tab)}
        </TypeTab>
      </div>

      {type === "repo" ? (
        <form
          className="space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            await onCreate(
              {
                resource_type: "github_repo",
                resource_ref: {
                  url: url.trim(),
                  provider: gitProviderFromUrl(url),
                  default_branch_hint: branch.trim() || undefined,
                  role: role || undefined,
                },
                label: description.trim() || undefined,
              },
              saveToWorkspace,
            );
          }}
        >
          {workspaceRepos.length > 0 && (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t(($) => $.resources.repos_search_placeholder)}
                  className="h-8 w-full rounded-md border bg-transparent pl-7 pr-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="max-h-24 space-y-1 overflow-y-auto">
                {filteredRepos.map((repo) => (
                  <button
                    key={repo.url}
                    type="button"
                    onClick={() => setUrl(repo.url)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent",
                      url === repo.url && "bg-accent",
                    )}
                  >
                    <FolderGit className="size-3" />
                    <span className="truncate">{repo.url}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t(($) => $.resources.url_placeholder)}
            className="h-8 w-full rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t(($) => $.resources.description_placeholder)}
            className="h-8 w-full rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              placeholder={t(($) => $.resources.default_branch_placeholder)}
              className="h-8 rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as GitRepositoryRole | "")}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="">{t(($) => $.resources.role_none)}</option>
              {REPOSITORY_ROLES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
          {!workspaceRepos.some((repo) => repo.url === url.trim()) && (
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={saveToWorkspace}
                onChange={(event) => setSaveToWorkspace(event.target.checked)}
              />
              {t(($) => $.resources.save_to_workspace)}
            </label>
          )}
          <Button type="submit" size="sm" className="h-7 w-full" disabled={!url.trim() || pending}>
            {t(($) => $.resources.url_submit)}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            await onCreate(
              {
                resource_type: "local_directory",
                resource_ref: {
                  local_path: localPath.trim(),
                  daemon_id: daemonId,
                  label: localLabel.trim() || undefined,
                },
              },
              false,
            );
          }}
        >
          {desktop ? (
            <p className="text-[11px] text-muted-foreground">
              {localDaemonRunning
                ? t(($) => $.resources.local_this_machine)
                : t(($) => $.resources.local_daemon_offline_hint)}
            </p>
          ) : (
            <select
              value={daemonId}
              onChange={(event) => setDaemonId(event.target.value)}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            >
              <option value="">{t(($) => $.resources.select_runtime)}</option>
              {runtimes.map((runtime) => (
                <option
                  key={runtime.daemonId}
                  value={runtime.daemonId}
                  disabled={existingLocalDaemonIds.has(runtime.daemonId)}
                >
                  {runtime.name} · {runtime.online ? t(($) => $.resources.online) : t(($) => $.resources.offline)}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-1.5">
            <input
              value={localPath}
              onChange={(event) => setLocalPath(event.target.value)}
              readOnly={desktop}
              placeholder={t(($) => $.resources.local_path_placeholder)}
              className="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 font-mono text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {desktop && (
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void pick()} disabled={!localDaemonRunning}>
                {t(($) => $.resources.choose_directory)}
              </Button>
            )}
          </div>
          <input
            value={localLabel}
            onChange={(event) => setLocalLabel(event.target.value)}
            placeholder={t(($) => $.resources.local_label_placeholder)}
            className="h-8 w-full rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {selectedRuntime?.online === false && (
            <p className="text-[10px] text-muted-foreground">
              {t(($) => $.resources.offline_unverified_hint)}
            </p>
          )}
          {daemonId && existingLocalDaemonIds.has(daemonId) && (
            <p className="text-[10px] text-destructive">
              {t(($) => $.resources.local_daemon_already_attached_hint)}
            </p>
          )}
          <Button
            type="submit"
            size="sm"
            className="h-7 w-full"
            disabled={
              pending ||
              !daemonId ||
              !localPath.trim() ||
              existingLocalDaemonIds.has(daemonId) ||
              (desktop && !localDaemonRunning)
            }
          >
            {t(($) => $.resources.add_local_directory_button)}
          </Button>
        </form>
      )}
    </div>
  );
}

function TypeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2 py-1 text-xs transition-colors",
        active
          ? "bg-background font-medium shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FormActions({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  const { t } = useT("projects");
  return (
    <div className="flex justify-end gap-1.5">
      <Button type="button" variant="ghost" size="sm" className="h-6" onClick={onCancel}>
        {t(($) => $.resources.cancel)}
      </Button>
      <Button type="submit" size="sm" className="h-6" disabled={saving}>
        {t(($) => $.resources.save)}
      </Button>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-muted px-1.5 py-0.5">{children}</span>;
}

function localRuntimeMachines(runtimes: AgentRuntime[]): RuntimeMachine[] {
  const byDaemon = new Map<string, RuntimeMachine>();
  for (const runtime of runtimes) {
    if (runtime.runtime_mode === "cloud" || !runtime.daemon_id) continue;
    const current = byDaemon.get(runtime.daemon_id);
    byDaemon.set(runtime.daemon_id, {
      daemonId: runtime.daemon_id,
      name: current?.name || runtime.name || shortDaemonId(runtime.daemon_id),
      online: current?.online === true || runtime.status === "online",
    });
  }
  return [...byDaemon.values()].toSorted((a, b) => a.name.localeCompare(b.name));
}

function shortDaemonId(daemonId: string): string {
  return daemonId.length > 12 ? `${daemonId.slice(0, 8)}…` : daemonId;
}

function providerLabel(provider: string): string {
  switch (provider) {
    case "github":
      return "GitHub";
    case "gitlab":
      return "GitLab";
    case "self_hosted":
      return "Self-hosted Git";
    default:
      return "Generic Git";
  }
}

function accessLabel(
  status: RepositoryAccessStatus,
  t: TFunction<"projects">,
): string {
  switch (status) {
    case "accessible":
      return t(($) => $.resources.access_accessible);
    case "auth_required":
      return t(($) => $.resources.access_auth_required);
    case "not_found":
      return t(($) => $.resources.access_not_found);
    case "network_failed":
      return t(($) => $.resources.access_network_failed);
    case "daemon_offline":
      return t(($) => $.resources.access_daemon_offline);
    case "not_checked":
    default:
      return t(($) => $.resources.access_not_checked);
  }
}

function localValidationMessage(
  result: ValidateLocalDirectoryResult,
  t: TFunction<"projects">,
): string {
  switch (result.reason) {
    case "not_absolute":
      return t(($) => $.resources.local_validate_not_absolute);
    case "not_found":
      return t(($) => $.resources.local_validate_not_found);
    case "not_a_directory":
      return t(($) => $.resources.local_validate_not_a_directory);
    case "not_readable":
      return t(($) => $.resources.local_validate_not_readable);
    case "not_writable":
      return t(($) => $.resources.local_validate_not_writable);
    case "unsafe":
      return t(($) => $.resources.local_validate_unsafe);
    case "unsupported":
      return t(($) => $.resources.local_validate_unsupported);
    case "error":
    default:
      return result.error ?? t(($) => $.resources.toast_local_pick_failed);
  }
}
