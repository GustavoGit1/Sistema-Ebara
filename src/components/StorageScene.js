"use client";
import { useEffect, useRef, useState } from "react";
import { createStorageScene } from "@/lib/storage-scene-engine";

export default function StorageScene({
  layout,
  selectedId,
  focus,
  editing,
  snap,
  onSelect,
  onMove,
  placement,
  onPlace,
  compact = false
}) {
  const host = useRef(),
    engine = useRef(),
    latest = useRef();
  const [error, setError] = useState("");
  latest.current = { onSelect, onMove, onPlace };
  useEffect(() => {
    try {
      engine.current = createStorageScene(host.current, {
        onSelect: (...args) => latest.current.onSelect?.(...args),
        onMove: (...args) => latest.current.onMove?.(...args),
        onPlace: (...args) => latest.current.onPlace?.(...args)
      });
    } catch {
      setError(
        "Não foi possível iniciar o 3D. Ative a aceleração gráfica do navegador. Você pode continuar pela lista de posições."
      );
    }
    return () => {
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.setLayout(layout);
  }, [layout]);
  useEffect(() => {
    engine.current?.setSelection(selectedId);
  }, [selectedId]);
  useEffect(() => {
    engine.current?.setEditing(editing, snap);
  }, [editing, snap]);
  useEffect(() => {
    engine.current?.focus(focus || {});
  }, [focus]);
  useEffect(() => {
    engine.current?.setPlacement(placement);
  }, [placement]);
  return (
    <div
      ref={host}
      className={`relative h-full ${compact ? "" : "min-h-[320px]"} w-full touch-none`}
      aria-label="Visualização 3D do estoque"
    >
      {error && (
        <p role="alert" className="p-6">
          {error}
        </p>
      )}
    </div>
  );
}
