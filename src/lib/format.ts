export function formatPrice(n: number): string {
  if (!isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

/**
 * Precio con cantidad de decimales FIJA — para paneles que se refrescan en vivo.
 *
 * `formatPrice` usa solo `maximumFractionDigits`, así que descarta los decimales
 * que no hacen falta: 63185.77 → "63,185.77" pero 63185 → "63,185" y 63185.70 →
 * "63,185.7". En una tabla estática da igual, pero en un panel que se actualiza
 * varias veces por segundo el texto cambia de ANCHO en cada tick y arrastra a
 * las celdas vecinas: el panel entero tiembla.
 *
 * Fijando mínimo = máximo, el ancho queda constante y (con `tabular-nums`) el
 * número se actualiza sin mover un píxel.
 */
export function formatPrecioEstable(n: number, decimales?: number): string {
  if (!isFinite(n)) return "—";
  // mismos tramos que formatPrice, para que ambos muestren la misma precisión
  const d = decimales ?? (n >= 1 ? 2 : n >= 0.01 ? 4 : 6);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export function formatPct(n: number): string {
  if (!isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatVolume(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}
