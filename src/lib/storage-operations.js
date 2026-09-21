import { makeObject } from "./storage-layout";

export function indexLayout(layout) {
  const byId = new Map(layout.objects.map((object) => [object.id, object]));
  const children = new Map();
  const items = new Map();
  for (const object of layout.objects) {
    const key = object.parentId || null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(object);
  }
  for (const item of layout.items) {
    if (!items.has(item.locationId)) items.set(item.locationId, []);
    items.get(item.locationId).push(item);
  }
  return { byId, children, items };
}

export function validDimensions(dimensions) {
  return (
    dimensions &&
    ["width", "height", "depth"].every(
      (key) => Number.isFinite(dimensions[key]) && dimensions[key] > 0
    )
  );
}

export function validateLayout(layout) {
  if (
    !layout ||
    layout.version !== 1 ||
    !Array.isArray(layout.objects) ||
    !Array.isArray(layout.items)
  )
    throw new Error("O arquivo de estoque não é compatível.");
  const { byId } = indexLayout(layout);
  if (byId.size !== layout.objects.length)
    throw new Error("Existem objetos com identificadores repetidos.");
  const complete = new Set();
  for (const object of layout.objects) {
    if (
      typeof object.id !== "string" ||
      !object.id ||
      !validDimensions(object.dimensions)
    )
      throw new Error("Um objeto possui dimensões inválidas.");
    for (const field of ["position", "rotation"]) {
      if (
        !["x", "y", "z"].every((key) => Number.isFinite(object[field]?.[key]))
      )
        throw new Error("Um objeto possui uma transformação inválida.");
    }
    if (object.parentId && !byId.has(object.parentId))
      throw new Error("Um objeto está associado a uma estrutura inexistente.");
    const visited = new Set();
    let parent = object;
    while (parent && !complete.has(parent.id)) {
      if (visited.has(parent.id))
        throw new Error("A hierarquia possui uma referência circular.");
      visited.add(parent.id);
      parent = byId.get(parent.parentId);
    }
    visited.forEach((id) => complete.add(id));
  }
  const inventoryIds = new Set();
  const associations = new Set();
  for (const item of layout.items) {
    const association = `${item.productId}:${item.locationId}`;
    if (
      !byId.has(item.locationId) ||
      typeof item.productId !== "string" ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      inventoryIds.has(item.id) ||
      associations.has(association)
    )
      throw new Error("Uma associação de produto é inválida.");
    if (item.storedVolume && !validDimensions(item.storedVolume))
      throw new Error("Um produto possui volume ocupado inválido.");
    inventoryIds.add(item.id);
    associations.add(association);
  }
  return layout;
}

export function resizeTree(layout, id, dimensions) {
  if (!validDimensions(dimensions))
    throw new Error("Informe dimensões maiores que zero.");
  const { byId, children } = indexLayout(layout);
  const original = byId.get(id);
  if (!original) return layout;
  const scale = {
    x: dimensions.width / original.dimensions.width,
    y: dimensions.height / original.dimensions.height,
    z: dimensions.depth / original.dimensions.depth
  };
  const changed = new Map([[id, { ...original, dimensions }]]);
  const queue = [...(children.get(id) || [])];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const object = queue[cursor];
    changed.set(object.id, {
      ...object,
      position: {
        x: object.position.x * scale.x,
        y: object.position.y * scale.y,
        z: object.position.z * scale.z
      },
      dimensions: {
        width: object.dimensions.width * scale.x,
        height: object.dimensions.height * scale.y,
        depth: object.dimensions.depth * scale.z
      }
    });
    queue.push(...(children.get(object.id) || []));
  }
  for (const item of layout.items) {
    const object = changed.get(item.locationId);
    if (
      object &&
      item.storedVolume &&
      Object.keys(item.storedVolume).some(
        (key) => item.storedVolume[key] > object.dimensions[key] + 1e-8
      )
    )
      throw new Error(
        "O novo tamanho não comporta o material armazenado. Ajuste a ocupação antes de reduzir a estrutura."
      );
  }
  const occupied = new Map();
  for (const item of layout.items) {
    if (!item.storedVolume || !changed.has(item.locationId)) continue;
    const volume =
      item.storedVolume.width *
      item.storedVolume.height *
      item.storedVolume.depth;
    occupied.set(
      item.locationId,
      (occupied.get(item.locationId) || 0) + volume
    );
  }
  for (const [locationId, volume] of occupied) {
    const dimensions = changed.get(locationId).dimensions;
    if (volume > dimensions.width * dimensions.height * dimensions.depth + 1e-8)
      throw new Error(
        "O novo tamanho não comporta o volume total armazenado nesta posição."
      );
  }
  return {
    ...layout,
    objects: layout.objects.map((object) => changed.get(object.id) || object)
  };
}

export function automaticObject(layout, type, parentId = null) {
  let number = 1;
  let object = makeObject(type, parentId, number);
  const codes = new Set(layout.objects.map((current) => current.code));
  while (codes.has(object.code)) object = makeObject(type, parentId, ++number);
  return object;
}

export function footprint(object) {
  const angle = object.rotation.y;
  return {
    width:
      Math.abs(Math.cos(angle)) * object.dimensions.width +
      Math.abs(Math.sin(angle)) * object.dimensions.depth,
    depth:
      Math.abs(Math.sin(angle)) * object.dimensions.width +
      Math.abs(Math.cos(angle)) * object.dimensions.depth
  };
}

export function snapPosition(object, proposed, siblings, parent, step) {
  const position = { ...proposed };
  const guides = [];
  if (!step) return { position, guides };
  position.x = Math.round(position.x / step) * step;
  position.z = Math.round(position.z / step) * step;
  const size = footprint(object);
  const threshold = Math.min(0.18, step * 0.6);
  for (const [axis, dimension, otherAxis, otherDimension] of [
    ["x", "width", "z", "depth"],
    ["z", "depth", "x", "width"]
  ]) {
    let nearest = threshold;
    let match;
    for (const sibling of siblings) {
      if (sibling.id === object.id) continue;
      const siblingSize = footprint(sibling);
      if (
        Math.abs(position[otherAxis] - sibling.position[otherAxis]) >
        (size[otherDimension] + siblingSize[otherDimension]) / 2 + 0.5
      )
        continue;
      const gap = (size[dimension] + siblingSize[dimension]) / 2;
      for (const value of [
        sibling.position[axis],
        sibling.position[axis] - gap,
        sibling.position[axis] + gap
      ]) {
        const distance = Math.abs(proposed[axis] - value);
        if (distance < nearest) {
          nearest = distance;
          match = value;
        }
      }
    }
    if (match !== undefined) {
      position[axis] = match;
      guides.push(axis);
    }
  }
  if (parent) {
    const maxX = Math.max(0, (parent.dimensions.width - size.width) / 2);
    const maxZ = Math.max(0, (parent.dimensions.depth - size.depth) / 2);
    position.x = Math.min(maxX, Math.max(-maxX, position.x));
    position.z = Math.min(maxZ, Math.max(-maxZ, position.z));
  }
  return { position, guides };
}
