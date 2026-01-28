/**
 * 공통 버블 빌더
 * 캐러셀 디자인 통일을 위한 공통 함수 모음
 */

// 공통 색상 팔레트 (CLAUDE.md 참조)
export const COLORS = {
  darkNavy: '#0D1B4C',      // 헤더/푸터 배경
  background: '#F0F8FF',    // 본문 배경 (연한 하늘색)
  white: '#FFFFFF',         // 콘텐츠 상자 배경
  navy: '#1D3A8F',          // 버튼 primary
  lightBlue: '#DCEAF7',     // 버튼 secondary
  text: '#000000',          // 본문 텍스트
  subtext: '#666666',       // 보조 텍스트
  lightGray: '#999999',     // 비활성 텍스트
  border: '#E5E5E5',        // 구분선
};

// 공통 로고 URL
export const LOGO_URL = 'https://storage.worksmobile.com/k1/drive/r/24101/300118260/300118260/@2001000000362831/3472530909344205321?fileId=QDIwMDEwMDAwMDAzNjI4MzF8MzQ3MjUzMDkwOTM0NDIwNTMyMXxGfDA&downloadType=O&resourceType=thumbnail&resourceFormat=origin&cache=1734582221372&conditionalAccessPolicy=false';

/**
 * 헤더 생성 (Navy 배경, 카테고리명)
 */
export function createHeader(title: string): any {
  return {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'text',
        text: title,
        size: 'sm',
        weight: 'bold',
        color: COLORS.white,
        align: 'center',
      },
    ],
    backgroundColor: COLORS.darkNavy,
    paddingAll: '8px',
  };
}

/**
 * 푸터 생성 (Navy 배경, AJUBIO)
 */
export function createFooter(): any {
  return {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'text',
        text: 'AJUBIO',
        size: 'xxs',
        weight: 'bold',
        color: COLORS.white,
        align: 'center',
      },
    ],
    backgroundColor: COLORS.darkNavy,
    paddingAll: '6px',
  };
}

/**
 * 버튼이 있는 푸터 생성 (AJUBIO 포함)
 */
export function createButtonFooter(buttons: any[]): any {
  return {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        contents: buttons,
        spacing: 'md',
      },
      {
        type: 'text',
        text: 'AJUBIO',
        size: 'xxs',
        weight: 'bold',
        color: COLORS.darkNavy,
        align: 'center',
        margin: 'sm',
      },
    ],
    backgroundColor: COLORS.background,
    paddingAll: '8px',
  };
}

/**
 * 흰색 둥근 상자 생성 (콘텐츠 래퍼)
 */
export function createContentBox(contents: any[], options?: { margin?: string }): any {
  return {
    type: 'box',
    layout: 'vertical',
    contents,
    backgroundColor: COLORS.white,
    cornerRadius: '12px',
    paddingAll: '16px',
    margin: options?.margin || 'md',
  };
}

/**
 * 구분선 생성
 */
export function createSeparator(margin: string = 'md'): any {
  return {
    type: 'separator',
    margin,
    color: COLORS.border,
  };
}

/**
 * 요약 버블 옵션
 */
export interface SummaryBubbleOptions {
  title: string;              // 병원명/지역명
  subtitle?: string;          // 조회조건 (기간 등)
  bodyContents: any[];        // 월평균 매출, 매출흐름 등
  buttons?: any[];            // 하단 버튼들
  showLogo?: boolean;         // 로고 표시 여부 (기본 true)
}

/**
 * 요약 버블 생성 (메인 버블)
 * - 작은 로고
 * - 병원명/지역명
 * - 조회조건 표기
 * - [하얀색 둥근상자] 내용 [상자 끝]
 * - 버튼
 */
export function createSummaryBubble(options: SummaryBubbleOptions): any {
  const { title, subtitle, bodyContents, buttons, showLogo = true } = options;

  const bodyBoxContents: any[] = [];

  // 로고
  if (showLogo) {
    bodyBoxContents.push({
      type: 'image',
      url: LOGO_URL,
      aspectRatio: '5:3',
      size: 'sm',
      aspectMode: 'fit',
    });
  }

  // 제목
  bodyBoxContents.push({
    type: 'text',
    text: title,
    size: 'md',
    color: COLORS.text,
    weight: 'bold',
    align: 'center',
    margin: showLogo ? 'md' : 'none',
    wrap: true,
  });

  // 부제목 (조회조건)
  if (subtitle) {
    bodyBoxContents.push({
      type: 'text',
      text: subtitle,
      size: 'xs',
      color: COLORS.lightGray,
      align: 'center',
      margin: 'sm',
    });
  }

  // 흰색 둥근 상자 (본문 내용)
  bodyBoxContents.push(createContentBox(bodyContents));

  const bubble: any = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyBoxContents,
      backgroundColor: COLORS.background,
      paddingAll: '12px',
    },
  };

  // 버튼이 있으면 푸터 추가
  if (buttons && buttons.length > 0) {
    bubble.footer = createButtonFooter(buttons);
  }

  return bubble;
}

