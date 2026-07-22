// Desktop-only helpers for the project_resource local_directory flow.
//
// These wrap the preload `desktopAPI` surface so view components can
// SSR-render on web (where `window.desktopAPI` is undefined) and degrade
// gracefully to no-op promises instead of crashing.

export type PickDirectoryResult = {
  ok: boolean;
  path?: string;
  basename?: string;
  reason?: "cancelled" | "no_window" | "error" | "unsupported";
  error?: string;
};

export type ValidateLocalDirectoryResult = {
  ok: boolean;
  reason?:
    | "not_absolute"
    | "not_found"
    | "not_a_directory"
    | "not_readable"
    | "not_writable"
    | "unsafe"
    | "error"
    | "unsupported";
  error?: string;
};

export type RepositoryAccessStatus =
  | "accessible"
  | "auth_required"
  | "not_found"
  | "network_failed"
  | "not_checked"
  | "daemon_offline";

export interface RepositoryAccessCheckResult {
  status: RepositoryAccessStatus;
  checkedAt?: string;
}

interface DesktopLocalDirectoryAPI {
  pickDirectory?: (defaultPath?: string) => Promise<PickDirectoryResult>;
  validateLocalDirectory?: (
    path: string,
  ) => Promise<ValidateLocalDirectoryResult>;
  checkRepositoryAccess?: (
    url: string,
  ) => Promise<RepositoryAccessCheckResult>;
}

function readDesktopAPI(): DesktopLocalDirectoryAPI | undefined {
  if (typeof window === "undefined") return undefined;
  const api = (window as unknown as { desktopAPI?: DesktopLocalDirectoryAPI })
    .desktopAPI;
  return api;
}

/** True when the renderer is running inside the Electron desktop shell, as
 *  evidenced by the preload-exposed pickDirectory bridge. Avoids hard-coding
 *  navigator/process checks — those vary across electron-vite + jsdom tests. */
export function isDesktopShell(): boolean {
  const api = readDesktopAPI();
  return typeof api?.pickDirectory === "function";
}

export async function pickDirectory(
  defaultPath?: string,
): Promise<PickDirectoryResult> {
  const api = readDesktopAPI();
  if (!api?.pickDirectory) return { ok: false, reason: "unsupported" };
  return api.pickDirectory(defaultPath);
}

export async function validateLocalDirectory(
  path: string,
): Promise<ValidateLocalDirectoryResult> {
  const api = readDesktopAPI();
  if (!api?.validateLocalDirectory) return { ok: false, reason: "unsupported" };
  return api.validateLocalDirectory(path);
}

export async function checkRepositoryAccess(
  url: string,
): Promise<RepositoryAccessCheckResult> {
  const api = readDesktopAPI();
  if (!api?.checkRepositoryAccess) return { status: "not_checked" };
  return api.checkRepositoryAccess(url);
}
