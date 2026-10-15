FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build
RUN npm prune --omit=dev --legacy-peer-deps

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package*.json ./
EXPOSE 3000
ENV NODE_ENV=production
ENV HOST=0.0.0.0
USER node
CMD ["node", "build/index.js"]
