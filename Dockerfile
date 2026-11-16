FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Production mode: disables the localhost CORS convenience and the insecure dev-auth escape hatch.
ENV NODE_ENV=production

WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ .

# Don't run the API (and anything it might spawn) as root.
RUN mkdir -p uploads && chown -R node:node /app
USER node

EXPOSE 3001

CMD ["npm", "start"]
