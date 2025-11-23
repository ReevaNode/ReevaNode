# ============================================
# DOCKERFILE PARA REEVA - HOSPITAL MANAGEMENT SYSTEM
# ============================================

# Etapa 1: Builder
FROM public.ecr.aws/docker/library/node:18-alpine AS builder

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependencias (usar npm install si no hay package-lock.json)
RUN npm install --production

# Etapa 2: Production
FROM node:18-alpine

# Variables de entorno por defecto
ENV NODE_ENV=production \
    PORT=3001

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copiar node_modules desde builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copiar código de la aplicación
COPY --chown=nodejs:nodejs . .

# Cambiar a usuario no-root
USER nodejs

# Exponer puerto
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de inicio
CMD ["npm", "start"]
