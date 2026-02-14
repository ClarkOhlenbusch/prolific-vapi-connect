export const buildInfo = {
  pkgVersion: __APP_PKG_VERSION__,
  gitSha: __APP_GIT_SHA__,
  gitDirty: __APP_GIT_DIRTY__,
  builtAt: __APP_BUILT_AT__,
};

export const formatBuildLabel = (options?: { baseVersion?: string; uncommittedCounter?: number }) => {
  const baseVersion = options?.baseVersion || buildInfo.pkgVersion;
  const n = options?.uncommittedCounter || 0;
  const suffix = n > 0 ? `-uncommitted${n}` : "";
  return `v${baseVersion}${suffix}`;
};
