# TradingView clon 📈

> **Una alternativa open-source y 100% gratis a TradingView**
> Velas en vivo, multi-ventana con distintas temporalidades, indicadores, señales del modelo RL, Liquidation Heatmap y probador de estrategias — sin pagar USD, sin login, sin ads.

Visor de charts crypto construido sobre [lightweight-charts](https://github.com/tradingview/lightweight-charts) (la librería open-source de TradingView) y los datos públicos de **Binance** (REST + WebSocket). Integra la evaluación del modelo RL PPO de este repositorio: carga el `senales.json` que exporta `evaluar.py` y muestra las operaciones de la IA directamente sobre el gráfico.

---

## ✨ Features

- 📊 **Velas en vivo** vía WebSocket de Binance (sin API key), con histórico REST y reconexión con backoff exponencial
- 🪟 **Multi-ventana**: 1, 2 o 4 charts del mismo par con temporalidades distintas (ej. BTC/USDT 1m / 5m / 15m / 1d), cada ventana con su propio selector de timeframe
- 📐 **Indicadores estilo TradingView**: botón «Indicadores» en el header para añadir/quitar EMA 20/50/200 (superpuestas al precio) y Volumen, RSI 14, MACD 12/26/9 (cada uno en su panel propio). El registro es escalable: agregar un indicador nuevo es sumar una entrada en `lib/indicators/registro.ts`
- 🔍 **Búsqueda de símbolo** sobre todos los pares USDT del exchange
- 🤖 **Señales IA**: carga `senales.json` (de `evaluar.py --guardar-curva`) y dibuja las compras/ventas del modelo como flechas en todas las ventanas
- 🧪 **Probador de estrategias**: reconstruye los trades cerrados de la IA con métricas (win rate, profit factor, drawdown…)
- 🔥 **Liquidation Heatmap**: mapa de calor de zonas de liquidación estimadas, superpuesto al chart en un canvas sincronizado con el rango visible
- 👁️ **Watchlist** con precios y cambio 24h en tiempo real
- 💾 **Persistencia** en localStorage (símbolo, ventanas, indicadores, watchlist)
- 🌐 100% client-side — deploy estático en Vercel/Cloudflare

## 🚀 Empezar

```bash
bun install
bun run dev
```

Abrí [http://localhost:3000](http://localhost:3000). Funciona de entrada: sin licencias, sin API keys, sin formularios.

## 🛠️ Stack

| Capa | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS 4 + shadcn/ui |
| Charts | lightweight-charts (open source, de TradingView) |
| Estado | Zustand (con persistencia) |
| Iconos | lucide-react |
| Datos | Binance Public REST + WebSocket |
| Gestor de paquetes | bun |

## 📐 Arquitectura

```
src/
├── app/
│   ├── layout.tsx             # Root, fuente Inter, TooltipProvider, dark
│   ├── page.tsx               # Grilla multi-ventana + paneles
│   └── globals.css            # Paleta TradingView
├── components/
│   ├── chart/
│   │   ├── ChartLigero.tsx       # Chart de una ventana (velas + capas)
│   │   ├── IndicatorMenu.tsx     # Botón «Indicadores» (diálogo del registro)
│   │   ├── SymbolSelector.tsx    # Búsqueda de pares USDT
│   │   └── ModelSignals.tsx      # Carga/toggle del senales.json del modelo RL
│   ├── layout/
│   │   ├── Header.tsx            # Logo, selector, señales IA, heatmap, layout
│   │   ├── RightSidebar.tsx      # Contiene la watchlist
│   │   └── BottomPanel.tsx       # Stats 24h + botón del probador
│   ├── modelos/
│   │   ├── BarraModelosIA.tsx    # Barra de monitoreo en vivo (ancho completo)
│   │   ├── SelectorModelo.tsx    # Pestañas para alternar entre modelos
│   │   └── CeldaMetrica.tsx      # Celda reutilizable de métrica
│   ├── panel/
│   │   └── StrategyTester.tsx    # Registro de operaciones de la IA
│   ├── watchlist/
│   │   └── Watchlist.tsx         # Precios live multi-símbolo
│   └── ui/                       # shadcn primitives
└── lib/
    ├── binance/
    │   ├── rest.ts               # klines / ticker / exchangeInfo
    │   ├── ws.ts                 # WS multiplex + auto-reconnect
    │   └── types.ts
    ├── indicators/
    │   ├── index.ts              # SMA, EMA, RSI (Wilder), MACD (funciones puras)
    │   ├── registro.ts           # Registro de indicadores del chart (escalable)
    │   └── liquidations.ts       # Cálculo del Liquidation Heatmap
    ├── modelos/                  # ⭐ capa multi-modelo (ver abajo)
    │   ├── tipos.ts              # Contrato canónico EstadoModeloIA
    │   ├── adaptadores.ts        # Traducen el formato de cada motor
    │   ├── registro.ts           # Catálogo de modelos (escalable)
    │   ├── derivar.ts            # PnL, R/R, señal, duración (derivados)
    │   └── useModelosIA.ts       # Sondeo de todas las fuentes
    ├── store/
    │   ├── chart-store.ts        # Zustand global state
    │   └── modelos-store.ts      # Estado en vivo por modelo (efímero)
    ├── trades.ts                 # Reconstrucción de trades + métricas de la IA
    └── format.ts                 # formatPrice / formatPct / formatVolume
```

## 🤖 Varios modelos de IA a la vez

El visor monitorea **varios modelos en paralelo** (PPO, SAC y los que vengan).
Cada motor corre en su propio proyecto y publica su estado; el visor los
muestra en la **barra superior** con un selector para alternar entre ellos.

La clave es que **nada en la interfaz conoce un modelo concreto**: todos los
componentes consumen el contrato canónico `EstadoModeloIA` (`lib/modelos/tipos.ts`).

```
motor (SAC, PPO…)  →  adaptador  →  EstadoModeloIA  →  barra · gráfico · probador
   su propio formato              contrato canónico
```

Dos transportes soportados:

| Transporte | Cómo publica el motor | Ejemplo |
|---|---|---|
| `archivo` | escribe un JSON en `public/` que el visor sondea cada 5 s | SAC → `public/estado_vivo.json` |
| `websocket` | empuja mensajes por WS | PPO → `NEXT_PUBLIC_FEED_VIVO_URL` |

**Regla de diseño:** el motor publica **hechos** (precio de entrada, nocional,
stop loss); la interfaz calcula **lecturas** (PnL, riesgo/recompensa, señal,
duración). Por eso la barra y las marcas del gráfico salen del mismo estado y
no pueden contradecirse.

### Agregar un modelo nuevo

1. Que su motor publique el estado con el **contrato v1** (`lib/modelos/tipos.ts`).
2. Agregar **una entrada** en `lib/modelos/registro.ts`:

```ts
{
  id: "dqn",
  etiqueta: "DQN",
  descripcion: "Deep Q-Network · acciones discretas",
  color: "#26a69a",
  transporte: "archivo",
  url: "/estado_vivo_dqn.json",
  adaptar: adaptarContratoEstandar,
}
```

No hay que tocar la barra, el gráfico, el store ni el probador de estrategias.
Si el motor publica un formato propio, se escribe un adaptador en
`adaptadores.ts` — es la **única** pieza que conoce ese formato.

> Una fuente sin `url` (variable de entorno ausente) o cuyo archivo no existe
> se ignora en silencio: registrar un modelo antes de tenerlo entrenado no
> rompe nada, simplemente no aparece en el selector. Y si **ningún** motor está
> corriendo, la barra no ocupa espacio y el visor se ve como siempre.

## 🧠 Cómo funciona

### Multi-ventana
El selector de layout del header (1 / 2 / 4) arma una grilla de charts del
mismo par, cada uno con su timeframe (`ventanas` en el store). Al pasar a 4
ventanas se precargan 1m / 5m / 15m / 1d; cada ventana puede cambiarse con su
propia barra de timeframes.

### Datos históricos y en vivo
Cada ventana pide `GET /api/v3/klines` (hasta 1000 velas de su timeframe) y
se suscribe a una única conexión WebSocket multiplexada
(`stream.binance.com`):
- `<symbol>@kline_<interval>` → updates de la vela actual + cierre de velas
- `<symbol>@miniTicker` → tickers del watchlist

Al reconectarse (Binance corta el WS cada 24h) se vuelven a suscribir todos
los streams activos con backoff exponencial. Cada stream admite varios
suscriptores; se des-suscribe de Binance recién cuando se va el último.

### Indicadores (escalables)
`lib/indicators/registro.ts` es el catálogo: cada indicador declara sus
series (una EMA es 1 línea; el MACD son 2 líneas + histograma) y si va
superpuesto al precio o en un panel propio debajo. El botón «Indicadores»
del header lista el catálogo automáticamente, y el chart crea/quita las
series y paneles al activarlos. Para sumar un indicador nuevo (ej.
SuperTrend) alcanza con agregar una entrada al registro — el cálculo puro
vive en `lib/indicators/index.ts`.

En cada tick se actualiza solo el último punto; al cierre de vela se
recalcula la serie completa (para 1000 velas el costo es despreciable).

### Señales del modelo RL
`evaluar.py --checkpoint <dir> --guardar-curva` exporta
`evaluacion_<split>/senales.json`. El botón **Señales IA** del header lo
carga y: (1) dibuja cada apertura/cierre como flecha sobre las velas
(L/S/TP/SL/LIQ/C), (2) salta al período del backtest y (3) abre el
**Probador de estrategias** con los trades reconstruidos y sus métricas
(`lib/trades.ts`).

### Liquidation Heatmap
`lib/indicators/liquidations.ts` estima las zonas de liquidación al estilo
Coinglass a partir de datos públicos: por cada vela asume posiciones
apalancadas (100x/50x/25x/10x/5x, ponderadas por volumen) abiertas cerca del
cierre, ubica sus precios de liquidación y los va consumiendo cuando el
precio los atraviesa. El resultado se pinta en un canvas superpuesto al
chart, sincronizado con el rango visible de tiempo y precio.

## ⚠️ Qué NO incluye (todavía) — a implementar a futuro

- X Volume Profile Visible Range (como en TradingView una copia) con todos los estilos
- X Volume Footprint
- X Order Flow
