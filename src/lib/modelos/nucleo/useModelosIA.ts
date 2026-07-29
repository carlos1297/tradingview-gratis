"use client";

import { useEffect } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import { useModelosStore } from "@/lib/store/modelos-store";
import { conectorDe } from "./transportes";
import { MS_SONDEO_POR_DEFECTO, type EstadoModeloIA, type FuenteModelo } from "./tipos";

/**
 * useModelosIA.ts — NÚCLEO de la capa multi-modelo. Es el único lugar que
 * conecta transporte + adaptador + store, y no conoce ningún modelo concreto:
 * todo sale de la entrada del registro que recibe.
 *
 * Tolerante por diseño: una fuente caída, un 404 o un JSON a medio escribir no
 * afectan a las demás — cada modelo vive en su propia suscripción.
 *
 * Quién monta esto: `components/modelos/ProveedorModelosIA.tsx`, una sola vez
 * por página. NO lo llames desde un componente de presentación: si ese
 * componente se desmonta (modo inmersivo, un layout futuro) el monitoreo se
 * corta y el gráfico se queda dibujando una posición congelada.
 */

/**
 * Suscribe UNA fuente. Se usa desde un componente por fuente, así cada
 * suscripción es una unidad montable/desmontable de forma independiente y no
 * hace falta llamar hooks dentro de un bucle.
 */
export function useFuente(fuente: FuenteModelo) {
  const publicarEstado = useModelosStore((s) => s.publicarEstado);
  const quitarModelo = useModelosStore((s) => s.quitarModelo);

  useEffect(() => {
    const url = fuente.url;
    if (!url) return; // fuente desactivada: nada que hacer

    const conectar = conectorDe(fuente.transporte);
    if (!conectar) {
      // Solo puede pasar con una fuente declarada por entorno con un
      // transporte inexistente; en código TypeScript ya lo impide.
      console.warn(
        `[modelos] "${fuente.id}" pide el transporte "${fuente.transporte}", que no está registrado`,
      );
      return;
    }

    let vivo = true;

    const onDatos = (crudo: unknown) => {
      if (!vivo) return;
      // El adaptador recibe el ÚLTIMO estado publicado por esta misma fuente:
      // los transportes incrementales (WebSocket manda solo los eventos nuevos
      // de cada tick) lo necesitan para acumular.
      const previo = useModelosStore.getState().estados[fuente.id] ?? null;
      let estado: EstadoModeloIA | null;
      try {
        estado = fuente.adaptar(crudo, fuente, previo);
      } catch (e) {
        // Adaptador roto: se ignora este tick. Un modelo con un bug de formato
        // no puede tumbar la interfaz ni a los otros modelos.
        console.warn(`[modelos] el adaptador de "${fuente.id}" falló: ${(e as Error).message}`);
        return;
      }
      if (!estado) return;
      // Esta suscripción SOLO publica su estado. Llevar las señales al Probador
      // de estrategias es responsabilidad de useSincronizarSenales(), que mira
      // el modelo ACTIVO: hacerlo acá, por fuente, dejaba el Probador congelado
      // al cambiar de modelo (cada efecto recordaba su propio contador y ya no
      // volvía a empujar nada).
      publicarEstado(fuente.id, estado);
    };

    const cerrar = conectar({
      url,
      msSondeo: fuente.msSondeo ?? MS_SONDEO_POR_DEFECTO,
      onDatos,
      // El motor se apagó y su archivo ya no existe: se quita del selector en
      // vez de dejar un modelo fantasma con datos viejos.
      onAusente: () => {
        if (vivo) quitarModelo(fuente.id);
      },
      onAviso: (m) => console.warn(`[modelos:${fuente.id}] ${m}`),
    });

    return () => {
      vivo = false;
      cerrar();
    };
  }, [fuente, publicarEstado, quitarModelo]);
}

/**
 * Lleva las señales del modelo ACTIVO al store del gráfico, que es de donde
 * leen el Probador de estrategias (Resumen · Rendimiento · Lista de
 * operaciones) y las marcas del chart.
 *
 * Es reactivo a propósito: depende del modelo activo y de su cantidad de
 * señales, así que **cambiar de modelo en el selector actualiza el Probador al
 * instante**. La versión anterior empujaba desde cada fuente con un contador
 * propio y, al alternar, el modelo recién activado ya tenía su contador al día
 * y nunca volvía a publicar: el Probador seguía mostrando las operaciones del
 * otro modelo.
 *
 * Solo manda el activo: mezclar las operaciones de dos motores daría un win
 * rate y un profit factor sin significado.
 */
export function useSincronizarSenales() {
  const setModelSignals = useChartStore((s) => s.setModelSignals);
  const activo = useModelosStore((s) => s.modeloActivo);
  const estado = useModelosStore((s) =>
    s.modeloActivo ? (s.estados[s.modeloActivo] ?? null) : null,
  );
  const nSenales = estado?.senales.length ?? 0;
  const etiqueta = estado?.modeloEtiqueta;
  const simbolo = estado?.simbolo;

  useEffect(() => {
    if (!activo || !estado) return;
    // OJO: acá NO se toca el símbolo del gráfico.
    //
    // Antes esto hacía `setSymbol(estado.simbolo)`, y era lo que recargaba los
    // gráficos: cambiar el par dispara un refetch de velas y la serie se vuelve
    // a construir. Alternar entre modelos —o simplemente mirar otro par
    // mientras uno opera— provocaba esa recarga y el gráfico daba un salto.
    //
    // Quién manda sobre el par es el usuario. Si el modelo activo opera otro
    // mercado, la barra lo dice y ofrece cambiar con un clic; sus marcas y su
    // posición ya se filtran por símbolo, así que nunca se dibujan sobre el
    // gráfico equivocado.
    //
    // abrirPanel: false → refrescar en vivo NO reabre el panel que el usuario
    // cerró (cargar un senales.json a mano sí lo abre, como siempre).
    setModelSignals(
      {
        simbolo: estado.simbolo,
        split: `${estado.modeloEtiqueta} en vivo`,
        senales: estado.senales,
      },
      { abrirPanel: false },
    );
    // `estado` cambia de identidad en cada tick; las dependencias reales son
    // qué modelo es y cuántas señales lleva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, nSenales, etiqueta, simbolo, setModelSignals]);
}
