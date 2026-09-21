import { emptyLayout, localLayout, uid } from "./storage-layout";
import { validateLayout } from "./storage-operations";

export function createLayoutRepository({ companyId, demoMode, client, layoutId = null }) {
  let revision = 0;
  const table = layoutId ? "storage_named_layouts" : "storage_layouts";
  const localKey = layoutId ? companyId + ":" + layoutId : companyId;
  const scoped = (query) => {
    query = query.eq("company_id", companyId);
    return layoutId ? query.eq("id", layoutId) : query;
  };
  return {
    async load() {
      if (demoMode) {
        const data = await localLayout(localKey);
        revision = data.savedRevision || 0;
        return validateLayout(data);
      }
      const result = await scoped(client.from(table).select("layout,revision")).maybeSingle();
      if (result.error) throw result.error;
      if (layoutId && !result.data) throw new Error("Layout não encontrado ou sem acesso.");
      revision = result.data?.revision || 0;
      return validateLayout(result.data?.layout || emptyLayout());
    },
    async save(layout) {
      validateLayout(layout);
      const nextRevision = revision + 1;
      if (demoMode)
        await localLayout(
          localKey,
          { ...layout, savedRevision: nextRevision },
          revision
        );
      else if (!revision) {
        if (layoutId) throw new Error("Carregue o layout antes de salvar.");
        const result = await client
          .from(table)
          .insert({ company_id: companyId, layout, revision: nextRevision });
        if (result.error) throw result.error;
      } else {
        const result = await scoped(client
          .from(table)
          .update({
            layout,
            revision: nextRevision,
            updated_at: new Date().toISOString()
          }))
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

export async function listNamedLayouts({ companyId, demoMode, client }) {
  if (demoMode) return (await localLayout(companyId + ":catalog")).entries || [];
  const result = await client.from("storage_named_layouts").select("id,name").eq("company_id", companyId).order("name");
  if (result.error) throw result.error;
  return result.data || [];
}
export async function createNamedLayout({ companyId, demoMode, client }, name, layout) {
  name = name.trim();
  if (!name || name.length > 80) throw new Error("Informe um nome de até 80 caracteres.");
  validateLayout(layout);
  const entry = { id: uid(), name };
  if (demoMode) {
    const key = companyId + ":catalog";
    const catalog = await localLayout(key);
    if ((catalog.entries || []).some(e => e.name.toLowerCase() === name.toLowerCase())) throw new Error("Já existe um layout com esse nome.");
    await localLayout(companyId + ":" + entry.id, { ...layout, savedRevision: 1 }, 0);
    await localLayout(key, { ...catalog, entries: [...(catalog.entries || []), entry], savedRevision: (catalog.savedRevision || 0) + 1 }, catalog.savedRevision || 0);
  } else {
    const result = await client.from("storage_named_layouts").insert({ ...entry, company_id: companyId, layout, revision: 1 });
    if (result.error) throw result.error;
  }
  return entry;
}
