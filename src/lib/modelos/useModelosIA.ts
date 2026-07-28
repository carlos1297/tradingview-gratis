"use client";

import { useEffect } from "react";
import { conectarFeedVivo } from "@/lib/liveFeed";
import { useChartStore } from "@/lib/store/chart-store";
import { useModelosStore } from "@/lib/store/modelos-store";
import { REGISTRO_MODELOS } from "./registro";
import type { EstadoModeloIA, FuenteModelo } from "./tipos";

/**
 * useModelosIA — Suscribe la interfaz a TODAS las fuentes del registro.
 *
 * Un solo hook para los dos transportes: sondeo de archivo y WebSocket. Se
 * monta una vez (en la barra de modelos) y alimenta modelos-store; cualquier
 * componente lee de ahí sin volver a pedir nada.
 *
 * Tolerante por diseño: una fuente caída, un 404 o un JSON a medio escribir
 * no afectan a las demás — cada modelo vive en su propio efecto.
 */

const MS_SONDEO = 5000;

/** Cada fuente monta su propia suscripción: aislar fallos entre modelos. */
function useFuente(fuente: FuenteModelo) {
  const publicarEstado = useModelosStore((s) => s.publicarEstado);
  const quitarModelo = useModelosStore((s) => s.quitarModelo);
  const setModelSignals = useChartStore((s) => s.setModelSignals);
  const setSymbol = useChartStore((s) => s.setSymbol);

  useEffect(() => {
    const url = fuente.url;
    if (!url) return; // fuente desactivada: nada que hacer

    let vivo = true;
    // nº de señales ya empujadas al Probador de estrategias: solo se toca el
    // store del gráfico cuando hay operaciones NUEVAS, no en cada tick
    let nSenalesPublicadas = -1;

    const aplicar = (crudo: unknown) => {
      if (!vivo) return;
      const previo = useModelosStore.getState().estados[fuente.id] ?? null;
      let estado: EstadoModeloIA | null;
      try {
        estado = fuente.adaptar(crudo, fuente, previo);
      } catch {
        return; // adaptador roto: se ignora este tick, no se cae la interfaz
      }
      if (!estado) return;
      publicarEstado(fuente.id, estado);

      // Empujar las operaciones al MISMO store que lee el Probador de
      // estrategias, para que Resumen / Rendimiento / Lista de operaciones y
      // las marcas del gráfico muestren la corrida en vivo. Solo el modelo
      // activo manda: con dos motores corriendo, mezclar sus señales daría
      // estadísticas sin sentido.
      const esActivo = useModelosStore.getState().modeloActivo === fuente.id;
      if (esActivo && estado.senales.length !== nSenalesPublicadas) {
        nSenalesPublicadas = estado.senales.length;
        if (estado.senales.length > 0) {
          setSymbol(estado.simbolo);
          setModelSignals({
            simbolo: estado.simbolo,
            split: `${estado.modeloEtiqueta} en vivo`,
            senales: estado.senales,
          });
        }
      }
    };

    if (fuente.transporte === "websocket") {
      return conectarFeedVivo(url, aplicar);
    }

    // ── Transporte de archivo: sondeo ────────────────────────────────────
    let timer: ReturnType<typeof setInterval> | null = null;
    const sondear = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) {
          // 404 = motor nunca arrancó. Si antes respondía, se quita del
          // selector para no dejar un modelo fantasma.
          if (nSenalesPublicadas >= 0) quitarModelo(fuente.id);
          return;
        }
        aplicar(await r.json());
        if (nSenalesPublicadas < 0) nSenalesPublicadas = 0;
      } catch {
        /* archivo a medio escribir o red caída: se reintenta al próximo sondeo */
      }
    };
    void sondear();
    timer = setInterval(() => void sondear(), MS_SONDEO);
    return () => {
      vivo = false;
      if (timer) clearInterval(timer);
    };
  }, [fuente, publicarEstado, quitarModelo, setModelSignals, setSymbol]);
}

/**
 * Suscribe todas las fuentes registradas. El registro es una constante de
 * módulo, así que la cantidad de hooks es estable entre renders (no viola las
 * reglas de hooks aunque se recorra con map).
 */
export function useModelosIA() {
  for (const fuente of REGISTRO_MODELOS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useFuente(fuente);
  }
}
