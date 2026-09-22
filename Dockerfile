# A-10 — Imagen de producción de la API Kronos Space.
#
# Render usa runtime nativo de Node (ver render.yaml); este Dockerfile es
# para autohospedaje (VPS, Fly.io, etc.) y reproduce el mismo entorno:
# Node 22, solo dependencias de producción, usuario sin privilegios.
#
# Construir:  docker build -t kronos-space-api .
# Ejecutar:   docker run -p 5000:5000 --env-file server/.env \
#               -v kronos-uploads:/data kronos-space-api
#
# Variables obligatorias: JWT_SECRET, MONGODB_URI, CLIENT_URL (ver
# server/.env.example). Los uploads persisten en el volumen /data.

FROM node:22-slim AS base

ENV NODE_ENV=production \
    PORT=5000 \
    UPLOADS_DIR=/data/uploads

WORKDIR /app

# Solo lo necesario para instalar el workspace del servidor (el cliente
# se despliega aparte; .dockerignore excluye el resto del contexto).
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
RUN npm ci --workspace=server --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY server/src server/src

# Volumen de uploads + usuario sin privilegios.
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node

EXPOSE 5000
VOLUME /data

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/api/health').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "server/src/server.js"]
