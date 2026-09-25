/** Keep drafts tied to the Host home, even when a replacement Host reuses a revision. */
export function bindComponentSettings(ctx, entryId) {
  const form = ctx.configForms.get(entryId);
  return {
    getSnapshot: () => ({ ...form.getSnapshot(), sourceId: ctx.remote.$host?.home }),
    subscribe(listener) {
      const off = [form.subscribe(listener), ctx.on('connection/reset', listener)];
      return () => { for (const unsubscribe of off) unsubscribe(); };
    },
    mutate: (operations, revision) => form.mutate(operations, revision),
  };
}
