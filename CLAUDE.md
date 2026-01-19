# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # 개발 서버 실행 (nodemon + ts-node)
npm run build        # TypeScript 컴파일 (dist/ 출력)
npm start            # 프로덕션 서버 실행

npm run docker:build # Docker 이미지 빌드
npm run docker:run   # Docker 컨테이너 실행 (.env 파일 필요)
```

## Architecture

NaverWorks Bot 백엔드 - Express.js + TypeScript, GCP Cloud Run 배포

### Request Flow
```
NaverWorks Bot → POST /webhook → botController → naverworks/message → 사용자 응답
```

### Token Management
- **토큰 정보는 환경변수가 아닌 MSSQL DB(EnvConfig 테이블)에 저장**
- `envDB.ts`: DB에서 `CLIENT_ID`, `CLIENT_SECRET`, `refresh_token`, `access_token` 조회/저장
- `auth.ts`: refresh_token으로 access_token 발급, 실패 시 최대 3회 재시도
- 토큰 갱신 시 새 refresh_token도 함께 저장됨

### Permission System (3단계)
- `USER`: 본인 정보만 조회
- `ADMIN`: 전체 정보 조회
- `SUPER_ADMIN`: 전체 조회 + DB 수정

권한은 `UserPermissions` 테이블에서 NaverWorks userId로 조회

### Required DB Tables
- `EnvConfig(key, value, updatedAt)` - 토큰 및 API 자격증명
- `UserPermissions(userId, role)` - 사용자 권한

## Deployment

GitHub main 브랜치 푸시 시 Cloud Build가 자동 배포 (cloudbuild.yaml)
- 리전: asia-northeast3 (서울)
- 포트: 8080
