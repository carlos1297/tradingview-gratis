"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useChartStore } from "@/lib/store/chart-store";
import { heatColor, NIVELES_APALANCAMIENTO } from "@/lib/indicators/liquidations";
import { cn } from "@/lib/utils";

/**
 * Filtro de órdenes profesional del Liquidation Heatmap: qué apalancamientos
 * incluir, qué lado (long/short), la intensidad mínima para pintar (oculta
 * órdenes débiles) y la opacidad. Se abre desde el botón del header y persiste
 * en el store (chart-store.liqHeatmapConfig).
 */

const LADOS: Array<{ id: "ambos" | "long" | "short"; etq: string }> = [
  { id: "ambos", etq: "Ambos" },
  { id: "long", etq: "Long" },
  { id: "short", etq: "Short" },
];

// referencia de la escala de color (misma rampa que pinta el heatmap)
const ESCALA = [0, 0.25, 0.5, 0.75, 1].map((v) => heatColor(v)).join(", ");

export function HeatmapConfig() {
  const cfg = useChartStore((s) => s.liqHeatmapConfig);
  const set = useChartStore((s) => s.setLiqHeatmapConfig);

  const toggleApalancamiento = (lev: number) =>
    set({
      apalancamientos: cfg.apalancamientos.includes(lev)
        ? cfg.apalancamientos.filter((x) => x !== lev)
        : [...cfg.apalancamientos, lev],
    });

  return (
    <Dialog>
      <DialogTrigger
        title="Configurar el filtro de órdenes del Liquidation Heatmap"
        aria-label="Configurar Liquidation Heatmap"
        className="flex h-7 w-7 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="max-w-sm gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">
            Liquidation Heatmap · filtro de órdenes
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 p-4">
          <Campo titulo="Apalancamiento" ayuda="Cohortes de posiciones incluidas en la estimación">
            <div className="flex flex-wrap gap-1.5">
              {NIVELES_APALANCAMIENTO.map((lev) => {
                const on = cfg.apalancamientos.includes(lev);
                return (
                  <button
                    key={lev}
                    onClick={() => toggleApalancamiento(lev)}
                    aria-pressed={on}
                    className={cn(
                      "rounded px-2.5 py-1 text-xs font-medium tabular-nums",
                      on
                        ? "bg-tv-blue/15 text-tv-blue ring-1 ring-tv-blue/40"
                        : "bg-tv-bg text-tv-text-muted hover:text-tv-text",
                    )}
                  >
                    {lev}x
                  </button>
                );
              })}
            </div>
          </Campo>

          <Campo titulo="Lado" ayuda="Liquidaciones de long (debajo del precio) o short (arriba)">
            <div className="flex gap-1 rounded border border-tv-border p-0.5">
              {LADOS.map(({ id, etq }) => (
                <button
                  key={id}
                  onClick={() => set({ lado: id })}
                  className={cn(
                    "flex-1 rounded px-2 py-1 text-xs",
                    cfg.lado === id
                      ? "bg-tv-blue/15 text-tv-blue"
                      : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                  )}
                >
                  {etq}
                </button>
              ))}
            </div>
          </Campo>

          <Campo
            titulo="Intensidad mínima"
            valor={`${Math.round(cfg.umbral * 100)}%`}
            ayuda="Oculta las zonas de liquidación más débiles (filtra el ruido)"
          >
            <input
              type="range"
              min={0.02}
              max={0.6}
              step={0.01}
              value={cfg.umbral}
              onChange={(e) => set({ umbral: parseFloat(e.target.value) })}
              className="w-full accent-tv-blue"
            />
          </Campo>

          <Campo titulo="Opacidad" valor={`${Math.round(cfg.opacidad * 100)}%`}>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={cfg.opacidad}
              onChange={(e) => set({ opacidad: parseFloat(e.target.value) })}
              className="w-full accent-tv-blue"
            />
          </Campo>

          <div className="flex flex-col gap-1">
            <div
              className="h-2 w-full rounded"
              style={{ background: `linear-gradient(to right, ${ESCALA})` }}
            />
            <div className="flex justify-between text-[10px] text-tv-text-dim">
              <span>baja</span>
              <span>densidad de liquidaciones</span>
              <span>alta</span>
            </div>
          </div>

          <button
            onClick={() =>
              set({
                apalancamientos: [...NIVELES_APALANCAMIENTO],
                lado: "ambos",
                umbral: 0.05,
                opacidad: 1,
              })
            }
            className="mt-1 flex items-center gap-1.5 self-start rounded px-2 py-1 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          >
            <RotateCcw className="h-3 w-3" />
            Restablecer
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  titulo,
  valor,
  ayuda,
  children,
}: {
  titulo: string;
  valor?: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-tv-text">{titulo}</span>
        {valor && (
          <span className="text-xs tabular-nums text-tv-text-muted">{valor}</span>
        )}
      </div>
      {children}
      {ayuda && <span className="text-[10px] text-tv-text-dim">{ayuda}</span>}
    </div>
  );
}
