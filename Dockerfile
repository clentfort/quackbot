FROM node:25-alpine

RUN apk add --no-cache ffmpeg python3 py3-setuptools make g++ curl unzip

RUN curl -fsSL https://deno.land/x/install/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

WORKDIR /app

COPY . .

RUN npm ci --verbose --cache ./cache && \
  npm run build && \
  rm -rf ./cache && \
  apk del --purge py3-setuptools make g++ 

CMD ["node", "dist/index.js"]
