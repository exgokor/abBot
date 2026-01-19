# Database Queries Guide

## 개요
이 폴더는 NaverWorks Bot에서 사용하는 DB 쿼리를 관리합니다.
요청별로 `.sql` 파일을 생성하여 쿼리를 저장하고, TypeScript에서 불러와 사용합니다.

## DB 연결 정보
- Server: MS SQL Server (gabiadb.com)
- Database: ajubio
- 연결: `src/services/database/connection.ts`

## 사용 방법

### 1. SQL 파일 작성
```sql
-- queries/getSalesData.sql
SELECT
  hospitalCode,
  hospitalName,
  SUM(amount) as totalAmount
FROM Sales
WHERE year = @year AND month = @month
GROUP BY hospitalCode, hospitalName
```

### 2. TypeScript에서 호출
```typescript
import { executeQuery } from '../connection';

const result = await executeQuery<SalesData>(
  `SELECT * FROM Sales WHERE year = @year`,
  { year: 2025 }
);
```

## 파일 구조
```
src/services/database/queries/
├── claude.md              # 이 파일 (가이드)
├── index.ts               # 쿼리 실행 헬퍼 함수
├── sales.sql              # 매출 관련 쿼리
├── hospital.sql           # 병원 관련 쿼리
├── inventory.sql          # 재고 관련 쿼리
└── user.sql               # 사용자 관련 쿼리
```

## 테이블 스키마
(테이블 정보는 사용자 요청에 따라 추가)

### NaverWorks (토큰 저장)
| Column    | Type         | Description      |
|-----------|--------------|------------------|
| key       | VARCHAR(100) | 키 (PRIMARY KEY) |
| value     | TEXT         | 암호화된 값      |
| updatedAt | DATETIME     | 수정일시         |

### UserPermissions (권한)
| Column | Type         | Description                    |
|--------|--------------|--------------------------------|
| userId | VARCHAR(100) | NaverWorks userId (PRIMARY KEY)|
| role   | VARCHAR(20)  | USER / ADMIN / SUPER_ADMIN     |

## 쿼리 작성 규칙
1. 파라미터는 `@paramName` 형식 사용 (SQL Injection 방지)
2. 주석으로 쿼리 목적 설명
3. 복잡한 쿼리는 View로 만들어서 사용 권장

---

## 비즈니스 테이블 스키마

### CSO_TBL (협력사/딜러 정보)
CSO(협력사) 및 딜러 정보를 관리하는 테이블

| Column | Type | Description |
|--------|------|-------------|
| cso_cd | nvarchar(28) | cso별 고유코드 (PK) |
| cso_corp_nm | nvarchar(43) | 협력사명 |
| cso_dealer_nm | nvarchar(30) | 딜러이름 |
| cso_corp_type | nvarchar(24) | 개인/법인 구분 |
| cso_origin | nvarchar(24) | 과거소속된 회사명 |
| cso_type | nvarchar(23) | 내부 구분용 (OB/신규/자사직원) |
| cso_home_addr | nvarchar(86) | 자택주소 |
| cso_phone | nvarchar(29) | 핸드폰번호 (010 생략) |
| cso_email | nvarchar(45) | 이메일주소 |
| cso_email2 | nvarchar(43) | 보조이메일주소 |
| cso_public_cd | nvarchar(42) | 신고번호 |
| cso_corp_cd | nvarchar(32) | 사업자번호 |
| cso_corp_addr | nvarchar(78) | 사업자상 주소지 |
| cso_bank_nm | nvarchar(26) | 사업자은행명 |
| cso_bank_cd | nvarchar(37) | 계좌번호 |
| cso_payType | nvarchar(26) | 계산서발행타입 (역발행/국세청) |
| cso_sendbill_id | nvarchar(37) | 역발행 시 센드빌 ID |
| cso_biz_category | nvarchar(64) | 업종 |
| cso_biz_type | nvarchar(97) | 업태 |
| cso_birth | nvarchar(36) | 생년월일 |
| cso_is_valid | nvarchar(21) | 현재유효여부 |
| cso_works_id | nvarchar(20) | 웍스ID |
| cso_works_folder_id | nvarchar(20) | 웍스폴더아이디 |
| cso_start_year | SmallInt | 시작년 |
| cso_start_month | SmallInt | 시작월 |
| cso_start_index | SmallInt | 시작년월인덱스 |
| cso_end_year | SmallInt | 종료년 |
| cso_end_month | SmallInt | 종료월 |
| cso_end_index | SmallInt | 종료년월인덱스 |
| update_at | DateTime | 업데이트일시 |

---

### HOSPITAL_TBL (병원 정보)
병원 마스터 테이블

