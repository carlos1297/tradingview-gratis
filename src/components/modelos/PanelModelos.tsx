"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Layers, Target } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { saludMotor } from "@/lib/modelos/nucleo/derivar";
import { CAPAS, visibilidadDe } from "@/lib/modelos/nucleo/visibilidad";
import { fuentePorId } from "@/lib/modelos/registro";
import { useChartStore } from "@/lib/store/chart-store";
import { useModelosDisponibles, useModelosStore } from "@/lib/store/modelos-store";
import { cn } from "@/lib/utils";

/**
 * PanelModelos — Administración de los modelos que están operando.
 *
 * Con un solo motor no hacía falta. Con varios a la vez el gráfico se vuelve
 * ilegible —dos juegos de flechas, dos cajas de posición, cuatro barreras— y
 * deja de poder responderse la pregunta más útil: *¿qué está haciendo ESTE
 * modelo?*. Este panel es el interruptor de cada capa de cada modelo.
 *
 * Es agnóstico del modelo: recorre los que respondieron y saca su identidad
 * (nombre y color) del registro. Un motor nuevo aparece solo.
 *
 * No ocupa espacio con menos de dos modelos: con uno solo, apagar sus capas no
 * resuelve ningún problema y la fila sería ruido.
 */
export function PanelModelos() {
  const modelos = useModelosDisponibles();
  const modeloActivo = useModelosStore((s) => s.modeloActivo);
  const setModeloActivo = useModelosStore((s) => s.setModeloActivo);
  const visibilidad = useChartStore((s) => s.visibilidadModelos);
  const alternarVisible = useChartStore((s) => s.alternarModeloVisible);
  const alternarCapa = useChartStore((s) => s.alternarCapaModelo);
  const aislar = useChartStore((s) => s.aislarModelo);
  const mostrarTodos = useChartStore((s) => s.mostrarTodosLosModelos);
  // Reloj de 1 s, igual que la barra de modelos: el semáforo se juzga por la
  // ANTIGÜEDAD del estado, así que tiene que envejecer aunque el motor no
  // publique. Leer `Date.now()` en el render sería impuro (lo rechaza el
  // compilador de React) y además nunca se refrescaría solo.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Con un modelo (o ninguno) no hay nada que administrar. Elemento vacío, no
  // `null`, por la misma razón que la barra de modelos: no descolocar el grid.
  if (modelos.length < 2) return <div data-label="panel-modelos-oculto" aria-hidden />;

  const ids = modelos.map((m) => m.modeloId);
  const ocultos = ids.filter((id) => !visibilidadDe(visibilidad, id).visible).length;

  return (
    <section
      data-label="panel-modelos"
      aria-label="Administración de modelos en el gráfico"
      className="flex w-full shrink-0 items-stretch gap-px overflow-x-auto border-b border-tv-border bg-tv-panel"
    >
      <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-tv-border bg-tv-panel px-3">
        <Layers className="h-3.5 w-3.5 text-tv-text-dim" />
        <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Modelos en el gráfico
        </span>
        {ocultos > 0 && (
          <button
            onClick={() => mostrarTodos(ids)}
            className="whitespace-nowrap rounded border border-tv-border px-1.5 py-0.5 text-[10px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          >
            mostrar todos
          </button>
        )}
      </div>

      {modelos.map((m) => {
        const fuente = fuentePorId(m.modeloId);
        const color = fuente?.color ?? "#787b86";
        const v = visibilidadDe(visibilidad, m.modeloId);
        const salud = saludMotor(m, ahora, fuente?.msFresco);
        const esActivo = modeloActivo === m.modeloId;

        return (
          <div
            key={m.modeloId}
            data-label="panel-modelos-fila"
            data-modelo={m.modeloId}
            className={cn(
              "flex shrink-0 items-center gap-2 border-r border-tv-border px-3 py-1.5",
              !v.visible && "opacity-45",
            )}
          >
            {/* Identidad: el color es el mismo con el que se dibujan sus
                operaciones sobre las velas. */}
            <span className="flex shrink-0 items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: color }}
                aria-hidden
              />
              <span className="text-xs font-semibold text-tv-text">{m.modeloEtiqueta}</span>
              <span
                className="text-[10px] uppercase tracking-wide text-tv-text-dim"
                title={`Estado del motor: ${salud}`}
              >
                {salud === "operando" ? "en vivo" : salud}
              </span>
            </span>

            {/* Maestro: apaga TODO lo de este modelo, conservando sus capas. */}
            <Tooltip>
              <TooltipTrigger
                onClick={() => alternarVisible(m.modeloId)}
                aria-label={`${v.visible ? "Ocultar" : "Mostrar"} las operaciones de ${m.modeloEtiqueta}`}
                aria-pressed={v.visible}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded",
                  v.visible
                    ? "text-tv-text hover:bg-tv-panel-hover"
                    : "text-tv-text-dim hover:bg-tv-panel-hover",
                )}
              >
                {v.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {v.visible ? "Ocultar" : "Mostrar"} todo lo de {m.modeloEtiqueta}
              </TooltipContent>
            </Tooltip>

            {/* Solo: aislar este modelo. Repetirlo vuelve a mostrarlos todos. */}
            <Tooltip>
              <TooltipTrigger
                onClick={() => aislar(m.modeloId, ids)}
                aria-label={`Ver solo ${m.modeloEtiqueta}`}
                className="flex h-6 w-6 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
              >
                <Target className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Ver solo {m.modeloEtiqueta} · repetir para volver a todos
              </TooltipContent>
            </Tooltip>

            {/* Capas sueltas. El catálogo sale de `visibilidad.ts`: sumar una
                capa nueva no toca este componente. */}
            <span className="flex shrink-0 items-center gap-0.5">
              {CAPAS.map((capa) => {
                const encendida = v[capa.clave];
                return (
                  <Tooltip key={capa.clave}>
                    <TooltipTrigger
                      onClick={() => alternarCapa(m.modeloId, capa.clave)}
                      aria-label={`${encendida ? "Ocultar" : "Mostrar"} ${capa.etiqueta} de ${m.modeloEtiqueta}`}
                      aria-pressed={encendida}
                      disabled={!v.visible}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:cursor-not-allowed",
                        encendida
                          ? "text-tv-text"
                          : "text-tv-text-dim line-through",
                      )}
                      style={encendida ? { background: `${color}26` } : undefined}
                    >
                      {capa.etiqueta}
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {capa.descripcion}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </span>

            {/* El modelo ACTIVO es el que analiza el Probador. Separado de la
                visibilidad a propósito: se puede comparar tres en el gráfico y
                estudiar las estadísticas de uno. */}
            <Tooltip>
              <TooltipTrigger
                onClick={() => setModeloActivo(m.modeloId)}
                aria-pressed={esActivo}
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                  esActivo
                    ? "bg-tv-blue/15 text-tv-blue"
                    : "text-tv-text-dim hover:bg-tv-panel-hover hover:text-tv-text",
                )}
              >
                {esActivo ? "analizando" : "analizar"}
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Analizar {m.modeloEtiqueta} en el Probador de estrategias
              </TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </section>
  );
}
