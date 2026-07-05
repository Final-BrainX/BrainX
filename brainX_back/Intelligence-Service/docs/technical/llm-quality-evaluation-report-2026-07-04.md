# LLM 품질 평가 요약 (2026-07-04)

## 대상

- 평가 대상: StyleProfile 문체 설정
- 구현 축: `conversationTone`, `writingStyle`
- 실행 runner: `brainx.dev.style-profile-quality`
- 상세 보고서: `docs/technical/llm-quality-evaluations/style-profile-quality-evaluation-2026-07-04.md`
- capture artifacts: `build/style-profile-quality-captures/20260704-style-profile-quality/`

## 결론

최초 실제 OpenAI chat model 호출 기준으로는 5개 시나리오 중 4개가 통과했고, inline assist `REWRITE`에서 `writingStyle` 반영 강도가 약한 문제가 확인되었다.

이후 `StylePromptCompiler`를 `Mandatory user style instructions` 형식으로 강화하고 `writingStyle.speechLevel=음슴체` 재작성 시나리오를 추가해 재평가했다. `20260705-style-profile-strength` run 기준으로 5개 시나리오가 모두 통과했다.

- `conversationTone`: 직접적/간결/emoji-off, 따뜻함/상세함, unknown key ignore 모두 통과.
- `writingStyle`: inline assist `DRAFT`는 통과.
- `writingStyle`: prompt 강화 후 inline assist `REWRITE`도 `음슴체`/짧은 메모 톤 시나리오에서 통과.

## 판정

- overall: 강화 후 통과
- regression risk: 낮음. dev-only runner와 script 추가이며 public API/SSOT 변경은 없다.
- product quality risk: 낮음-중간. 재평가는 통과했지만 `writing-eumsseum-short-rewrite`의 style adherence는 4점이라 실제 사용자 데이터에서는 계속 관찰할 필요가 있다.

## 후속 작업

- inline assist `REWRITE`의 `writingStyle` 적용 강도는 이번 prompt 강화로 보강되었다.
- `informationDensity=light`와 `sentenceLength=short` 조합을 deterministic 또는 judge retry 조건으로 추적한다.
- inline assist use case의 token usage 노출 여부를 검토한다.