| Column | Type | Description |
|--------|------|-------------|
| hos_cd | nvarchar(27) | 병원코드1 (PK) |
| hos_cso_cd | nvarchar(25) | 병원코드2 |
| hos_abbr | nvarchar(38) | 병원약어명 |
| hos_type | nvarchar(28) | 병원종별 |
| hos_name | nvarchar(78) | 병원풀네임 |
| hos_addr | nvarchar(154) | 병원전체주소 |
| hos_addr1 | nvarchar(24) | 병원 Depth1 (시/도) |
| hos_addr2 | nvarchar(28) | 병원 Depth2 (구/군) |
| hos_addr3 | nvarchar(26) | 병원 Depth3 |
| hos_addr4 | nvarchar(34) | 병원 Depth4 |
| hos_hira | nvarchar(100) | 심평원고유코드 |
| hos_sgg_cd | nvarchar(26) | 심평원시군구코드 |
| hosIndex | nvarchar(33) | 병원시군구명 |
| news_word | nvarchar(33) | 뉴스 키워드 |
| ubi_addr | nvarchar(48) | 유비스트 지역구명 |
| sfa_cd | nvarchar(32) | 과거병원코드 |
| hos_corp_cd | nvarchar(30) | 병원사업자번호 |
| hos_lat | nvarchar(31) | 병원위도 |
| hos_lon | nvarchar(30) | 병원경도 |
| hos_admin | nvarchar(26) | 병원담당직원 |
| update_at | DateTime | 업데이트일시 |

---

### DRUG_TBL (의약품 정보)
의약품 마스터 테이블

| Column | Type | Description |
|--------|------|-------------|
| drug_cd | nvarchar(33) | 의약품코드 (PK) |
| drug_name | nvarchar(50) | 의약품명 |
| drug_class | nvarchar(36) | 의약품분류 |
| drug_isvalid | nvarchar(21) | 의약품유효여부 |
| drug_price | Integer | 약가 |
| drug_totRate | Decimal | 수수료율 |
| drug_dpRate | Decimal | 딜러공개용 수수료율 |
| drug_dpABRate | Decimal | 딜러공개용 법인수수료율 |
| drug_ABmarginRate | Decimal | 아주바이오 수익률 |
| drug_category | nvarchar(28) | 의약품 진료과분류 |
| drug_type | nvarchar(48) | 의약품 질환분류 |
| drug_ingr | nvarchar(111) | 성분명 |
| drug_ingr_eng | nvarchar(119) | 성분명(영어) |
| drug_manufac | nvarchar(28) | 제약사이름 |
| drug_manufac_type | nvarchar(28) | 자사생산여부 |
| drug_ubi_atc_cd | nvarchar(20) | 유비스트코드 |
| drug_ubi_vs_product | nvarchar(20) | 유비스트 상경쟁품코드 |
| start_year | SmallInt | 의약품 유효시작년 |
| start_month | SmallInt | 의약품 유효시작월 |
| start_index | SmallInt | 의약품 유효시작 년/월인덱스 |
| end_year | SmallInt | 의약품 유효종료년 |
| end_month | SmallInt | 의약품 유효종료월 |
| end_index | SmallInt | 의약품 유효종료 년/월인덱스 |
| drug_index | SmallInt | 의약품 내부 분류숫자 |
| update_at | DateTime | 업데이트일시 |

---

### BLOCK_TBL (블록/담당 배정)
병원-의약품-CSO 담당 배정 정보

| Column | Type | Description |
|--------|------|-------------|
| hos_cd | nvarchar(27) | 병원코드1 |
| hos_cso_cd | nvarchar(25) | 병원코드2 |
| drug_cd | nvarchar(33) | 의약품코드 |
| seq | nvarchar(21) | 블록순서 |
| cso_cd | nvarchar(28) | cso별 고유코드 (FK → CSO_TBL) |
| block_isvalid | nvarchar(21) | 블록 현재유효여부 |
| disease_type | nvarchar(43) | 진료과 |
| isFirst | nvarchar(21) | 최초담당여부 |
| start_year | SmallInt | 블록시작년 |
| start_month | SmallInt | 블록시작월 |
| start_index | SmallInt | 블록시작 년월인덱스 |
| end_year | SmallInt | 블록종료년 |
| end_month | SmallInt | 블록종료월 |
| end_index | SmallInt | 블록종료 년월인덱스 |
| update_at | DateTime | 업데이트일시 |

---

### SALES_TBL (매출/처방 데이터)
처방 및 정산 데이터

