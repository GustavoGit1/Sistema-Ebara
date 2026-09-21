import { emptyLayout, localLayout } from "./storage-layout";
import { validateLayout } from "./storage-operations";

export function createLayoutRepository({ companyId, demoMode, client }) {
  let revision = 0;
  return {
    async load() {
      if (demoMode) {
        const data = await localLayout(companyId);
        revision = data.savedRevision || 0;
        return validateLayout(data);
      }
      const result = await client
        .from("storage_layouts")
        .select("layout,revision")
        .eq("company_id", companyId)
        .maybeSingle();
      if (result.error) throw result.error;
      revision = result.data?.revision || 0;
      return validateLayout(result.data?.layout || emptyLayout());
    },
    async save(layout) {
      validateLayout(layout);
      const nextRevision = revision + 1;
      if (demoMode)
        await localLayout(
          companyId,
          { ...layout, savedRevision: nextRevision },
          revision
        );
      else if (!revision) {
        const result = await client
          .from("storage_layouts")
          .insert({ company_id: companyId, layout, revision: nextRevision });
        if (result.error) throw result.error;
      } else {
        const result = await client
          .from("storage_layouts")
          .update({
            layout,
            revision: nextRevision,
            updated_at: new Date().toISOString()
          })
          .eq("company_id", companyId)
          .eq("revision", revision)
          .select("revision");
        if (result.error) throw result.error;
        if (!result.data?.length)
          throw new Error(
            "Outra pessoa alterou este estoque. Exporte sua cópia e recarregue o layout antes de continuar."
          );
      }
      revision = nextRevision;
    }
  };
}

// Only one request is in flight. Intermediate edits are replaced by the latest
// snapshot, avoiding one network request per keystroke without losing the end state.
export function createSaveQueue(write, onSaved, onError, delay = 350) {
  let pending = null,
    running = false,
    timer = null;
  async function flush() {
    clearTimeout(timer);
    if (running || !pending) return;
    running = true;
    while (pending) {
      const snapshot = pending;
      pending = null;
      try {
        await write(snapshot);
        onSaved(snapshot, Boolean(pending));
      } catch (error) {
        pending = null;
        onError(error);
        break;
      }
    }
    running = false;
  }
  return {
    schedule(snapshot) {
      pending = snapshot;
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
    dispose() {
      clearTimeout(timer);
      return flush();
    }
  };
}
