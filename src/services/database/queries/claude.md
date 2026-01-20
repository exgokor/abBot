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

---

## 생성된 뷰 테이블 (_byClaude 접미사)

> 모든 뷰는 `_byClaude` 접미사로 구분됨
> 생성 스크립트: `src/scripts/createViews.ts`
> 실행: `npx ts-node src/scripts/createViews.ts`

### 집계 뷰

#### V_SALES_DETAIL_byClaude
매출 상세 (모든 마스터 테이블 조인)

| Column | Description |
|--------|-------------|
| hos_cd, hos_cso_cd | 병원 키 |
| drug_cd, seq | 품목/블록 키 |
| cso_cd_then | 당시 CSO |
| drug_cnt, drug_price, pay_rate | 매출 계산용 |
| sales_year, sales_month, sales_index | 처방 기간 |
| cso_dealer_nm, cso_corp_nm | CSO 정보 |
| hos_name, hos_abbr, hosIndex | 병원 정보 |
| drug_name, drug_class, drug_category | 품목 정보 |
| **sales_amount** | 계산된 매출 (drug_cnt * drug_price * pay_rate) |

#### V_CSO_MONTHLY_SALES_byClaude
CSO별 월별 매출 집계

| Column | Description |
|--------|-------------|
| cso_cd, cso_dealer_nm, cso_corp_nm | CSO 정보 |
| sales_year, sales_month, sales_index | 기간 |
| hospital_count | 거래 병원수 |
| drug_count | 거래 품목수 (drug_cnt > 0) |
| drug_class_count | 품목군수 |
| **total_sales** | 총 매출 |

#### V_HOSPITAL_MONTHLY_SALES_byClaude
병원별 월별 매출 집계

| Column | Description |
|--------|-------------|
| hos_cd, hos_cso_cd | 병원 키 |
| hos_name, hos_abbr, hosIndex | 병원 정보 |
| sales_year, sales_month, sales_index | 기간 |
| cso_count | 거래 CSO수 |
| drug_count, drug_class_count | 품목수 |
| **total_sales** | 총 매출 |

#### V_DRUG_MONTHLY_SALES_byClaude
품목별 월별 매출 집계

| Column | Description |
|--------|-------------|
| drug_cd, drug_name, drug_class | 품목 정보 |
| sales_year, sales_month, sales_index | 기간 |
| hospital_count | 거래 병원수 |
| cso_count | 거래 CSO수 |
| total_qty | 총 수량 |
| **total_sales** | 총 매출 |

#### V_REGION_MONTHLY_SALES_byClaude
지역별 월별 매출 집계

| Column | Description |
|--------|-------------|
| hosIndex, hos_addr1 | 지역 정보 |
| sales_year, sales_month, sales_index | 기간 |
| hospital_count | 병원수 |
| cso_count | CSO수 |
| drug_count | 품목수 |
| **total_sales** | 총 매출 |

### 조합 집계 뷰

#### V_CSO_HOSPITAL_MONTHLY_byClaude
CSO-병원 조합별 월별 매출

| Column | Description |
|--------|-------------|
| cso_cd, cso_dealer_nm | CSO 정보 |
| hos_cd, hos_cso_cd, hos_name, hos_abbr | 병원 정보 |
| sales_year, sales_month, sales_index | 기간 |
| drug_count, drug_class_count | 품목수 |
| **total_sales** | 총 매출 |

#### V_CSO_DRUG_MONTHLY_byClaude
CSO-품목 조합별 월별 매출

| Column | Description |
|--------|-------------|
| cso_cd, cso_dealer_nm | CSO 정보 |
| drug_cd, drug_name, drug_class | 품목 정보 |
| sales_year, sales_month, sales_index | 기간 |
| hospital_count | 병원수 |
| total_qty | 수량 |
| **total_sales** | 총 매출 |

#### V_HOSPITAL_DRUG_MONTHLY_byClaude
병원-품목 조합별 월별 매출

