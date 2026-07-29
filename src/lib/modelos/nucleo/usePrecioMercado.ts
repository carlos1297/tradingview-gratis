"use client";

import { useEffect, useRef, useState } from "react";
import { getBinanceWS } from "@/lib/binance/ws";

/**
 * usePrecioMercado — Precio actual del par que opera un modelo.
 *
 * ÚNICA fuente del "precio actual" con el que se mide el PnL flotante. Antes
 * cada consumidor usaba el suyo y el mismo PnL salía distinto en cada lugar:
 *
 *   · la barra de modelos → el tick del miniTicker de Binance
 *   · el Probador          → `estado.precio`, el que publica el motor (una vez
 *                            cada 5 minutos, o congelado si el motor murió)
 *   · el gráfico           → el cierre de la última vela DE SU PROPIA
 *                            temporalidad, así que el porcentaje cambiaba al
 *                            cambiar de temporalidad y dos ventanas del mismo
 *                            par mostraban números distintos
 *
 * Reutiliza el WebSocket singleton (`lib/binance/ws.ts`): no abre una conexión
 * propia, y varias llamadas al mismo par comparten el stream.
 *
 * Devuelve `null` mientras no llegó ningún tick — quien lo consume decide con
 * qué caer hacia atrás (el precio del propio motor, o el de la última vela).
 *
 * Esta versión guarda el precio en ESTADO: re-renderiza en cada tick, que es
 * lo que hace falta cuando el número se muestra en pantalla (la barra de
 * modelos, la franja del Probador). Si solo lo vas a usar para dibujar en un
 * canvas, usá `usePrecioMercadoRef`: no re-renderiza nada.
 */
export function usePrecioMercado(simbolo: string | undefined): number | null {
  // El precio se guarda JUNTO a su par: si el modelo cambia de símbolo, el
  // precio viejo deja de coincidir y se descarta solo, sin resetear estado
  // dentro del efecto.
  const [tick, setTick] = useState<{ simbolo: string; precio: number } | null>(null);

  useEffect(() => {
    if (!simbolo) return;
    return getBinanceWS().subscribeMiniTickers([simbolo], (t) => {
      if (t.symbol.toUpperCase() === simbolo.toUpperCase()) {
        setTick({ simbolo, precio: t.close });
      }
    });
  }, [simbolo]);

  return tick && tick.simbolo === simbolo ? tick.precio : null;
}

/**
 * Igual que `usePrecioMercado`, pero el precio va a una ref y **no dispara
 * ningún re-render**.
 *
 * Para quien DIBUJA en vez de mostrar. `ChartLigero` es un componente caro
 * —crea el chart, las series, los indicadores y cuatro canvas superpuestos— y
 * ya repinta la operación por su cuenta cada 500 ms; meterle el precio en un
 * `useState` lo re-renderizaba entero una vez por segundo, y con cuatro
 * ventanas abiertas eso es cuatro re-renders por segundo a cambio de nada.
 *
 * Es el mismo patrón que el resto del archivo usa para el estado del store
 * (`heatmapActivoRef.current = heatmapActivo`): el valor vive en una ref para
 * poder leerse fresco desde un callback de larga vida, sin volver a suscribir
 * nada y sin re-renderizar.
 */
export function usePrecioMercadoRef(simbolo: string | undefined) {
  const precio = useRef<number | null>(null);

  useEffect(() => {
    // el precio del par anterior no vale para este: se descarta al cambiar
    precio.current = null;
    if (!simbolo) return;
    return getBinanceWS().subscribeMiniTickers([simbolo], (t) => {
      if (t.symbol.toUpperCase() === simbolo.toUpperCase()) {
        precio.current = t.close;
      }
    });
  }, [simbolo]);

  return precio;
}
