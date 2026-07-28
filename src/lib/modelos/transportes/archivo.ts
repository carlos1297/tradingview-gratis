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
export const conectarArchivo: Conector = ({
  url,
  msSondeo,
  onDatos,
  onAusente,
  onAviso,
}) => {
  let vivo = true;
  // Solo para el guardia del 404: si la fuente respondió alguna vez y después
  // desaparece, el motor se apagó y hay que quitar el modelo. Un 404 desde el
  // arranque es lo normal cuando ese motor nunca se lanzó: se ignora.
  let respondioAlgunaVez = false;

  const sondear = async () => {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!vivo) return;
      if (!r.ok) {
        if (r.status === 404 && respondioAlgunaVez) onAusente();
        return;
      }
      const crudo = await r.json();
      if (!vivo) return;
      respondioAlgunaVez = true;
      onDatos(crudo);
    } catch (e) {
      // Archivo a medio escribir, JSON inválido o red caída: se reintenta en
      // el próximo sondeo. Un motor caído NO debe tumbar la interfaz.
      if (vivo && respondioAlgunaVez) {
        onAviso?.(`lectura fallida de ${url}: ${(e as Error).message}`);
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