| Column | Description |
|--------|-------------|
| hos_cd, hos_cso_cd, hos_name | 병원 정보 |
| drug_cd, drug_name, drug_class | 품목 정보 |
| sales_year, sales_month, sales_index | 기간 |
| cso_count | CSO수 |
| total_qty | 수량 |
| **total_sales** | 총 매출 |

### 블록 뷰

#### V_CURRENT_BLOCKS_byClaude
현재 담당자 (end_index가 MAX인 레코드)

| Column | Description |
|--------|-------------|
| hos_cd, hos_cso_cd, drug_cd, seq | 블록 키 |
| cso_cd, cso_dealer_nm, cso_email | 담당 CSO 정보 |
| hos_name, hos_abbr, hosIndex | 병원 정보 |
| drug_name, drug_class | 품목 정보 |
| disease_type | 진료과 |
| isFirst | 최초담당여부 |
| start_year, start_month, start_index | 담당 시작 |
| end_year, end_month, end_index | 담당 종료 |

#### V_BLOCK_HISTORY_byClaude
블록 변경 이력 전체

| Column | Description |
|--------|-------------|
| (V_CURRENT_BLOCKS_byClaude와 동일) | |
| block_isvalid | 유효여부 |
| update_at | 수정일시 |

### 검색 뷰

#### V_SEARCH_INDEX_byClaude
통합 검색용 인덱스

| Column | Description |
|--------|-------------|
| entity_type | 'CSO', 'HOSPITAL', 'DRUG' |
| entity_cd | 엔티티 코드 (병원은 hos_cd\|hos_cso_cd) |
| search_name | 검색용 이름 |
| search_abbr | 병원 약어 (병원만) |
| region | 지역 (병원만, hosIndex) |

---

## 뷰 활용 예시

### CSO 최근 3개월 매출 조회
```sql
DECLARE @endIndex INT = (YEAR(GETDATE()) - 2000) * 12 + MONTH(GETDATE()) - 1
DECLARE @startIndex INT = @endIndex - 2

SELECT cso_dealer_nm, sales_year, sales_month, total_sales
FROM V_CSO_MONTHLY_SALES_byClaude
WHERE cso_cd = @cso_cd
  AND sales_index BETWEEN @startIndex AND @endIndex
ORDER BY sales_index
```

### CSO의 TOP5 병원 조회
```sql
SELECT TOP 5
    hos_name, hos_abbr, hosIndex,
    SUM(total_sales) AS total_sales,
    SUM(drug_count) AS drug_count
FROM V_CSO_HOSPITAL_MONTHLY_byClaude
WHERE cso_cd = @cso_cd
  AND sales_index BETWEEN @startIndex AND @endIndex
GROUP BY hos_cd, hos_cso_cd, hos_name, hos_abbr, hosIndex
ORDER BY total_sales DESC
```

### 지역별 매출 조회
```sql
SELECT hosIndex, hos_addr1,
    SUM(total_sales) AS total_sales,
    SUM(hospital_count) AS hospital_count
FROM V_REGION_MONTHLY_SALES_byClaude
WHERE hosIndex LIKE '인천%'
  AND sales_index BETWEEN @startIndex AND @endIndex
GROUP BY hosIndex, hos_addr1
ORDER BY total_sales DESC
```

### 병원+품목 블록 정보 조회
```sql
SELECT cso_dealer_nm, disease_type, isFirst, start_year, start_month
FROM V_CURRENT_BLOCKS_byClaude
WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
  AND drug_cd = @drug_cd
```

### 통합 검색 (CSO/병원/품목)
```sql
-- 3글자 이상 입력 시
SELECT entity_type, entity_cd, search_name, search_abbr, region
FROM V_SEARCH_INDEX_byClaude
WHERE search_name LIKE '%검색어%'
   OR search_abbr LIKE '%검색어%'
```

---

## 매출조회 챗봇 규칙

### 입력 규칙
- **최소 입력 길이**: 2글자 이상
- 2글자 미만 입력 시: "2글자 이상 입력해주세요" 안내

