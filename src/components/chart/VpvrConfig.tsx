"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useChartStore, type VpvrConfig as VpvrCfg } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/**
 * Configuración profesional del Volume Profile Visible Range (VPVR): filas,
 * % del Value Area, lado, ancho, opacidad, toggles de VA y HVN/LVN, y colores
 * independientes. Se abre desde el header y persiste en el store.
 */

const VPVR_DEFAULT: VpvrCfg = {
  rows: 24,
  vaPercent: 0.7,
  lado: "derecha",
  anchoPct: 0.3,
  opacidad: 0.85,
  mostrarVA: true,
  mostrarHvnLvn: false,
  colorAlcista: "#26a69a",
  colorBajista: "#ef5350",
  colorPOC: "#2962ff",
  colorVA: "#b2b5be",
  colorFueraVA: "#5d6069",
};

export function VpvrConfig() {
  const cfg = useChartStore((s) => s.vpvrConfig);
  const set = useChartStore((s) => s.setVpvrConfig);

  return (
    <Dialog>
      <DialogTrigger
        title="Configurar el Volume Profile (VPVR)"
        aria-label="Configurar VPVR"
        className="flex h-7 w-7 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="max-w-sm gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">
            Volume Profile · configuración
          </DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-4">
          <Campo titulo="Filas (Rows)" valor={String(cfg.rows)}>
            <input
              type="range"
              min={8}
              max={150}
              step={1}
              value={cfg.rows}
              onChange={(e) => set({ rows: parseInt(e.target.value, 10) })}
              className="w-full accent-tv-blue"
            />
          </Campo>

          <Campo titulo="Value Area" valor={`${Math.round(cfg.vaPercent * 100)}%`}>
            <input
              type="range"
              min={0.5}
              max={0.9}
              step={0.01}
              value={cfg.vaPercent}
              onChange={(e) => set({ vaPercent: parseFloat(e.target.value) })}
              className="w-full accent-tv-blue"
            />
          </Campo>

          <Campo titulo="Lado del perfil">
            <div className="flex gap-1 rounded border border-tv-border p-0.5">
              {(["izquierda", "derecha"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => set({ lado: l })}
                  className={cn(
                    "flex-1 rounded px-2 py-1 text-xs capitalize",
                    cfg.lado === l
                      ? "bg-tv-blue/15 text-tv-blue"
                      : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </Campo>

          <Campo titulo="Ancho" valor={`${Math.round(cfg.anchoPct * 100)}%`}>
            <input
              type="range"
              min={0.1}
              max={0.6}
              step={0.02}
              value={cfg.anchoPct}
              onChange={(e) => set({ anchoPct: parseFloat(e.target.value) })}
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

          <div className="flex flex-col gap-2">
            <Toggle
              etq="Resaltar Value Area (VAH/VAL)"
              on={cfg.mostrarVA}
              onClick={() => set({ mostrarVA: !cfg.mostrarVA })}
            />
            <Toggle
              etq="Marcar HVN / LVN"
              on={cfg.mostrarHvnLvn}
              onClick={() => set({ mostrarHvnLvn: !cfg.mostrarHvnLvn })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-tv-text">Colores</span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <Color etq="Alcista" val={cfg.colorAlcista} set={(v) => set({ colorAlcista: v })} />
              <Color etq="Bajista" val={cfg.colorBajista} set={(v) => set({ colorBajista: v })} />
              <Color etq="POC" val={cfg.colorPOC} set={(v) => set({ colorPOC: v })} />
              <Color etq="Value Area" val={cfg.colorVA} set={(v) => set({ colorVA: v })} />
              <Color etq="Fuera del VA" val={cfg.colorFueraVA} set={(v) => set({ colorFueraVA: v })} />
            </div>
          </div>

          <button
            onClick={() => set({ ...VPVR_DEFAULT })}
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
  children,
}: {
  titulo: string;
  valor?: string;
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
    </div>
  );
}

function Toggle({
  etq,
  on,
  onClick,
}: {
  etq: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="flex items-center justify-between rounded px-1 py-0.5 text-xs text-tv-text hover:bg-tv-panel-hover"
    >
      <span>{etq}</span>
      <span
        className={cn(
          "flex h-4 w-7 items-center rounded-full p-0.5 transition-colors",
          on ? "bg-tv-blue/70" : "bg-tv-border",
        )}
      >
        <span
          className={cn(
            "h-3 w-3 rounded-full bg-white transition-transform",
            on ? "translate-x-3" : "translate-x-0",
          )}
        />
      </span>
    </button>
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
