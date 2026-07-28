"use client";

import { Expand, LayoutGrid, Zap } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { entrarPantallaCompleta } from "@/lib/fullscreen";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { IndicatorMenu } from "@/components/chart/IndicatorMenu";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/** Plantillas de cantidad de ventanas (estilo TradingView) */
const LAYOUTS_PRESET = [1, 2, 3, 4, 6, 8, 10];

export function Header() {
  const nVentanas = useChartStore((s) => s.ventanasTF.length);
  const setNumeroVentanas = useChartStore((s) => s.setNumeroVentanas);
  const setSoloGraficos = useChartStore((s) => s.setSoloGraficos);

  return (
    <header className="flex h-12 items-center justify-between border-b border-tv-border bg-tv-panel px-3">
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-2 pr-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-tv-blue/20">
            <Zap className="h-4 w-4 text-tv-blue" />
          </div>
          <span className="text-sm font-semibold text-tv-text">
            TradingView <span className="text-tv-text-muted">Gratis</span>
          </span>
        </div>
        <Separator orientation="vertical" className="h-6 bg-tv-border" />
        <SymbolSelector />
        <Separator orientation="vertical" className="mx-1 h-6 bg-tv-border" />
        <IndicatorMenu />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setSoloGraficos(true);
            entrarPantallaCompleta();
          }}
          title="Pantalla completa: solo los gráficos, en todo el monitor (Esc para salir)"
          aria-label="Pantalla completa de gráficos"
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Expand className="h-3.5 w-3.5" />
          <span>Pantalla completa</span>
        </button>
        {/* plantilla de ventanas (cantidad), estilo TradingView */}
        <div className="flex items-center gap-0.5 rounded border border-tv-border p-0.5">
          <LayoutGrid className="mx-0.5 h-3.5 w-3.5 text-tv-text-dim" />
          {LAYOUTS_PRESET.map((n) => (
            <button
              key={n}
              onClick={() => setNumeroVentanas(n)}
              title={`${n} ${n === 1 ? "ventana" : "ventanas"}`}
              aria-label={`${n} ventanas`}
              className={cn(
                "min-w-6 rounded px-1.5 py-1 text-xs tabular-nums",
                nVentanas === n
                  ? "bg-tv-blue/15 text-tv-blue"
                  : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
