# Project 关联 Git 工程功能需求文档

## Problem Statement

当前 Multica 的 Project 已经可以挂 `github_repo` / `local_directory` 类型的资源，但产品表达偏“资源”而不是“代码工程”。用户真正想完成的是：

在一个 Project 下关联一个或多个代码工程，让 Agent 能根据 issue 自动知道应该在哪些仓库或本地目录改代码，并在具备凭证时提交 commit、push、创建 PR/MR。

## 当前底层能力

现有底层已经支持：

- Project 可挂多个 `project_resource`。
- `resource_type = github_repo` 虽然名字叫 GitHub，但 URL 校验接受通用 Git URL，包括 GitLab、自建 GitLab、SSH URL。
- Daemon 会把 Project resources 注入 Agent 工作目录和 prompt。
- Agent 可用 `multica repo checkout <url>` checkout 仓库。
- 多仓库会进入 repo list，Agent 可按需 checkout。
- `local_directory` 可让 Agent 直接在某台 daemon 所在机器的已有目录工作，不 clone、不复制、不创建 worktree。
- 同一 Project 在同一台 daemon 上最多绑定一个 `local_directory`，同一路径上的任务会串行等待。
- 同一 Project 同时存在 `github_repo` 和匹配当前 daemon 的 `local_directory` 时，本地目录优先作为 Agent 的实际工作树。
- GitHub App 集成目前是 PR 只读同步，不负责 push / 开 PR。

## Goals

1. 让 Project 页面显式支持“关联 Git 工程”。
2. 支持一个 Project 关联多个 Git 仓库。
3. 支持 GitHub、GitLab、自建 Git 服务。
4. 支持 Project 关联 `local_directory` 类型的本地代码目录，用于超大仓库或需要原地 review 的场景。
5. 让 Agent 更稳定地知道：主仓库、默认分支、仓库用途、本地目录覆盖关系、是否可访问。
6. 为“自动提交 PR/MR”提供短期可用路径和长期平台能力路径。

## User Stories

1. 作为项目负责人，我想在 Project 页面添加 Git 仓库 URL，以便 Agent 执行 issue 时知道要改哪个代码库。
2. 作为项目负责人，我想一个 Project 关联多个 Git 仓库，以便前端、后端、SDK 可以一起作为项目上下文。
3. 作为 GitLab 用户，我想粘贴 GitLab 仓库地址，以便不用只依赖 GitHub。
4. 作为 Agent 使用者，我想标记某个仓库为主仓库，以便 Agent 优先 checkout 正确仓库。
5. 作为项目负责人，我想给仓库设置默认分支，以便 Agent 基于 `main`、`develop` 或 release 分支工作。
6. 作为项目负责人，我想给仓库加描述，比如“前端”“后端”“文档”，以便 Agent 不猜。
7. 作为用户，我想看到仓库是否能被当前 daemon 访问，以便提前发现私有仓库凭证问题。
8. 作为用户，我想在 Project 创建时一次性选择多个 repo，以便减少后续配置。
9. 作为用户，我想在 Project 详情页继续添加、编辑、删除 repo，以便维护项目代码范围。
10. 作为团队成员，我想 Agent 创建的 PR/MR 自动关联 Multica issue，以便代码进展能回流到任务页面。
11. 作为管理员，我想控制谁可以修改 Project 关联的 Git 工程，以免普通成员误改执行上下文。
12. 作为自建 GitLab 用户，我想配置 GitLab webhook，以便 MR 状态也能同步到 Multica。
13. 作为本地开发者，我想把 Project 绑定到我机器上的已有目录，以便 Agent 可以直接在我正在 review 的 checkout 里工作。
14. 作为大仓库维护者，我想用 `local_directory` 跳过重复 clone，以便几十 GB 或带大量 LFS 资源的仓库也能被 Agent 高效处理。
15. 作为桌面端用户，我想通过文件夹选择器添加本地目录，以便不用手动输入容易出错的绝对路径。
16. 作为 CLI 用户，我想用命令为 Project 添加本地目录，以便在无桌面 UI 或自动化环境中配置资源。
17. 作为团队成员，我想看到某个本地目录绑定在哪台 daemon 上，以便理解为什么只有特定机器会原地执行任务。
18. 作为 Agent 使用者，我想当本地目录忙碌时看到任务正在等待释放，以便知道任务不是失败而是在排队。

## Proposed Features

