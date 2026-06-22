# Domain Documentation

이 디렉터리는 Intelligence Service를 기술 구조가 아니라 도메인 흐름으로 이해하기 위한 문서를 둔다.

- `knowledge-intelligence-domain-flow.md`: API 명세를 바탕으로 도메인 스토리텔링, 이벤트 스토밍, 컨텍스트 맵 관점에서 기능 흐름과 도메인 관계를 정리한다.
- `consumed-events-domain-map.md`: `AI-Service`가 consumer로 받는 AsyncAPI 이벤트와 Intelligence 도메인 기능의 연결을 정리한다.
- `style-profile-input-direction.md`: 사용자 문체 설정을 직관적으로 입력받고 구조화된 `StyleProfile`로 정규화하는 방향을 정리한다.

## 작성 기준

- 데이터베이스, framework, package, class, messaging 구현 같은 기술 세부사항은 다루지 않는다.
- 사용자가 무엇을 하고, 지식이 어떤 상태로 바뀌며, 다음 도메인 행동이 무엇인지에 집중한다.
- API 명세의 endpoint는 원천 사양으로만 참고하고, 본문은 가능한 한 비즈니스 언어로 표현한다.
