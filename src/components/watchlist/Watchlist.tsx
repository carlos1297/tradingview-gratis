"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { fetchTickers24h } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import { useChartStore } from "@/lib/store/chart-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatPrice, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Row {
  symbol: string;
  price: number;
  pct: number;
}

export function Watchlist() {
  const watchlist = useChartStore((s) => s.watchlist);
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const removeFromWatchlist = useChartStore((s) => s.removeFromWatchlist);
  const openSymbolDialog = useChartStore((s) => s.setSymbolDialogOpen);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down" | null>>({});
  // último precio visto por símbolo (para la dirección del flash) y timers
  // pendientes, fuera del estado para no meter efectos en los updaters
  const preciosRef = useRef<Record<string, number>>({});
  const flashTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  /** Frame pendiente para volcar los ticks acumulados (0 = ninguno). */
  const rafRef = useRef(0);

  useEffect(() => {
    if (watchlist.length === 0) return;
    let cancelled = false;

    fetchTickers24h(watchlist)
      .then((tickers) => {
        if (cancelled) return;
        const map: Record<string, Row> = {};
        tickers.forEach((t) => {
          map[t.symbol] = {
            symbol: t.symbol,
            price: t.lastPrice,
            pct: t.priceChangePercent,
          };
          preciosRef.current[t.symbol] = t.lastPrice;
        });
        setRows(map);
      })
      .catch(console.error);

    // Los ticks se ACUMULAN y se vuelcan una vez por frame.
    //
    // Binance manda un miniTicker por segundo y por par: con la watchlist por
    // defecto eso eran ~10 renders por segundo del panel —uno por símbolo, sin
    // batching entre ellos porque cada tick llega en su propio callback— más
    // uno extra por cada flash y otro al apagarlo. Coalescer deja un render por
    // frame como mucho, con todos los pares actualizados de una.
    const volcado = { filas: {} as Record<string, Row>, flashes: {} as Record<string, "up" | "down"> };

    const programarVolcado = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (cancelled) return;
        const { filas, flashes } = volcado;
        volcado.filas = {};
        volcado.flashes = {};

        if (Object.keys(filas).length > 0) setRows((prev) => ({ ...prev, ...filas }));
        if (Object.keys(flashes).length > 0) {
          setFlash((f) => ({ ...f, ...flashes }));
          for (const simbolo of Object.keys(flashes)) {
            clearTimeout(flashTimersRef.current[simbolo]);
            flashTimersRef.current[simbolo] = setTimeout(() => {
              setFlash((f) => ({ ...f, [simbolo]: null }));
            }, 300);
          }
        }
      });
    };

    const ws = getBinanceWS();
    const unsub = ws.subscribeMiniTickers(watchlist, (tick) => {
      const previo = preciosRef.current[tick.symbol];
      preciosRef.current[tick.symbol] = tick.close;
      if (previo !== undefined && tick.close !== previo) {
        volcado.flashes[tick.symbol] = tick.close > previo ? "up" : "down";
      }
      volcado.filas[tick.symbol] = {
        symbol: tick.symbol,
        price: tick.close,
        pct: tick.pct,
      };
      programarVolcado();
    });

    const timers = flashTimersRef.current;
    return () => {
      cancelled = true;
      unsub();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      Object.values(timers).forEach(clearTimeout);
    };
  }, [watchlist]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-tv-border px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Watchlist
        </h2>
        <button
          onClick={() => openSymbolDialog(true)}
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Agregar símbolo"
          aria-label="Agregar al watchlist"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-tv-border px-3 py-1.5 text-[10px] uppercase tracking-wider text-tv-text-dim">
        <span>Símbolo</span>
        <span className="text-right">Precio</span>
        <span className="text-right">24h</span>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {watchlist.map((s) => {
            const row = rows[s];
            const isActive = s === symbol;
            const f = flash[s];
            return (
              <div
                key={s}
                onClick={() => setSymbol(s)}
                className={cn(
                  "group grid cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                  "hover:bg-tv-panel-hover",
                  isActive && "bg-tv-panel-hover",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-tv-text">
                    {s.replace("USDT", "")}
                  </span>
                  <span className="text-[10px] text-tv-text-dim">USDT</span>
                </div>
                <span
                  className={cn(
                    "text-right tabular-nums transition-colors",
                    f === "up" && "text-tv-green",
                    f === "down" && "text-tv-red",
                    !f && "text-tv-text",
                  )}
                >
                  {row ? formatPrice(row.price) : "—"}
                </span>
                <div className="flex items-center justify-end gap-1">
                  <span
                    className={cn(
                      "tabular-nums",
                      row
                        ? row.pct >= 0
                          ? "text-tv-green"
                          : "text-tv-red"
                        : "text-tv-text-muted",
                    )}
                  >
                    {row ? formatPct(row.pct) : "—"}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromWatchlist(s);
                    }}
                    className="invisible rounded p-0.5 text-tv-text-muted hover:bg-tv-bg hover:text-tv-red group-hover:visible"
                    aria-label={`Quitar ${s} del watchlist`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
          {watchlist.length === 0 && (
            <div className="p-4 text-center text-xs text-tv-text-muted">
              Tu watchlist está vacío
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
