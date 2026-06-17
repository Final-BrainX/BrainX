export type ConsentKey = "termsRequired" | "privacyRequired" | "marketingOptional" | "behaviorAnalyticsOptional";

export type ConsentState = Record<ConsentKey, boolean>;

export type LegalDocument = {
  slug: string;
  consentKey: ConsentKey;
  title: string;
  shortLabel: string;
  required: boolean;
  summary: string;
  sections: Array<{
    title: string;
    body: string[];
  }>;
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
    summary: "BrainX 계정, 워크스페이스, 노트 원장, AI 보조 기능 이용에 필요한 기본 약관입니다.",
    sections: [
      {
        title: "서비스의 성격",
        body: [
          "BrainX는 사용자가 작성하거나 가져온 노트, 폴더, 링크, 태그, 그래프 데이터를 기반으로 지식 정리와 탐색을 돕는 AI 기반 지식 관리 서비스입니다.",
          "AI 요약, 추천 연결, 검색, 대화 기능은 사용자의 자료 이해를 돕기 위한 보조 기능이며, 중요한 결정에는 사용자의 검토가 필요합니다."
        ]
      },
      {
        title: "사용자 콘텐츠와 권리",
        body: [
          "사용자는 자신이 업로드하거나 작성한 노트, 문서, 메모, 태그, 링크, 그래프 구성 등 콘텐츠에 대한 권리를 보유합니다.",
          "BrainX는 서비스 제공, 동기화, 백업, 검색, AI 분석, 보안 및 장애 대응에 필요한 범위에서만 사용자 콘텐츠를 처리합니다."
        ]
      },
      {
        title: "외부 서비스 연동",
        body: [
          "Notion, Obsidian 등 외부 서비스에서 가져오기 기능을 사용할 경우 사용자가 승인한 범위의 데이터만 가져옵니다.",
          "연동 해제 또는 계정 삭제 시 관련 토큰과 연결 정보는 서비스 정책에 따라 삭제 또는 비활성화됩니다."
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
    summary: "회원가입, 로그인, 보안, 노트 동기화, AI 기능 제공을 위해 처리하는 개인정보 안내입니다.",
    sections: [
      {
        title: "수집하는 정보",
        body: [
          "계정 정보: 이메일, 비밀번호 해시, 닉네임, 프로필 이미지, 소셜 로그인 제공자와 제공자 식별자 해시.",
          "서비스 정보: 노트 제목과 본문, 폴더, 태그, 링크, 즐겨찾기, 그래프 레이아웃, 최근 활동, 공유 링크 설정.",
          "운영 정보: 로그인 시각, 토큰/세션 정보, 인증 코드 발송 기록, 오류 로그, 보안 이벤트, 기기 및 브라우저에서 제공되는 기본 요청 정보."
        ]
      },
      {
        title: "처리 목적",
        body: [
          "회원 식별, 로그인, 이메일 인증, 소셜 로그인, 계정 보안, 동기화, 노트 저장과 복구, 가져오기/내보내기, 공유 링크 제공에 사용합니다.",
          "AI 요약, 자동 연결, 그래프 탐색, 검색, RAG 대화 기능 제공을 위해 사용자의 지식 콘텐츠를 처리할 수 있습니다."
        ]
      },
      {
        title: "보관과 삭제",
        body: [
          "계정 유지 기간 동안 서비스 제공에 필요한 정보를 보관하며, 회원 탈퇴 또는 삭제 요청 시 법령상 보존이 필요한 정보를 제외하고 삭제합니다.",
          "휴지통에 있는 노트와 공유 링크는 복구 및 오남용 방지를 위해 일정 기간 보관될 수 있습니다."
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
    summary: "제품 업데이트, 이벤트, 교육 콘텐츠 등 선택적 안내 수신에 대한 동의입니다.",
    sections: [
      {
        title: "수신 항목",
        body: [
          "새 기능, 요금제, 이벤트, 베타 테스트, 사용 팁, 교육 콘텐츠, 설문조사 안내를 이메일 또는 서비스 내 알림으로 받을 수 있습니다.",
          "마케팅 수신 동의 여부는 서비스 핵심 기능 이용 가능 여부에 영향을 주지 않습니다."
        ]
      },
      {
        title: "철회 방법",
        body: [
          "사용자는 설정 또는 마이페이지에서 언제든지 마케팅 정보 수신 동의를 철회할 수 있습니다.",
          "철회 후에도 서비스 운영, 보안, 결제, 약관 변경 등 필수 안내는 발송될 수 있습니다."
        ]
      }
    ]
  },
  {
    slug: "analytics",
    consentKey: "behaviorAnalyticsOptional",
    title: "행동 데이터 분석 동의",
    shortLabel: "행동 데이터 분석 동의",
    required: false,
    summary: "서비스 개선과 AI 추천 품질 향상을 위한 선택적 사용 패턴 분석 동의입니다.",
    sections: [
      {
        title: "분석 대상",
        body: [
          "노트 작성, 저장, 조회, 검색, 그래프 탐색, 링크 클릭, 가져오기/내보내기, AI 기능 사용 여부 같은 서비스 사용 이벤트를 분석할 수 있습니다.",
          "분석에는 원문 노트 내용을 직접 노출하지 않는 집계 또는 비식별 처리 방식이 우선 적용됩니다."
        ]
      },
      {
        title: "이용 목적",
        body: [
          "자동 연결 추천, 검색 품질, 그래프 탐색 경험, 오류 탐지, 성능 개선, 기능 우선순위 판단에 사용합니다.",
          "이 동의는 선택 사항이며 거부해도 회원가입과 기본 서비스 이용은 가능합니다."
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
