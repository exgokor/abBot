// NaverWorks Webhook 메시지 타입
export interface WebhookMessage {
  type: string;
  source: {
    userId: string;
    channelId?: string;
    domainId?: string;
  };
  content: {
    type: string;
    text?: string;
    postback?: string;
  };
  issuedTime: string;
}

// NaverWorks 토큰 응답
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

// DB 토큰 저장 형식
export interface StoredToken {
  id: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  updatedAt: Date;
}

// Flexible Template 타입
export interface FlexibleTemplate {
  contentType: 'flex';
  content: FlexContainer;
}

export interface FlexContainer {
  type: 'bubble' | 'carousel';
  body?: FlexBox;
  footer?: FlexBox;
  contents?: FlexBubble[];
}

export interface FlexBubble {
  type: 'bubble';
  body?: FlexBox;
  footer?: FlexBox;
}

export interface FlexBox {
  type: 'box';
  layout: 'vertical' | 'horizontal' | 'baseline';
  contents: FlexComponent[];
  spacing?: string;
  margin?: string;
}

export type FlexComponent = FlexText | FlexButton | FlexBox;

export interface FlexText {
  type: 'text';
  text: string;
  weight?: 'regular' | 'bold';
  size?: string;
  color?: string;
  wrap?: boolean;
}

export interface FlexButton {
  type: 'button';
  action: {
    type: 'message' | 'uri' | 'postback';
    label: string;
    text?: string;
    uri?: string;
    data?: string;
  };
  style?: 'primary' | 'secondary' | 'link';
}

// 메시지 전송 요청
export interface SendMessageRequest {
  botId: string;
  userId: string;
  content: TextContent | FlexibleTemplate;
}

export interface TextContent {
  contentType: 'text';
  content: {
    text: string;
  };
}
