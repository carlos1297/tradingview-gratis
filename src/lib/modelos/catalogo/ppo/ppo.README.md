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

## Probarlo sin modelo entrenado

El motor tiene un **modo demostración** que no necesita checkpoint, dataset ni
TensorFlow: el mismo motor de paper trading (simulador con comisiones, SL/TP,
liquidación y el contrato v1) corriendo sobre un mercado sintético y una
política de juguete. Sirve para ver la integración completa —barra, caja en el
gráfico, flechas, Probador— antes de que exista un modelo.

```bash
# en el repo RL_PPO (proyecto aparte):
./ejecutar.py --demo          # levanta el feed + este visor y los conecta
```

En el panel aparece como **PPO · demo**, con `checkpoint` en «—»: es la señal de
que no hay modelo entrenado detrás y los resultados no significan nada. Detalle
en `modelo_PPO/demo_feed.py` de ese repo.

## Archivos de este modelo

```
ppo.fuente.ts                        el alta en el visor
ppo.README.md                        este archivo
__tests__/ppo.integracion.test.ts    contrato ejecutable
__tests__/fixtures/estado_ppo_v1_ws.json
```

Eso es **todo** lo que el visor sabe de PPO: no hay adaptador propio ni cliente
WebSocket a medida. El transporte lo pone `nucleo/transportes/websocket.ts` y la
traducción `nucleo/adaptadores.ts`, los mismos que usaría cualquier otro motor
que hable el contrato v1.

## Ver también

- [`../../../../docs/CONTRATO_MODELOS.md`](../../../../../docs/CONTRATO_MODELOS.md) §2.2 — el protocolo WebSocket
- [`../sac/sac.README.md`](../sac/sac.README.md) — el mismo contrato por archivo
