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

### 색상 팔레트

| 용도 | 색상코드 | 설명 |
|------|---------|------|
| 헤더/푸터 | `#0D1B4C` | 진한 네이비 (darkNavy) |
| 본문 배경 | `#F0F8FF` | 연한 하늘색 (background) |
| 콘텐츠 상자 | `#FFFFFF` | 흰색 (white) |
| 버튼 primary | `#1D3A8F` | 네이비 (navy) |
| 버튼 secondary | `#DCEAF7` | 연한 파랑 (lightBlue) |
| 본문 텍스트 | `#000000` | 검정 (text) |
| 보조 텍스트 | `#666666` | 중간 회색 (subtext) |
| 비활성 텍스트 | `#999999` | 연한 회색 (lightGray) |
| 구분선 | `#E5E5E5` | 매우 연한 회색 (border) |

### 금액 표시

- `formatMoney()`: X.X백만, `formatMoneyInt()`: X백만

### 뷰 생성

```bash
npx ts-node src/scripts/createViews.ts
```

> 모든 뷰는 `_byClaude` 접미사

### 네이버웍스메시지 테스트보낼 UserId

73524122-e756-4c53-179e-0378b4ad90b5
