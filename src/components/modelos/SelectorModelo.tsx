"use client";

import { Cpu } from "lucide-react";
import { REGISTRO_MODELOS } from "@/lib/modelos/registro";
import { useModelosStore } from "@/lib/store/modelos-store";
import { cn } from "@/lib/utils";

/**
 * SelectorModelo — Elige qué modelo se muestra en detalle en la barra.
 *
 * Se dibuja solo con los modelos que REALMENTE respondieron (`disponibles`),
 * en el orden del registro. Con un único modelo activo se muestra como
 * etiqueta fija; con dos o más aparecen las pestañas. Agregar PPO al registro
 * hace aparecer su pestaña sin tocar este archivo.
 */
export function SelectorModelo() {
  const disponibles = useModelosStore((s) => s.disponibles);
  const modeloActivo = useModelosStore((s) => s.modeloActivo);
  const setModeloActivo = useModelosStore((s) => s.setModeloActivo);
  const estados = useModelosStore((s) => s.estados);

  // orden estable del registro, no el de llegada
  const fuentes = REGISTRO_MODELOS.filter((f) => disponibles.includes(f.id));
  if (fuentes.length === 0) return null;

  const activa = fuentes.find((f) => f.id === modeloActivo) ?? fuentes[0];

  if (fuentes.length === 1) {
    return (
      <div className="flex items-center gap-2" title={activa.descripcion}>
        <span
          className="flex h-6 w-6 items-center justify-center rounded"
          style={{ background: `${activa.color}22` }}
        >
          <Cpu className="h-3.5 w-3.5" style={{ color: activa.color }} />
        </span>
        <div className="flex flex-col leading-none">
          <span className="text-[13px] font-semibold text-tv-text">
            {estados[activa.id]?.modeloEtiqueta ?? activa.etiqueta}
          </span>
          <span className="mt-0.5 text-[10px] uppercase tracking-wider text-tv-text-dim">
            Modelo IA
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Cpu className="mr-0.5 h-3.5 w-3.5 shrink-0 text-tv-text-dim" />
      <div
        className="flex items-center gap-0.5 rounded border border-tv-border p-0.5"
        role="tablist"
        aria-label="Modelo de IA activo"
      >
        {fuentes.map((f) => {
          const activo = f.id === activa.id;
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={activo}
              title={f.descripcion}
              onClick={() => setModeloActivo(f.id)}
              className={cn(
                "rounded px-2 py-1 text-xs font-semibold transition-colors",
                activo
                  ? "text-tv-text"
                  : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
              )}
              style={activo ? { background: `${f.color}26`, color: f.color } : undefined}
            >
              {estados[f.id]?.modeloEtiqueta ?? f.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}
