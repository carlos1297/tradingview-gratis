/**
 * Hosts de datos públicos de Binance, en orden de preferencia.
 *
 * Se usa por defecto el mirror `*.binance.vision` (Binance Public Data): sirve
 * los mismos endpoints de mercado (klines, ticker/24hr, exchangeInfo y los
 * streams WS de kline/aggTrade/miniTicker) sin API key, y suele estar accesible
 * donde `api.binance.com` / `stream.binance.com` están geobloqueados o dan
 * "Failed to fetch" por CORS/región. El dominio clásico queda como respaldo:
 * el REST prueba host por host y el WS va alternando en cada reconexión.
 */
export const REST_HOSTS = [
  "https://data-api.binance.vision/api/v3",
  "https://api.binance.com/api/v3",
];

export const WS_HOSTS = [
  "wss://data-stream.binance.vision/stream",
  "wss://stream.binance.com:9443/stream",
];
