# Playwright's image already has Chromium and its system libraries.
FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=10000
EXPOSE 10000
CMD ["node", "server/index.mjs"]
