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

---

## 매출조회 챗봇 Flexible Template 디자인 규격

### 색상 팔레트
| 용도 | 색상코드 | 설명 |
|------|---------|------|
| 배경 | `#F0F8FF` | 연한 하늘색 (버블 body) |
| 콘텐츠 박스 | `#FFFFFF` | 흰색 (내부 박스 배경) |
| 버튼 | `#1D3A8F` | 네이비 |
| 본문 텍스트 | `#000000` | 검정 |
| 보조 텍스트 | `#666666` | 진한 회색 |
| 연한 텍스트 | `#999999` | 연한 회색 (기간 표시 등) |
| 구분선 | `#E5E5E5` | 매우 연한 회색 |

### 로고 이미지 설정
```typescript
{
  type: 'image',
  url: 'https://storage.worksmobile.com/k1/drive/r/24101/300118260/300118260/@2001000000362831/3472530909344205321?fileId=...',
  aspectRatio: '5:3',
  size: 'md',           // 50% 크기
  aspectMode: 'fit'     // PNG 대응
}
```

### 콘텐츠 박스 스타일 (둥근 모서리)
```typescript
{
  type: 'box',
  layout: 'vertical',
  contents: [...],
  paddingAll: '15px',
  margin: 'lg',
  backgroundColor: '#FFFFFF',  // 흰색 배경
  cornerRadius: '10px'         // 둥근 모서리
}
```

### 금액 표시 규격
- **단위**: 백만원
- **일반 표시**: `X.X백만` (소수점 1자리) - `formatMoney()`
- **정수 표시**: `X백만` (소수점 없음) - `formatMoneyInt()`
- **예시**: `217.3백만`, `89백만`

### 매출 추이 표시
```
월평균 매출    217.3백만
(248.6 → 199.7 → 203.5)
```
- 첫 줄: 월평균 (bold, lg)
- 둘째 줄: 월별 추이 (괄호, 화살표 연결, xs)

### 조회 기간 표시
- **위치**: 제목 바로 아래 (가운데 정렬)
- **포맷**: `YYYY.M ~ YYYY.M (N개월)`
- **스타일**: `size: xs`, `color: #999999`

### 캐러셀 구성 (지역 조회 예시)
1. **요약 버블**: 지역 전체 월평균 + 추이 + 거래 병원/품목 수 + [TOP5 병원][TOP5 품목] 버튼
2. **TOP3 병원 버블들**: 각 병원별 월평균 + 추이 + 품목별 매출 (TOP3 + 기타) + [상세보기] 버튼
3. **요약+기간변경 버블**: 주요 품목별 매출 (더보기 링크) + [6개월][1년] 버튼

### 버튼 스타일
```typescript
{
  type: 'button',
  action: { type: 'postback', label: '...', data: '...' },
  style: 'primary',
  height: 'sm',
  color: '#1D3A8F'
}
```

### 더보기 텍스트 링크 (드릴다운)
```typescript
{
  type: 'text',
  text: '더보기',
  size: 'xxs',
  color: '#1D3A8F',
  decoration: 'underline',
  action: {
    type: 'postback',
    label: '더보기',
    data: JSON.stringify({
      action: 'drill_down',
      type: 'drug_region_detail',
      context: { drug_cd, drug_name, region, period_months }
    })
  }
}
```

### Postback Action Types
| action | type | 설명 |
|--------|------|------|
| `drill_down` | `top_hospitals` | TOP N 병원 |
| `drill_down` | `top_drugs` | TOP N 품목 |
| `drill_down` | `hospital_detail` | 병원 상세 |
| `drill_down` | `drug_region_detail` | 지역+품목 상세 |
| `change_period` | - | 기간 변경 (3/6/12개월) |

### 테스트 스크립트
```bash
npx ts-node src/scripts/test-region-carousel.ts
```

### 뷰 생성 스크립트
```bash
npx ts-node src/scripts/createViews.ts
```
> 모든 뷰는 `_byClaude` 접미사로 구분
