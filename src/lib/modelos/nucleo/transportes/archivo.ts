import type { Conector } from "./tipos";

/**
 * transportes/archivo.ts — El motor escribe un JSON en `public/` y el visor lo
 * sondea. Es el transporte más simple y el que menos acopla: el motor no
 * necesita servidor, red ni saber que el visor existe.
 *
 * Requisito del lado del motor: **escritura atómica** (escribir en `.tmp` y
 * `os.replace`). Sin eso el sondeo puede leer un archivo a medio escribir; acá
 * eso no rompe nada (el JSON inválido se descarta y se reintenta), pero el
 * panel parpadearía.
 *
 * `cache: "no-store"` es obligatorio: sin él el navegador sirve la primera
 * lectura para siempre y el panel se congela con el estado inicial.
 */

/**
 * Lecturas fallidas seguidas antes de avisar por consola. Con el sondeo por
 * defecto (5 s) son ~15 segundos de silencio: suficiente para que una recarga
 * de página o un reinicio del dev server pasen sin ensuciar nada, y poco para
 * enterarse de un corte real.
 */
const FALLOS_ANTES_DE_AVISAR = 3;

export const conectarArchivo: Conector = ({
  url,
  urlsRespaldo,
  msSondeo,
  onDatos,
  onAusente,
  onAviso,
}) => {
  let vivo = true;
  /**
   * Orígenes a probar, en orden. El primero es el nombre actual; los demás son
   * nombres anteriores del mismo archivo, para que renombrarlo no obligue a
   * actualizar el visor y el motor a la vez.
   */
  const candidatos = [url, ...(urlsRespaldo ?? [])];
  /** Índice del que está respondiendo. Se fija en cuanto uno funciona. */
  let elegido = 0;
  // Solo para el guardia del 404: si la fuente respondió alguna vez y después
  // desaparece, el motor se apagó y hay que quitar el modelo. Un 404 desde el
  // arranque es lo normal cuando ese motor nunca se lanzó: se ignora.
  let respondioAlgunaVez = false;
  // Fallos de red seguidos. Un `fetch` puede tirar "Failed to fetch" por
  // motivos que no son un problema: recarga de página, HMR de `next dev`, o el
  // servidor reiniciando con la pestaña vieja todavía sondeando. Avisar en el
  // primero llenaba la consola de advertencias alarmantes en un arranque
  // normal. Se avisa UNA vez cuando el fallo se sostiene, y se vuelve a callar
  // en cuanto la fuente responde.
  let fallosSeguidos = 0;

  const sondear = async () => {
    try {
      // Mientras ninguno respondió se recorren todos; una vez que uno funciona
      // se sondea SOLO ese, para no pedir en cada tick un archivo que no existe.
      const aProbar = respondioAlgunaVez ? [candidatos[elegido]] : candidatos;
      let r: Response | null = null;
      let indice = elegido;
      for (let i = 0; i < aProbar.length; i++) {
        const respuesta = await fetch(aProbar[i], { cache: "no-store" });
        if (!vivo) return;
        if (respuesta.ok) {
          r = respuesta;
          indice = respondioAlgunaVez ? elegido : i;
          break;
        }
        // 404 en TODOS los candidatos = la fuente ya no existe. Si nunca
        // respondió, es que ese motor no arrancó: se ignora en silencio.
        if (respuesta.status !== 404) break;
      }
      if (r === null) {
        if (respondioAlgunaVez) onAusente();
        return;
      }
      const crudo = await r.json();
      if (!vivo) return;
      if (!respondioAlgunaVez && indice > 0) {
        onAviso?.(
          `usando el origen de respaldo ${candidatos[indice]} (${url} no existe)`,
        );
      }
      elegido = indice;
      respondioAlgunaVez = true;
      fallosSeguidos = 0;
      onDatos(crudo);
    } catch (e) {
      // Archivo a medio escribir, JSON inválido o red caída: se reintenta en
      // el próximo sondeo. Un motor caído NO debe tumbar la interfaz.
      if (!vivo || !respondioAlgunaVez) return;
      fallosSeguidos += 1;
      if (fallosSeguidos === FALLOS_ANTES_DE_AVISAR) {
        onAviso?.(
          `${candidatos[elegido]} lleva ${fallosSeguidos} lecturas fallidas seguidas: ${(e as Error).message}`,
        );
      }
    }
  };

  void sondear();
  const timer = setInterval(() => void sondear(), msSondeo);

  return () => {
    vivo = false;
    clearInterval(timer);
  };
};
