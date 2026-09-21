import * as THREE from "three";
import { areaGrid } from "./storage-area";
import { palletRackPieces } from "./storage-pallet-rack";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { indexLayout, snapPosition, footprint } from "./storage-operations";

// The renderer has no dependency on authentication, React state or a database.
export function createStorageScene(host, callbacks) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "low-power"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#171717");
  const camera = new THREE.PerspectiveCamera(48, 1, 0.02, 1500);
  camera.position.set(9, 9, 12);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.25;
  controls.maxDistance = 700;
  controls.maxPolarAngle = Math.PI * 0.95;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.5));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(5, 12, 8);
  scene.add(light);
  const root = new THREE.Group();
  const overlays = new THREE.Group();
  scene.add(root, overlays);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitEdges = new THREE.EdgesGeometry(unitBox);
  const materials = new Map();
  function material(color, line = false) {
    const key = `${color}:${line}`;
    if (!materials.has(key))
      materials.set(
        key,
        line
          ? new THREE.LineBasicMaterial({ color })
          : new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
      );
    return materials.get(key);
  }
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    material("#222222")
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.025;
  scene.add(floor);
  let grid = new THREE.GridHelper(40, 160, 0x777777, 0x343434);
  grid.visible = false;
  scene.add(grid);
  const guideGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-12, 0.015, 0),
    new THREE.Vector3(12, 0.015, 0),
    new THREE.Vector3(0, 0.015, -12),
    new THREE.Vector3(0, 0.015, 12)
  ]);
  const guides = new THREE.LineSegments(
    guideGeometry,
    new THREE.LineBasicMaterial({ color: 0xfbbf24, depthTest: false })
  );
  guides.renderOrder = 20;
  guides.visible = false;
  scene.add(guides);
  const selectedMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    depthTest: false
  });
  const ancestorMaterial = new THREE.LineBasicMaterial({
    color: 0xfbbf24,
    depthTest: false
  });
  let layout = { objects: [], items: [] },
    index = indexLayout(layout),
    editing = false,
    step = 0.25;
  let selectedId = null,
    selectedPath = new Set(),
    animation = null,
    dirty = true,
    disposed = false;
  const groups = new Map(),
    visuals = [],
    labels = new Map();
  const ray = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  ray.params.Line.threshold = 0.035;
  const pointers = new Set();
  let down = null,
    drag = null,
    lastTap = { time: 0, id: null };
  const temporary = new THREE.Vector3();
  let frame = 0;

  function addBox(group, id, dimensions, position, color, edges = false) {
    const mesh = edges
      ? new THREE.LineSegments(unitEdges, material(color, true))
      : new THREE.Mesh(unitBox, material(color));
    mesh.scale.set(
      Math.max(0.008, dimensions[0]),
      Math.max(0.008, dimensions[1]),
      Math.max(0.008, dimensions[2])
    );
    mesh.position.set(...position);
    mesh.userData.id = id;
    group.add(mesh);
    return mesh;
  }
  function createLabel(object, group) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = "bold 24px sans-serif";
    canvas.width = Math.min(
      384,
      Math.max(
        72,
        Math.ceil(ctx.measureText(object.code || object.name).width + 24)
      )
    );
    canvas.height = 48;
    ctx.fillStyle = "#171717";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      object.code || object.name,
      canvas.width / 2,
      33,
      canvas.width - 12
    );
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, depthTest: false })
    );
    sprite.position.set(0, object.dimensions.height + 0.1, 0);
    sprite.scale.set(
      Math.min(0.95, Math.max(0.4, object.dimensions.width)),
      0.16,
      1
    );
    sprite.renderOrder = 10;
    group.add(sprite);
    labels.set(object.id, sprite);
    return sprite;
  }
  function clearLabels() {
    for (const sprite of labels.values()) {
      sprite.removeFromParent();
      sprite.material.map.dispose();
      sprite.material.dispose();
    }
    labels.clear();
  }
  function setLayout(next) {
    cancel();
    layout = next;
    index = indexLayout(layout);
    updateArea();
    grid.visible = editing || Boolean(layout.area);
    clearLabels();
    root.clear();
    groups.clear();
    visuals.length = 0;
    for (const object of layout.objects) {
      const group = new THREE.Group();
      group.position.set(
        object.position.x,
        object.position.y,
        object.position.z
      );
      group.rotation.set(
        object.rotation.x,
        object.rotation.y,
        object.rotation.z
      );
      groups.set(object.id, group);
    }
    for (const object of layout.objects) {
      const group = groups.get(object.id);
      (groups.get(object.parentId) || root).add(group);
      const { width: w, height: h, depth: d } = object.dimensions;
      const pieces = [];
      const box = (size, position, color, edges = false) => {
        const mesh = addBox(group, object.id, size, position, color, edges);
        pieces.push(mesh);
        return mesh;
      };
      if (object.type === "pallet_rack") {
        for (const piece of palletRackPieces(object.dimensions)) {
          box(piece.size, piece.position, piece.color).rotation.x = piece.rotation;
        }
      } else if (["rack", "gondola", "cabinet"].includes(object.type)) {
        for (const x of [-1, 1])
          for (const z of [-1, 1])
            box(
              [0.04, h, 0.04],
              [(x * (w - 0.04)) / 2, h / 2, (z * (d - 0.04)) / 2],
              "#a7adb6"
            );
        box([w, 0.04, d], [0, 0.02, 0], "#a7adb6");
        if (object.type === "cabinet")
          box([w, h, 0.025], [0, h / 2, -d / 2], "#616b78");
      } else if (["floor_area", "aisle"].includes(object.type))
        box([w, 0.015, d], [0, 0.008, 0], "#708b8b", true);
      else if (object.type === "shelf")
        box([w, 0.035, d], [0, 0.018, 0], "#a7adb6");
      else if (object.type === "pallet") {
        box(
          [w, Math.min(0.12, h), d],
          [0, Math.min(0.06, h / 2), 0],
          "#a78051"
        );
        box([w, h, d], [0, h / 2, 0], "#558981", true);
      } else
        box(
          [w, h, d],
          [0, h / 2, 0],
          object.type === "wall" ? "#626873" : "#558981",
          object.type === "slot"
        );
      let productMesh = null;
      const items = index.items.get(object.id) || [];
      if (items.length) {
        const volumes = items.map((item) => item.storedVolume).filter(Boolean);
        const size =
          volumes.length === 1
            ? [
                Math.min(w, volumes[0].width),
                Math.min(h, volumes[0].height),
                Math.min(d, volumes[0].depth)
              ]
            : [w * 0.8, h * 0.7, d * 0.8];
        productMesh = addBox(
          group,
          object.id,
          size,
          [0, size[1] / 2 + (object.type === "pallet" ? 0.12 : 0.025), 0],
          "#c99562"
        );
      }
      visuals.push({ object, group, pieces, productMesh });
    }
    root.updateMatrixWorld(true);
    setSelection(selectedId);
    dirty = true;
  }
  function setSelection(id) {
    selectedId = id;
    selectedPath = new Set();
    let object = index.byId.get(id);
    overlays.clear();
    while (object && !selectedPath.has(object.id)) {
      selectedPath.add(object.id);
      const group = groups.get(object.id);
      const outline = new THREE.LineSegments(
        unitEdges,
        object.id === id ? selectedMaterial : ancestorMaterial
      );
      const { width, height, depth } = object.dimensions;
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3(0, height / 2, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(width + 0.025, height + 0.025, depth + 0.025)
      );
      outline.matrixAutoUpdate = false;
      outline.matrix.multiplyMatrices(group.matrixWorld, local);
      outline.renderOrder = object.id === id ? 30 : 25;
      overlays.add(outline);
      object = index.byId.get(object.parentId);
    }
    dirty = true;
  }
  let areaKey = "";
  function updateArea() {
    const area = layout.area || { width: 40, depth: 40 };
    const key = JSON.stringify([area.width, area.depth, step]);
    if (key === areaKey) return;
    areaKey = key;
    scene.remove(grid);
    grid.geometry.dispose();
    grid.material.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(areaGrid(area, step), 3));
    grid = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x555555 }));
    grid.visible = editing || Boolean(layout.area);
    scene.add(grid);
    floor.scale.set(area.width / 1000, area.depth / 1000, 1);
  }
  function setEditing(value, snap) {
    editing = value;
    step = snap;
    updateArea();
    grid.visible = editing || Boolean(layout.area);
    dirty = true;
  }
  function focus(request = {}) {
    root.updateMatrixWorld(true);
    const object = index.byId.get(request.id),
      group = groups.get(request.id);
    let bounds;
    if (object) {
      const d = object.dimensions;
      bounds = new THREE.Box3(
        new THREE.Vector3(-d.width / 2, 0, -d.depth / 2),
        new THREE.Vector3(d.width / 2, d.height, d.depth / 2)
      ).applyMatrix4(group.matrixWorld);
    } else {
      bounds = layout.area
        ? new THREE.Box3(new THREE.Vector3(-layout.area.width / 2, 0, -layout.area.depth / 2), new THREE.Vector3(layout.area.width / 2, 0, layout.area.depth / 2))
        : new THREE.Box3();
      for (const candidate of index.children.get(null) || []) {
        const d = candidate.dimensions;
        bounds.union(
          new THREE.Box3(
            new THREE.Vector3(-d.width / 2, 0, -d.depth / 2),
            new THREE.Vector3(d.width / 2, d.height, d.depth / 2)
          ).applyMatrix4(groups.get(candidate.id).matrixWorld)
        );
      }
    }
    if (bounds.isEmpty())
      bounds.set(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 2, 3));
    const target = bounds.getCenter(new THREE.Vector3()),
      size = bounds.getSize(new THREE.Vector3());
    const distance = Math.max(
      0.65,
      (size.length() * 1.25) / Math.min(1, camera.aspect)
    );
    const directions = {
      front: [0, 0.08, 1],
      back: [0, 0.08, -1],
      left: [-1, 0.08, 0],
      right: [1, 0.08, 0],
      top: [0, 1, 0.001],
      perspective: [1, 0.8, 1]
    };
    const direction = new THREE.Vector3(
      ...(directions[request.view] || directions.perspective)
    ).normalize();
    if (group && !request.view)
      direction.applyQuaternion(
        group.getWorldQuaternion(new THREE.Quaternion())
      );
    animation = {
      from: camera.position.clone(),
      to: target.clone().addScaledVector(direction, distance),
      oldTarget: controls.target.clone(),
      target,
      start: performance.now()
    };
    dirty = true;
  }
  function cast(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1
    );
    ray.setFromCamera(pointer, camera);
  }
  function hits(event) {
    cast(event);
    return ray
      .intersectObjects(root.children, true)
      .filter((hit) => hit.object.visible && hit.object.userData.id);
  }
  function hit(event) {
    const actual = hits(event)[0]?.object.userData.id;
    if (editing || !actual) return actual;
    // A tap enters one level at a time, even if a deeper shelf was hit.
    const chain = [];
    let object = index.byId.get(actual);
    while (object) {
      chain.unshift(object.id);
      object = index.byId.get(object.parentId);
    }
    const current = chain.indexOf(selectedId);
    return chain[Math.min(chain.length - 1, current + 1)];
  }
  function start(event) {
    pointers.add(event.pointerId);
    animation = null;
    if (pointers.size > 1) {
      cancel(false);
      return;
    }
    const id = hit(event);
    down = {
      x: event.clientX,
      y: event.clientY,
      id,
      pointerId: event.pointerId
    };
    if (editing && !preview && id && event.button === 0) {
      const group = groups.get(id),
        world = group.getWorldPosition(new THREE.Vector3());
      ground.constant = -world.y;
      const point = hits(event).find((entry) => entry.object.userData.id === id)?.point.clone();
      if (point) {
        drag = {
          id,
          group,
          original: group.position.clone(),
          parent: group.parent,
          rotation: group.rotation.clone(),
          offset: point.sub(world)
        };
        controls.enabled = event.pointerType === "touch";
      }
    }
  }
  function move(event) {
    if (!drag || event.pointerId !== down?.pointerId) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) < 6) return;
    controls.enabled = false;
    const object = index.byId.get(drag.id);
    const placement = placementAt(event, object, drag.group.getWorldQuaternion(new THREE.Quaternion()), drag.offset);
    if (!placement) return;
    drag.placement = placement;
    (groups.get(placement.parentId) || root).add(drag.group);
    drag.group.position.set(placement.position.x, placement.position.y, placement.position.z);
    drag.group.rotation.set(placement.rotation.x, placement.rotation.y, placement.rotation.z);
    drag.group.updateWorldMatrix(true, true);
    guides.position.copy(drag.group.getWorldPosition(new THREE.Vector3()));
    guides.visible = Boolean(step && !event.altKey);
    guides.quaternion.copy(
      drag.group.parent.getWorldQuaternion(new THREE.Quaternion())
    );
    setSelection(selectedId);
    dirty = true;
  }
  // Raycast support surfaces in local coordinates, excluding the moving subtree.
  function placementAt(event, object, worldRotation = new THREE.Quaternion(), grabOffset = new THREE.Vector3()) {
    cast(event);
    let nearest = null;
    for (const candidate of layout.objects) {
      let ancestor = candidate;
      let cyclic = false;
      while (ancestor) {
        if (ancestor.id === object.id) { cyclic = true; break; }
        ancestor = index.byId.get(ancestor.parentId);
      }
      if (cyclic) continue;
      const group = groups.get(candidate.id), dimensions = candidate.dimensions;
      const rotation = new THREE.Euler().setFromQuaternion(
        group.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldRotation));
      const rotated = { ...object, rotation };
      const size = footprint(rotated);
      if (size.width > dimensions.width + 1e-8 || size.depth > dimensions.depth + 1e-8) continue;
      const inverse = group.matrixWorld.clone().invert();
      const localRay = ray.ray.clone().applyMatrix4(inverse);
      const localOffset = grabOffset.clone().applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()).invert());
      let height = candidate.type === "shelf" ? 0.035 : candidate.type === "pallet" ? Math.min(0.12, dimensions.height) : ["floor_area", "aisle", "slot"].includes(candidate.type) ? 0.015 : dimensions.height;
      if (object.type === "shelf" && ["rack", "gondola", "cabinet"].includes(candidate.type)) {
        const entry = localRay.intersectBox(new THREE.Box3(new THREE.Vector3(-dimensions.width/2,0,-dimensions.depth/2),new THREE.Vector3(dimensions.width/2,dimensions.height,dimensions.depth/2)),new THREE.Vector3());
        if (!entry) continue;
        height = Math.max(0, Math.min(dimensions.height - object.dimensions.height, step && !event.altKey ? Math.round(entry.y / step) * step : entry.y));
      }
      const point = localRay.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0), -(height + localOffset.y)), new THREE.Vector3());
      if (point) point.sub(localOffset);
      if (!point || Math.abs(point.x) > dimensions.width/2 || Math.abs(point.z) > dimensions.depth/2) continue;
      const distance = group.localToWorld(point.clone()).distanceTo(ray.ray.origin);
      const position = snapPosition(rotated, { x: point.x, y: height, z: point.z }, index.children.get(candidate.id) || [], candidate, event.altKey ? 0 : step).position;
      position.x = THREE.MathUtils.clamp(position.x, -(dimensions.width-size.width)/2, (dimensions.width-size.width)/2);
      position.z = THREE.MathUtils.clamp(position.z, -(dimensions.depth-size.depth)/2, (dimensions.depth-size.depth)/2);
      if (!nearest || distance < nearest.distance) nearest = { parentId: candidate.id, position, rotation: { x: rotation.x, y: rotation.y, z: rotation.z }, distance };
    }
    if (nearest) return nearest;
    const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-grabOffset.y),new THREE.Vector3());
    if (point) point.sub(grabOffset);
    if (!point) return null;
    const rotation = new THREE.Euler().setFromQuaternion(worldRotation);
    return { parentId: null, position: snapPosition({ ...object, rotation }, { x: point.x, y: 0, z: point.z }, index.children.get(null) || [], null, event.altKey ? 0 : step).position, rotation: { x: rotation.x, y: rotation.y, z: rotation.z } };
  }
  let preview = null;
  const previewGroup = new THREE.Group();
  scene.add(previewGroup);
  function setPlacement(object) {
    preview = object;
    previewGroup.clear();
    previewGroup.visible = false;
    if (object) {
      const d = object.dimensions;
      addBox(previewGroup, null, [d.width,d.height,d.depth],[0,d.height/2,0],"#fbbf24",true);
    }
    dirty = true;
  }
  function previewAt(event) {
    if (!editing || !preview) return null;
    const placement = placementAt(event, preview);
    if (!placement) return null;
    const parent = groups.get(placement.parentId) || root;
    previewGroup.position.copy(parent.localToWorld(new THREE.Vector3(placement.position.x,placement.position.y,placement.position.z)));
    previewGroup.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion())).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(placement.rotation.x,placement.rotation.y,placement.rotation.z)));
    previewGroup.visible = true;
    dirty = true;
    return placement;
  }
  function dragOver(event) { if (preview && editing) { event.preventDefault(); previewAt(event); } }
  function drop(event) {
    if (!preview || !editing) return;
    event.preventDefault();
    const placement = previewAt(event);
    if (placement) callbacks.onPlace?.(placement);
    setPlacement(null);
  }
  function previewMove(event) { previewAt(event); }
  function previewLeave() { previewGroup.visible = false; dirty = true; }
  function end(event) {
    pointers.delete(event.pointerId);
    if (!down || event.pointerId !== down.pointerId) return;
    if (preview && editing && Math.hypot(event.clientX-down.x,event.clientY-down.y)<8) {
      drop(event);
    } else if (drag?.placement) {
      const { position, parentId, rotation } = drag.placement;
      callbacks.onMove(drag.id, position, parentId, rotation);
    } else if (
      Math.hypot(event.clientX - down.x, event.clientY - down.y) < 8
    ) {
      const double =
        lastTap.id === down.id && performance.now() - lastTap.time < 350;
      callbacks.onSelect(down.id || null, Boolean(down.id && double));
      lastTap = { id: down.id, time: performance.now() };
    }
    down = null;
    drag = null;
    guides.visible = false;
    controls.enabled = true;
    dirty = true;
  }
  function cancel(clearPointers = true) {
    if (drag) {
      drag.parent.add(drag.group);
      drag.group.rotation.copy(drag.rotation);
      drag.group.position.copy(drag.original);
      drag.group.updateWorldMatrix(true, true);
    }
    down = null;
    drag = null;
    guides.visible = false;
    controls.enabled = true;
    dirty = true;
    if (clearPointers) pointers.clear();
  }
  function pointerCancel(event) {
    pointers.delete(event.pointerId);
    cancel(false);
  }
  function updateDetails() {
    const candidates = [];
    for (const visual of visuals) {
      const { object, group, pieces, productMesh } = visual;
      const distance = camera.position.distanceTo(
        group.getWorldPosition(temporary)
      );
      const active = selectedPath.has(object.id);
      const detailed =
        !object.parentId || object.type === "shelf" || active || distance < 10;
      pieces.forEach((mesh) => {
        mesh.visible = detailed;
      });
      if (productMesh) productMesh.visible = active || distance < 5;
      if (active || distance < (object.parentId ? 5 : 40))
        candidates.push({ visual, distance, active });
    }
    candidates.sort(
      (a, b) => Number(b.active) - Number(a.active) || a.distance - b.distance
    );
    const shown = new Set();
    for (const { visual, active, distance } of candidates.slice(0, 48)) {
      const label =
        labels.get(visual.object.id) ||
        createLabel(visual.object, visual.group);
      label.material.color.set(active ? "#fbbf24" : "#ffffff");
      const labelHeight = Math.max(
        0.04,
        (distance *
          2 *
          Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) *
          26) /
          Math.max(1, host.clientHeight)
      );
      label.scale.set(
        (labelHeight * label.material.map.image.width) / 48,
        labelHeight,
        1
      );
      label.visible = true;
      shown.add(visual.object.id);
    }
    for (const [id, sprite] of labels) {
      if (!shown.has(id)) {
        sprite.removeFromParent();
        sprite.material.map.dispose();
        sprite.material.dispose();
        labels.delete(id);
      }
    }
  }
  function render() {
    if (disposed) return;
    frame = requestAnimationFrame(render);
    if (animation) {
      const t = Math.min(1, (performance.now() - animation.start) / 650),
        eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(animation.from, animation.to, eased);
      controls.target.lerpVectors(animation.oldTarget, animation.target, eased);
      if (t === 1) animation = null;
      dirty = true;
    }
    const moved = controls.update();
    if (!dirty && !moved) return;
    updateDetails();
    renderer.render(scene, camera);
    dirty = false;
  }
  const resize = new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height));
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    dirty = true;
  });
  host.appendChild(renderer.domElement);
  resize.observe(host);
  renderer.domElement.addEventListener("pointerdown", start, true);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", pointerCancel);
  const wheel = () => {
    animation = null;
    dirty = true;
  };
  renderer.domElement.addEventListener("wheel", wheel, { passive: true });
  renderer.domElement.addEventListener("dragover", dragOver);
  renderer.domElement.addEventListener("drop", drop);
  renderer.domElement.addEventListener("pointermove", previewMove);
  renderer.domElement.addEventListener("pointerleave", previewLeave);
  render();
  return {
    setPlacement,
    setLayout,
    setSelection,
    setEditing,
    focus,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      renderer.domElement.removeEventListener("dragover", dragOver);
      renderer.domElement.removeEventListener("drop", drop);
      renderer.domElement.removeEventListener("pointermove", previewMove);
      renderer.domElement.removeEventListener("pointerleave", previewLeave);
      resize.disconnect();
      controls.dispose();
      clearLabels();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", pointerCancel);
      renderer.domElement.removeEventListener("pointerdown", start, true);
      renderer.domElement.removeEventListener("wheel", wheel);
      unitBox.dispose();
      unitEdges.dispose();
      floor.geometry.dispose();
      grid.geometry.dispose();
      grid.material.dispose();
      guideGeometry.dispose();
      guides.material.dispose();
      selectedMaterial.dispose();
      ancestorMaterial.dispose();
      materials.forEach((value) => value.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
