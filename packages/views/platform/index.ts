export { useImmersiveMode } from "./use-immersive-mode";
export { useDesktopUnreadBadge } from "./use-desktop-unread-badge";
export { DragStrip } from "./drag-strip";
export { openExternal } from "./open-external";
export {
  isDesktopShell,
  pickDirectory,
  validateLocalDirectory,
  checkRepositoryAccess,
  type PickDirectoryResult,
  type ValidateLocalDirectoryResult,
  type RepositoryAccessCheckResult,
  type RepositoryAccessStatus,
} from "./local-directory";
export {
  useLocalDaemonStatus,
  type LocalDaemonStatus,
} from "./use-local-daemon-status";
export {
  ScrollRestorationProvider,
  useRestoredScrollOffset,
  useRestoredScrollRef,
  type ScrollRestorationAdapter,
} from "./scroll-restoration";
