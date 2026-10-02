FROM node:24.19.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
WORKDIR /app
COPY . .
RUN npm run build:node

FROM node:24.19.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
# PORT намеренно не задан: Northflank его не подставляет, поэтому без него запускающий скрипт
# слушает сразу 8080 и 3000, и любой из этих номеров в port entry доходит до игры.
# Другой номер — через PORT (или PORTS через запятую) в переменных сервиса.
COPY --from=build --chown=node:node /app/dist/standalone ./
USER node
EXPOSE 8080 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "const p=(process.env.PORTS||process.env.PORT||'8080').split(',')[0].trim();fetch('http://127.0.0.1:'+p+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "northflank-serve.mjs"]
