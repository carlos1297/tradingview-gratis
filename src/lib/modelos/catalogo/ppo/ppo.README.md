# Modelo PPO

Proximal Policy Optimization. A diferencia de SAC, **no escribe un archivo**:
expone un servicio que empuja su estado por WebSocket.

## De dónde salen los datos

| | |
|---|---|
| **Motor** | `modelo_PPO/main.py`, en el repo **RL_PPO** (proyecto aparte) |
| **Transporte** | `websocket` — el servicio empuja, el visor escucha |
| **URL** | `NEXT_PUBLIC_FEED_VIVO_URL` (p. ej. `ws://127.0.0.1:8000/ws`) |
| **Activación** | opt-in: **sin esa variable la fuente queda desactivada** y PPO no aparece en el selector |

## Particularidades frente al transporte de archivo

1. **Eventos incrementales.** Cada mensaje trae solo las señales nuevas del tick
   (`eventos`), no la lista completa. El adaptador las acumula sobre el estado
   previo — por eso un corte de socket tiene una gracia de 3 s antes de retirar
   el modelo: perderlo borraría las operaciones cerradas de la corrida.
2. **La frescura se mide por hora de recepción**, no por el `tiempoMs` del
   mensaje. El servicio suele correr en **replay** sobre datos históricos, y con
   su reloj el semáforo marcaría `DETENIDO` para siempre.
3. **`enVivo: false`.** En replay es obligatorio: sin eso el visor compararía un
   precio de entrada de hace dos años contra el BTC de hoy y mostraría un PnL de
   cientos de por ciento que no existe.
4. **Reconexión sola** con backoff 1 s → 10 s. Un servicio que todavía carga
   TensorFlow, o un replay que reinicia entre pasadas, no dejan el modelo caído.

## Archivos de este modelo

```
ppo.fuente.ts                        el alta en el visor
ppo.feed.ts                          envoltorio de compatibilidad del cliente WS
ppo.README.md                        este archivo
__tests__/ppo.integracion.test.ts    contrato ejecutable
__tests__/fixtures/estado_ppo_v1_ws.json
```

`ppo.feed.ts` existía como `lib/liveFeed.ts` y era la API pública del cliente
WebSocket del servicio. Se conserva porque puede estar importado desde fuera,
pero **delega en `nucleo/transportes/websocket.ts`**: no hay dos
implementaciones. Código nuevo no debería usarlo — alcanza con la entrada del
catálogo.

## Ver también

- [`../../../../docs/CONTRATO_MODELOS.md`](../../../../../docs/CONTRATO_MODELOS.md) §2.2 — el protocolo WebSocket
- [`../sac/sac.README.md`](../sac/sac.README.md) — el mismo contrato por archivo
