"use client";

import { useEffect } from "react";
import { Minimize } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { VentanasTimeframes } from "@/components/chart/VentanasTimeframes";
import { BarraModelosIA } from "@/components/modelos/BarraModelosIA";
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
      <div className="relative h-screen w-screen overflow-hidden bg-tv-bg">
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
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      <Header />
      {/* monitor de modelos de IA: ancho completo, entre la barra superior y
          el gráfico. Se auto-oculta si no hay ningún motor corriendo. */}
      <BarraModelosIA />
      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* mosaico de ventanas de timeframe (plantilla + divisores) */}
          <VentanasTimeframes />
        </main>
        {watchlistVisible && <RightSidebar />}
      </div>
      <StrategyTester />
      <BottomPanel />
    </div>
  );
}
