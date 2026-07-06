export type ConsentKey = "termsRequired" | "privacyRequired" | "marketingOptional" | "behaviorAnalyticsOptional";

export type ConsentState = Record<ConsentKey, boolean>;

export type LegalSection = {
  title: string;
  body: string[];
  items?: string[]; // 항목 목록 (불릿 리스트)
};

export type LegalDocument = {
  slug: string;
  consentKey: ConsentKey;
  title: string;
  shortLabel: string;
  required: boolean;
  summary: string;
  effectiveDate: string;
  version: string;
  iconName: "shield" | "lock" | "sparkle" | "bell";
  accentColor: string; // tailwind color token like "79 142 247"
  sections: LegalSection[];
};

export const EMPTY_CONSENTS: ConsentState = {
  termsRequired: false,
  privacyRequired: false,
  marketingOptional: false,
  behaviorAnalyticsOptional: false
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    slug: "terms",
    consentKey: "termsRequired",
    title: "서비스 이용약관",
    shortLabel: "서비스 이용약관",
    required: true,
    effectiveDate: "2026년 1월 1일",
    version: "v1.0",
    iconName: "shield",
    accentColor: "79 142 247",
    summary: "BrainX 계정, 워크스페이스, 노트 원장, AI 보조 기능 이용에 필요한 기본 약관입니다. 서비스를 이용하기 전에 반드시 내용을 확인해 주세요.",
    sections: [
      {
        title: "제1조 서비스의 성격 및 목적",
        body: [
          "BrainX(이하 '서비스')는 사용자가 작성하거나 가져온 노트, 폴더, 링크, 태그, 그래프 데이터를 기반으로 지식 정리와 탐색을 돕는 AI 기반 지식 관리 서비스입니다.",
          "AI 요약, 추천 연결, 검색, 대화 기능은 사용자의 자료 이해를 돕기 위한 보조 기능이며, 중요한 결정에는 반드시 사용자 본인의 검토가 필요합니다."
        ]
      },
      {
        title: "제2조 사용자 콘텐츠와 지식재산권",
        body: [
          "사용자는 자신이 업로드하거나 작성한 노트, 문서, 메모, 태그, 링크, 그래프 구성 등 모든 콘텐츠에 대한 권리를 보유합니다.",
          "BrainX는 서비스 제공, 동기화, 백업, 검색, AI 분석, 보안 및 장애 대응에 필요한 최소 범위에서만 사용자 콘텐츠를 처리합니다.",
          "서비스 제공을 위해 수집·처리한 콘텐츠는 사용자의 명시적 동의 없이 제3자에게 판매하거나 공유하지 않습니다."
        ]
      },
      {
        title: "제3조 외부 서비스 연동",
        body: [
          "Notion, Obsidian 등 외부 서비스에서 가져오기 기능을 사용할 경우 사용자가 승인한 범위의 데이터만 가져옵니다.",
          "연동 해제 또는 계정 삭제 시 관련 토큰과 연결 정보는 서비스 정책에 따라 즉시 삭제 또는 비활성화됩니다."
        ]
      },
      {
        title: "제4조 서비스 이용 제한",
        body: [
          "다음 각 호에 해당하는 경우 서비스 이용이 제한될 수 있습니다.",
        ],
        items: [
          "타인의 개인정보를 무단으로 수집·이용·제공하는 행위",
          "서비스의 정상적인 운영을 방해하거나 서버에 과도한 부하를 주는 행위",
          "저작권, 상표권 등 지식재산권을 침해하는 콘텐츠를 업로드하는 행위",
          "관계 법령 또는 본 약관을 위반하는 행위"
        ]
      },
      {
        title: "제5조 서비스 변경 및 중단",
        body: [
          "BrainX는 서비스 내용을 변경하거나 종료할 수 있습니다. 중요한 변경 사항은 서비스 내 알림 또는 이메일로 30일 이전에 공지합니다.",
          "천재지변, 서버 장애 등 불가피한 사정으로 서비스가 일시 중단될 수 있으며, 이 경우 가능한 빠르게 복구하겠습니다."
        ]
      }
    ]
  },
  {
    slug: "privacy",
    consentKey: "privacyRequired",
    title: "개인정보 처리방침",
    shortLabel: "개인정보 처리방침",
    required: true,
    effectiveDate: "2026년 1월 1일",
    version: "v1.0",
    iconName: "lock",
    accentColor: "123 122 238",
    summary: "회원가입, 로그인, 보안, 노트 동기화, AI 기능 제공을 위해 처리하는 개인정보에 대한 안내입니다. BrainX는 사용자의 개인정보를 소중하게 다룹니다.",
    sections: [
      {
        title: "제1조 수집하는 개인정보 항목",
        body: [
          "BrainX는 서비스 제공을 위해 최소한의 개인정보만을 수집합니다."
        ],
        items: [
          "계정 정보: 이메일, 비밀번호 해시, 닉네임, 프로필 이미지, 소셜 로그인 제공자 식별자 해시",
          "서비스 정보: 노트 제목과 본문, 폴더, 태그, 링크, 즐겨찾기, 그래프 레이아웃, 공유 링크 설정",
          "운영 정보: 로그인 시각, 세션 정보, 인증 코드 발송 기록, 오류 로그, 보안 이벤트",
          "기기 정보: 브라우저 종류, OS, IP 주소(보안 목적)"
        ]
      },
      {
        title: "제2조 개인정보 처리 목적",
        body: [
          "수집된 개인정보는 아래 목적에 한하여 사용됩니다."
        ],
        items: [
          "회원 식별, 로그인, 이메일 인증, 소셜 로그인 연동",
          "계정 보안 및 이상 접근 탐지",
          "노트 저장·복구·동기화, 가져오기/내보내기, 공유 링크 제공",
          "AI 요약, 자동 연결, 그래프 탐색, 검색, RAG 대화 기능 제공",
          "서비스 이용 통계 및 품질 개선 (비식별 처리 후 활용)"
        ]
      },
      {
        title: "제3조 개인정보 보관 및 삭제",
        body: [
          "계정 유지 기간 동안 서비스 제공에 필요한 정보를 보관하며, 회원 탈퇴 또는 삭제 요청 시 관련 법령상 보존 의무가 있는 정보를 제외하고 즉시 삭제합니다.",
          "휴지통에 있는 노트와 공유 링크는 복구 및 오남용 방지를 위해 최대 30일간 보관될 수 있습니다.",
          "전자상거래 관련 기록은 관련 법령에 따라 최대 5년간 보관될 수 있습니다."
        ]
      },
      {
        title: "제4조 제3자 제공 및 위탁",
        body: [
          "BrainX는 사용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다.",
          "서비스 운영을 위해 아래와 같이 개인정보 처리를 위탁합니다."
        ],
        items: [
          "클라우드 인프라 제공사: 서버 운영 및 데이터 저장",
          "이메일 발송 서비스: 인증 코드 및 서비스 공지 발송",
          "결제 대행사: 유료 구독 결제 처리 (해당 시)"
        ]
      },
      {
        title: "제5조 사용자의 권리",
        body: [
          "사용자는 언제든지 아래 권리를 행사할 수 있습니다."
        ],
        items: [
          "개인정보 열람·수정 요청",
          "개인정보 삭제(회원 탈퇴) 요청",
          "개인정보 처리 정지 요청",
          "개인정보 이동(이식성) 요청"
        ]
      }
    ]
  },
  {
    slug: "marketing",
    consentKey: "marketingOptional",
    title: "마케팅 정보 수신 동의",
    shortLabel: "마케팅 정보 수신",
    required: false,
    effectiveDate: "2026년 1월 1일",
    version: "v1.0",
    iconName: "sparkle",
    accentColor: "167 139 250",
    summary: "BrainX의 새로운 기능 소식, 이벤트, 교육 콘텐츠 등 유익한 정보를 받아보실 수 있습니다. 선택 동의이며 언제든지 철회할 수 있습니다.",
    sections: [
      {
        title: "수신하게 될 정보",
        body: [
          "마케팅 수신에 동의하시면 아래 내용을 이메일 또는 서비스 내 알림으로 받으실 수 있습니다."
        ],
        items: [
          "새로운 기능 출시 및 업데이트 소식",
          "프리미엄 요금제 혜택 및 이벤트 안내",
          "베타 테스트 및 얼리 액세스 초대",
          "사용 팁, 튜토리얼, 교육 콘텐츠",
          "설문조사 및 피드백 요청"
        ]
      },
      {
        title: "수신 채널 및 방법",
        body: [
          "수신 채널은 이메일과 서비스 내 알림(푸시)이며, 각 채널별로 별도 수신 거부가 가능합니다.",
          "마케팅 정보 수신 동의 여부는 서비스 핵심 기능(노트 작성, AI 기능, 그래프 등) 이용 가능 여부에 영향을 주지 않습니다."
        ]
      },
      {
        title: "동의 철회 방법",
        body: [
          "마케팅 정보 수신 동의는 언제든지 철회할 수 있으며, 철회 후에는 즉시 발송이 중단됩니다.",
          "철회 후에도 서비스 운영, 보안, 결제, 약관 변경 등 필수 안내는 발송될 수 있습니다."
        ],
        items: [
          "서비스 내: 설정 > 개인정보 동의 수정 > 마케팅 정보 수신 동의 해제",
          "이메일 수신 거부: 발송된 이메일 하단의 '수신 거부' 링크 클릭",
          "고객센터: brainx@brainx.app으로 요청"
        ]
      }
    ]
  },
  {
    slug: "analytics",
    consentKey: "behaviorAnalyticsOptional",
    title: "행동 데이터 분석 동의",
    shortLabel: "행동 데이터 분석",
    required: false,
    effectiveDate: "2026년 1월 1일",
    version: "v1.0",
    iconName: "sparkle",
    accentColor: "74 195 172",
    summary: "서비스 개선과 AI 추천 품질 향상을 위해 사용 패턴을 분석합니다. 선택 동의이며 거부해도 모든 핵심 기능을 이용할 수 있습니다.",
    sections: [
      {
        title: "분석 대상 이벤트",
        body: [
          "동의하시는 경우 아래와 같은 서비스 사용 이벤트가 수집·분석됩니다."
        ],
        items: [
          "노트 작성, 저장, 조회, 검색, 삭제, 복구",
          "그래프 탐색, 노드 클릭, 링크 연결·해제",
          "AI 기능(요약, 연결 추천, 대화) 사용 여부 및 피드백",
          "가져오기/내보내기 기능 사용",
          "기능 체류 시간 및 화면 이동 패턴 (비식별)"
        ]
      },
      {
        title: "데이터 처리 방식",
        body: [
          "수집된 이벤트 데이터는 집계 또는 비식별 처리를 거쳐 분석되며, 원문 노트 내용이 직접 분석 대상이 되지 않습니다.",
          "개인을 특정할 수 없는 형태로 처리된 집계 통계만 서비스 개선에 활용됩니다.",
          "제3자 분석 도구를 사용하는 경우 해당 도구의 개인정보 처리방침이 별도로 적용될 수 있습니다."
        ]
      },
      {
        title: "활용 목적",
        body: [
          "수집된 행동 데이터는 오직 서비스 품질 향상 목적으로만 활용됩니다."
        ],
        items: [
          "AI 자동 연결 추천 정확도 향상",
          "검색 품질 및 그래프 탐색 경험 개선",
          "오류 탐지 및 성능 개선",
          "신규 기능 개발 우선순위 결정"
        ]
      },
      {
        title: "동의 철회 및 데이터 삭제",
        body: [
          "이 동의는 선택 사항이며 거부해도 회원가입과 모든 기본 서비스 이용이 가능합니다.",
          "철회 요청 시 수집 중단 및 기존 수집된 행동 데이터는 30일 이내에 삭제됩니다."
        ],
        items: [
          "서비스 내: 설정 > 개인정보 동의 수정 > 행동 데이터 분석 동의 해제",
          "고객센터: brainx@brainx.app으로 삭제 요청"
        ]
      }
    ]
  }
];

export function legalBySlug(slug: string) {
  return LEGAL_DOCUMENTS.find((document) => document.slug === slug) ?? null;
}

export function allConsents(value: boolean): ConsentState {
  return {
    termsRequired: value,
    privacyRequired: value,
    marketingOptional: value,
    behaviorAnalyticsOptional: value
  };
}

export function requiredConsentsAccepted(consents: ConsentState) {
  return consents.termsRequired && consents.privacyRequired;
}
