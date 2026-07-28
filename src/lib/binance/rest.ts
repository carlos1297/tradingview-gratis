import type { Candle, SymbolInfo, Ticker24h, Timeframe } from "./types";
import { REST_HOSTS } from "./endpoints";

/**
 * Pide un endpoint de mercado probando los hosts de Binance en orden. Un
 * `fetch` que lanza (TypeError "Failed to fetch": red/CORS/geobloqueo) hace
 * saltar al siguiente host; una respuesta HTTP (aunque sea error) se devuelve
 * tal cual (no reintenta contra otro host por un 4xx/5xx). Solo si TODOS los
 * hosts fallan a nivel de red se propaga el error.
 */
async function pedir(path: string, init?: RequestInit): Promise<Response> {
  let ultimoError: unknown;
  for (const host of REST_HOSTS) {
    try {
      return await fetch(`${host}${path}`, { cache: "no-store", ...init });
    } catch (e) {
      ultimoError = e;
    }
  }
  throw ultimoError instanceof Error
    ? ultimoError
    : new Error("Sin conexión a Binance");
}

export async function fetchKlines(
  symbol: string,
  interval: Timeframe,
  limit = 1000,
  endTimeMs?: number,
): Promise<Candle[]> {
  // endTimeMs → historical review mode (e.g. the backtest window of the RL model)
  const end = endTimeMs !== undefined ? `&endTime=${Math.floor(endTimeMs)}` : "";
  const res = await pedir(
    `/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}${end}`,
  );
  if (!res.ok) throw new Error(`klines ${res.status}`);
  const data = (await res.json()) as unknown[][];
  return data.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
    isFinal: true,
  }));
}

export async function fetchTicker24h(symbol: string): Promise<Ticker24h> {
  const res = await pedir(`/ticker/24hr?symbol=${symbol.toUpperCase()}`);
  if (!res.ok) throw new Error(`ticker ${res.status}`);
  const t = await res.json();
  return {
    symbol: t.symbol,
    lastPrice: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    highPrice: parseFloat(t.highPrice),
    lowPrice: parseFloat(t.lowPrice),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
  };
}

export async function fetchTickers24h(symbols: string[]): Promise<Ticker24h[]> {
  const arr = JSON.stringify(symbols.map((s) => s.toUpperCase()));
  const res = await pedir(`/ticker/24hr?symbols=${encodeURIComponent(arr)}`);
  if (!res.ok) throw new Error(`tickers ${res.status}`);
  const data = await res.json();
  return data.map((t: Record<string, string>) => ({
    symbol: t.symbol,
    lastPrice: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    highPrice: parseFloat(t.highPrice),
    lowPrice: parseFloat(t.lowPrice),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
  }));
}

let cachedSymbols: SymbolInfo[] | null = null;
export async function fetchExchangeSymbols(): Promise<SymbolInfo[]> {
  if (cachedSymbols) return cachedSymbols;
  const res = await pedir(`/exchangeInfo`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`exchangeInfo ${res.status}`);
  const data = await res.json();
  cachedSymbols = data.symbols
    .filter(
      (s: { status: string; quoteAsset: string }) =>
        s.status === "TRADING" && s.quoteAsset === "USDT",
    )
    .map((s: { symbol: string; baseAsset: string; quoteAsset: string; status: string }) => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      status: s.status,
    }));
  return cachedSymbols!;
}