### 1. Project 页面增加“Git 工程”区块

#### 需求

在 Project Detail 页面增加一个更明确的区块，名称从“Resources”弱化为“Git projects / Git repositories”。展示：

- 仓库 URL
- provider：GitHub / GitLab / Self-hosted / Generic Git
- 默认分支
- 用途标签：frontend / backend / docs / infra / other
- 是否主仓库
- 最近访问检测状态

#### 实现思路

- 复用现有 Project Resources CRUD。
- 前端主要扩展 `ProjectResourcesSection`。
- 存储层短期继续使用 `resource_type = github_repo`，避免破坏已有桌面端/API。
- UI 文案显示为“Git repository”，不要暴露 `github_repo` 这个内部名字。
- `resource_ref` 增加可选字段：

```json
{
  "url": "...",
  "default_branch_hint": "main",
  "provider": "gitlab",
  "role": "backend",
  "primary": true
}
```

### 2. 支持 GitLab / 自建 Git URL

#### 需求

用户可以添加：

```text
https://gitlab.com/group/repo.git
git@gitlab.com:group/repo.git
git@gitlab.example.com:group/repo.git
ssh://git@gitlab.example.com:22/group/repo.git
```

#### 实现思路

- 后端现有 URL 校验已经基本支持。
- 产品上不要新建“GitLab repo”类型，短期统一叫 Git repository。
- 前端根据 URL host 推断 provider：
  - `github.com` -> GitHub
  - `gitlab.com` -> GitLab
  - 其他 -> Self-hosted Git
- provider 仅用于展示和后续 webhook 能力，不影响 daemon checkout。

### 3. 多仓库管理

#### 需求

一个 Project 可添加多个 Git 工程，并支持排序和主仓库标记。

#### 实现思路

- 现有 `project_resource.position` 可用于排序。
- 新增 UI 拖拽排序或上下移动按钮。
- `primary` 可放在 `resource_ref` 中。
- Agent prompt 里按主仓库、排序后的顺序展示。
- 如果没有主仓库，默认第一个 Git repo 为 primary。

### 4. 默认分支 / 基准 ref

#### 需求

每个 Git 工程可以配置默认分支，例如 `main`、`develop`、`release/1.0`。

#### 实现思路

- 现有 `default_branch_hint` 已支持。
- UI 增加编辑入口。
- Agent prompt 中明确：

```text
Default branch: main
Use `multica repo checkout <url> --ref main`
```

- Daemon 层无需强制 checkout 默认分支，继续让 Agent 按提示调用 checkout；后续可增强为 checkout 自动使用 hint。

### 5. 仓库可访问性检测

#### 需求

用户添加仓库后，页面显示当前 daemon 是否能访问该仓库。

状态：

- Accessible
- Auth required
- Not found
- Network failed
- Not checked
- Daemon offline

#### 实现思路

- 增加 daemon 本地健康检测接口，例如 `POST /repo/check`。
- 内部运行：

```bash
git ls-remote <url>
```

- 检测时设置 `GIT_TERMINAL_PROMPT=0`，避免卡住。
- Web 端无法直接检测本机 Git 凭证，只有桌面端或 daemon 在线时显示检测结果。
- 后端不保存用户 Git token，只保存检测结果摘要和时间可选。
- UI 在 Project Git 工程行展示状态 pill。

### 6. 从 Workspace 仓库库中选择

#### 需求

Workspace Settings 已有 Repositories，Project 添加 Git 工程时可以：

- 从 Workspace 已保存仓库中选择
- 粘贴临时 URL
- 添加后可选择是否同步加入 Workspace 仓库库

#### 实现思路

- 现有创建 Project modal 已有 Repos 入口，可扩展。
- Project 页面 Add Git repository popover 中保留搜索 workspace repos。
- 新增 checkbox：“Also save to workspace repositories”。
- 保存 workspace repo 仍走 workspace update API；Project resource 走 project resource API。

### 7. 本地目录与 Git 仓库绑定

#### 需求

用户既可以关联远程 Git 仓库，也可以指定本机目录作为该仓库的执行目录。本地目录适用于：

- 超大仓库、游戏项目、LFS 资源仓库等 clone 成本很高的项目。
- 用户希望 Agent 直接在当前 checkout 中改代码，并随时用本地编辑器 review 的项目。
- 需要复用本机已有依赖、构建产物、子模块或非标准开发环境的项目。

