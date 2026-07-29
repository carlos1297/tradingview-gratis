import { describe, expect, test } from "bun:test";
import type { Candle } from "@/lib/binance/types";
import { ema, macd, rsi, sma } from "../index";

/** Velas a partir de una lista de cierres (OHLC plano, volumen 1). */
const velas = (cierres: number[]): Candle[] =>
  cierres.map((c, i) => ({ time: i * 60, open: c, high: c, low: c, close: c, volume: 1 }));

const constante = (n: number, v = 100) => velas(Array(n).fill(v));
const subiendo = (n: number) => velas(Array.from({ length: n }, (_, i) => 100 + i));
const bajando = (n: number) => velas(Array.from({ length: n }, (_, i) => 200 - i));

describe("RSI · casos extremos", () => {
  test("mercado PLANO da 50, no 99", () => {
    // Con `loss === 0` se sustituía RS por 100, y una serie sin una sola
    // variación aparecía como 99 «sobrecomprada». Sin fuerza en ninguna
    // dirección, lo neutro es 50.
    const r = rsi(constante(40), 14);
    expect(r.at(-1)!.value).toBe(50);
    expect(r.every((p) => p.value === 50)).toBe(true);
  });

  test("solo subidas da 100 exacto", () => {
    expect(rsi(subiendo(40), 14).at(-1)!.value).toBe(100);
  });

  test("solo bajadas da 0 exacto", () => {
    expect(rsi(bajando(40), 14).at(-1)!.value).toBe(0);
  });

  test("una serie mixta se queda dentro de 0..100", () => {
    const mixta = velas([44, 44.3, 44.1, 44.6, 43.4, 44.3, 44.9, 44.3, 44.6, 44.2,
      45.6, 47.2, 46.6, 46.3, 46.3, 46, 46.4, 46.2, 45.6, 46.2, 46.2, 46.0, 46.0]);
    const r = rsi(mixta, 14);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((p) => p.value >= 0 && p.value <= 100 && Number.isFinite(p.value))).toBe(true);
  });

  test("sin velas suficientes devuelve vacío en vez de romperse", () => {
    expect(rsi(constante(14), 14)).toEqual([]);
    expect(rsi([], 14)).toEqual([]);
  });
});

describe("EMA y SMA", () => {
  test("sobre una serie constante valen esa constante", () => {
    expect(ema(constante(50, 100), 20).every((p) => Math.abs(p.value - 100) < 1e-9)).toBe(true);
    expect(sma(constante(50, 100), 20).every((p) => p.value === 100)).toBe(true);
  });

  test("emiten un punto por vela desde que hay período completo", () => {
    expect(sma(subiendo(50), 20)).toHaveLength(31);
    expect(ema(subiendo(50), 20)).toHaveLength(31);
  });

  test("sin velas suficientes devuelven vacío", () => {
    expect(ema(constante(19), 20)).toEqual([]);
    expect(sma(constante(19), 20)).toEqual([]);
  });

  test("ningún valor sale NaN ni infinito", () => {
    const e = ema(subiendo(300), 200);
    expect(e.length).toBeGreaterThan(0);
    expect(e.every((p) => Number.isFinite(p.value))).toBe(true);
  });
});

describe("MACD", () => {
  test("sobre una serie constante el histograma es cero", () => {
    const m = macd(constante(120));
    expect(m.length).toBeGreaterThan(0);
    expect(m.every((p) => Math.abs(p.histogram) < 1e-9)).toBe(true);
  });

  test("las tres series quedan alineadas en el mismo tiempo", () => {
    const m = macd(subiendo(200));
    expect(m.every((p) => Number.isFinite(p.macd) && Number.isFinite(p.signal))).toBe(true);
    expect(m.every((p) => Math.abs(p.histogram - (p.macd - p.signal)) < 1e-9)).toBe(true);
  });

  test("sin velas suficientes devuelve vacío", () => {
    expect(macd(constante(30))).toEqual([]);
  });
});
