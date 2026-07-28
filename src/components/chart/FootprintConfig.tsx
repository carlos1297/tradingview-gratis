"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useChartStore, type FootprintConfig as FpCfg } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/**
 * Configuración del Footprint (Bid×Ask por nivel de precio): granularidad del
 * nivel (escala del tick), ratio de desequilibrio a resaltar, ancho mínimo de
 * vela para dibujar, opacidad y colores. Se abre desde su fila en el menú de
 * indicadores y persiste en el store.
 */

const FP_DEFAULT: FpCfg = {
  escala: 0.5,
  imbalance: 3,
  minAncho: 56,
  opacidad: 0.9,
  colorAsk: "#26a69a",
  colorBid: "#ef5350",
  colorPOC: "#2962ff",
};

const ESCALAS: Array<{ v: number; etq: string }> = [
  { v: 0.25, etq: "Muy fino" },
  { v: 0.5, etq: "Fino" },
  { v: 1, etq: "Normal" },
  { v: 2, etq: "Grueso" },
];

export function FootprintConfig() {
  const cfg = useChartStore((s) => s.footprintConfig);
  const set = useChartStore((s) => s.setFootprintConfig);

  return (
    <Dialog>
      <DialogTrigger
        title="Configurar el Footprint (Bid×Ask por nivel)"
        aria-label="Configurar Footprint"
        className="flex h-7 w-7 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="max-w-sm gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">
            Footprint · configuración
          </DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-4">
          <Campo
            titulo="Granularidad del nivel"
            ayuda="Tamaño de cada nivel de precio (más fino = más filas por vela)"
          >
            <div className="flex gap-1 rounded border border-tv-border p-0.5">
              {ESCALAS.map(({ v, etq }) => (
                <button
                  key={v}
                  onClick={() => set({ escala: v })}
                  className={cn(
                    "flex-1 rounded px-2 py-1 text-xs",
                    cfg.escala === v
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
            titulo="Desequilibrio (imbalance)"
            valor={`${cfg.imbalance}×`}
            ayuda="Resalta la celda cuando un lado supera al otro por este factor"
          >
            <input
              type="range"
              min={1.5}
              max={6}
              step={0.5}
              value={cfg.imbalance}
              onChange={(e) => set({ imbalance: parseFloat(e.target.value) })}
              className="w-full accent-tv-blue"
            />
          </Campo>

          <Campo
            titulo="Ancho mínimo de vela"
            valor={`${cfg.minAncho}px`}
            ayuda="Debajo de este zoom no se dibujan los números (evita amontonar)"
          >
            <input
              type="range"
              min={32}
              max={120}
              step={4}
              value={cfg.minAncho}
              onChange={(e) => set({ minAncho: parseInt(e.target.value, 10) })}
              className="w-full accent-tv-blue"
            />
          </Campo>

          <Campo titulo="Opacidad" valor={`${Math.round(cfg.opacidad * 100)}%`}>
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={cfg.opacidad}
              onChange={(e) => set({ opacidad: parseFloat(e.target.value) })}
              className="w-full accent-tv-blue"
            />
          </Campo>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-tv-text">Colores</span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <Color etq="Compra (ask)" val={cfg.colorAsk} set={(v) => set({ colorAsk: v })} />
              <Color etq="Venta (bid)" val={cfg.colorBid} set={(v) => set({ colorBid: v })} />
              <Color etq="POC" val={cfg.colorPOC} set={(v) => set({ colorPOC: v })} />
            </div>
          </div>

          <button
            onClick={() => set({ ...FP_DEFAULT })}
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

function Color({
  etq,
  val,
  set,
}: {
  etq: string;
  val: string;
  set: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-tv-text-muted">
      <input
        type="color"
        value={val}
        onChange={(e) => set(e.target.value)}
        className="h-5 w-5 cursor-pointer rounded border border-tv-border bg-transparent"
      />
      <span className="truncate">{etq}</span>
    </label>
  );
}