#### 实现思路

- 现有 `local_directory` 已支持，但它和 `github_repo` 是两个独立资源。
- 可增强为 UI 上“为这个 Git 仓库绑定本地目录”。
- 存储上有两个选择：
  - 短期：继续创建一条 `local_directory`，label 指向 repo 名称。
  - 长期：在 `local_directory.resource_ref` 里增加 `repo_url`，让 daemon 更明确地知道这是哪个 remote 的本地覆盖。
- 执行优先级沿用现状：当前 daemon 有匹配 `local_directory` 时优先本地目录，否则走 git worktree。

### 8. Project 可直接添加 `local_directory` 资源

#### 需求

Project 页面需要把 `local_directory` 作为可直接添加的一等资源，而不是只作为 Git repo 的隐藏补充。用户可以在 Project Detail 页面点击“添加本地目录”，选择当前机器上的目录，保存后该 Project 下的 Agent 任务会在匹配 daemon 上原地执行。

页面展示：

- 本地目录 label
- 脱敏后的路径，例如 `code/multica`，避免暴露完整 home 路径
- 绑定 daemon 名称 / 当前机器标识
- 当前机器是否匹配该资源
- 是否正在等待目录释放
- 删除、重命名、重新选择目录入口

#### 实现思路

- 复用现有 `resource_type = local_directory`：

```json
{
  "resource_type": "local_directory",
  "resource_ref": {
    "local_path": "/Users/me/code/multica",
    "daemon_id": "00000000-0000-0000-0000-000000000000",
    "label": "主开发目录"
  }
}
```

- 桌面端使用原生文件夹选择器拿到绝对路径和 basename。
- Web 端不展示文件夹选择器；可展示已存在的本地目录资源，但不提供新增本地目录入口。
- 添加前调用桌面端/daemon 本地校验，确认路径存在、是目录、可读、可写。
- 服务端继续只做“绝对路径形态”校验，真实文件系统校验由 daemon 执行。
- 同一 Project + 同一 daemon 最多允许一个 `local_directory`，API 返回 `409` 时 UI 展示清晰错误。
- 创建成功后更新 Project Resources query cache，并通过 realtime 或 query invalidation 刷新其他打开页面。

### 9. `local_directory` 路径校验与安全边界

#### 需求

添加本地目录时必须避免误选系统目录、用户 home 根目录、临时目录或不可写目录，避免 Agent 在危险路径下写文件。

校验规则：

- 必须是绝对路径。
- 必须存在且是目录。
- daemon 进程必须可读、可写。
- 不允许 `/`、`/Users`、`/home`、`/root`、`/etc`、`/tmp`、`/var`、`/usr`、`/opt`、用户 `$HOME`、Windows 盘根等高风险路径。
- symlink 解析后仍不能指向黑名单路径。

#### 实现思路

- 桌面端选择目录后调用本地 `validateLocalDirectory(path)`。
- Daemon 任务启动前再次校验，防止保存后路径被移动、权限变化或 symlink 被替换。
- UI 错误信息按原因区分：
  - not absolute
  - not found
  - not a directory
  - not readable
  - not writable
  - unsupported / unsafe path
- 不把完整本地路径写入远程通知、公共评论或普通成员可见的高曝光区域；列表中优先展示 label 和相对脱敏路径。

### 10. `local_directory` 执行模型与等待状态

#### 需求

当 Project 绑定了当前 daemon 的 `local_directory` 时，Agent 任务应直接在该目录执行；同一目录上的任务串行，第二个任务需要显示“等待本地目录释放”。

#### 实现思路

- Daemon claim 到任务后，根据 `ProjectResources` 查找 `resource_type = local_directory` 且 `daemon_id` 匹配当前 daemon 的资源。
- 找到匹配资源后，跳过 `github_repo` worktree 创建，把 `work_dir` 设置为该本地目录。
- 以 symlink 解析后的真实路径为 key 获取目录锁。
- 如果锁被占用，把任务状态推进到 `waiting_local_directory`。
- 当前 UI 已有 waiting 状态，可在 Project 资源行或 issue 执行记录中补充“正在等待此目录”的提示。
- 任务取消或完成时释放目录锁；等待任务继续执行。
- 等待不设置默认超时，由用户取消或前一个任务结束来推进。

### 11. `github_repo` 与 `local_directory` 的混用规则

#### 需求

