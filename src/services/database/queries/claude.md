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

## 추가 예정 테이블
(사용자 요청 시 여기에 스키마 추가)
