FROM node:20-slim

# 작업 디렉토리
WORKDIR /app

# 의존성 설치
COPY package*.json ./
RUN npm ci --only=production

# 빌드된 소스 복사
COPY dist/ ./dist/

# Cloud Run은 8080 포트 사용
EXPOSE 8080

# 실행
CMD ["node", "dist/index.js"]
