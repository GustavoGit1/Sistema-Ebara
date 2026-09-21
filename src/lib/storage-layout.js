export const TYPES = {
  wall: "Parede",
  rack: "Estante",
  gondola: "Gôndola",
  cabinet: "Armário",
  shelf: "Prateleira",
  drawer: "Gaveta",
  pallet: "Palete",
  box: "Caixa",
  slot: "Posição",
  aisle: "Corredor",
  floor_area: "Área de armazenamento"
};
export const emptyLayout = () => ({ version: 1, objects: [], items: [] });
export function uid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // getRandomValues also supports a tablet opening the local app over HTTP.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}
export function makeObject(type, parentId = null, index = 1) {
  const sizes = {
    wall: [4, 2.5, 0.15],
    rack: [2, 2.2, 0.6],
    gondola: [2, 1.8, 1],
    cabinet: [1, 2, 0.5],
    shelf: [1.8, 0.35, 0.55],
    drawer: [0.8, 0.2, 0.4],
    pallet: [1.2, 1.6, 1],
    box: [0.4, 0.3, 0.3],
    slot: [0.5, 0.35, 0.5],
    aisle: [3, 2.5, 8],
    floor_area: [3, 2.5, 3]
  };
  const [width, height, depth] = sizes[type] || sizes.slot;
  return {
    id: uid(),
    name: `${TYPES[type]} ${index}`,
    code: `${type.toUpperCase()}-${String(index).padStart(2, "0")}`,
    type,
    parentId,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    dimensions: { width, height, depth },
    properties: {}
  };
}
export function pathTo(objects, id) {
  const path = [],
    visited = new Set();
  let current = objects.find((o) => o.id === id);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = objects.find((o) => o.id === current.parentId);
  }
  return path;
}
export function descendants(objects, id) {
  return objects.filter((o) => pathTo(objects, o.id).some((p) => p.id === id));
}
export function duplicateTree(layout, id) {
  const tree = descendants(layout.objects, id),
    ids = new Map(tree.map((o) => [o.id, uid()]));
  return {
    ...layout,
    objects: [
      ...layout.objects,
      ...tree.map((o) => ({
        ...structuredClone(o),
        id: ids.get(o.id),
        parentId: ids.get(o.parentId) || o.parentId,
        name: `${o.name} (cópia)`,
        code: `${o.code}-${ids.get(o.id).slice(0, 4)}`,
        position: {
          ...o.position,
          x: o.position.x + (o.id === id ? o.dimensions.width + 0.25 : 0)
        }
      }))
    ]
  };
}
export function suggestions(layout, dimensions) {
  const valid = (d) =>
    d &&
    ["width", "height", "depth"].every(
      (key) => Number.isFinite(d[key]) && d[key] > 0
    );
  if (!valid(dimensions)) return [];
  const volume = (d) => d.width * d.height * d.depth;
  return layout.objects
    .filter(
      (o) =>
        ["slot", "box", "drawer", "pallet"].includes(o.type) &&
        !layout.objects.some((c) => c.parentId === o.id) &&
        !pathTo(layout.objects, o.parentId).some((parent) =>
          layout.items.some((i) => i.locationId === parent.id && i.quantity > 0)
        )
    )
    .map((o) => {
      const items = layout.items.filter(
        (i) => i.locationId === o.id && i.quantity > 0
      );
      const unknown = items.some((i) => !valid(i.storedVolume));
      const used = items.reduce(
        (sum, i) => sum + (i.storedVolume ? volume(i.storedVolume) : 0),
        0
      );
      const free = Math.max(0, volume(o.dimensions) - used);
      const fits =
        valid(o.dimensions) &&
        dimensions.width <= o.dimensions.width &&
        dimensions.height <= o.dimensions.height &&
        dimensions.depth <= o.dimensions.depth &&
        volume(dimensions) <= free;
      return { object: o, free, unknown, occupied: items.length > 0, fits };
    })
    .filter((s) => s.fits && !s.unknown)
    .sort((a, b) => Number(a.occupied) - Number(b.occupied) || a.free - b.free);
}
export async function localLayout(companyId, value, expectedRevision) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("storage-layouts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("layouts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("layouts", value ? "readwrite" : "readonly");
      const store = tx.objectStore("layouts");
      const request = store.get(companyId);
      let conflict = null;
      request.onsuccess = () => {
        if (!value) return;
        if (
          expectedRevision !== undefined &&
          (request.result?.savedRevision || 0) !== expectedRevision
        ) {
          conflict = new Error(
            "Outra aba alterou este estoque. Exporte sua cópia e recarregue antes de continuar."
          );
          tx.abort();
          return;
        }
        store.put(value, companyId);
      };
      tx.oncomplete = () => resolve(value || request.result || emptyLayout());
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(conflict || tx.error || new Error("Salvamento interrompido."));
    });
  } finally {
    db.close();
  }
}
