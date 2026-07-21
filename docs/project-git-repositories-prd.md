# Project 关联 Git 工程功能需求文档

## Problem Statement

当前 Multica 的 Project 已经可以挂 `github_repo` / `local_directory` 类型的资源，但产品表达偏“资源”而不是“代码工程”。用户真正想完成的是：

在一个 Project 下关联一个或多个 Git 工程，让 Agent 能根据 issue 自动知道应该在哪些仓库改代码，并在具备凭证时提交 commit、push、创建 PR/MR。

## 当前底层能力

现有底层已经支持：

- Project 可挂多个 `project_resource`。
- `resource_type = github_repo` 虽然名字叫 GitHub，但 URL 校验接受通用 Git URL，包括 GitLab、自建 GitLab、SSH URL。
- Daemon 会把 Project resources 注入 Agent 工作目录和 prompt。
- Agent 可用 `multica repo checkout <url>` checkout 仓库。
- 多仓库会进入 repo list，Agent 可按需 checkout。
- `local_directory` 可让 Agent 直接在本地已有目录工作。
- GitHub App 集成目前是 PR 只读同步，不负责 push / 开 PR。

## Goals

1. 让 Project 页面显式支持“关联 Git 工程”。
2. 支持一个 Project 关联多个 Git 仓库。
3. 支持 GitHub、GitLab、自建 Git 服务。
4. 让 Agent 更稳定地知道：主仓库、默认分支、仓库用途、是否可访问。
5. 为“自动提交 PR/MR”提供短期可用路径和长期平台能力路径。

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

用户既可以关联远程 Git 仓库，也可以指定本机目录作为该仓库的执行目录。

#### 实现思路

- 现有 `local_directory` 已支持，但它和 `github_repo` 是两个独立资源。
- 可增强为 UI 上“为这个 Git 仓库绑定本地目录”。
- 存储上有两个选择：
  - 短期：继续创建一条 `local_directory`，label 指向 repo 名称。
  - 长期：在 `local_directory.resource_ref` 里增加 `repo_url`，让 daemon 更明确地知道这是哪个 remote 的本地覆盖。
- 执行优先级沿用现状：当前 daemon 有匹配 `local_directory` 时优先本地目录，否则走 git worktree。

### 8. PR/MR 创建能力：短期 Prompt 驱动

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

### 9. PR/MR 平台级同步：长期集成

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

### 10. Issue 与 Git 工程的默认关系

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
   - 右侧或主体区增加“Git repositories”。
   - 支持 add/edit/remove/check access。
   - 展示 repo 状态和默认分支。
2. **Create Project Modal**
   - 保留现有 Repos pill。
   - 增强为可添加 GitHub/GitLab/自建 Git URL。
   - 支持多选 workspace repos。
   - 支持设置 primary repo。

不建议把这个能力藏在 Settings 里。Settings 适合维护 workspace 级仓库库，Project 页面才是“这个项目到底关联哪些代码工程”的主入口。

## Implementation Decisions

- V1 不改数据库 schema，继续使用 `project_resource.resource_ref` JSONB 扩展字段。
- V1 不新增 `git_repo` resource type，避免破坏已有 API/桌面端；UI 层改名为 Git repository。
- 后端校验允许新增可选字段，但继续兼容旧 `{ url, default_branch_hint }`。
- Agent prompt 增强 Project Context，把 primary、role、default branch 写清楚。
- Daemon repo cache 继续使用现有 bare clone + worktree 机制。
- GitLab MR 同步作为独立后续能力，不混进基础 Git 工程关联。
- 自动开 PR/MR 第一阶段依赖 Agent 本机 CLI 和凭证，不由 Multica server 代持写权限 token。

## Testing Decisions

- 后端测试：`validateGithubRepoRef` 接受 GitLab、自建 GitLab、SSH URL、新增字段。
- API 测试：Project create 携带多个 Git repos 时事务性创建成功；重复 URL 被合理处理。
- 前端测试：Project Git repositories 区块可添加、删除、编辑默认分支、展示 provider。
- Daemon 测试：project repo 覆盖 workspace repo 的优先级不变；GitLab URL 可进入 repo cache。
- Prompt 测试：primary repo、default branch、role 会进入 Agent context。
- 可访问性检测测试：daemon offline、auth failed、success 三类 UI 状态。

## Out of Scope

- V1 不由 Multica server 保存 GitLab/GitHub 写权限 token。
- V1 不保证 Agent 一定会创建 PR/MR，只提供上下文和指令。
- V1 不做 GitLab MR webhook 同步。
- V1 不做 issue 级 repo 覆盖。
- V1 不做代码权限审计或文件级锁。

## Recommended Roadmap

1. **V1：Project Git repositories UI 增强**
   - 改文案、支持 GitLab 展示、支持默认分支/role/primary。
2. **V2：访问性检测**
   - daemon `git ls-remote` 检查，页面显示状态。
3. **V3：PR/MR 工作流指令**
   - Project 级 PR/MR creation guide，注入 Agent prompt。
4. **V4：GitLab MR 集成**
   - webhook 同步、MR 关联 issue、merge 后自动推进状态。
5. **V5：统一 Code Change 抽象**
   - 把 GitHub PR / GitLab MR 抽象成 provider-neutral change request。
