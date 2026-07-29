"use client";

import { useEffect, useRef } from "react";
import { ArrowLeftRight, Bot, Eye, EyeOff, X } from "lucide-react";
import {
  useChartStore,
  type ModelSignalsFile,
} from "@/lib/store/chart-store";
import { useModelosStore } from "@/lib/store/modelos-store";
import { fuentePorId } from "@/lib/modelos/registro";
import { sanearSenales } from "@/lib/modelos/nucleo/senales";

/**
 * Loads the senales.json exported by `evaluar.py --guardar-curva` (RL model
 * evaluation) and shows the buys/sells of the model as markers on the chart.
 *
 * Auto-load: ejecutar_visor.py copies the evaluation's senales.json into
 * public/senales.json before starting the dev server — if that file exists it
 * is fetched and applied on mount, no clicking needed. The manual button stays
 * as fallback for loading any other signals file.
 */
export function ModelSignals() {
  const inputRef = useRef<HTMLInputElement>(null);
  const autoCargaIntentada = useRef(false);
  const modelSignals = useChartStore((s) => s.modelSignals);
  const showModelSignals = useChartStore((s) => s.showModelSignals);
  const setModelSignals = useChartStore((s) => s.setModelSignals);
  const toggleShow = useChartStore((s) => s.toggleShowModelSignals);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const activo = useModelosStore((s) => s.modeloActivo);
  const disponibles = useModelosStore((s) => s.disponibles);
  const setModeloActivo = useModelosStore((s) => s.setModeloActivo);
  const ajustarTemporalidadesAlPeriodo = useChartStore(
    (s) => s.ajustarTemporalidadesAlPeriodo,
  );

  function aplicarSenales(parsed: ModelSignalsFile) {
    if (!Array.isArray(parsed.senales)) {
      throw new Error("el JSON no tiene la lista 'senales'");
    }
    // MISMA frontera de confianza que aplican los adaptadores a los motores en
    // vivo. Un senales.json es un archivo generado por otro proceso, igual de
    // externo: sin sanear, una señal a precio 0 —las emitía evaluar.py al
    // cerrar por fin de episodio— llegaba al gráfico y le arruinaba la escala
    // de precios. Los archivos ya generados siguen en disco, así que el
    // guardia tiene que estar acá y no solo del lado del motor.
    const senales = sanearSenales(parsed.senales);
    const descartadas = parsed.senales.length - senales.length;
    if (descartadas > 0) {
      console.warn(`[senales] ${descartadas} señal(es) inválida(s) descartada(s)`);
    }
    // `origen: "archivo"` marca que estas señales son de un período histórico:
    // el gráfico salta a esa fecha, se queda quieto (sin WebSocket) y el sync
    // del modelo en vivo no las pisa hasta que las quites.
    setModelSignals({ ...parsed, senales, origen: "archivo" });
    // jump to the symbol the model traded so the markers are visible
    if (parsed.simbolo) setSymbol(parsed.simbolo.toUpperCase());

    // …y a una temporalidad donde el backtest ENTERO entre en pantalla.
    //
    // El gráfico carga 1000 velas por ventana, así que la temporalidad decide
    // cuánto tiempo abarca: en 15m —el default— son 10 días. Un senales.json
    // de validación puede cubrir 8 meses. El chart saltaba al final del
    // backtest y encuadraba los 8 meses, con datos para el 4% de ese ancho: se
    // veía casi vacío y ninguna flecha se dibujaba, porque los marcadores caen
    // fuera del rango de velas cargado. Subir la temporalidad es lo que hace
    // que "el chart salta al período del backtest" sea verdad.
    if (senales.length > 1) {
      const desde = senales[0].tiempoMs;
      const hasta = senales[senales.length - 1].tiempoMs;
      ajustarTemporalidadesAlPeriodo(hasta - desde);
    }
  }

  useEffect(() => {
    // once per session: removing the signals must not resurrect them
    if (autoCargaIntentada.current || modelSignals) return;
    autoCargaIntentada.current = true;
    (async () => {
      try {
        const respuesta = await fetch("/senales.json", { cache: "no-store" });
        if (!respuesta.ok) return; // sin auto-señales: queda el botón manual
        // Un motor EN VIVO ya publicó su corrida mientras bajaba este archivo:
        // el backtest no puede pisarla. Las dos fuentes escriben en el mismo
        // `modelSignals`, así que sin este guardia el ganador dependía de cuál
        // de los dos fetch terminaba último — y `senales.json` además salta de
        // símbolo, moviendo el gráfico al período del backtest sin que nadie
        // lo pidiera. El botón manual sigue funcionando: si lo cargás a mano,
        // es porque lo querés.
        if (useModelosStore.getState().modeloActivo) {
          console.info("senales.json ignorado: hay un modelo en vivo publicando");
          return;
        }
        aplicarSenales((await respuesta.json()) as ModelSignalsFile);
        console.info("senales.json auto-cargado desde public/");
      } catch {
        // sin auto-señales: queda el botón manual
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFile(file: File) {
    try {
      aplicarSenales(JSON.parse(await file.text()) as ModelSignalsFile);
    } catch (e) {
      console.error("senales.json inválido:", e);
      alert(
        "Archivo de señales inválido. Generarlo con:\n" +
          "python3 evaluar.py --checkpoint <dir> --guardar-curva\n" +
          "y cargar evaluacion_<split>/senales.json",
      );
    }
  }

  if (!modelSignals) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          title="Cargar senales.json del modelo RL (evaluar.py --guardar-curva)"
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Bot className="h-3.5 w-3.5" />
          <span>Señales IA</span>
        </button>
      </>
    );
  }

  const n = modelSignals.senales.length;
  // Color de identidad del modelo que se está mostrando, para que la etiqueta
  // use el MISMO código de color que sus operaciones sobre las velas.
  //
  // Solo cuando la etiqueta muestra un modelo EN VIVO. Con un backtest
  // cargado a mano, lo que se ve es esa corrida histórica y no el modelo
  // activo: teñirla con su color mentiría, e intercambiar no cambiaría nada
  // —el backtest manda sobre el sync en vivo hasta que lo quites con la ✕—.
  const enVivo = modelSignals.origen === "vivo";
  const color = enVivo && activo ? (fuentePorId(activo)?.color ?? null) : null;
  const hayVarios = enVivo && disponibles.length > 1;

  return (
    <div
      data-label="chip-senales"
      className="flex items-center gap-0.5 rounded bg-tv-blue/10 px-1.5 py-0.5"
      style={color ? { background: `${color}1f` } : undefined}
    >
      {color ? (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-sm"
          style={{ background: color }}
          aria-hidden
        />
      ) : (
        <Bot className="h-3.5 w-3.5 text-tv-blue" />
      )}
      <span className="px-1 text-xs text-tv-text">
        {n} {n === 1 ? "señal" : "señales"} · {modelSignals.split}
      </span>

      {/* Intercambiar de modelo: pasa al siguiente que esté publicando y
          arrastra con él la etiqueta, el gráfico y el Probador —los tres leen
          del modelo activo—. Aparece solo con dos o más motores. */}
      {hayVarios && (
        <button
          onClick={() => {
            const i = disponibles.indexOf(activo ?? "");
            setModeloActivo(disponibles[(i + 1) % disponibles.length]);
          }}
          title={`Intercambiar modelo (${disponibles.length} publicando) · ahora: ${modelSignals.split}`}
          aria-label="Intercambiar modelo mostrado"
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
        </button>
      )}

      {/* El ojo apaga TODO lo que la IA dibuja: las flechas Y la operación en
          curso (caja, entrada, SL y TP). Antes solo tapaba las flechas y la
          posición abierta seguía ahí, que es justo lo que uno quiere sacarse
          de encima para mirar las velas limpias. Con un solo modelo, además,
          es el único interruptor disponible: el panel de administración
          aparece recién con dos. */}
      <button
        onClick={toggleShow}
        title={
          showModelSignals
            ? "Ocultar señales y la operación en curso"
            : "Mostrar señales y la operación en curso"
        }
        aria-pressed={showModelSignals}
        className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        {showModelSignals ? (
          <Eye className="h-3.5 w-3.5" />
        ) : (
          <EyeOff className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        onClick={() => setModelSignals(null)}
        title="Quitar señales del modelo"
        className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
