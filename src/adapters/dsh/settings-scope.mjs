/** Keep drafts tied to the Host home, even when a replacement Host reuses a revision. */
export function bindComponentSettings(ctx, namespace) {
  const scope = ctx.settingsScope.bind({ namespace });
  return {
    getSnapshot: () => ({ ...scope.getSnapshot(), sourceId: ctx.remote.$host?.home }),
    subscribe(listener) {
      const off = [scope.subscribe(listener), ctx.on('connection/reset', listener)];
      return () => { for (const unsubscribe of off) unsubscribe(); };
    },
    mutate: (operations, revision) => scope.mutate(operations, revision),
  };
}
