# NaverWorks Flexible Template 메시지 가이드

## 개요
NaverWorks Bot 메시지를 예쁘게 구성하기 위한 Flexible Template 가이드입니다.
모바일 가독성을 고려하여 설계합니다.

참고: https://www.w3.org/TR/css-flexbox-1/

## 메시지 디자인 패턴

### 기본 구조
```
┌─────────────────────────────┐
│  [회사 로고/헤더]            │  ← hero 또는 header
├─────────────────────────────┤
│  [제목]                      │
│  [본문 내용]                 │  ← body
│  [상세 정보]                 │
├─────────────────────────────┤
│  [버튼1] [버튼2]             │  ← footer
└─────────────────────────────┘
```

## 실제 사용 예시 (아주바이오)

### 1. 중대본원 블록현황 카드
```typescript
{
  contentType: 'flex',
  content: {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#0078D4',
      paddingAll: '15px',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: 'AJUBIO',
              color: '#FFFFFF',
              weight: 'bold',
              size: 'lg'
            }
          ]
        },
        {
          type: 'text',
          text: '중대본원 블록현황',
          color: '#FFFFFF',
          size: 'md',
          margin: 'sm'
        }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '15px',
      contents: [
        // 제품 섹션
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#F5F5F5',
          cornerRadius: '8px',
          paddingAll: '12px',
          contents: [
            {
              type: 'text',
              text: '도베셀정500mg',
              weight: 'bold',
              size: 'md',
              color: '#333333'
            },
            {
              type: 'separator',
              margin: 'sm'
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                { type: 'text', text: '메디젠', size: 'sm', color: '#666666', flex: 1 },
                { type: 'text', text: '이규현', size: 'sm', color: '#333333', align: 'end' }
              ]
            },
            {
              type: 'text',
              text: '신경과, 신경과, 신경외과,\n정형외과, 재활의학과, 내분비,\n순환기, 가정의학과',
              size: 'xs',
              color: '#0078D4',
              wrap: true,
              margin: 'sm'
            }
          ]
        }
      ]
    }
  }
}
```

### 2. 실적현황 카드
```typescript
{
  contentType: 'flex',
  content: {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#0078D4',
      paddingAll: '15px',
      contents: [
        {
          type: 'text',
          text: 'AJUBIO',
          color: '#FFFFFF',
          weight: 'bold',
          size: 'lg'
        },
        {
          type: 'text',
          text: '중대본원 실적현황',
          color: '#FFFFFF',
          size: 'md',
          margin: 'sm'
        }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'lg',
      paddingAll: '15px',
      contents: [
        // 전체실적 섹션
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '전체실적',
              weight: 'bold',
              size: 'md'
            },
            {
              type: 'text',
              text: '25년4월 ~ 25년6월',
              size: 'xs',
              color: '#888888'
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                { type: 'text', text: '평균:', size: 'md', color: '#666666' },
                { type: 'text', text: '7.9백만', size: 'xl', weight: 'bold', color: '#0078D4' }
              ]
            },
            {
              type: 'text',
              text: '(8.2 → 8.2 → 7.2)',
              size: 'xs',
              color: '#888888'
            }
          ]
        },
        {
          type: 'separator'
        },
        // 유로박솜군 섹션
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '유로박솜군',
              weight: 'bold',
              size: 'md'
            },
            {
              type: 'text',
              text: '25년4월 ~ 25년6월',
              size: 'xs',
              color: '#888888'
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                { type: 'text', text: '평균:', size: 'md', color: '#666666' },
                { type: 'text', text: '1.3백만', size: 'xl', weight: 'bold', color: '#0078D4' }
              ]
            },
            {
              type: 'text',
              text: '(1.4 → 1.5 → 1.0)',
              size: 'xs',
              color: '#888888'
            }
          ]
        }
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: 'CSO별 실적보기',
            data: '{"action":"csoDetail","hospitalCode":"12345"}'
          },
          style: 'primary',
          color: '#0078D4'
        }
      ]
    }
  }
}
```

## 컴포넌트 스타일 가이드

