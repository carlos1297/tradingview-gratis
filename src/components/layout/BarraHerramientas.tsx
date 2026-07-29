"use client";

import { useEffect } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  HERRAMIENTAS,
  HERRAMIENTA_POR_DEFECTO,
  herramientaPorAtajo,
} from "@/lib/herramientas/registro";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/**
 * BarraHerramientas — Barra lateral izquierda, estilo TradingView.
 *
 * NO conoce ninguna herramienta concreta: recorre `lib/herramientas/registro`
 * y arma un botón por entrada. Sumar una línea de tendencia, un Fibonacci o un
 * rectángulo no toca este archivo — igual que el menú «Indicadores» no cambia
 * al agregar un indicador nuevo.
 *
 * Es SOLO presentación: no dibuja sobre el gráfico ni sabe cómo se dibuja.
 * Escribe un id en el store y cada ventana del mosaico se da por enterada.
 */
export function BarraHerramientas() {
  const activa = useChartStore((s) => s.herramientaActiva);
  const setActiva = useChartStore((s) => s.setHerramientaActiva);

  // Atajos de teclado: cada herramienta declara el suyo en el registro, así que
  // esto tampoco hay que tocarlo al agregar una. Escape siempre vuelve al
  // cursor — es la salida cuando quedaste con una herramienta puesta y el
  // gráfico "no responde" a los clics como esperabas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // no robarle la tecla a un campo de texto (buscador de símbolo, etc.)
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;

      if (e.key === "Escape") {
        // Solo si hay algo que cancelar: en modo inmersivo Escape sale de
        // pantalla completa, y esta barra no se monta ahí, pero por las dudas
        // no se consume la tecla cuando ya estás en el cursor.
        if (useChartStore.getState().herramientaActiva !== HERRAMIENTA_POR_DEFECTO) {
          setActiva(HERRAMIENTA_POR_DEFECTO);
        }
        return;
      }
      const h = herramientaPorAtajo(e.key);
      if (h) setActiva(h.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActiva]);

  return (
    <aside
      data-label="barra-herramientas"
      aria-label="Herramientas de dibujo"
      role="toolbar"
      aria-orientation="vertical"
      className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-tv-border bg-tv-panel py-1.5"
    >
      {HERRAMIENTAS.map((h) => {
        const Icono = h.icono;
        const seleccionada = activa === h.id;
        return (
          <Tooltip key={h.id}>
            <TooltipTrigger
              onClick={() => setActiva(h.id)}
              aria-label={h.nombre}
              aria-pressed={seleccionada}
              data-herramienta={h.id}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded transition-colors",
                seleccionada
                  ? "bg-tv-blue/15 text-tv-blue"
                  : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
              )}
            >
              <Icono className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-56 text-xs">
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{h.nombre}</span>
                <kbd className="rounded border border-tv-border px-1 text-[10px] uppercase text-tv-text-dim">
                  {h.atajo}
                </kbd>
              </div>
              <div className="mt-0.5 text-[10px] leading-snug text-tv-text-muted">
                {h.descripcion}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </aside>
  );
}
