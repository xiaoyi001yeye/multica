import { normalize, parse } from "path";

const PROTECTED_ROOTS = [
  "/",
  "/Users",
  "/home",
  "/root",
  "/etc",
  "/tmp",
  "/private/tmp",
  "/var",
  "/usr",
  "/opt",
  "/Users/Shared",
];

export function isUnsafeLocalDirectoryPath(path: string, home: string): boolean {
  const candidate = comparablePath(path);
  const root = comparablePath(parse(path).root);
  if (candidate === root) return true;
  if (candidate === comparablePath(home)) return true;
  return PROTECTED_ROOTS.some(
    (protectedRoot) => candidate === comparablePath(protectedRoot),
  );
}

function comparablePath(path: string): string {
  const normalized = normalize(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