### 색상 팔레트 (AJUBIO 로고 기준 - 청록색 계열)
```typescript
const COLORS = {
  primary: '#00A5B5',      // 청록색 (로고 메인)
  secondary: '#007A87',    // 진한 청록
  accent: '#00C4D4',       // 밝은 청록
  dark: '#004D54',         // 어두운 청록
  background: '#F0FAFB',   // 연한 배경
  white: '#FFFFFF',
  text: '#333333',         // 본문 텍스트
  subtext: '#666666',      // 부가 텍스트
  muted: '#999999',        // 흐린 텍스트
  success: '#28A745',      // 성공/증가
  danger: '#DC3545',       // 경고/감소
};
```

### 로고 URL
```typescript
const LOGO_URL = 'https://storage.worksmobile.com/k1/drive/r/24101/300118260/300118260/@2001000000362831/3472530909344205321?fileId=QDIwMDEwMDAwMDAzNjI4MzF8MzQ3MjUzMDkwOTM0NDIwNTMyMXxGfDA&downloadType=O&resourceType=thumbnail&resourceFormat=origin&cache=1734582221372&conditionalAccessPolicy=false';
```

### 텍스트 사이즈
```typescript
const TEXT_SIZE = {
  xxs: 'xxs',   // 매우 작은 텍스트
  xs: 'xs',     // 날짜, 부가정보
  sm: 'sm',     // 일반 본문
  md: 'md',     // 제목
  lg: 'lg',     // 큰 제목
  xl: 'xl',     // 강조 숫자
  xxl: 'xxl',   // 매우 큰 숫자
};
```

### 레이아웃 패턴
```typescript
// 수평 라벨-값 쌍
{
  type: 'box',
  layout: 'horizontal',
  contents: [
    { type: 'text', text: '라벨:', flex: 1, size: 'sm', color: '#666666' },
    { type: 'text', text: '값', flex: 2, size: 'sm', align: 'end' }
  ]
}

// 정보 박스 (둥근 모서리 + 배경색)
{
  type: 'box',
  layout: 'vertical',
  backgroundColor: '#F5F5F5',
  cornerRadius: '8px',
  paddingAll: '12px',
  contents: [/* ... */]
}

// 구분선
{
  type: 'separator',
  margin: 'md'
}
```

## Postback 버튼 설계

### 버튼 액션 타입
```typescript
// message: 클릭 시 텍스트 전송
{
  type: 'button',
  action: {
    type: 'message',
    label: '버튼명',
    text: '/command'
  }
}

// postback: 클릭 시 서버로 데이터 전송 (채팅창에 표시 안됨)
{
  type: 'button',
  action: {
    type: 'postback',
    label: 'CSO별 실적보기',
    data: '{"action":"csoDetail","hospitalCode":"12345"}',
    displayText: 'CSO별 실적 조회'  // 선택: 채팅창에 표시할 텍스트
  },
  style: 'primary',
  color: '#0078D4'
}

// uri: 외부 링크
{
  type: 'button',
  action: {
    type: 'uri',
    label: '웹사이트 방문',
    uri: 'https://example.com'
  }
}
```

### Postback Data 설계
```typescript
// 실적 상세 조회
{ "action": "salesDetail", "hospitalCode": "12345", "period": "2025Q1" }

// CSO별 실적
{ "action": "csoDetail", "hospitalCode": "12345" }

// 제품별 현황
{ "action": "productStatus", "productCode": "DOBE500" }

// 페이지네이션
{ "action": "list", "category": "hospital", "page": 2 }
```

## 캐러셀 (여러 카드)
```typescript
{
  contentType: 'flex',
  content: {
    type: 'carousel',
    contents: [
      { type: 'bubble', /* 첫 번째 카드 */ },
      { type: 'bubble', /* 두 번째 카드 */ },
      { type: 'bubble', /* 세 번째 카드 */ }
    ]
  }
}
```

## 파일 구조
```
src/handlers/processMsg/
├── claude.md           # 이 파일 (템플릿 가이드)
├── templates.ts        # 재사용 템플릿 함수
├── hospitalCard.ts     # 병원 관련 카드
├── salesCard.ts        # 실적 관련 카드
└── commonComponents.ts # 공통 컴포넌트 (헤더, 푸터 등)
```
