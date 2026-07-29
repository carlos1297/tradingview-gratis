"use client";

import { useEffect, useRef } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import { useModelosStore } from "@/lib/store/modelos-store";
import { motorSinVida } from "./derivar";
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
 * Cuánto se espera, tras un corte de enlace, antes de retirar el modelo.
 * Cubre el primer reintento del backoff del WebSocket (1 s).
 */
const MS_GRACIA_RECONEXION = 3000;

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
    /** Retiro pendiente por corte de enlace (ver `onDesconectado`). */
    let retiro: ReturnType<typeof setTimeout> | null = null;
    const cancelarRetiro = () => {
      if (retiro) clearTimeout(retiro);
      retiro = null;
    };

    const onDatos = (crudo: unknown) => {
      if (!vivo) return;
      cancelarRetiro(); // volvió a hablar: el enlace está sano
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
      // Un estado que ya nació muerto NO se publica.
      //
      // Este guardia tiene que estar acá y no solo en el barrido. El transporte
      // de archivo relee `estado_vivo.json` cada 5 segundos, y ese archivo
      // sigue en disco después de que el motor se apagó: publicarlo y que el
      // barrido lo quitara un segundo después dejaba al modelo apareciendo y
      // desapareciendo en bucle — con el gráfico refetcheando entero en cada
      // vuelta, porque `modelSignals` cambiaba con él.
      //
      // También cubre el apagado limpio: si el motor escribe
      // `estado: "detenido"`, se lo retira en el acto en vez de esperar a que
      // el estado anterior envejezca los 12 minutos del umbral.
      if (motorSinVida(estado, Date.now(), fuente.msFresco)) {
        quitarModelo(fuente.id);
        return;
      }
      // Esta suscripción SOLO publica su estado. Llevar las señales al Probador
      // de estrategias es responsabilidad de useSincronizarSenales(), que mira
      // el modelo ACTIVO: hacerlo acá, por fuente, dejaba el Probador congelado
      // al cambiar de modelo (cada efecto recordaba su propio contador y ya no
      // volvía a empujar nada).
      publicarEstado(fuente.id, estado);
    };

    const cerrar = conectar({
      url,
      urlsRespaldo: fuente.urlsRespaldo,
      msSondeo: fuente.msSondeo ?? MS_SONDEO_POR_DEFECTO,
      onDatos,
      // El motor se apagó y su archivo ya no existe: se quita del selector en
      // vez de dejar un modelo fantasma con datos viejos.
      onAusente: () => {
        if (vivo) quitarModelo(fuente.id);
      },
      // Se cortó el enlace con un transporte push: el modelo desaparece de la
      // interfaz y con él su operación abierta.
      //
      // Con una gracia de MS_GRACIA_RECONEXION, que cubre el primer reintento
      // del backoff (1 s). Un parpadeo de red cierra y reabre el socket casi
      // sin pausa; retirar el modelo en ese instante le borraría al adaptador
      // el estado previo, y con él las señales que viene acumulando tick a
      // tick — el Probador perdería las operaciones cerradas de la corrida por
      // un corte de un segundo. Si el servicio de verdad murió, no vuelve a
      // hablar y el retiro se ejecuta igual.
      onDesconectado: () => {
        if (!vivo || retiro) return;
        retiro = setTimeout(() => {
          retiro = null;
          if (vivo) quitarModelo(fuente.id);
        }, MS_GRACIA_RECONEXION);
      },
      onAviso: (m) => console.warn(`[modelos:${fuente.id}] ${m}`),
    });

    return () => {
      vivo = false;
      cancelarRetiro();
      cerrar();
    };
  }, [fuente, publicarEstado, quitarModelo]);
}

/** Cada cuánto se revisa si algún motor dejó de dar señales de vida. */
const MS_BARRIDO = 1000;

/**
 * Saca de la interfaz a los motores que dejaron de publicar.
 *
 * Sin esto, un motor apagado seguía "operando" para siempre: el transporte de
 * archivo solo detecta el 404, y `public/estado_vivo.json` queda en disco
 * después de la corrida — Next lo sirve con 200 indefinidamente. El visor
 * arrancaba mostrando la posición de ayer, con su entrada, su stop y su PnL,
 * como si hubiera una IA conectada.
 *
 * El criterio es el mismo semáforo que ya usaba la barra: pasado el DOBLE de
 * `msFresco` (12 minutos con los defaults de 5m) el motor está DETENIDO, y un
 * motor detenido no tiene operaciones que mostrar. Quitarlo del store vacía de
 * un saque la barra, el selector, la caja del gráfico y el Probador, porque
 * los cuatro leen de ahí.
 *
 * Es reversible: si el motor vuelve a escribir, su siguiente lectura lo
 * republica y el modelo reaparece solo.
 */
export function useDescartarModelosDetenidos(fuentes: readonly FuenteModelo[]) {
  const quitarModelo = useModelosStore((s) => s.quitarModelo);

  useEffect(() => {
    // Las fuentes llegan por parámetro y no de `registro.ts` a propósito: el
    // núcleo no puede importar el catálogo, o dejaría de ser agnóstico del
    // modelo. Quien las tiene es ProveedorModelosIA, que ya monta el registro.
    const msFrescoPorId = new Map(fuentes.map((f) => [f.id, f.msFresco]));
    const barrer = () => {
      const ahora = Date.now();
      for (const [id, estado] of Object.entries(useModelosStore.getState().estados)) {
        if (motorSinVida(estado, ahora, msFrescoPorId.get(id))) quitarModelo(id);
      }
    };
    barrer();
    const timer = setInterval(barrer, MS_BARRIDO);
    return () => clearInterval(timer);
  }, [fuentes, quitarModelo]);
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
  /**
   * ¿Las señales que hay en el gráfico las puso este hook? Un `senales.json`
   * cargado a mano es del usuario y no se toca; las de un motor en vivo, sí.
   */
  const publicadasPorNosotros = useRef(false);

  useEffect(() => {
    if (!activo || !estado) {
      // No quedó ningún modelo publicando: se cayó, lo apagaron o dejó de dar
      // señales de vida. Sus operaciones tienen que irse con él — si no, las
      // flechas siguen sobre las velas y el Probador sigue mostrando su
      // rendimiento como si el motor estuviera corriendo.
      if (publicadasPorNosotros.current) {
        publicadasPorNosotros.current = false;
        // abrirPanel: false → no se le cierra el Probador al usuario en la cara
        useChartStore.getState().setModelSignals(null, { abrirPanel: false });
      }
      return;
    }
    // Un backtest cargado A MANO manda sobre el sync en vivo: lo puso el
    // usuario, con un clic, para mirar un período concreto. Antes lo pisaba el
    // primer tick del motor —el gráfico mostraba las 500 flechas del backtest
    // y un segundo después quedaba con la única señal del modelo en vivo—.
    // Para volver al vivo alcanza con quitar las señales (la ✕ del botón).
    const enGrafico = useChartStore.getState().modelSignals;
    if (enGrafico && enGrafico.origen === "archivo") return;

    publicadasPorNosotros.current = true;
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
        // el gráfico sigue en tiempo real; no es un período histórico
        origen: "vivo",
      },
      { abrirPanel: false },
    );
    // `estado` cambia de identidad en cada tick; las dependencias reales son
    // qué modelo es y cuántas señales lleva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, nSenales, etiqueta, simbolo, setModelSignals]);
}
