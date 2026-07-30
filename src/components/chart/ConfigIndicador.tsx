"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw, Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  buscarIndicador,
  paramsPorDefecto,
  type ParametroIndicador,
} from "@/lib/indicators/registro";
import { useChartStore, type InstanciaIndicador } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/**
 * ConfigIndicador — Ajustes de UNA instancia de indicador.
 *
 * Es GENÉRICO: se arma recorriendo `def.parametros`, así que un indicador nuevo
 * obtiene su panel sin escribir un componente. Mismo criterio que `VistaPlantilla`
 * con los layouts (el ícono sale de la geometría) y que el panel de modelos (las
 * capas salen del catálogo).
 *
 * Por eso NO hay un `EmaConfig.tsx` ni un `RsiConfig.tsx`: los overlays propios
 * (heatmap, VPVR, footprint) tienen el suyo a mano porque sus ajustes son
 * peculiares; los indicadores clásicos son todos «números y colores».
 *
 * Las dos pestañas —Entradas y Estilo, como en TradingView— también salen solas
 * del `tipo` de cada parámetro. Si un indicador tiene un solo grupo (el Volumen
 * es todo color), no se dibujan pestañas: una sola pestaña no es una elección.
 */

// ── Campo numérico ────────────────────────────────────────────────────

/**
 * El valor que se está tecleando vive aparte del que está guardado.
 *
 * Antes se escribía en el store en cada pulsación y se acotaba ahí mismo, así
 * que el campo no se podía vaciar para reescribirlo: borrar el "14" daba
 * `Number("")` → 0 → se acotaba al mínimo, y el cursor quedaba peleando con un
 * número que se regeneraba solo. Ahora se escribe libre y se confirma al salir
 * del campo o con Enter; Escape descarta.
 */
function CampoNumero({
  param,
  valor,
  onChange,
}: {
  param: ParametroIndicador;
  valor: number;
  onChange: (v: number) => void;
}) {
  const [borrador, setBorrador] = useState<string | null>(null);
  const min = param.min ?? 1;
  const max = param.max ?? Number.MAX_SAFE_INTEGER;
  const acotar = (n: number) => Math.max(min, Math.min(max, Math.round(n)));

  function confirmar() {
    if (borrador === null) return;
    const n = Number(borrador);
    // Vacío o basura: se descarta el borrador y vuelve el valor guardado, en
    // vez de escribir un 0 que el usuario nunca pidió.
    if (borrador.trim() !== "" && Number.isFinite(n)) onChange(acotar(n));
    setBorrador(null);
  }

  function ajustar(delta: number) {
    setBorrador(null);
    onChange(acotar(valor + delta));
  }

  return (
    <label className="flex items-center justify-between gap-4 py-2">
      <span className="text-xs text-tv-text">{param.etiqueta}</span>
      <span className="relative flex h-7 w-24 shrink-0 items-center rounded-md border border-tv-border bg-tv-bg transition-colors focus-within:border-tv-blue">
        <input
          // `text` y no `number`: las flechitas nativas del navegador no se
          // pueden estilar y desentonan con el resto. Las de al lado son
          // nuestras, y `inputMode` sigue abriendo el teclado numérico.
          type="text"
          inputMode="numeric"
          value={borrador ?? String(valor)}
          onChange={(e) => setBorrador(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              confirmar();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setBorrador(null);
              e.currentTarget.blur();
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              // El teclado hace lo mismo que las flechitas, con Shift de a 10.
              e.preventDefault();
              ajustar((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1));
            }
          }}
          className="h-full w-full rounded-md bg-transparent pl-2.5 pr-6 text-right text-xs tabular-nums text-tv-text outline-none"
        />
        <span className="absolute right-1 flex flex-col">
          <Flechita
            direccion="arriba"
            etiqueta={`Subir ${param.etiqueta}`}
            deshabilitado={valor >= max}
            onClick={() => ajustar(1)}
          />
          <Flechita
            direccion="abajo"
            etiqueta={`Bajar ${param.etiqueta}`}
            deshabilitado={valor <= min}
            onClick={() => ajustar(-1)}
          />
        </span>
      </span>
    </label>
  );
}

function Flechita({
  direccion,
  etiqueta,
  deshabilitado,
  onClick,
}: {
  direccion: "arriba" | "abajo";
  etiqueta: string;
  deshabilitado: boolean;
  onClick: () => void;
}) {
  const Icono = direccion === "arriba" ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      // Fuera del recorrido del tabulador: el campo ya es accesible con las
      // flechas del teclado, y dos paradas más por parámetro sería un estorbo.
      tabIndex={-1}
      disabled={deshabilitado}
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className="flex h-2.5 w-4 items-center justify-center rounded-[3px] text-tv-text-dim hover:bg-tv-panel-hover hover:text-tv-text disabled:pointer-events-none disabled:opacity-30"
    >
      <Icono className="h-3 w-3" />
    </button>
  );
}