同一个 Project 可能同时配置远程 Git 仓库和本地目录。用户需要清楚知道：什么时候 Agent 走远程 worktree，什么时候走本地目录。

#### 实现思路

- 如果任务运行的 daemon 有匹配 `local_directory`，该本地目录优先成为实际工作树。
- 如果任务运行的 daemon 没有匹配 `local_directory`，则回退到 Project 的 `github_repo` 资源，通过 `multica repo checkout` 创建 worktree。
- `github_repo` 仍写入 Agent prompt 和 `.multica/project/resources.json`，即使当前任务实际运行在本地目录中，也作为远程来源参考。
- 在 Project 页面上把这种关系可视化：
  - Git repo 行显示“Remote fallback”。
  - Local directory 行显示“Used on this machine”或“Bound to another daemon”。
- 如果 `local_directory.resource_ref.repo_url` 后续被引入，则 UI 可明确展示“这个本地目录覆盖哪个远程仓库”。

### 12. `local_directory` 的 CLI 管理能力

#### 需求

用户需要通过 CLI 添加、更新、删除本地目录资源，支持纯命令行或自动化配置。

#### 实现思路

- 继续支持现有通用 project resource 命令：

```bash
multica project resource add <project-id> \
  --type local_directory \
  --local-path /Users/me/code/big-game \
  --daemon-id <daemon-uuid> \
  --ref-label "主开发目录"
```

- `--daemon-id` 可通过 `multica daemon list` 获取。
- CLI 在发请求前做基础参数校验：local path 非空、daemon id 非空、路径看起来是绝对路径。
- 如果 CLI 在本机运行且 daemon 可访问，可增加可选的本地路径预校验。
- CLI 输出中显示 resource id、label、daemon id、local path 摘要。

### 13. PR/MR 创建能力：短期 Prompt 驱动

#### 需求

Agent 完成代码修改后，可以提交 commit、push、创建 PR/MR。

#### 实现思路

短期不需要 Multica 直接写 Git 平台。依赖运行机器已有工具：

- GitHub：`gh auth login`
- GitLab：`glab auth login`
- 通用 Git：SSH key / PAT / credential helper

Project Git 工程配置里增加“PR/MR 指南”字段：

```text
Create branch from main.
Branch name should include issue key.
Use gh pr create / glab mr create.
PR/MR title must include issue key.
```

Agent prompt 自动注入这些规则。

### 14. PR/MR 平台级同步：长期集成

#### 需求

GitHub PR / GitLab MR 自动显示在 Multica issue 详情页，并在 merge 后自动推进 issue 状态。

#### 实现思路

- GitHub 现有只读集成可继续保留。
- GitLab 需要新增独立集成：
  - GitLab OAuth / token 配置
  - webhook endpoint：`/api/webhooks/gitlab`
  - 处理 `merge_request` 事件
  - 从 branch/title/description 解析 issue key
  - 写入统一表或新增通用 code review 表
- 长期建议抽象命名从 `github_pull_request` 演进为通用 `code_change_request`，字段包含：
  - provider
  - repo_owner / repo_name / project_path
  - number / iid
  - title
  - url
  - state
  - merged
  - source_branch
  - target_branch

### 15. Issue 与 Git 工程的默认关系

#### 需求

Project 下的 issue 默认继承 Project Git 工程；单个 issue 也可以覆盖或指定具体仓库。

#### 实现思路

- V1：只做 Project 级别，不做 issue 覆盖。
- V2：issue metadata 或 issue-resource link 支持指定 repo。
- UI 在 issue 创建时可选择“Target repo”。
- Agent prompt 优先级：
  1. issue 指定 repo
  2. project primary repo
  3. project repo list
  4. workspace repo fallback

## Page Design

可以增加到页面上，而且适合分两处：

1. **Project Detail 页面**
   - 右侧或主体区增加“Code resources”或“Git repositories & local directories”。
   - 支持 add/edit/remove/check access。
   - 展示 repo 状态、默认分支、本地目录绑定状态。
   - 分组展示 Remote repositories 与 Local directories，避免用户误以为本地目录会同步到所有机器。
2. **Create Project Modal**
   - 保留现有 Repos pill。
   - 增强为可添加 GitHub/GitLab/自建 Git URL。
   - 支持多选 workspace repos。
   - 支持设置 primary repo。
   - 桌面端增加 Local directory 入口；Web 端隐藏该入口。
