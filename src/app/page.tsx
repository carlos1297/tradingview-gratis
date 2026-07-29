"use client";

import { useEffect } from "react";
import { Minimize } from "lucide-react";
import { BarraHerramientas } from "@/components/layout/BarraHerramientas";
import { Header } from "@/components/layout/Header";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { VentanasTimeframes } from "@/components/chart/VentanasTimeframes";
import { BarraModelosIA } from "@/components/modelos/BarraModelosIA";
import { PanelModelos } from "@/components/modelos/PanelModelos";
import { ProveedorModelosIA } from "@/components/modelos/ProveedorModelosIA";
import { StrategyTester } from "@/components/panel/StrategyTester";
import { useChartStore } from "@/lib/store/chart-store";
import { salirPantallaCompleta } from "@/lib/fullscreen";

export default function HomePage() {
  const watchlistVisible = useChartStore((s) => s.watchlistVisible);
  const soloGraficos = useChartStore((s) => s.soloGraficos);
  const setSoloGraficos = useChartStore((s) => s.setSoloGraficos);

  const salir = () => {
    salirPantallaCompleta();
    setSoloGraficos(false);
  };

  // en modo inmersivo: Esc sale, y si el usuario abandona el fullscreen del
  // navegador (F11/Esc) se sincroniza saliendo también del modo inmersivo
  useEffect(() => {
    if (!soloGraficos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") salir();
    };
    const onFsChange = () => {
      if (!document.fullscreenElement) setSoloGraficos(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloGraficos]);

  // Modo inmersivo: solo los gráficos, en todo el monitor
  if (soloGraficos) {
    return (
      <main
        data-label="modo-inmersivo"
        aria-label="Gráficos en pantalla completa"
        className="relative h-full w-full overflow-hidden bg-tv-bg"
      >
        {/* También acá: el gráfico dibuja la posición abierta del modelo, así
            que el monitoreo tiene que seguir vivo aunque la barra no se vea.
            Sin esto, en pantalla completa la operación quedaba congelada. */}
        <ProveedorModelosIA />
        <VentanasTimeframes />
        <button
          onClick={salir}
          title="Salir de pantalla completa (Esc)"
          aria-label="Salir de pantalla completa"
          className="absolute right-3 top-3 z-50 flex items-center gap-1.5 rounded-md border border-tv-border bg-tv-panel/90 px-2.5 py-1.5 text-xs text-tv-text shadow-lg backdrop-blur hover:bg-tv-panel-hover"
        >
          <Minimize className="h-3.5 w-3.5" />
          <span>Salir (Esc)</span>
        </button>
      </main>
    );
  }

  return (
    /*
     * Shell en GRID, no en flex, y a propósito.
     *
     * Con flex, cualquier fila que se niegue a encoger (o cuyo contenido crezca
     * — el mosaico de gráficos al redimensionarlo) empuja a las de abajo, y
     * como la raíz es overflow-hidden lo que sobra se RECORTA sin scroll: la
     * víctima era la barra inferior, justo la que tiene el botón para reabrir
     * el Probador. Quedabas sin salida.
     *
     * En grid las filas son explícitas: solo la central es elástica
     * (`minmax(0,1fr)` — el 0 es lo que le permite encoger por debajo de su
     * contenido) y las demás toman su alto natural.
     *
     * Las 5 filas se renderizan SIEMPRE, aunque estén vacías: si un hijo
     * devolviera null, los que siguen se correrían de fila y el `1fr` le
     * tocaría al panel equivocado.
     *
     * NINGUNA medida en `vh`. `vh` mide la VENTANA del navegador, que puede ser
     * más alta que el área realmente visible; una fila dimensionada en vh se
     * queda con más espacio del que hay y el resto lo paga la fila elástica,
     * que se encoge hasta desaparecer. Todo lo de acá abajo se mide en % del
     * espacio REAL (`h-full`, `flex-1`, `max-h-[45%]`).
     */
    <div
      data-label="shell-app"
      className="grid h-full w-full grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] overflow-hidden bg-tv-bg"
    >
      {/* Monitoreo de los modelos: no dibuja nada, solo mantiene vivas las
          suscripciones del registro. Va acá, fuera de todo panel ocultable,
          para que ningún cambio de layout pueda cortar el flujo de datos. */}
      <ProveedorModelosIA />

      <Header />

      {/* monitor de modelos de IA: ancho completo, entre la barra superior y
          el gráfico. Se auto-oculta si no hay ningún motor corriendo. */}
      <BarraModelosIA />

      {/* Administración multi-modelo: qué dibuja cada motor sobre el gráfico.
          Se auto-oculta con menos de dos modelos corriendo. */}
      <PanelModelos />

      {/*
       * Región elástica: los gráficos y el Probador se REPARTEN este espacio.
       *
       * Que el Probador viva acá dentro (y no como fila propia del grid) es lo
       * que garantiza que nunca tape los gráficos: su tope es `max-h-[45%]` de
       * ESTA región, así que al mosaico siempre le queda el 55% largo. Cuando
       * el Probador era una fila `auto` con alto en vh, podía pedir más de lo
       * que había y los gráficos —única fila elástica— absorbían todo el
       * faltante hasta quedar en cero: se veían "empujados" fuera de la vista,
       * y con overflow-hidden no aparecía ningún scroll para alcanzarlos.
       */}
      <div
        data-label="region-elastica"
        className="flex min-h-0 flex-col overflow-hidden"
      >
        <div data-label="fila-graficos" className="flex min-h-0 flex-1 overflow-hidden">
          {/* Herramientas de dibujo: pegada al borde izquierdo y a la altura
              de los gráficos, como en TradingView. Va DENTRO de la fila (no
              como columna del grid) para que no le robe alto a la barra
              inferior ni al Probador. */}
          <BarraHerramientas />
          <main
            data-label="area-graficos"
            aria-label="Gráficos"
            className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >
            {/* mosaico de ventanas de timeframe (plantilla + divisores) */}
            <VentanasTimeframes />
          </main>
          {watchlistVisible && <RightSidebar />}
        </div>
        <StrategyTester />
      </div>

      <BottomPanel />
    </div>
  );
}
