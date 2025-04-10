FROM node:22-alpine

RUN apk add --no-cache ffmpeg python3 py3-setuptools make g++

WORKDIR /app

COPY . .

RUN npm ci --verbose --cache ./cache && \
  npm run build && \
  rm -rf ./cache && \
  apk del --purge py3-setuptools make g++ 

CMD ["node", "dist/index.js"]
