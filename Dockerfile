# 1단계: 빌드
FROM node:20-slim AS builder

WORKDIR /app

# 설정 파일 먼저 복사
COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci

# 소스 복사
COPY . .

# tsconfig를 명시해서 빌드
RUN npx tsc -p tsconfig.json


# 2단계: 실행
FROM node:20-slim

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/public ./dist/public
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

EXPOSE 8080

CMD ["node", "dist/index.js"]