// ── Campo de color ────────────────────────────────────────────────────

function CampoColor({
  param,
  valor,
  onChange,
}: {
  param: ParametroIndicador;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2">
      <span className="text-xs text-tv-text">{param.etiqueta}</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-tv-text-dim">
          {valor}
        </span>
        {/* La muestra ES el botón: el `input` nativo va encima, invisible, para
            que el selector de color del sistema se abra al hacer clic sin que
            se vea el control cuadrado y gris del navegador. */}
        <span
          className="relative block h-7 w-10 overflow-hidden rounded-md border border-tv-border transition-colors hover:border-tv-text-muted focus-within:border-tv-blue"
          style={{ background: valor }}
        >
          <input
            type="color"
            value={valor}
            onChange={(e) => onChange(e.target.value)}
            aria-label={param.etiqueta}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </span>
      </span>
    </label>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────

export function ConfigIndicador({ instancia }: { instancia: InstanciaIndicador }) {
  const setParams = useChartStore((s) => s.setParamsIndicador);
  const [pestana, setPestana] = useState<"entradas" | "estilo">("entradas");
  const idBase = useId();
  const def = buscarIndicador(instancia.definicionId);
  if (!def || def.parametros.length === 0) return null;

  const titulo = def.etiqueta(instancia.params);
  const entradas = def.parametros.filter((p) => p.tipo === "numero");
  const estilos = def.parametros.filter((p) => p.tipo === "color");
  const conPestanas = entradas.length > 0 && estilos.length > 0;

  const campos = (params: ParametroIndicador[]) => (
    <div className="divide-y divide-tv-border/50 px-4 py-1">
      {params.map((param) => {
        const valor = instancia.params[param.clave] ?? param.porDefecto;
        return param.tipo === "numero" ? (
          <CampoNumero
            key={param.clave}
            param={param}
            valor={Number(valor)}
            onChange={(v) => setParams(instancia.id, { [param.clave]: v })}
          />
        ) : (
          <CampoColor
            key={param.clave}
            param={param}
            valor={String(valor)}
            onChange={(v) => setParams(instancia.id, { [param.clave]: v })}
          />
        );
      })}
    </div>
  );

  return (
    <Dialog>
      <DialogTrigger
        title={`Configurar ${titulo}`}
        aria-label={`Configurar ${titulo}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <Settings2 className="h-3.5 w-3.5" />
      </DialogTrigger>

      <DialogContent
        data-label="config-indicador"
        className="max-w-sm gap-0 overflow-hidden bg-tv-panel p-0"
      >
        <DialogHeader className="gap-1 border-b border-tv-border px-4 py-3 pr-10">
          <DialogTitle className="text-sm font-medium">{titulo}</DialogTitle>
          <p className="text-[11px] leading-snug text-tv-text-muted">
            {def.descripcion}
          </p>
        </DialogHeader>

        {conPestanas ? (
          <>
            <div
              role="tablist"
              aria-label="Ajustes"
              className="flex gap-4 border-b border-tv-border px-4"
            >
              {(
                [
                  ["entradas", "Entradas"],
                  ["estilo", "Estilo"],
                ] as const
              ).map(([id, texto]) => (
                <button
                  key={id}
                  role="tab"
                  id={`${idBase}-${id}`}
                  aria-selected={pestana === id}
                  aria-controls={`${idBase}-${id}-panel`}
                  onClick={() => setPestana(id)}
                  className={cn(
                    "-mb-px border-b-2 py-2 text-xs transition-colors",
                    pestana === id
                      ? "border-tv-blue text-tv-text"
                      : "border-transparent text-tv-text-muted hover:text-tv-text",
                  )}
                >
                  {texto}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`${idBase}-${pestana}-panel`}
              aria-labelledby={`${idBase}-${pestana}`}
            >
              {campos(pestana === "entradas" ? entradas : estilos)}
            </div>
          </>
        ) : (
          campos(def.parametros)
        )}

        <div className="flex justify-start border-t border-tv-border px-4 py-2">
          <button
            onClick={() => setParams(instancia.id, paramsPorDefecto(def))}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          >
            <RotateCcw className="h-3 w-3" />
            Restablecer
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