/**
 * 상세 버블 옵션
 */
export interface DetailBubbleOptions {
  headerTitle: string;        // 헤더 제목 (블록현황, 품목별 매출 등)
  subTitle?: string;          // Sub제목 (병원명/품목명)
  period?: string;            // 기간
  bodyContents: any[];        // 품목명, 매출정보 등
  buttons?: any[];            // 하단 버튼 (선택)
}

/**
 * 상세 버블 생성 (품목별, 블록현황, CSO별 등)
 * - 헤더 (Navy, 카테고리명)
 * - [하얀색 둥근상자] Sub제목, 기간, 구분선, 내용 [상자 끝]
 * - 푸터 (Navy, AJUBIO)
 */
export function createDetailBubble(options: DetailBubbleOptions): any {
  const { headerTitle, subTitle, period, bodyContents, buttons } = options;

  // 흰색 상자 내부 내용
  const boxContents: any[] = [];

  // Sub제목
  if (subTitle) {
    boxContents.push({
      type: 'text',
      text: subTitle,
      size: 'md',
      color: COLORS.text,
      weight: 'bold',
      align: 'center',
      wrap: true,
    });
  }

  // 기간
  if (period) {
    boxContents.push({
      type: 'text',
      text: period,
      size: 'xs',
      color: COLORS.lightGray,
      align: 'center',
      margin: 'sm',
    });
  }

  // 구분선
  if (subTitle || period) {
    boxContents.push(createSeparator('md'));
  }

  // 본문 내용 추가
  boxContents.push(...bodyContents);

  const bubble: any = {
    type: 'bubble',
    header: createHeader(headerTitle),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [createContentBox(boxContents, { margin: 'none' })],
      backgroundColor: COLORS.background,
      paddingAll: '12px',
    },
    footer: buttons && buttons.length > 0 ? createButtonFooter(buttons) : createFooter(),
  };

  return bubble;
}

/**
 * 기본 버튼 생성 (네이비 스타일)
 */
export function createButton(label: string, postbackData: any, style: 'primary' | 'secondary' = 'primary'): any {
  return {
    type: 'button',
    action: {
      type: 'postback',
      label,
      data: JSON.stringify(postbackData),
    },
    style,
    height: 'sm',
    color: style === 'primary' ? COLORS.navy : COLORS.lightBlue,
  };
}

/**
 * 행 생성 (라벨 + 값)
 */
export function createRow(label: string, value: string, options?: {
  labelSize?: string;
  valueSize?: string;
  valueWeight?: string;
  valueColor?: string;
  margin?: string;
}): any {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: label,
        size: options?.labelSize || 'sm',
        color: COLORS.subtext,
        flex: 1,
      },
      {
        type: 'text',
        text: value,
        size: options?.valueSize || 'sm',
        weight: options?.valueWeight || 'bold',
        color: options?.valueColor || COLORS.text,
        align: 'end',
        flex: 2,
      },
    ],
    margin: options?.margin || 'md',
  };
}

/**
 * 품목 매출 행 생성 (새 포맷)
 * 품목명
 * ( 매출 > 매출 > 매출 )    월평균매출
 */
export function createDrugSalesRow(drugName: string, trendText: string, avgText: string): any {
  return {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'text',
        text: drugName,
        size: 'sm',
        color: COLORS.text,
        weight: 'bold',
        wrap: true,
      },
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: `( ${trendText} )`,
            size: 'xs',
            color: COLORS.subtext,
            flex: 3,
          },
          {
            type: 'text',
            text: avgText,
            size: 'xs',
            weight: 'bold',
            color: COLORS.text,
            align: 'end',
            flex: 1,
          },
        ],
        margin: 'sm',
      },
    ],
    margin: 'lg',
  };
}

/**
 * 블록 항목 행 생성
 * 품목명 - CSO딜러명
 *   진료과1, 진료과2
 */
export function createBlockRow(drugName: string, csoName: string, diseases: string): any {
  const contents: any[] = [
    {
      type: 'text',
      text: `${drugName} - ${csoName}`,
      size: 'sm',
      color: COLORS.text,
      weight: 'bold',
      wrap: true,
    },
  ];

  if (diseases) {
    contents.push({
      type: 'text',
      text: diseases,
      size: 'xs',
      color: COLORS.subtext,
      margin: 'sm',
      wrap: true,
    });
  }

  return {
    type: 'box',
    layout: 'vertical',
    contents,
    margin: 'lg',
  };
}
