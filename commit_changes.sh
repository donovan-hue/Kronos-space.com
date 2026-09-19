#!/bin/bash

cd /workspaces/Kronos-space.com

echo "=== Estado del repositorio ==="
git status

echo ""
echo "=== Agregando cambios ==="
git add -A

echo ""
echo "=== Haciendo commit ==="
git commit -m "Tareas 39-42: Integración IA, flujo guiones, perfiles y autenticación

TAREA 39 - Integración con IA:
- Timeout 45s en proveedor OpenRouter
- Validación estricta de respuestas JSON
- Detección de respuestas truncadas
- Códigos de error específicos (TIMEOUT, INCOMPLETE)
- Persistencia de errores seguros sin exponer credenciales

TAREA 40 - Conectar guiones, usuario y proyectos:
- Validación de metadatos contra enums del modelo
- Manejo de errores en historial
- Estados de carga, vacío y error
- Restauración de configuración completa

TAREA 41 - Perfiles y datos de usuario:
- Perfil público sin exponer arrays de relaciones
- Conteos e isFollowing protegidos
- Consulta directa de publicaciones por usuario
- Total real de publicaciones del usuario

TAREA 42 - Autenticación definitiva:
- Diferenciación explícita de errores JWT
- Interceptor global para sesiones expiradas
- Logout automático en 401
- JWT HS256 con 7 días de expiración"

echo ""
echo "=== Push a repositorio remoto ==="
git push -u origin main

echo ""
echo "=== Resumen de cambios ==="
git log --oneline -1
