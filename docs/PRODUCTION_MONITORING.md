# Monitoreo de producción ElMenúXFA

El health útil está en `GET https://elmenuxfa.com/api/health`.
No hace carga de menú. Responde en pocos segundos incluso si Supabase está lento.

Forma esperada cuando todo va bien:

```json
{
  "ok": true,
  "supabase": "healthy",
  "latencyMs": 350,
  "timestamp": "2026-09-19T00:00:00.000Z",
  "version": "<sha o deployment id>"
}
```

- `ok: false` o `supabase: "down"` = Vercel no puede completar REST.
- `supabase: "degraded"` = REST ok, Auth falló.
- `latencyMs` > 2000 = degradación aunque `ok` sea true.

## Better Uptime (o similar)

1. Crear un monitor HTTP GET a `https://elmenuxfa.com/api/health`.
2. Timeout del monitor: 8s (el endpoint aborta pings a 4s).
3. Considerar caída si el status no es 200 o el body no tiene `"ok":true`.
4. Alertar si `latencyMs` > 2000 en 2 checks seguidos.
5. No apuntes el monitor a `/api/menu/*` ni a `POST /api/orders`.

## Vercel Monitoring

En el proyecto `kosmenu`:

- Observability → Function duration / errors para `/api/health`, `/api/menu/[comercioId]`, `/api/orders`.
- Alerta si error rate de esas rutas > 5% en 5 minutos.
- Alerta si duration p95 de `/api/menu` > 4s.

## Sentry (opcional)

1. Crear proyecto Next.js.
2. Añadir `SENTRY_DSN` en Vercel (Production).
3. Alertas: 5xx > 5% o timeout `supabase_circuit_open` / `MENU_UNAVAILABLE`.

## Qué no hacer

- No cronear `/api/health` más de 1 vez por minuto.
- El workflow `.github/workflows/prod-uptime.yml` ya pega cada 10 min. Si Supabase está caído, pausa ese workflow para no saturar Hobby.
