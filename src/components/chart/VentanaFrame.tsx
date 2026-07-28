"use client";

import { useState } from "react";
import { GripVertical, Maximize2, Minimize2, X } from "lucide-react";
import { ChartLigero } from "@/components/chart/ChartLigero";
import { useChartStore, type VentanaTF } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";
import { cn } from "@/lib/utils";

/**
 * Marco (chrome) de una ventana del layout: barra de título fija con selector
 * de timeframe y controles de maximizar / cerrar, envolviendo un ChartLigero.
 * El layout es por plantilla con divisores redimensionables; las ventanas no
 * flotan, pero se pueden REORGANIZAR arrastrando el tirador (grip) de una
 * ventana sobre otra: intercambian su posición en el mosaico.
 */

const TF_OPCIONES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

interface Props {
  ventana: VentanaTF;
  symbol: string;
  maximizada: boolean;
  puedeCerrar: boolean;
}

export function VentanaFrame({ ventana, symbol, maximizada, puedeCerrar }: Props) {
  const setTf = useChartStore((s) => s.setVentanaTimeframe);
  const quitar = useChartStore((s) => s.quitarVentana);
  const toggleMax = useChartStore((s) => s.toggleMaximizarVentana);
  const intercambiar = useChartStore((s) => s.intercambiarVentanas);
  const [sobre, setSobre] = useState(false);
  // reorganización: solo con más de una ventana y fuera del modo maximizado
  const arrastrable = puedeCerrar && !maximizada;

  return (
    <article
      data-label="ventana-grafico"
      data-timeframe={ventana.timeframe}
      data-maximizada={maximizada || undefined}
      aria-label={`Gráfico de ${symbol} en ${ventana.timeframe}`}
      onDragOver={(e) => {
        if (!arrastrable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!sobre) setSobre(true);
      }}
      onDragLeave={(e) => {
        // dragleave también se dispara al entrar a un hijo (canvas, etc.):
        // solo apagar el resaltado si el cursor salió del marco de verdad.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setSobre(false);
      }}
      onDrop={(e) => {
        if (!arrastrable) return;
        e.preventDefault();
        setSobre(false);
        const origen = e.dataTransfer.getData("text/plain");
        if (origen && origen !== ventana.id) intercambiar(origen, ventana.id);
      }}
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md border bg-tv-bg",
        sobre ? "border-tv-blue ring-2 ring-inset ring-tv-blue/70" : "border-tv-border",
      )}
    >
      <header
        data-label="ventana-barra-titulo"
        className="flex h-7 shrink-0 items-center gap-1.5 border-b border-tv-border bg-tv-panel px-1.5"
      >
        {arrastrable && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", ventana.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            title="Arrastrar para reorganizar (soltá sobre otra ventana para intercambiarlas)"
            aria-label="Reorganizar ventana"
            className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-tv-text-dim hover:text-tv-text active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}
        <select
          value={ventana.timeframe}
          onChange={(e) => setTf(ventana.id, e.target.value as Timeframe)}
          title="Timeframe de la ventana"
          className="cursor-pointer rounded bg-tv-blue/15 px-1.5 py-0.5 text-xs font-medium text-tv-blue outline-none"
        >
          {TF_OPCIONES.map((tf) => (
            <option key={tf} value={tf} className="bg-tv-panel text-tv-text">
              {tf}
            </option>
          ))}
        </select>
        <span className="truncate text-[10px] tabular-nums text-tv-text-dim">
          {symbol}
        </span>
        <div
          data-label="ventana-controles"
          role="group"
          aria-label="Controles de la ventana"
          className="ml-auto flex items-center gap-0.5"
        >
          <BotonBarra
            title={maximizada ? "Restaurar" : "Maximizar"}
            onClick={() => toggleMax(ventana.id)}
          >
            {maximizada ? (
              <Minimize2 className="h-3 w-3" />
            ) : (
              <Maximize2 className="h-3 w-3" />
            )}
          </BotonBarra>
          {puedeCerrar && (
            <BotonBarra
              title="Cerrar ventana"
              onClick={() => quitar(ventana.id)}
              peligro
            >
              <X className="h-3 w-3" />
            </BotonBarra>
          )}
        </div>
      </header>

      {/* min-h-0 + flex-1: el lienzo toma lo que queda tras la barra de título
          y puede encoger por debajo de su contenido. Sin min-h-0, el gráfico
          conservaría su alto natural y empujaría el marco hacia abajo. */}
      <div data-label="ventana-lienzo" className="min-h-0 flex-1">
        <ChartLigero
          symbol={symbol}
          timeframe={ventana.timeframe}
          onTimeframeChange={(tf) => setTf(ventana.id, tf)}
          mostrarBarraTF={false}
        />
      </div>
    </article>
  );
}

function BotonBarra({
  title,
  onClick,
  peligro,
  children,
}: {
  title: string;
  onClick: () => void;
  peligro?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded text-tv-text-muted",
        peligro
          ? "hover:bg-tv-red/20 hover:text-tv-red"
          : "hover:bg-tv-panel-hover hover:text-tv-text",
      )}
    >
      {children}
    </button>
  );
}