3. **Issue / Task 状态区域**
   - 当任务处于 `waiting_local_directory` 时，显示“等待本地目录释放”。
   - 如果任务运行在本地目录中，显示脱敏路径或 label，帮助用户定位改动在哪里。

不建议把这个能力藏在 Settings 里。Settings 适合维护 workspace 级仓库库，Project 页面才是“这个项目到底关联哪些代码工程”的主入口。

## Implementation Decisions

- V1 不改数据库 schema，继续使用 `project_resource.resource_ref` JSONB 扩展字段。
- V1 不新增 `git_repo` resource type，避免破坏已有 API/桌面端；UI 层改名为 Git repository。
- 后端校验允许新增可选字段，但继续兼容旧 `{ url, default_branch_hint }`。
- V1 继续使用现有 `local_directory` resource type，并把它作为 Project 页面上的一等资源入口。
- Web 端只读展示 `local_directory`，桌面端提供添加/校验/重命名/删除。
- 同一 Project + 同一 daemon 仍最多允许一个 `local_directory`，该限制由 API 和 UI 双重表达。
- Agent prompt 增强 Project Context，把 primary、role、default branch 写清楚。
- Agent prompt 增强 Local directory Context，把本地目录 label、绑定 daemon、远程 fallback 关系写清楚。
- Daemon repo cache 继续使用现有 bare clone + worktree 机制。
- Daemon 对匹配当前 daemon 的 `local_directory` 保持优先执行，不匹配时回退到 `github_repo`。
- GitLab MR 同步作为独立后续能力，不混进基础 Git 工程关联。
- 自动开 PR/MR 第一阶段依赖 Agent 本机 CLI 和凭证，不由 Multica server 代持写权限 token。

## Testing Decisions

- 后端测试：`validateGithubRepoRef` 接受 GitLab、自建 GitLab、SSH URL、新增字段。
- API 测试：Project create 携带多个 Git repos 时事务性创建成功；重复 URL 被合理处理。
- 前端测试：Project Git repositories 区块可添加、删除、编辑默认分支、展示 provider。
- 前端测试：桌面端可添加 `local_directory`，Web 端隐藏新增入口但能展示已有资源。
- 前端测试：同一 daemon 已有本地目录时，新增按钮置灰并显示原因。
- Daemon 测试：project repo 覆盖 workspace repo 的优先级不变；GitLab URL 可进入 repo cache。
- Daemon 测试：匹配当前 daemon 的 `local_directory` 优先于 `github_repo`，不匹配时回退到 worktree。
- Daemon 测试：同一本地目录并发任务进入 `waiting_local_directory`，前一个任务完成后继续执行。
- Prompt 测试：primary repo、default branch、role 会进入 Agent context。
- Prompt 测试：local directory label、路径摘要、daemon 绑定关系会进入 Agent context。
- 可访问性检测测试：daemon offline、auth failed、success 三类 UI 状态。

## Out of Scope

- V1 不由 Multica server 保存 GitLab/GitHub 写权限 token。
- V1 不保证 Agent 一定会创建 PR/MR，只提供上下文和指令。
- V1 不做 GitLab MR webhook 同步。
- V1 不做 issue 级 repo 覆盖。
- V1 不做代码权限审计或文件级锁。
- V1 不支持同一台 daemon 给同一 Project 绑定多个本地目录。
- V1 不自动 stash、切分支、保护或还原本地目录里的脏改动。
- V1 不承诺本地目录里的改动会自动 commit、push 或开 PR/MR。

## Recommended Roadmap

1. **V1：Project Git repositories UI 增强**
   - 改文案、支持 GitLab 展示、支持默认分支/role/primary。
2. **V2：Local directory 一等入口**
   - Project 页面支持添加、展示、重命名、删除 `local_directory`。
   - 桌面端接文件夹选择器和本地路径校验；Web 端只读展示。
   - Issue/Task 区域强化 `waiting_local_directory` 状态提示。
3. **V3：访问性检测**
   - daemon `git ls-remote` 检查，页面显示状态。
4. **V4：PR/MR 工作流指令**
   - Project 级 PR/MR creation guide，注入 Agent prompt。
5. **V5：GitLab MR 集成**
   - webhook 同步、MR 关联 issue、merge 后自动推进状态。
6. **V6：统一 Code Change 抽象**
   - 把 GitHub PR / GitLab MR 抽象成 provider-neutral change request。
