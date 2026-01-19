# NaverWorks Bot Message Handler

## 개요
이 폴더는 NaverWorks Bot의 메시지 처리를 담당합니다.

## 수신 메시지 형식

### 1. Text 메시지
```typescript
interface TextMessage {
  type: "message";
  source: {
    userId: string;      // 사용자 고유 ID (예: "73524122-e756-4c53-179e-0378b4ad90b5")
    domainId: number;    // 도메인 ID (예: 300118260)
  };
  issuedTime: string;    // ISO 8601 형식
  content: {
    type: "text";
    text: string;        // 사용자 입력 텍스트
  };
}
```

### 2. Postback 메시지 (버튼 클릭)
```typescript
interface PostbackMessage {
  type: "postback";
  data: string;          // JSON 문자열 (예: '{"Category":"병원","Code":"180830098572","Name":"삼성서울"}')
  source: {
    userId: string;
    channelId: string;
    domainId: number;
  };
  issuedTime: string;
}
```

## 사용 가능한 서비스

### NaverWorks API (src/services/naverworks/)
- `getAccessToken()` - 액세스 토큰 획득
- `sendTextMessage(userId, text)` - 텍스트 메시지 전송
- `sendFlexMessage(userId, flexContent)` - Flexible Template 전송
- `usersList()` - 전체 사용자 목록 조회

### Database (src/services/database/)
- `getConnection()` - MSSQL 연결 풀
- `executeQuery(sql, params)` - SQL 쿼리 실행
- `getEncryptedValue(key)` / `setEncryptedValue(key, value)` - 암호화된 값 조회/저장

## 권한 체계
- `USER` (일반유저): 본인 정보만 조회
- `ADMIN` (관리자): 전체 정보 조회 가능
- `SUPER_ADMIN` (최종관리자): 전체 조회 + DB 수정 가능

## 파일 구조
```
src/handlers/
├── claude.md           # 이 파일 (컨텍스트 문서)
├── index.ts            # 메인 핸들러 (라우팅)
├── textHandler.ts      # 텍스트 메시지 처리
├── postbackHandler.ts  # Postback 처리
└── commands/           # 명령어별 처리
    ├── help.ts
    ├── myinfo.ts
    └── search.ts
```

## 응답 형식 (Flexible Template)
NaverWorks Bot은 Flexible Template(LINE의 Flex Message와 유사)을 지원합니다.

### 텍스트 버블
```typescript
{
  contentType: 'flex',
  content: {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '제목', weight: 'bold', size: 'lg' },
        { type: 'text', text: '내용', wrap: true }
      ]
    }
  }
}
```

### 버튼 포함
```typescript
{
  contentType: 'flex',
  content: {
    type: 'bubble',
    body: { /* ... */ },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: { type: 'message', label: '버튼명', text: '/command' },
          style: 'primary'
        }
      ]
    }
  }
}
```

## Postback 흐름 구조

### 1. 봇이 버튼 메시지 전송 (Postback Action 포함)
버튼에 postback action을 설정하면, 버튼 클릭 시 설정한 data가 서버로 전달됩니다.

```typescript
// 봇이 보내는 메시지 (버튼에 payload 패킹)
{
  contentType: 'flex',
  content: {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '병원을 선택하세요', weight: 'bold' }
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '삼성서울병원',
            data: '{"Category":"병원","Code":"180830098572","Name":"삼성서울"}',  // ← payload
            displayText: '삼성서울병원 선택'  // 유저 채팅창에 표시될 텍스트 (선택)
          },
          style: 'primary'
        }
      ]
    }
  }
}
```

### 2. 유저가 버튼 클릭 → 서버로 Postback 요청 수신
```typescript
// 서버가 받는 요청 (유저가 버튼 클릭 시)
{
  type: "postback",
  data: '{"Category":"병원","Code":"180830098572","Name":"삼성서울"}',  // ← 위에서 설정한 payload
  source: {
    userId: "73524122-e756-4c53-179e-0378b4ad90b5",
    channelId: "621a81c1-e6df-b79d-5f65-625bec36c23d",
    domainId: 300118260
  },
  issuedTime: "2024-12-13T05:05:06.738Z"
}
```

### 3. Postback 처리 흐름
```
[봇] 버튼 메시지 전송 (data에 JSON payload 설정)
         ↓
[유저] 버튼 클릭
         ↓
[서버] POST /webhook 으로 postback 요청 수신
         ↓
[서버] data (JSON string) 파싱 → 해당 로직 실행
         ↓
[봇] 결과 메시지 전송
```

### Postback payload 설계 예시
```typescript
// 카테고리 기반 라우팅
{ "Category": "병원", "Code": "123", "Name": "삼성서울" }
{ "Category": "매출", "Year": "2024", "Month": "12" }
{ "Category": "재고", "ProductCode": "ABC001" }

// 액션 기반 라우팅
{ "action": "confirm", "orderId": "12345" }
{ "action": "cancel", "orderId": "12345" }
{ "action": "detail", "type": "hospital", "id": "180830098572" }
```

## DB 테이블 참조
- `NaverWorks` - 토큰, 설정값 저장 (key-value, 암호화)
- 추가 테이블은 ajubio DB 스키마 참조
