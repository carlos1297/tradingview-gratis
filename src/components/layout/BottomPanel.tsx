"use client";

import { useEffect, useState } from "react";
import { ChevronUp, FlaskConical, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { fetchTicker24h } from "@/lib/binance/rest";
import type { Ticker24h } from "@/lib/binance/types";
import { formatPrice, formatPct, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BottomPanel() {
  const symbol = useChartStore((s) => s.symbol);
  const tradesPanelOpen = useChartStore((s) => s.tradesPanelOpen);
  const setTradesPanelOpen = useChartStore((s) => s.setTradesPanelOpen);
  const nSenales = useChartStore((s) => s.modelSignals?.senales.length ?? 0);
  const watchlistVisible = useChartStore((s) => s.watchlistVisible);
  const toggleWatchlist = useChartStore((s) => s.toggleWatchlist);
  // se guarda junto al símbolo consultado: al cambiar de par, los stats del
  // anterior dejan de mostrarse solos, sin resetear estado dentro del efecto
  const [ticker, setTicker] = useState<{ simbolo: string; datos: Ticker24h } | null>(null);
  const t = ticker && ticker.simbolo === symbol ? ticker.datos : null;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchTicker24h(symbol)
        .then((datos) => {
          if (!cancelled) setTicker({ simbolo: symbol, datos });
        })
        .catch(console.error);
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  const upClass = (n: number) => (n >= 0 ? "text-tv-green" : "text-tv-red");

  return (
    <div className="flex h-9 items-center gap-0 border-t border-tv-border bg-tv-panel px-3 text-xs">
      <button
        onClick={() => setTradesPanelOpen(!tradesPanelOpen)}
        title="Registro de operaciones de la IA: rentabilidad, métricas y lista de trades"
        className={
          "mr-1 flex items-center gap-1.5 rounded px-2.5 py-1 text-xs " +
          (tradesPanelOpen
            ? "bg-tv-blue/15 text-tv-blue"
            : "text-tv-text hover:bg-tv-panel-hover")
        }
      >
        <FlaskConical className="h-3.5 w-3.5" />
        <span>Probador de estrategias</span>
        {nSenales > 0 && (
          <span className="rounded bg-tv-green/20 px-1 py-0.5 text-[10px] font-semibold text-tv-green">
            IA
          </span>
        )}
        <ChevronUp
          className={
            "h-3 w-3 transition-transform " + (tradesPanelOpen ? "rotate-180" : "")
          }
        />
      </button>
      <div className="h-6 w-px bg-tv-border" />
      <Stat label="Símbolo" value={symbol} />
      <Stat
        label="24h Cambio"
        value={t ? formatPct(t.priceChangePercent) : "—"}
        valueClass={t ? upClass(t.priceChangePercent) : ""}
      />
      <Stat
        label="24h Alto"
        value={t ? formatPrice(t.highPrice) : "—"}
        valueClass="text-tv-green"
      />
      <Stat
        label="24h Bajo"
        value={t ? formatPrice(t.lowPrice) : "—"}
        valueClass="text-tv-red"
      />
      <Stat
        label="24h Vol (base)"
        value={t ? formatVolume(t.volume) : "—"}
      />
      <Stat
        label="24h Vol (USDT)"
        value={t ? formatVolume(t.quoteVolume) : "—"}
      />
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={toggleWatchlist}
          title={watchlistVisible ? "Ocultar Watchlist" : "Mostrar Watchlist"}
          className={
            "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs " +
            (watchlistVisible
              ? "bg-tv-blue/15 text-tv-blue"
              : "text-tv-text hover:bg-tv-panel-hover")
          }
        >
          {watchlistVisible ? (
            <PanelRightClose className="h-3.5 w-3.5" />
          ) : (
            <PanelRightOpen className="h-3.5 w-3.5" />
          )}
          <span>Watchlist</span>
        </button>
        <div className="h-6 w-px bg-tv-border" />
        <div className="flex items-center gap-2 text-[10px] text-tv-text-dim">
          <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tv-green" />
          <span>Binance · Live</span>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 border-r border-tv-border px-3">
      <span className="text-tv-text-dim">{label}</span>
      <span className={cn("font-medium tabular-nums", valueClass ?? "text-tv-text")}>
        {value}
      </span>
    </div>
  );
}
