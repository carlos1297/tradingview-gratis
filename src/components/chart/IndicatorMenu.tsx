"use client";

import { useState } from "react";
import { Check, LineChart, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buscarIndicador, INDICADORES } from "@/lib/indicators/registro";
import { ConfigIndicador } from "@/components/chart/ConfigIndicador";
import type { InstanciaIndicador } from "@/lib/store/chart-store";
import { HeatmapConfig } from "@/components/chart/HeatmapConfig";
import { VpvrConfig } from "@/components/chart/VpvrConfig";
import { FootprintConfig } from "@/components/chart/FootprintConfig";
import { useChartStore, type IndicatorKey } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/**
 * Botón «Indicadores» del header, estilo TradingView: un único diálogo con
 * TODOS los indicadores. Arriba los avanzados/institucionales (overlays propios
 * con su engranaje de configuración: Liq Heatmap, VPVR, Order Flow, Footprint),
 * y debajo los clásicos del registro (EMA/RSI/MACD/Volumen). Los indicadores
 * nuevos del registro aparecen acá solos.
 */

interface Overlay {
  key: IndicatorKey;
  nombre: string;
  descripcion: string;
  config?: React.ReactNode;
}

const OVERLAYS: Overlay[] = [
  {
    key: "liqHeatmap",
    nombre: "Liquidation Heatmap",
    descripcion: "Zonas de liquidación estimadas superpuestas al precio",
    config: <HeatmapConfig />,
  },
  {
    key: "vpvr",
    nombre: "Volume Profile (VPVR)",
    descripcion: "Perfil de volumen por precio sobre el rango visible",
    config: <VpvrConfig />,
  },
  {
    key: "orderFlow",
    nombre: "Order Flow / CVD",
    descripcion: "Delta por vela y volumen delta acumulado en vivo (panel propio)",
  },
  {
    key: "footprint",
    nombre: "Footprint (Bid×Ask)",
    descripcion: "Volumen comprador/vendedor por nivel dentro de cada vela (en vivo)",
    config: <FootprintConfig />,
  },
];

