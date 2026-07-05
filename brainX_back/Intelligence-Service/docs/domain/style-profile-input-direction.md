# Style Profile Input Direction

이 문서는 Intelligence Service의 사용자 문체 프로필 입력 방향과 prompt 적용 범위를 정리한다. 목표는 사용자가 JSON이나 prompt 문장을 직접 작성하지 않아도, 구조화된 선택값으로 AI 응답 경험을 조정하게 하는 것이다.

## 원칙

문체 프로필은 두 축만 유지한다.

| 축 | 적용 대상 | 예시 key |
| --- | --- | --- |
| `conversationTone` | AI가 사용자에게 직접 설명하거나 이유를 말하는 대화형 응답 | `speechLevel`, `warmth`, `directness`, `verbosity`, `emoji` |
| `writingStyle` | AI가 생성하거나 수정하는 결과물 자체의 문체 | `defaultAudience`, `defaultPurpose`, `formality`, `informationDensity`, `sentenceLength`, `avoid` |

`assistanceStyle`은 제거한다. 질문 빈도, 선제적 제안, 반박 수준 같은 도움 방식은 실제 기능별 UX/정책과 강하게 결합되어 있는데, 독립 설정으로 남겨두면 사용하지 않는 가정 때문에 기능별 prompt와 API 부채가 늘어난다. 필요해지기 전까지는 두 축으로 충분하다.

## 적용 규칙

- 대화 응답, 추천 이유, 사용자에게 보이는 설명은 `conversationTone`을 적용한다.
- 초안 작성, 요약, 재작성, 번역, 리포트처럼 결과물이 사용자의 콘텐츠가 되는 기능은 `writingStyle`을 적용한다.
- 한 응답 안에 설명과 결과물이 섞이면 설명에는 `conversationTone`, 결과물에는 `writingStyle`을 분리 적용한다.
- 현재 요청에서 사용자가 명시한 언어, 형식, 분량, 출력 schema가 저장된 프로필보다 우선한다.
- 안전, 개인정보, 사실성, 권한, evidence 제한, JSON schema 같은 제품 정책은 문체 프로필보다 항상 우선한다.

## 저장 형태

REST API의 `StyleProfileData`와 `StyleProfilePutRequest`는 다음 두 property만 사용한다.

```json
{
  "conversationTone": {
    "speechLevel": "haeyo",
    "warmth": "low",
    "directness": "high",
    "verbosity": "short",
    "emoji": "off"
  },
  "writingStyle": {
    "defaultAudience": "general_professional",
    "defaultPurpose": "explain",
    "formality": "business",
    "informationDensity": "balanced",
    "sentenceLength": "short_to_medium",
    "avoid": [
      "과장 표현",
      "불필요한 감탄"
    ]
  }
}
```

DB의 `user_style_profiles.style`은 JSON text 컬럼이며, 저장 시 `conversationTone`과 `writingStyle`만 쓴다. 기존 JSON에 남아 있던 `assistanceStyle` key는 migration으로 제거하고, legacy JSON을 읽을 때도 domain mapping에서 사용하지 않는다.

## Prompt Compiler

`StylePromptCompiler`는 저장된 프로필을 짧은 system prompt instruction으로 변환한다.

- 허용된 key만 변환한다.
- 알 수 없는 key와 중첩 객체는 무시한다.
- 문자열은 개행과 과도한 공백을 제거하고 길이를 제한한다.
- 빈 profile은 prompt를 추가하지 않는다.
- `assistanceStyle` 문자열이나 legacy key는 prompt에 포함하지 않는다.

## 기능별 적용 방향

상세 mapping은 `docs/technical/ai-feature-catalog.md`의 `StyleProfile Prompt Mapping` 표를 기준으로 한다. 요약하면 `NOTE_QA`, `WORKSPACE_SEARCH`, 링크 추천 이유, 브릿지 개념 이유, 폴더 정리 이유는 `conversationTone`을 사용하고, `COMPOSE`, `NOTE_ACTION`, inline assist, 클러스터링, 인사이트 리포트는 `writingStyle`을 사용한다.

라우터, 채팅 제목 생성, 검색, 모델 설정, 상태 조회, dev runner 같은 내부 판단/조회성 기능에는 문체 프로필을 적용하지 않는다.
