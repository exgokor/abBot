# CLAUDE.md

NaverWorks Bot 백엔드 - Express.js + TypeScript, GCP Cloud Run 배포

## Commands

```bash
npm run dev          # 개발 서버 실행
npm run build        # TypeScript 컴파일
npm start            # 프로덕션 서버 실행
```

## Architecture

### Request Flow
```
NaverWorks Bot → POST /webhook → botController → naverworks/message → 사용자 응답
```

### Token Management
- 토큰은 MSSQL DB `EnvConfig` 테이블에 저장 (환경변수 아님)
- `auth.ts`: refresh_token으로 access_token 발급, 실패 시 최대 3회 재시도

### Permission System
- `USER` / `ADMIN` / `SUPER_ADMIN` 3단계
- `UserPermissions` 테이블에서 NaverWorks userId로 조회

## Deployment

GitHub main 브랜치 푸시 → Cloud Build 자동 배포
- 리전: asia-northeast3
- 포트: 8080

## 매출조회 챗봇

### 색상
- 배경: `#F0F8FF`, 버튼: `#1D3A8F`, 본문: `#000000`, 보조: `#666666`

### 금액 표시
- `formatMoney()`: X.X백만, `formatMoneyInt()`: X백만

### 뷰 생성
```bash
npx ts-node src/scripts/createViews.ts
```
> 모든 뷰는 `_byClaude` 접미사
