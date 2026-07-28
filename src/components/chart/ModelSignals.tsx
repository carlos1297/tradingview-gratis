"use client";

import { useEffect, useRef } from "react";
import { Bot, Eye, EyeOff, X } from "lucide-react";
import {
  useChartStore,
  type ModelSignalsFile,
} from "@/lib/store/chart-store";
import { useModelosStore } from "@/lib/store/modelos-store";
import { sanearSenales } from "@/lib/modelos/senales";

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
    setModelSignals({ ...parsed, senales });
    // jump to the symbol the model traded so the markers are visible
    if (parsed.simbolo) setSymbol(parsed.simbolo.toUpperCase());
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
  return (
    <div className="flex items-center gap-0.5 rounded bg-tv-blue/10 px-1.5 py-0.5">
      <Bot className="h-3.5 w-3.5 text-tv-blue" />
      <span className="px-1 text-xs text-tv-text">
        {n} señales · {modelSignals.split}
      </span>
      <button
        onClick={toggleShow}
        title={showModelSignals ? "Ocultar señales" : "Mostrar señales"}
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
