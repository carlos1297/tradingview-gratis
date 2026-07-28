/**
 * Helpers de la Fullscreen API del navegador (pantalla completa de monitor).
 * Silencian el rechazo: si el navegador no lo permite, el modo inmersivo de la
 * app igual se aplica (ocultar todo menos los gráficos).
 */

export function pantallaCompletaActiva(): boolean {
  return typeof document !== "undefined" && !!document.fullscreenElement;
}

export async function entrarPantallaCompleta(): Promise<void> {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen();
    }
  } catch {
    // gesto/permiso denegado: seguimos solo con el modo inmersivo
  }
}

export async function salirPantallaCompleta(): Promise<void> {
  if (typeof document === "undefined") return;
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  } catch {
    // ignorar
  }
}