### 자연어 파싱 대상
| 엔티티 | 검색 필드 | 검색 방식 |
|--------|----------|----------|
| CSO/딜러 | `cso_dealer_nm` | LIKE '%입력값%' |
| 병원 | `hos_name`, `hos_abbr` | LIKE '%입력값%' |
| 품목 | `drug_name` | LIKE '%입력값%' |
| 지역 | `hosIndex` | LIKE '입력값%' |

### 조회 레벨
- Level 0: 지역 단위 (지역명만)
- Level 1: 단일 엔티티 (CSO/병원/품목)
- Level 2: 조합 (CSO+병원, 병원+품목 등)
- Level 3: 완전 상세 (CSO+병원+품목)

### 블록 정보 표시 규칙
> 병원명 + 품목명 동시 입력 시에만 블록(담당자) 정보 표시

### 기간 설정
- 기본값: 최근 3개월
- 옵션: 3개월, 6개월, 1년

### 매출 계산 공식
```sql
매출 = SUM(drug_cnt * drug_price * pay_rate)
```

### 년월인덱스 계산
```
년월인덱스 = (년도 - 2000) * 12 + 월 - 1
예: 2025년 2월 = (2025-2000)*12 + 2-1 = 301
```

---

## 공통 UI 규격

### 로고 이미지 URL
```
https://storage.worksmobile.com/k1/drive/r/24101/300118260/300118260/@2001000000362831/3472530909344205321?fileId=QDIwMDEwMDAwMDAzNjI4MzF8MzQ3MjUzMDkwOTM0NDIwNTMyMXxGfDA&downloadType=O&resourceType=thumbnail&resourceFormat=origin&cache=1734582221372&conditionalAccessPolicy=false
```

### 로고 이미지 설정
- **aspectRatio**: `5:3`
- **aspectMode**: `fit` (PNG 이미지 대응)
- **size**: `full`

### 금액 표시 규격
- 단위: **백만원**
- 포맷: `X.X백만` (소수점 1자리)
- 예시: `79.7백만`, `7.9백만`, `0.8백만`

### 매출 추이 표시 (3개월)
```
월평균 매출    217.3백만
(248.6 → 199.7 → 203.5)
```
- 첫 줄: 월평균 매출 (크게, bold)
- 둘째 줄: 월별 매출 추이 (괄호, 화살표로 연결)

### 조회 기간 표시
- 위치: **제목 바로 아래** (가운데 정렬)
- 포맷: `YYYY.M ~ YYYY.M (N개월)`
- 예시: `2025.10 ~ 2025.12 (3개월)`
- 스타일: `size: xs`, `color: #999999`

### 줄간격
- 기본 margin: `md` ~ `lg` (1.5배 간격 유지)
- 구분선 전후: `margin: lg`

### 색상 팔레트
| 용도 | 색상코드 | 설명 |
|------|---------|------|
| 배경 | `#F0F8FF` | 연한 하늘색 |
| 버튼 | `#1D3A8F` | 네이비 |
| 버튼 텍스트 | `#FFFFFF` | 흰색 |
| 본문 | `#000000` | 검정 |
| 보조 텍스트 | `#999999` | 연한 회색 |
| 구분선 | `#E5E5E5` | 매우 연한 회색 |

### 버블 스타일
- 상단: 로고 (AJUBIO, aspectMode: fit)
- 제목: 검정색, bold, 가운데 정렬
- 제목 아래: 조회 기간 (회색, 작은 글씨)
- 본문: 줄간격 1.5배, 간결한 레이아웃
- 하단: 네이비 버튼 (#1D3A8F)

### 캐러셀 구성 (지역 조회)
1. **요약 버블**: 지역 전체 월평균 + 추이 + 거래 병원/품목 수
2. **TOP3 병원 버블**: 각 병원별 월평균 + 추이 + 품목별 매출 (TOP3 + 기타)
3. **요약+기간변경 버블**: 주요 품목별 매출 + 6개월/1년 버튼

### 버튼 스타일
```json
{
  "style": "primary",
  "color": "#1D3A8F",
  "height": "sm"
}
```
