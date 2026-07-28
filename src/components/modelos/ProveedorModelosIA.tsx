"use client";

import { useEffect } from "react";
import { REGISTRO_MODELOS } from "@/lib/modelos/registro";
import type { FuenteModelo } from "@/lib/modelos/tipos";
import { useFuente, useSincronizarSenales } from "@/lib/modelos/useModelosIA";

/**
 * ProveedorModelosIA — Mantiene vivo el monitoreo de TODOS los modelos
 * registrados. No dibuja nada.
 *
 * Va montado una sola vez por página y por FUERA de cualquier panel que pueda
 * ocultarse. Antes el sondeo lo arrancaba `BarraModelosIA`, y eso lo ataba a
 * que esa barra estuviera en pantalla: al entrar en modo inmersivo (solo
 * gráficos) la barra se desmonta, el sondeo moría y el gráfico se quedaba
 * dibujando indefinidamente la última posición conocida — con su PnL, su stop
 * y su take profit congelados, sin ninguna señal de que ya no eran reales.
 *
 * Separar el "quién trae los datos" del "quién los muestra" también deja
 * agregar más vistas (una ventana flotante, un widget en otra pantalla) sin
 * multiplicar suscripciones.
 */

/** Una suscripción = un componente. Así cada fuente monta y desmonta sola. */
function SuscriptorFuente({ fuente }: { fuente: FuenteModelo }) {
  useFuente(fuente);
  return null;
}

/** Detecta en desarrollo el error de montar el proveedor dos veces. */
let montados = 0;

export function ProveedorModelosIA() {
  useEffect(() => {
    montados += 1;
    if (montados > 1 && process.env.NODE_ENV !== "production") {
      console.warn(
        "[modelos] hay más de un <ProveedorModelosIA/> montado: cada fuente se está " +
          "sondeando por duplicado. Dejá uno solo, en la raíz de la página.",
      );
    }
    return () => {
      montados -= 1;
    };
  }, []);

  useSincronizarSenales();

  return (
    <>
      {REGISTRO_MODELOS.map((fuente) => (
        <SuscriptorFuente key={fuente.id} fuente={fuente} />
      ))}
    </>
  );
}