export function IndicatorMenu() {
  const [open, setOpen] = useState(false);
  const activos = useChartStore((s) => s.indicadoresActivos);
  const agregar = useChartStore((s) => s.agregarIndicador);
  const quitar = useChartStore((s) => s.quitarIndicador);
  const indicators = useChartStore((s) => s.indicators);
  const toggleIndicator = useChartStore((s) => s.toggleIndicator);

  const total = activos.length + OVERLAYS.filter((o) => indicators[o.key]).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        title="Indicadores: añadir/quitar indicadores del chart"
        className={cn(
          "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs",
          total > 0
            ? "bg-tv-blue/15 text-tv-blue"
            : "text-tv-text hover:bg-tv-panel-hover",
        )}
      >
        <LineChart className="h-3.5 w-3.5" />
        <span>Indicadores</span>
        {total > 0 && (
          <span className="rounded bg-tv-blue/20 px-1 py-0.5 text-[10px] font-semibold tabular-nums">
            {total}
          </span>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">Indicadores</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[460px]">
          {/* Lo que ya está en el gráfico, con sus ajustes.
              Va PRIMERO porque es donde se vuelve a entrar: agregar se hace una
              vez, configurar y quitar se hacen muchas. */}
          {activos.length > 0 && (
            <Seccion titulo="En el gráfico">
              {activos.map((inst) => (
                <FilaInstancia
                  key={inst.id}
                  instancia={inst}
                  onQuitar={() => quitar(inst.id)}
                />
              ))}
            </Seccion>
          )}

          <Seccion titulo="Agregar indicador">
            {INDICADORES.map((d) => {
              const yaEsta = activos.some((i) => i.definicionId === d.id);
              return (
                <FilaCatalogo
                  key={d.id}
                  nombre={d.nombre}
                  descripcion={d.descripcion}
                  // `multiple: false` (MACD, Volumen) no se puede repetir.
                  deshabilitado={!d.multiple && yaEsta}
                  cuantas={activos.filter((i) => i.definicionId === d.id).length}
                  onAgregar={() => agregar(d.id)}
                />
              );
            })}
          </Seccion>

          <Seccion titulo="Order Flow & Liquidez">
            {OVERLAYS.map((o) => (
              <FilaOverlay
                key={o.key}
                nombre={o.nombre}
                descripcion={o.descripcion}
                activo={indicators[o.key]}
                onToggle={() => toggleIndicator(o.key)}
                config={o.config}
              />
            ))}
          </Seccion>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/** Una instancia ya en el gráfico: color, etiqueta derivada, ajustes y quitar. */
function FilaInstancia({
  instancia,
  onQuitar,
}: {
  instancia: InstanciaIndicador;
  onQuitar: () => void;
}) {
  const def = buscarIndicador(instancia.definicionId);
  if (!def) return null;
  const metas = def.series(instancia.params);

  return (
    <div
      data-label="fila-instancia-indicador"
      data-indicador={instancia.definicionId}
      className="flex items-center gap-2 px-4 py-2 hover:bg-tv-panel-hover"
    >
      {/* Los colores de la instancia, en orden. El MACD muestra sus tres. */}
      <span className="flex shrink-0 gap-0.5">
        {metas.map((m, i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: m.color }}
            aria-hidden
          />
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-tv-text">
        {def.etiqueta(instancia.params)}
      </span>
      <ConfigIndicador instancia={instancia} />
      <button
        onClick={onQuitar}
        title={`Quitar ${def.etiqueta(instancia.params)}`}
        aria-label={`Quitar ${def.etiqueta(instancia.params)}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-tv-text-muted hover:bg-tv-red/20 hover:text-tv-red"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Una entrada del catálogo, con el botón de agregar. */
function FilaCatalogo({
  nombre,
  descripcion,
  deshabilitado,
  cuantas,
  onAgregar,
}: {
  nombre: string;
  descripcion: string;
  deshabilitado: boolean;
  cuantas: number;
  onAgregar: () => void;
}) {
  return (
    <button
      onClick={onAgregar}
      disabled={deshabilitado}
      title={deshabilitado ? `${nombre} ya está en el gráfico` : `Agregar ${nombre}`}
      aria-label={`Agregar ${nombre}`}
      className="flex w-full items-start gap-3 px-4 py-2 text-left hover:bg-tv-panel-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tv-text-muted" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="text-xs text-tv-text">{nombre}</span>
          {cuantas > 0 && (
            <span className="rounded bg-tv-blue/20 px-1 text-[10px] font-semibold tabular-nums text-tv-blue">
              {cuantas}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[10px] leading-snug text-tv-text-muted">
          {descripcion}
        </span>
      </span>
    </button>
  );
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="border-b border-tv-border bg-tv-bg/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-tv-text-dim">
        {titulo}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

/** Fila de un indicador clásico del registro (toggle de fila completa). */

/**
 * Fila de un overlay propio. Como puede llevar un engranaje de configuración
 * (otro diálogo), es un `div` con un botón de toggle + el engranaje aparte
 * (no se pueden anidar `<button>`).
 */
function FilaOverlay({
  nombre,
  descripcion,
  activo,
  onToggle,
  config,
}: {
  nombre: string;
  descripcion: string;
  activo: boolean;
  onToggle: () => void;
  config?: React.ReactNode;
}) {
  return (
    <div className="group flex items-center justify-between border-b border-tv-border px-4 py-2 hover:bg-tv-panel-hover">
      <button
        onClick={onToggle}
        aria-pressed={activo}
        aria-label={`${activo ? "Quitar" : "Añadir"} ${nombre}`}
        className="flex flex-1 flex-col gap-0.5 text-left"
      >
        <span
          className={cn(
            "text-xs font-medium",
            activo ? "text-tv-blue" : "text-tv-text",
          )}
        >
          {nombre}
        </span>
        <span className="text-[11px] text-tv-text-muted">{descripcion}</span>
      </button>
      <div className="ml-2 flex shrink-0 items-center gap-1">
        {config}
        {activo ? (
          <Check className="h-4 w-4 text-tv-blue" />
        ) : (
          <Plus className="h-4 w-4 text-tv-text-dim group-hover:text-tv-text" />
        )}
      </div>
    </div>
  );
}
