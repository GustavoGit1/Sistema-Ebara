"use client";
import {
  cloneElement,
  useId,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import {
  createLayoutRepository,
  createSaveQueue
} from "@/lib/storage-persistence";
import {
  automaticObject,
  resizeTree,
  validateLayout
} from "@/lib/storage-operations";
import {
  TYPES,
  emptyLayout,
  makeObject,
  pathTo,
  descendants,
  duplicateTree,
  suggestions,
  uid
} from "@/lib/storage-layout";
const Scene = dynamic(() => import("./StorageScene"), {
  ssr: false,
  loading: () => <p className="p-6">Carregando ambiente 3D…</p>
});
const button =
  "min-h-11 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm disabled:opacity-40";
const input =
  "min-h-11 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2";
const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
function Field({ label, children }) {
  const id = useId();
  return (
    <div className="block space-y-1 text-sm">
      <label htmlFor={id} className="block text-neutral-300">
        {label}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}
export default function StorageWorkspace({
  companies,
  products,
  activeCompanyId,
  demoMode,
  initialPage,
  onClose
}) {
  const [companyId, setCompanyId] = useState(
    activeCompanyId || companies[0]?.id || ""
  );
  const [generation, setGeneration] = useState(0);
  const leaveGuard = useRef(() => true),
    dialogRef = useRef();
  useEffect(() => {
    const element = dialogRef.current,
      previous = document.activeElement;
    const siblings = [...element.parentElement.children].filter(
      (node) => node !== element
    );
    const original = siblings.map((node) => node.inert);
    siblings.forEach((node) => {
      node.inert = true;
    });
    element.focus();
    return () => {
      siblings.forEach((node, i) => {
        node.inert = original[i];
      });
      previous?.focus();
    };
  }, []);
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape" && leaveGuard.current()) onClose();
        if (e.key === "Tab") {
          const controls = [
            ...dialogRef.current.querySelectorAll(
              'button,input,select,summary,[tabindex="0"]'
            )
          ].filter((node) => !node.disabled && node.offsetParent !== null);
          const first = controls[0],
            last = controls.at(-1);
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === dialogRef.current)
          ) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-neutral-100"
      role="dialog"
      aria-modal="true"
      aria-label="Estoque e espaços disponíveis"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 p-3">
        <h2 className="text-xl font-semibold">Estoque físico</h2>
        <select
          aria-label="Empresa do estoque"
          className={`${input} !w-auto`}
          value={companyId}
          onChange={(e) => {
            if (leaveGuard.current()) setCompanyId(e.target.value);
          }}
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          className={button}
          onClick={() => {
            if (leaveGuard.current()) onClose();
          }}
        >
          Fechar
        </button>
      </header>
      {companyId ? (
        <Workspace
          key={`${companyId}:${generation}`}
          companyId={companyId}
          products={products.filter(
            (p) => p.company_id === companyId && p.active !== false
          )}
          demoMode={demoMode}
          initialPage={initialPage}
          leaveGuard={leaveGuard}
          onReload={() => {
            if (leaveGuard.current()) setGeneration((value) => value + 1);
          }}
        />
      ) : (
        <p className="p-6">Cadastre uma empresa para montar seu estoque.</p>
      )}
    </div>
  );
}
function Workspace({
  companyId,
  products,
  demoMode,
  initialPage,
  leaveGuard,
  onReload
}) {
  const [layout, setLayout] = useState(emptyLayout),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState("Carregando…"),
    [page, setPage] = useState(initialPage),
    [editing, setEditing] = useState(false),
    [detailsOpen, setDetailsOpen] = useState(false),
    [selectedId, setSelected] = useState(null),
    [focus, setFocus] = useState(null),
    [query, setQuery] = useState(""),
    [productId, setProduct] = useState(""),
    [snap, setSnap] = useState(0),
    [past, setPast] = useState([]),
    [future, setFuture] = useState([]),
    [placing, setPlacing] = useState(false),
    [type, setType] = useState("rack"),
    [unit, setUnit] = useState("m"),
    [count, setCount] = useState(5),
    [prefix, setPrefix] = useState("A-"),
    [assignProduct, setAssignProduct] = useState(""),
    [quantity, setQuantity] = useState(1),
    [volume, setVolume] = useState({ width: "", height: "", depth: "" }),
    [wanted, setWanted] = useState({ width: 1.2, height: 1, depth: 1 });
  const saved = useRef(null),
    focusTimers = useRef([]),
    mounted = useRef(true);
  const [saveError, setSaveError] = useState(false);
  const repository = useMemo(
    () => createLayoutRepository({ companyId, demoMode, client: supabase }),
    [companyId, demoMode]
  );
  const saveQueue = useMemo(
    () =>
      createSaveQueue(
        (value) => repository.save(value),
        (value, pending) => {
          saved.current = value;
          if (mounted.current) {
            setSaveError(false);
            setStatus(
              pending
                ? "Salvando…"
                : demoMode
                  ? "Salvo neste navegador (demonstração)"
                  : "Salvo para esta empresa"
            );
          }
        },
        (error) => {
          if (mounted.current) {
            setSaveError(true);
            setStatus("Não salvo: " + error.message);
          }
        }
      ),
    [repository, demoMode]
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      saveQueue.dispose();
    };
  }, [saveQueue]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await repository.load();
        if (alive) {
          validateLayout(data);
          setLayout(data);
          saved.current = data;
          setReady(true);
          setStatus(
            demoMode
              ? "Salvo neste navegador (demonstração)"
              : "Layout carregado"
          );
        }
      } catch (error) {
        if (alive)
          setStatus(
            "Não foi possível carregar o estoque. Verifique a conexão e tente novamente. Se persistir, peça ao responsável para verificar a configuração do armazenamento."
          );
      }
    })();
    return () => {
      alive = false;
      focusTimers.current.forEach(clearTimeout);
    };
  }, [companyId, demoMode]);
  leaveGuard.current = () =>
    !ready ||
    saved.current === layout ||
    window.confirm(
      "Existem alterações ainda não salvas. Deseja sair mesmo assim?"
    );
  function save(value = layout) {
    setSaveError(false);
    setStatus("Salvando…");
    saveQueue.schedule(value);
  }
  function exportLayout() {
    const blob = new Blob([JSON.stringify(layout, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "estoque-layout.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useEffect(() => {
    if (ready && layout !== saved.current) save(layout);
  }, [layout, ready]);
  useEffect(() => {
    const warn = (e) => {
      if (layout !== saved.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [layout]);
  async function importLayout(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("A cópia deve ter até 10 MB.");
      const next = validateLayout(JSON.parse(await file.text()));
      if (
        next.items.some(
          (item) => !products.some((product) => product.id === item.productId)
        )
      )
        throw new Error(
          "Esta cópia contém produtos que não estão disponíveis nesta empresa."
        );
      if (
        (layout.objects.length || layout.items.length) &&
        !window.confirm(
          "Importar esta cópia substituirá o layout atual e suas associações. Deseja continuar?"
        )
      )
        return;
      commit(next);
      setSelected(null);
      setProduct("");
      setQuery("");
      setFocus({ stamp: Date.now() });
    } catch (error) {
      setStatus("Não foi possível importar: " + error.message);
    }
  }
  function commit(next) {
    setPast((p) => [...p.slice(-49), layout]);
    setFuture([]);
    setLayout(next);
  }
  function patch(id, changes) {
    try {
      let next = changes.dimensions
        ? resizeTree(layout, id, changes.dimensions)
        : layout;
      next = {
        ...next,
        objects: next.objects.map((object) =>
          object.id === id ? { ...object, ...changes } : object
        )
      };
      commit(next);
    } catch (error) {
      setStatus(error.message);
    }
  }
  function navigate(id) {
    setDetailsOpen(true);
    focusTimers.current.forEach(clearTimeout);
    setSelected(id);
    const path = pathTo(layout.objects, id);
    path.forEach((o, index) => {
      focusTimers.current.push(
        setTimeout(
          () => {
            setSelected(o.id);
            setFocus({ id: o.id, stamp: Date.now() });
          },
          index * Math.min(450, 1400 / Math.max(1, path.length))
        )
      );
    });
  }
  function overview() {
    setDetailsOpen(false);
    focusTimers.current.forEach(clearTimeout);
    setSelected(null);
    setProduct("");
    setQuery("");
    setFocus({ view: "perspective", stamp: Date.now() });
  }
  const selected = layout.objects.find((o) => o.id === selectedId),
    product = products.find((p) => p.id === productId);
  const found = useMemo(
    () =>
      query
        ? products
            .filter((p) =>
              [
                p.name,
                p.sku,
                p.barcode,
                p.code,
                p.internal_code,
                p.internalCode,
                p.id
              ].some((v) => normalize(v).includes(normalize(query)))
            )
            .slice(0, 30)
        : [],
    [products, query]
  );
  const locations = layout.items.filter((i) => i.productId === productId);
  const recommendations = useMemo(
    () => suggestions(layout, wanted),
    [layout, wanted]
  );
  const previewObject = useMemo(() => automaticObject(layout, type), [layout, type]);
  const previewLayout = useMemo(() => ({ version: 1, objects: [previewObject], items: [] }), [previewObject]);
  const previewFocus = useMemo(() => ({ id: previewObject.id }), [previewObject]);
  function removeSelected() {
    if (!selected) return;
    const ids = new Set(descendants(layout.objects, selectedId).map((o) => o.id));
    const items = layout.items.filter((i) => ids.has(i.locationId));
    if (!window.confirm(`Apagar ${selected.name}, ${ids.size - 1} subdivisões e ${items.length} associações de produtos?`)) return;
    commit({ ...layout, objects: layout.objects.filter((o) => !ids.has(o.id)), items: layout.items.filter((i) => !ids.has(i.locationId)) });
    setSelected(null);
  }
  function add(parentId = null) {
    const object = automaticObject(layout, type, parentId);
    if (parentId && layout.items.some((item) => item.locationId === parentId)) {
      setStatus(
        "Retire as associações desta posição antes de adicionar objetos dentro dela."
      );
      return;
    }
    if (parentId) {
      const parent = layout.objects.find((o) => o.id === parentId);
      object.dimensions.width = Math.min(
        object.dimensions.width,
        parent.dimensions.width * 0.95
      );
      object.dimensions.depth = Math.min(
        object.dimensions.depth,
        parent.dimensions.depth * 0.95
      );
      object.dimensions.height = Math.min(
        object.dimensions.height,
        parent.dimensions.height
      );
    } else
      object.position.x =
        (layout.objects.filter((o) => !o.parentId).length % 6) * 2.5;
    if (!parentId)
      object.position.z =
        Math.floor(layout.objects.filter((o) => !o.parentId).length / 6) * 3;
    commit({ ...layout, objects: [...layout.objects, object] });
    setSelected(object.id);
    setFocus({ id: object.id, stamp: Date.now() });
  }
  function subdivide(shelves = false, requestedCount = count) {
    if (!selected) return;
    if (layout.items.some((item) => item.locationId === selected.id)) {
      setStatus(
        "Retire as associações de produtos desta posição antes de criar subdivisões."
      );
      return;
    }
    const amount = Math.min(
      100,
      Math.max(1, Math.floor(Number(requestedCount)) || 1)
    );
    const existing = layout.objects.filter(
      (o) =>
        o.parentId === selected.id &&
        (shelves ? o.type === "shelf" : o.type === "slot")
    );
    const removing = existing
      .slice(amount)
      .flatMap((o) => descendants(layout.objects, o.id).map((c) => c.id));
    if (
      removing.length &&
      !window.confirm(
        `A redução removerá ${removing.length} espaços e ${layout.items.filter((i) => removing.includes(i.locationId)).length} associações de produtos. Continuar?`
      )
    )
      return;
    const children = Array.from({ length: amount }, (_, i) => {
      const child =
        existing[i] ||
        makeObject(shelves ? "shelf" : "slot", selected.id, i + 1);
      return {
        ...child,
        name:
          existing[i]?.name || `${shelves ? "Prateleira" : "Posição"} ${i + 1}`,
        code:
          existing[i]?.code ||
          `${selected.code}-${prefix}${String(i + 1).padStart(2, "0")}`,
        position: {
          x: shelves
            ? 0
            : -selected.dimensions.width / 2 +
              (selected.dimensions.width / amount) * (i + 0.5),
          y: shelves ? (selected.dimensions.height / amount) * i + 0.12 : 0,
          z: 0
        },
        dimensions: {
          width:
            selected.dimensions.width * (shelves ? 0.94 : (1 / amount) * 0.94),
          height: shelves
            ? (selected.dimensions.height / amount) * 0.85
            : selected.dimensions.height * 0.85,
          depth: selected.dimensions.depth * 0.94
        }
      };
    });
    try {
      let next = {
        ...layout,
        objects: layout.objects.filter((o) => !removing.includes(o.id)),
        items: layout.items.filter((i) => !removing.includes(i.locationId))
      };
      for (const child of children)
        if (existing.some((o) => o.id === child.id))
          next = resizeTree(next, child.id, child.dimensions);
      commit({
        ...next,
        objects: [
          ...next.objects.filter((o) => !existing.some((c) => c.id === o.id)),
          ...children
        ]
      });
    } catch (error) {
      setStatus(error.message);
    }
  }
  function associate() {
    const p = products.find((p) => p.id === assignProduct);
    if (
      !p ||
      !selected ||
      !(Number(quantity) > 0) ||
      !Number.isFinite(Number(quantity))
    )
      return;
    const allocated = layout.items
      .filter((i) => i.productId === p.id && i.locationId !== selected.id)
      .reduce((s, i) => s + i.quantity, 0);
    if (allocated + Number(quantity) > Number(p.quantity)) {
      setStatus(
        "A quantidade distribuída ultrapassa o saldo cadastrado do produto."
      );
      return;
    }
    const filled = Object.values(volume).filter((v) => v !== "").length;
    if (
      filled &&
      (filled !== 3 ||
        Object.values(volume).some(
          (v) => !(Number(v) > 0) || !Number.isFinite(Number(v))
        ))
    ) {
      setStatus("Preencha as três dimensões do volume ou deixe todas vazias.");
      return;
    }
    const storedVolume = filled
      ? Object.fromEntries(
          Object.entries(volume).map(([k, v]) => [k, Number(v)])
        )
      : undefined;
    if (
      storedVolume &&
      Object.keys(storedVolume).some(
        (k) => storedVolume[k] > selected.dimensions[k]
      )
    ) {
      setStatus("O volume informado ultrapassa as dimensões da posição.");
      return;
    }
    if (storedVolume) {
      const others = layout.items.filter(
        (item) => item.locationId === selected.id && item.productId !== p.id
      );
      const occupied = others.reduce(
        (sum, item) =>
          sum +
          (item.storedVolume
            ? item.storedVolume.width *
              item.storedVolume.height *
              item.storedVolume.depth
            : 0),
        0
      );
      const total =
        storedVolume.width * storedVolume.height * storedVolume.depth;
      const capacity =
        selected.dimensions.width *
        selected.dimensions.height *
        selected.dimensions.depth;
      if (occupied + total > capacity + 1e-8) {
        setStatus(
          "O volume total ultrapassa a capacidade cadastrada desta posição."
        );
        return;
      }
    }
    commit({
      ...layout,
      items: [
        ...layout.items.filter(
          (i) => !(i.productId === p.id && i.locationId === selected.id)
        ),
        {
          id: uid(),
          productId: p.id,
          locationId: selected.id,
          quantity: Number(quantity),
          ...(storedVolume ? { storedVolume } : {})
        }
      ]
    });
  }
  return (
    <>
      <nav className="flex flex-wrap gap-2 border-b border-neutral-800 p-3">
        <button
          className={button}
          aria-pressed={page === "map"}
          onClick={() => setPage("map")}
        >
          Visualização e montagem 3D
        </button>
        <button
          className={button}
          aria-pressed={page === "space"}
          onClick={() => setPage("space")}
        >
          Sugestão de espaço
        </button>
        <span role="status" className="self-center text-sm text-neutral-400">
          {status}
        </span>
      </nav>
      {saveError && (
        <div
          role="alert"
          className="flex flex-wrap gap-2 border-b border-amber-700 p-3"
        >
          <button className={button} onClick={() => save()}>
            Tentar salvar novamente
          </button>
          <button className={button} onClick={exportLayout}>
            Exportar minha cópia
          </button>
          <button className={button} onClick={onReload}>
            Recarregar layout
          </button>
        </div>
      )}
      {!ready ? (
        <div className="p-6">
          <p>O ambiente estará disponível após carregar o layout.</p>
          <button className={button} onClick={onReload}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {page === "space" ? (
            <section className="overflow-auto p-4">
              <h3 className="text-xl font-semibold">Onde posso guardar?</h3>
              <p className="my-3 text-neutral-400">
                Informe o volume total a guardar, em metros. As sugestões usam
                as dimensões cadastradas; confirme o espaço livre no local antes
                de guardar.
              </p>
              <div className="grid max-w-xl grid-cols-3 gap-3">
                {["width", "height", "depth"].map((key, i) => (
                  <Field
                    key={key}
                    label={["Largura (m)", "Altura (m)", "Profundidade (m)"][i]}
                  >
                    <input
                      className={input}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={wanted[key]}
                      onChange={(e) =>
                        setWanted({
                          ...wanted,
                          [key]:
                            e.target.value === "" ? "" : Number(e.target.value)
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
              <p className="my-4">
                {recommendations.length} posições sugeridas. Posições ocupadas
                sem volume informado não são recomendadas.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {recommendations.map((s) => (
                  <button
                    className={`${button} text-left`}
                    key={s.object.id}
                    onClick={() => {
                      setPage("map");
                      setEditing(false);
                      navigate(s.object.id);
                    }}
                  >
                    <strong>
                      {pathTo(layout.objects, s.object.id)
                        .map((o) => o.name)
                        .join(" → ")}
                    </strong>
                    <p>
                      {s.object.code} ·{" "}
                      {s.occupied ? "Espaço parcial estimado" : "Posição vazia"}{" "}
                      · {s.free.toFixed(2)} m³ livres
                    </p>
                    <span>Ver no estoque →</span>
                  </button>
                ))}
              </div>
              {!recommendations.length && (
                <p className="mt-4">
                  Nenhuma posição compatível. Cadastre posições ou revise as
                  dimensões e os volumes ocupados.
                </p>
              )}
            </section>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 p-3">
                <button
                  className={button}
                  aria-pressed={editing}
                  onClick={() => {
                    setEditing(!editing);
                    setDetailsOpen(!editing);
                  }}
                >
                  {editing ? "Concluir montagem" : "Editar estoque"}
                </button>
                <button
                  className={`${button} !bg-white !text-black`}
                  onClick={overview}
                >
                  Voltar para visão geral
                </button>
                {!editing && (
                  <button
                    className={button}
                    onClick={() => setDetailsOpen(!detailsOpen)}
                  >
                    {detailsOpen ? "Ocultar detalhes" : "Explorar posições"}
                  </button>
                )}
                {editing && (
                  <>
                    <button
                      className={button}
                      disabled={!past.length}
                      onClick={() => {
                        setFuture((f) => [layout, ...f]);
                        setLayout(past.at(-1));
                        setPast((p) => p.slice(0, -1));
                      }}
                    >
                      Desfazer
                    </button>
                    <button
                      className={button}
                      disabled={!future.length}
                      onClick={() => {
                        setPast((p) => [...p, layout]);
                        setLayout(future[0]);
                        setFuture((f) => f.slice(1));
                      }}
                    >
                      Refazer
                    </button>
                    <button className={button} onClick={() => save()}>
                      Salvar layout
                    </button>
                    <button className={button} onClick={exportLayout}>
                      Exportar cópia
                    </button>
                    <label className={`${button} relative cursor-pointer`}>
                      Importar cópia
                      <input
                        aria-label="Importar cópia"
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        type="file"
                        accept="application/json,.json"
                        onChange={importLayout}
                      />
                    </label>
                  </>
                )}
              </div>
              <div className="relative z-20 border-b border-neutral-800 px-3 pb-3">
                {" "}
                <div className="bg-neutral-950">
                  <Field label="Encontrar produto">
                    <input
                      className={input}
                      placeholder="Nome, SKU ou código"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setProduct("");
                        if (!e.target.value) {
                          setProduct("");
                          setSelected(null);
                          focusTimers.current.forEach(clearTimeout);
                        }
                      }}
                    />
                  </Field>
                </div>
                {query && !product && (
                  <div className="absolute left-3 right-3 top-full z-30 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-xl">
                    {found.map((p) => (
                      <button
                        className={`${button} w-full text-left`}
                        key={p.id}
                        onClick={() => {
                          focusTimers.current.forEach(clearTimeout);
                          setSelected(null);
                          setProduct(p.id);
                          setDetailsOpen(true);
                          const first = layout.items.find(
                            (i) => i.productId === p.id
                          );
                          if (first) navigate(first.locationId);
                        }}
                      >
                        {p.name}
                        <span className="block text-xs text-neutral-400">
                          {p.sku || p.code || p.id}
                        </span>
                      </button>
                    ))}
                    {!found.length && <p>Nenhum produto encontrado.</p>}
                  </div>
                )}
              </div>
              <div className="relative min-h-0 flex-1 overflow-auto md:flex">
                <div className="relative h-[55vh] min-h-[320px] min-w-0 flex-1 md:h-full">
                  <Scene
                    layout={layout}
                    selectedId={selectedId}
                    focus={focus}
                    editing={editing}
                    snap={snap}
                    placement={editing && placing ? previewObject : null}
                    onPlace={(placement) => {
                      commit({ ...layout, objects: [...layout.objects, { ...previewObject, ...placement }] });
                      setSelected(previewObject.id);
                      setPlacing(false);
                    }}
                    onMove={(id, position, parentId, rotation) =>
                      patch(id, {
                        position,
                        ...(parentId !== undefined ? { parentId } : {}),
                        ...(rotation ? { rotation } : {})
                      })
                    }
                    onSelect={(id, double) => {
                      if (!id) {
                        focusTimers.current.forEach(clearTimeout);
                        setSelected(null);
                        setDetailsOpen(false);
                        return;
                      }
                      if (editing) {
                        setSelected(id);
                        setPlacing(false);
                        if (double) setFocus({ id, stamp: Date.now() });
                      } else navigate(id);
                    }}
                  />
                  {!layout.objects.length && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
                      <p className="rounded-lg bg-neutral-950/90 p-5">
                        Seu estoque ainda está vazio.
                        <br />
                        Toque em “Editar estoque” para adicionar o primeiro
                        objeto.
                      </p>
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1">
                    {[
                      ["front", "Frente"],
                      ["back", "Trás"],
                      ["left", "Esquerda"],
                      ["right", "Direita"],
                      ["top", "Superior"],
                      ["perspective", "Perspectiva"]
                    ].map(([view, label]) => (
                      <button
                        className={button}
                        key={view}
                        onClick={() =>
                          setFocus({ id: selectedId, view, stamp: Date.now() })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {(editing || detailsOpen) && (
                  <aside className="w-full min-w-0 shrink-0 space-y-4 overflow-y-auto border-neutral-800 bg-neutral-900 p-4 md:w-80 md:border-l">
                    {editing && selected && (
                      <section className="space-y-2 border-b border-neutral-700 pb-4">
                        <button className={`${button} w-full border-red-700 text-red-300`} onClick={removeSelected}>Apagar {selected.name}</button>
                        <p className="text-xs text-neutral-400">Arraste sobre outro objeto para apoiar. Arraste para o chão para retirar.</p>
                      </section>
                    )}
                    {product && (
                      <section>
                        {locations.reduce((sum, i) => sum + i.quantity, 0) !==
                          Number(product.quantity) && (
                          <p role="status" className="mb-2 text-amber-300">
                            Saldo cadastrado: {product.quantity}. Distribuído
                            nas posições:{" "}
                            {locations.reduce((sum, i) => sum + i.quantity, 0)}.
                            Confira a distribuição após movimentações.
                          </p>
                        )}
                        <h3 className="font-semibold">{product.name}</h3>
                        <p className="text-sm text-neutral-400">
                          Código:{" "}
                          {product.sku ||
                            product.code ||
                            product.internal_code ||
                            product.id}
                        </p>
                        {(product.image_url || product.imageUrl) && (
                          <img
                            alt={product.name}
                            src={product.image_url || product.imageUrl}
                            className="my-2 h-24 w-24 rounded object-contain"
                          />
                        )}
                        {locations.map((i) => (
                          <button
                            className={`${button} my-1 w-full text-left`}
                            key={i.id}
                            onClick={() => navigate(i.locationId)}
                          >
                            {pathTo(layout.objects, i.locationId)
                              .map((o) => o.name)
                              .join(" → ")}
                            <strong className="block">
                              {i.quantity} unidades
                            </strong>
                          </button>
                        ))}
                        {!locations.length && (
                          <p>Produto ainda sem posição física associada.</p>
                        )}
                      </section>
                    )}
                    {editing && (
                      <section className="space-y-3">
                        <Field label="Adicionar objeto">
                          <select
                            className={input}
                            value={type}
                            onChange={(e) => { setType(e.target.value); setPlacing(false); }}
                          >
                            {Object.entries(TYPES).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <div draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", type); e.dataTransfer.effectAllowed = "copy"; setPlacing(true); }} onDragEnd={() => setPlacing(false)} className="cursor-grab rounded-lg border border-neutral-700 bg-neutral-950 p-2" aria-label={`Prévia de ${TYPES[type]}. Arraste para o estoque`}>
                          <div className="pointer-events-none h-[180px] overflow-hidden rounded">
                            <Scene compact layout={previewLayout} focus={previewFocus} editing={false} snap={0} />
                          </div>
                          <p className="text-center text-sm">{TYPES[type]} · Arraste para o estoque</p>
                        </div>
                        <button className={button} onClick={() => setPlacing(!placing)}>
                          {placing ? "Cancelar posicionamento" : "Escolher local na cena"}
                        </button>
                        {placing && <p role="status" className="text-sm text-amber-300">Mova sobre o chão ou outro objeto e solte. Você também pode tocar no local para adicionar.</p>}
                        {selected && (
                          <button
                            className={button}
                            onClick={() => add(selected.id)}
                          >
                            Adicionar dentro de {selected.name}
                          </button>
                        )}
                        <Field label="Quer alinhar os objetos lado a lado automaticamente?">
                          <select className={input} value={snap ? "yes" : "no"} onChange={(e) => setSnap(e.target.value === "yes" ? 0.25 : 0)}>
                            <option value="no">Não, mover livremente</option>
                            <option value="yes">Sim, alinhar automaticamente</option>
                          </select>
                        </Field>
                        <Field label="Encaixe no chão">
                          <select
                            className={input}
                            value={snap}
                            onChange={(e) => setSnap(Number(e.target.value))}
                          >
                            {[
                              [0, "Desativado"],
                              [0.1, "10 cm"],
                              [0.25, "25 cm"],
                              [0.5, "50 cm"],
                              [1, "1 m"]
                            ].map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <p className="text-xs text-neutral-400">
                          Arraste o objeto para mover. Arraste o fundo para
                          girar a câmera. As linhas amarelas ajudam a alinhar.
                          No computador, segure Alt para suspender o encaixe.
                        </p>
                      </section>
                    )}
                    {selected && (
                      <section className="space-y-3">
                        <h3 className="font-semibold">{selected.name}</h3>
                        <p className="text-sm text-amber-300">
                          {pathTo(layout.objects, selectedId)
                            .map((o) => o.name)
                            .join(" → ")}{" "}
                          · {selected.code}
                        </p>
                        {layout.items
                          .filter((i) => i.locationId === selectedId)
                          .map((i) => (
                            <div
                              className="rounded border border-neutral-700 p-2"
                              key={i.id}
                            >
                              {products.find((p) => p.id === i.productId)
                                ?.name || "Produto indisponível"}
                              <strong className="block">
                                {i.quantity} unidades
                              </strong>
                              {editing && (
                                <button
                                  className={button}
                                  onClick={() =>
                                    commit({
                                      ...layout,
                                      items: layout.items.filter(
                                        (item) => item.id !== i.id
                                      )
                                    })
                                  }
                                >
                                  Retirar associação
                                </button>
                              )}
                            </div>
                          ))}
                        {editing && (
                          <>
                            <Field label="Nome">
                              <input
                                className={input}
                                value={selected.name}
                                onChange={(e) =>
                                  patch(selectedId, { name: e.target.value })
                                }
                              />
                            </Field>
                            <Field label="Código">
                              <input
                                className={input}
                                value={selected.code}
                                onChange={(e) =>
                                  patch(selectedId, { code: e.target.value })
                                }
                              />
                            </Field>
                            <Field label="Unidade">
                              <select
                                className={input}
                                value={unit}
                                onChange={(e) => setUnit(e.target.value)}
                              >
                                <option>m</option>
                                <option>cm</option>
                                <option>mm</option>
                              </select>
                            </Field>
                            {["width", "height", "depth"].map((key, i) => (
                              <Field
                                key={key}
                                label={`${["Largura", "Altura", "Profundidade"][i]} (${unit})`}
                              >
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  className={input}
                                  value={Number(
                                    (
                                      selected.dimensions[key] *
                                      (unit === "m"
                                        ? 1
                                        : unit === "cm"
                                          ? 100
                                          : 1000)
                                    ).toFixed(3)
                                  )}
                                  onChange={(e) => {
                                    const value =
                                      Number(e.target.value) /
                                      (unit === "m"
                                        ? 1
                                        : unit === "cm"
                                          ? 100
                                          : 1000);
                                    if (value > 0)
                                      patch(selectedId, {
                                        dimensions: {
                                          ...selected.dimensions,
                                          [key]: value
                                        }
                                      });
                                  }}
                                />
                              </Field>
                            ))}
                            <div className="flex flex-wrap gap-2">
                              <button
                                className={button}
                                onClick={() =>
                                  patch(selectedId, {
                                    rotation: {
                                      ...selected.rotation,
                                      y: selected.rotation.y + Math.PI / 2
                                    }
                                  })
                                }
                              >
                                Girar 90°
                              </button>
                              <button
                                className={button}
                                onClick={() =>
                                  commit(duplicateTree(layout, selectedId))
                                }
                              >
                                Duplicar
                              </button>

                            </div>
                            <Field label="Quantidade de subdivisões">
                              <input
                                className={input}
                                type="number"
                                min="1"
                                max="100"
                                value={count}
                                onChange={(e) => setCount(e.target.value)}
                              />
                            </Field>
                            <Field label="Prefixo dos códigos">
                              <input
                                className={input}
                                value={prefix}
                                onChange={(e) => setPrefix(e.target.value)}
                              />
                            </Field>
                            <button
                              className={button}
                              onClick={() => subdivide(false)}
                            >
                              Criar / atualizar posições
                            </button>
                            {["rack", "cabinet", "gondola"].includes(
                              selected.type
                            ) && (
                              <>
                                <Field label="Número de prateleiras">
                                  <input
                                    className={input}
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={
                                      layout.objects.filter(
                                        (o) =>
                                          o.parentId === selectedId &&
                                          o.type === "shelf"
                                      ).length || ""
                                    }
                                    onChange={(e) => {
                                      if (Number(e.target.value) > 0)
                                        subdivide(true, e.target.value);
                                    }}
                                  />
                                </Field>
                                <button
                                  className={button}
                                  onClick={() => subdivide(true)}
                                >
                                  Criar / atualizar prateleiras
                                </button>
                              </>
                            )}
                            {["slot", "pallet", "box", "drawer"].includes(
                              selected.type
                            ) &&
                              !layout.objects.some(
                                (o) => o.parentId === selectedId
                              ) && (
                                <div className="space-y-3 border-t border-neutral-700 pt-3">
                                  <Field label="Associar produto">
                                    <select
                                      className={input}
                                      value={assignProduct}
                                      onChange={(e) =>
                                        setAssignProduct(e.target.value)
                                      }
                                    >
                                      <option value="">Selecione</option>
                                      {products.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.name}
                                        </option>
                                      ))}
                                    </select>
                                  </Field>
                                  <Field label="Quantidade nesta posição">
                                    <input
                                      className={input}
                                      type="number"
                                      min="0.01"
                                      value={quantity}
                                      onChange={(e) =>
                                        setQuantity(e.target.value)
                                      }
                                    />
                                  </Field>
                                  <p className="text-sm">
                                    Volume total ocupado (opcional, em metros)
                                  </p>
                                  {["width", "height", "depth"].map(
                                    (key, i) => (
                                      <Field
                                        key={key}
                                        label={
                                          ["Largura", "Altura", "Profundidade"][
                                            i
                                          ]
                                        }
                                      >
                                        <input
                                          className={input}
                                          type="number"
                                          min="0.01"
                                          step="0.01"
                                          value={volume[key]}
                                          onChange={(e) =>
                                            setVolume({
                                              ...volume,
                                              [key]: e.target.value
                                            })
                                          }
                                        />
                                      </Field>
                                    )
                                  )}
                                  <button
                                    className={button}
                                    onClick={associate}
                                  >
                                    Salvar associação
                                  </button>
                                </div>
                              )}
                          </>
                        )}
                      </section>
                    )}
                    <details>
                      <summary className="min-h-11 cursor-pointer py-3">
                        Explorar posições por lista
                      </summary>
                      {layout.objects
                        .filter((o) => o.parentId === (selectedId || null))
                        .map((o) => (
                          <button
                            className={`${button} my-1 w-full text-left`}
                            key={o.id}
                            onClick={() =>
                              editing ? setSelected(o.id) : navigate(o.id)
                            }
                          >
                            {o.name} →
                          </button>
                        ))}
                      {selected && (
                        <button
                          className={button}
                          onClick={() => setSelected(selected.parentId)}
                        >
                          Subir um nível
                        </button>
                      )}
                    </details>
                    <p className="text-xs text-neutral-400">
                      Um dedo gira. Dois dedos deslocam; pinça aproxima. No
                      computador, arraste para girar, use a roda para aproximar
                      e o botão direito para deslocar.
                    </p>
                  </aside>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
