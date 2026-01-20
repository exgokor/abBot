# 1단계: 빌드용 이미지
FROM node:20-slim AS builder

WORKDIR /app

# 의존성 설치 (dev 포함, 빌드 필요하니까)
COPY package*.json ./
RUN npm ci

# 전체 소스 복사
COPY . .

# 빌드 실행 → dist 생성
RUN npm run build


# 2단계: 실행용 이미지 (가볍게)
FROM node:20-slim

WORKDIR /app

# 빌드 결과물만 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Cloud Run 포트
EXPOSE 8080

# 실행
CMD ["node", "dist/index.js"]

