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

## 📚 Documentación

| Documento | Para qué |
|---|---|
| [docs/BIBLIOTECA_MODELOS.md](docs/BIBLIOTECA_MODELOS.md) | Catálogo de componentes compartidos: qué ofrece la plataforma y cómo lo usa un modelo |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Capas, dependencias, flujo de datos, responsabilidad de cada módulo |
| [docs/CONTRATO_MODELOS.md](docs/CONTRATO_MODELOS.md) | El contrato JSON campo por campo: obligatorios, opcionales, errores |
| [docs/INTEGRAR_MODELO.md](docs/INTEGRAR_MODELO.md) | Guía paso a paso para conectar un modelo nuevo, con código |
| [docs/contrato/estado_vivo.schema.json](docs/contrato/estado_vivo.schema.json) | JSON Schema para validar tu motor automáticamente |

## 🤖 Varios modelos de IA a la vez

El visor monitorea **varios modelos en paralelo** (SAC, PPO y los que vengan).
Cada motor corre en su propio proyecto y publica su estado; el visor los muestra
en una barra de ancho completo con un selector para alternar entre ellos.

La clave es que **nada en la interfaz conoce un modelo concreto**: todos los
componentes consumen el contrato canónico `EstadoModeloIA`.

```
motor (SAC, PPO…) → transporte → adaptador → EstadoModeloIA → barra · gráfico · probador
   su formato        cómo viajan   traduce     contrato único
                      los bytes
```

**Regla de diseño:** el motor publica **hechos** (precio de entrada, nocional,
stop loss); la interfaz calcula **lecturas** (PnL, riesgo/recompensa, señal,
duración). Por eso la barra, el gráfico y el Probador no pueden contradecirse.

### Agregar un modelo nuevo

**Sin tocar código**, si tu motor publica el contrato v1 — una variable de entorno:

```bash
NEXT_PUBLIC_MODELOS_EXTRA=[{"id":"dqn","etiqueta":"DQN","url":"/estado_dqn.json"}]
```

**O en el registro** (`lib/modelos/registro.ts`), si querés que venga de fábrica
o si tu motor tiene formato propio:

```ts
{
  id: "dqn",
  etiqueta: "DQN",
  descripcion: "Deep Q-Network · acciones discretas",
  color: "#26a69a",
  transporte: "archivo",
  url: "/estado_dqn.json",
  adaptar: adaptarContratoEstandar,
}
```

En los dos casos: no se toca la barra, el gráfico, el store ni el Probador. El
paso a paso completo está en [docs/INTEGRAR_MODELO.md](docs/INTEGRAR_MODELO.md).

> Una fuente sin `url` o cuyo archivo no existe se ignora en silencio: registrar
> un modelo antes de tenerlo entrenado no rompe nada, simplemente no aparece en
> el selector. Y si **ningún** motor está corriendo, la barra no ocupa espacio y
> el visor se ve como siempre.

## 🧪 Verificación

```bash
bun run verificar   # tsc --noEmit && eslint && bun test src
bun test src        # 223 tests del contrato multi-modelo
```

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

### Probador de estrategias con modelos en vivo

El Probador funciona igual con un `senales.json` de backtest que con un motor
en vivo (SAC, PPO…): las dos fuentes terminan en el mismo store
(`chart-store.modelSignals`), así que **no hay código por modelo**.

Quién alimenta qué:

| Fuente | Cómo llega | Abre el panel |
|---|---|---|
| `senales.json` manual (botón «Señales IA») | `setModelSignals(f)` | Sí — lo acabás de pedir |
| Modelo en vivo del registro | `useSincronizarSenales()` → `setModelSignals(f, { abrirPanel: false })` | No — respeta si lo cerraste |

Dos reglas que conviene conocer:

**1. Solo manda el modelo ACTIVO.** Al cambiar de pestaña en el selector, el
Probador se recalcula con las operaciones de ese modelo. Mezclar dos motores
daría un win rate y un factor de beneficio sin significado.

**2. La operación ABIERTA no entra en las estadísticas.** Se muestra aparte, en
una franja propia arriba del panel (lado, entrada, precio actual, PnL flotante,
tamaño, duración, SL y TP). Sumarla al win rate o al profit factor los
falsearía: su resultado todavía no existe. Por eso un modelo recién arrancado
—con posición abierta y ningún cierre— muestra la franja y el aviso «sin
operaciones cerradas todavía», en vez de tablas vacías.

> Las métricas (`lib/trades.ts`) se calculan **solo sobre cierres**:
> `buildOperaciones()` empareja cada `abrir_*` con su `cerrar_*` y descarta la
> apertura sin pareja.

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
