# Kronos Space

[![Kronos Space - CI](https://github.com/donovan-hue/Kronos-space.com/actions/workflows/ci.yml/badge.svg?event=push)](https://github.com/donovan-hue/Kronos-space.com/actions/workflows/ci.yml)
[![Kronos E2E (MongoDB real)](https://github.com/donovan-hue/Kronos-space.com/actions/workflows/kronos-e2e.yml/badge.svg?event=pull_request)](https://github.com/donovan-hue/Kronos-space.com/actions/workflows/kronos-e2e.yml)
[![Kronos Guardian](https://github.com/donovan-hue/Kronos-space.com/actions/workflows/kronos-guardian.yml/badge.svg?event=pull_request)](https://github.com/donovan-hue/Kronos-space.com/actions/workflows/kronos-guardian.yml)
[![Kronos Deploy Verify](https://github.com/donovan-hue/Kronos-space.com/actions/workflows/verify-deploy.yml/badge.svg?event=workflow_dispatch)](https://github.com/donovan-hue/Kronos-space.com/actions/workflows/verify-deploy.yml)
[![Kronos Auth Smoke Test](https://github.com/donovan-hue/Kronos-space.com/actions/workflows/smoke-auth.yml/badge.svg?event=workflow_dispatch)](https://github.com/donovan-hue/Kronos-space.com/actions/workflows/smoke-auth.yml)

## Dirección oficial

La única URL pública para usuarios es:

**https://kronos-space.com**

- `https://www.kronos-space.com` y el alias histórico de Vercel redirigen al dominio oficial conservando la ruta.
- Los enlaces de perfiles y publicaciones siempre se generan con el dominio oficial.
- `https://api.kronos-space.com` es infraestructura interna de la aplicación; no es una segunda página para usuarios.
- Las URLs únicas de preview de Vercel/Arena se usan exclusivamente para revisión técnica y no deben publicarse como acceso a producción.
- `krono-space.com` (sin la **s**) no pertenece a este proyecto y nunca debe mostrarse ni enlazarse.

## Desarrollo

```bash
npm ci
npm run dev
```

Frontend local: `http://localhost:3000`. API local: `http://localhost:5000`.
