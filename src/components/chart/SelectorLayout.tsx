"use client";

import { Check, Crosshair, LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PLANTILLAS,
  ventanasDePlantilla,
  type PlantillaLayout,
} from "@/lib/chart/plantillas";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/**
 * SelectorLayout — Elegir la disposición del mosaico, estilo TradingView.
 *
 * Reemplaza los botones numéricos (1 2 3 4 6 8 10), que solo podían expresar la
 * CANTIDAD. Con dos disposiciones para la misma cantidad —2 lado a lado vs. 2
 * apiladas— un número ya no alcanza: hace falta ver la forma.
 *
 * No conoce ninguna disposición concreta: recorre `lib/chart/plantillas`. Sumar
 * una entrada al catálogo la hace aparecer acá, con su ícono incluido.
 */

/**
 * El ícono de una disposición, DERIVADO de su geometría.
 *
 * Nada de SVGs a mano: se dibuja el mismo `columnas` que usa el mosaico, así una
 * plantilla nueva no puede quedar con un ícono que no corresponde a su forma.
 */
function VistaPlantilla({
  plantilla,
  activa,
}: {
  plantilla: PlantillaLayout;
  activa: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-7 w-9 shrink-0 gap-[2px] rounded border p-[2px]",
        activa ? "border-tv-blue bg-tv-blue/10" : "border-tv-border bg-tv-bg",
      )}
    >
      {plantilla.columnas.map((filas, ci) => (
        <span key={ci} className="flex flex-1 flex-col gap-[2px]">
          {Array.from({ length: filas }, (_, fi) => (
            <span
              key={fi}
              className={cn(
                "flex-1 rounded-[1px]",
                activa ? "bg-tv-blue/70" : "bg-tv-text-dim/50",
              )}
            />
          ))}
        </span>
      ))}
    </span>
  );
}

export function SelectorLayout() {
  const plantillaId = useChartStore((s) => s.plantillaId);
  const aplicarPlantilla = useChartStore((s) => s.aplicarPlantilla);
  const nVentanas = useChartStore((s) => s.ventanasTF.length);
  const sincronizar = useChartStore((s) => s.sincronizarCrosshair);
  const toggleSincronizar = useChartStore((s) => s.toggleSincronizarCrosshair);

  const actual = PLANTILLAS.find((p) => p.id === plantillaId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="Disposición de las ventanas"
        aria-label="Disposición de las ventanas"
        className="flex items-center gap-1.5 rounded border border-tv-border px-2 py-1 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        {actual && <VistaPlantilla plantilla={actual} activa />}
        <span className="tabular-nums">{nVentanas}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        data-label="menu-disposicion"
        className="w-64 p-2"
      >
        <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Disposición
        </div>

        <div className="grid grid-cols-3 gap-1">
          {PLANTILLAS.map((p) => {
            const activa = p.id === plantillaId;
            return (
              <button
                key={p.id}
                onClick={() => aplicarPlantilla(p.id)}
                title={`${p.nombre} · ${ventanasDePlantilla(p)} ${ventanasDePlantilla(p) === 1 ? "ventana" : "ventanas"}`}
                aria-label={p.nombre}
                aria-pressed={activa}
                data-plantilla={p.id}
                className={cn(
                  "flex flex-col items-center gap-1 rounded p-1.5 transition-colors",
                  activa ? "bg-tv-blue/15" : "hover:bg-tv-panel-hover",
                )}
              >
                <VistaPlantilla plantilla={p} activa={activa} />
                <span
                  className={cn(
                    "text-[10px] tabular-nums",
                    activa ? "text-tv-blue" : "text-tv-text-dim",
                  )}
                >
                  {ventanasDePlantilla(p)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Solo con más de una ventana: sincronizar el crosshair con una sola no
            significa nada. */}
        {nVentanas > 1 && (
          <>
            <div className="my-2 h-px bg-tv-border" />
            <button
              onClick={toggleSincronizar}
              aria-pressed={sincronizar}
              className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-xs text-tv-text hover:bg-tv-panel-hover"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {sincronizar && <Check className="h-3.5 w-3.5 text-tv-blue" />}
              </span>
              <Crosshair className="h-3.5 w-3.5 shrink-0 text-tv-text-muted" />
              <span className="flex-1">Sincronizar crosshair</span>
            </button>
            <p className="px-1.5 pt-0.5 text-[10px] leading-snug text-tv-text-dim">
              Al pasar el cursor por una ventana, las demás marcan el mismo
              instante — también entre temporalidades distintas.
            </p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
