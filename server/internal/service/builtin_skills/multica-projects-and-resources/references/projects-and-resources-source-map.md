# Projects and resources source map

- `server/cmd/multica/cmd_project.go` registers project `list`, `get`, `create`, `update`, `delete`, and `status`.
- The same file registers `project resource list/add/update/remove`.
- `project create --repo` attaches `github_repo` resources during project creation.
- `project resource add` supports shortcuts for `github_repo` (`--url`, `--default-branch-hint`) and `local_directory` (`--local-path`, `--daemon-id`, `--ref-label`), or generic `--ref '<json>'`.
- `project resource update` merges shortcut edits with existing `resource_ref` so a partial edit does not clobber required fields. Repository URLs and local-directory daemon IDs are immutable; changing either is remove + add.
- `server/cmd/server/router.go` exposes `/api/projects` plus `/api/projects/{projectId}/resources` routes.
- `server/pkg/db/queries/project_resource.sql` is the CRUD query surface for `project_resource` rows.
- `server/internal/daemon/execenv/runtime_config.go` renders repository provider, role, default branch, PR/MR guide, and local-directory binding context into the agent brief.
- `server/internal/daemon/health.go` exposes the local-only `/repo/check` probe used by Desktop for `git ls-remote` access checks.
- Project resources are written into `.multica/project/resources.json` for agent workdirs.