| Column | Type | Description |
|--------|------|-------------|
| hos_cd | nvarchar(27) | 병원코드1 |
| hos_cso_cd | nvarchar(25) | 병원코드2 |
| drug_cd | nvarchar(33) | 의약품코드 |
| seq | nvarchar(21) | 블록순서 |
| cso_cd_then | nvarchar(28) | 당시 정산받은 CSO코드 |
| drug_cnt | Decimal | 수량 |
| drug_price | Decimal | 당시 약가 |
| rx_type | nvarchar(23) | 원내/원외 |
| drug_ws_fee | Decimal | 도매수수료 |
| pay_rate | Decimal | 정산비율 (1, 0.7, 0) |
| sales_year | SmallInt | 처방년 |
| sales_month | SmallInt | 처방월 |
| sales_index | SmallInt | 처방 년월인덱스 |
| pay_year | SmallInt | 정산년 |
| pay_month | SmallInt | 정산월 |
| pay_index | SmallInt | 정산 년월인덱스 |
| update_at | DateTime | 업데이트일시 |

---

### EXCEPTRATE_TBL (예외 수수료율)
특정 CSO/병원/의약품 조합에 대한 예외 수수료율

| Column | Type | Description |
|--------|------|-------------|
| cso_cd | nvarchar(28) | cso별 고유코드 |
| max_hos_cd | nvarchar(27) | 병원코드1 최대값 |
| max_hos_cso_cd | nvarchar(25) | 병원코드2 최대값 |
| min_hos_cd | nvarchar(27) | 병원코드1 최소값 |
| min_hos_cso_cd | nvarchar(25) | 병원코드2 최소값 |
| drug_cd | nvarchar(33) | 의약품코드 |
| rx_type | nvarchar(23) | 원내/원외 |
| drug_totRate | Decimal | 전체수수료율 |
| drug_dpRate | Decimal | 딜러공개용 수수료율 |
| drug_dpABRate | Decimal | 딜러공개용 법인수수료율 |
| drug_ABmarginRate | Decimal | 아주바이오 수익률 |
| sales_start_index | SmallInt | 적용 년월인덱스 |
| sales_end_index | SmallInt | 종료 년월인덱스 |
| update_at | DateTime | 업데이트일시 |

---

## 테이블 관계도 (ERD 요약)

### 사용자 조회 흐름 (NaverWorks → 매출)
```
[NaverWorks Bot에서 userId 수신]
           ↓
NaverWorks_UserInfo_TBL (userId → email)
           ↓ email로 조인
CSO_TBL (email → cso_cd)  ※ 1:N 가능 (한 사람이 여러 CSO코드 보유)
           ↓ cso_cd로 조인
BLOCK_TBL (cso_cd → 담당 병원/품목 배정)
     ├── hos_cd → HOSPITAL_TBL
     └── drug_cd → DRUG_TBL
           ↓ hos_cd + drug_cd로 조인
SALES_TBL (처방/매출 데이터)
```

### 테이블 관계
```
NaverWorks_UserInfo_TBL
    │ email
    ↓
CSO_TBL (cso_email = email, 1:N)
    │ cso_cd
    ├───→ BLOCK_TBL (담당배정)
    │         │ hos_cd, drug_cd
    │         ├───→ HOSPITAL_TBL (병원)
    │         └───→ DRUG_TBL (의약품)
    │
    └───→ SALES_TBL (cso_cd_then = cso_cd)
              │ hos_cd, drug_cd
              ├───→ HOSPITAL_TBL
              └───→ DRUG_TBL

EXCEPTRATE_TBL ─── CSO/병원/의약품 조합별 특수 수수료율
```

## 주요 조인 패턴

### 1. userId로 CSO 코드 조회 (1:N)
```sql
-- NaverWorks userId → email → cso_cd (복수 가능)
SELECT c.cso_cd, c.cso_dealer_nm, c.cso_corp_nm
FROM NaverWorks_UserInfo_TBL u
JOIN CSO_TBL c ON c.cso_email = u.email
WHERE u.userId = @userId AND c.cso_is_valid = 'Y'
```

### 2. CSO의 담당 블록 (병원/품목) 조회
```sql
SELECT c.cso_dealer_nm, h.hos_name, d.drug_name, b.disease_type
FROM BLOCK_TBL b
JOIN CSO_TBL c ON b.cso_cd = c.cso_cd
JOIN HOSPITAL_TBL h ON b.hos_cd = h.hos_cd
JOIN DRUG_TBL d ON b.drug_cd = d.drug_cd
WHERE b.block_isvalid = 'Y' AND c.cso_cd = @cso_cd
```

### 3. 직전 3개월 매출 조회
```sql
-- 현재 년월인덱스 기준 직전 3개월
DECLARE @currentIndex INT = (YEAR(GETDATE()) * 12) + MONTH(GETDATE())

SELECT
    s.sales_year, s.sales_month,
    h.hos_name, d.drug_name,
    SUM(s.drug_cnt * s.drug_price) AS total_sales
FROM SALES_TBL s
JOIN HOSPITAL_TBL h ON s.hos_cd = h.hos_cd
JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
WHERE s.cso_cd_then = @cso_cd
  AND s.sales_index BETWEEN @currentIndex - 3 AND @currentIndex - 1
GROUP BY s.sales_year, s.sales_month, h.hos_name, d.drug_name
ORDER BY s.sales_index DESC
```

