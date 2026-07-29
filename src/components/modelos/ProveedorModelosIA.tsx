"use client";

import { useEffect } from "react";
import { REGISTRO_MODELOS } from "@/lib/modelos/registro";
import type { FuenteModelo } from "@/lib/modelos/nucleo/tipos";
import {
  useDescartarModelosDetenidos,
  useFuente,
  useSincronizarSenales,
} from "@/lib/modelos/nucleo/useModelosIA";

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

  // Va acá, junto a las suscripciones y fuera de todo panel ocultable: un
  // motor que dejó de publicar tiene que desaparecer también en modo
  // inmersivo, que es justo donde el gráfico se quedaba dibujando la última
  // posición conocida sin nadie que lo delatara.
  // Las fuentes van por parámetro: el núcleo no importa el catálogo, así que
  // quien las conoce es este proveedor, que ya monta el registro.
  useDescartarModelosDetenidos(REGISTRO_MODELOS);
  useSincronizarSenales();

  return (
    <>
      {REGISTRO_MODELOS.map((fuente) => (
        <SuscriptorFuente key={fuente.id} fuente={fuente} />
      ))}
    </>
  );
}