### 4. 년월인덱스 계산
```sql
-- 년월인덱스 = (년 * 12) + 월
-- 예: 2025년 1월 = (2025 * 12) + 1 = 24301
-- 예: 2026년 1월 = (2026 * 12) + 1 = 24313
SELECT (YEAR(GETDATE()) * 12) + MONTH(GETDATE()) AS currentIndex
```

---

## 권장 뷰 (View) 설계

### VW_CSO_SALES_SUMMARY (CSO별 매출 요약)
```sql
CREATE VIEW VW_CSO_SALES_SUMMARY AS
SELECT
    s.cso_cd_then AS cso_cd,
    c.cso_dealer_nm,
    s.sales_year,
    s.sales_month,
    s.sales_index,
    h.hos_cd,
    h.hos_name,
    h.hos_addr1,
    d.drug_cd,
    d.drug_name,
    SUM(s.drug_cnt) AS total_cnt,
    SUM(s.drug_cnt * s.drug_price) AS total_amount
FROM SALES_TBL s
JOIN CSO_TBL c ON s.cso_cd_then = c.cso_cd
JOIN HOSPITAL_TBL h ON s.hos_cd = h.hos_cd
JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
GROUP BY
    s.cso_cd_then, c.cso_dealer_nm,
    s.sales_year, s.sales_month, s.sales_index,
    h.hos_cd, h.hos_name, h.hos_addr1,
    d.drug_cd, d.drug_name
```

### VW_CSO_BLOCK_DETAIL (CSO별 담당 블록 상세)
```sql
CREATE VIEW VW_CSO_BLOCK_DETAIL AS
SELECT
    b.cso_cd,
    c.cso_dealer_nm,
    c.cso_email,
    h.hos_cd,
    h.hos_name,
    h.hos_type,
    h.hos_addr1,
    h.hos_addr2,
    d.drug_cd,
    d.drug_name,
    d.drug_category,
    b.disease_type,
    b.isFirst,
    b.block_isvalid
FROM BLOCK_TBL b
JOIN CSO_TBL c ON b.cso_cd = c.cso_cd
JOIN HOSPITAL_TBL h ON b.hos_cd = h.hos_cd
JOIN DRUG_TBL d ON b.drug_cd = d.drug_cd
WHERE b.block_isvalid = 'Y'
```

---

## 드릴다운 UI 흐름 설계

### 1단계: 사용자 인증 후 CSO 선택
```
[사용자가 "내 매출" 요청]
    ↓
userId로 email 조회 → CSO_TBL에서 cso_cd 목록 조회
    ↓
[CSO 선택 버튼] (복수 CSO인 경우)
├── CSO-A (개인사업자)
└── CSO-B (법인)
```

### 2단계: 기간/카테고리 선택
```
[CSO 선택 후]
    ↓
[기간 선택 버튼]
├── 직전 1개월
├── 직전 3개월
└── 직전 6개월

[카테고리 선택 버튼]
├── 전체 요약
├── 병원별 상세
└── 품목별 상세
```

### 3단계: 상세 드릴다운
```
[병원별 상세 선택 시]
    ↓
병원 목록 (매출 순 정렬)
├── 삼성서울병원 - 1,200만원 [상세보기]
├── 서울대병원 - 800만원 [상세보기]
└── 세브란스병원 - 600만원 [상세보기]
    ↓
[상세보기 클릭 시]
해당 병원의 품목별 매출 내역
```

### Postback 데이터 구조 예시
```json
// CSO 선택
{"action": "select_cso", "cso_cd": "CSO001"}

// 기간 선택
{"action": "select_period", "cso_cd": "CSO001", "months": 3}

// 카테고리 선택
{"action": "select_category", "cso_cd": "CSO001", "months": 3, "category": "hospital"}

// 병원 상세
{"action": "hospital_detail", "cso_cd": "CSO001", "months": 3, "hos_cd": "H001"}
```

---

## 자연어 쿼리 예시

| 자연어 요청 | 필요한 테이블/뷰 | 주요 조건 |
|-------------|-----------------|----------|
| "내 담당 병원 목록" | NaverWorks_UserInfo_TBL → CSO_TBL → VW_CSO_BLOCK_DETAIL | userId, block_isvalid='Y' |
| "직전 3개월 매출" | VW_CSO_SALES_SUMMARY | sales_index 범위 |
| "삼성서울병원 매출" | VW_CSO_SALES_SUMMARY | hos_name LIKE '%삼성서울%' |
| "리피어정 매출 현황" | VW_CSO_SALES_SUMMARY | drug_name LIKE '%리피어%' |
| "이번 달 정산 예상" | SALES_TBL + DRUG_TBL (수수료율) | pay_index = 현재 |
