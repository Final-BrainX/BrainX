# BrainX AI 프롬프트 모음

Claude, GPT, Codex, Gemini 등 AI Agent에서 공통으로 사용할 프롬프트.

---

# 0. 공통 규칙

```txt
사용자의 요청이 Git 관련 작업인 경우 가능한 결과를 함께 생성한다.

기본 동작:

- "커밋메시지 작성해줘"
  → Commit Message
  → PR 제목
  → PR Description

- "PR 작성해줘"
  → PR 제목
  → PR Description

- "커밋메시지와 PR 작성해줘"
  → Commit Message
  → PR 제목
  → PR Description

- 사용자가 "만" 이라는 표현으로 특정 항목만 요청한 경우 해당 항목만 생성

예시:

"커밋메시지만 작성해줘"
→ Commit Message만 생성

"PR 제목만 작성해줘"
→ PR 제목만 생성

"PR Description만 작성해줘"
→ PR Description만 생성

가능하면 git diff, git status, git log를 우선 확인한다.

Git 관련 작업 수행 전 반드시 아래 항목을 확인한다.

- git status
- git diff
- git log
- 현재 Git에 추적 중인 파일

다음 파일이 Git에 추적되고 있거나 커밋 대상에 포함되어 있는 경우 사용자에게 경고한다.

- .env
- .env.local
- .env.production
- *.env
- application-local.yml
- application-local.yaml
- application-secret.yml
- application-secret.yaml
- *.pem
- *.key
- *.p12
- *.jks
- firebase-adminsdk.json

특히 아래 BrainX 경로는 민감 정보 파일로 간주한다.

- brainX_back/.env
- env/*.env
- user-service.env
- ingestion-service.env
- commerce-service.env
- workspace-service.env

단, 다음 항목은 예제 파일 또는 환경 변수 템플릿으로 간주하며 기본적으로 경고 대상에서 제외한다.

- .env.example
- *.env.example

application.yml, application.properties는 파일명만으로 경고하지 않는다.

단, 실제 비밀번호, 토큰, Secret, API Key가 직접 작성되어 있으면 경고한다.

아래와 같은 환경 변수 치환식 또는 placeholder 값만 있는 경우는 경고 대상에서 제외한다.

- ${MAIL_PASSWORD:}
- ${JWT_SECRET:replace_with_at_least_32_byte_secret}
- ${GOOGLE_CLIENT_SECRET:your_google_client_secret}
- ${POSTGRES_PASSWORD:change_me}
- your_google_client_id
- your_google_client_secret
- your_kakao_rest_api_key
- your_naver_client_id
- your_naver_client_secret
- change_me
- replace_with_at_least_32_byte_secret
- ${DB_PASSWORD:change_me}
- ${KAKAO_CLIENT_SECRET:}
- ${NOTION_CLIENT_SECRET:your_notion_client_secret}
- ${TOSS_SECRET_KEY:your_toss_secret_key}
- ${OPENAI_API_KEY:}
- ${VOYAGE_API_KEY:}
- ${QDRANT_API_KEY:}

또한 파일명과 관계없이 아래 항목에 실제 값이 들어가 있는 경우 사용자에게 경고한다.

- MAIL_PASSWORD=
- GOOGLE_CLIENT_SECRET=
- KAKAO_CLIENT_SECRET=
- NAVER_CLIENT_SECRET=
- NOTION_CLIENT_SECRET=
- JWT_SECRET=
- ACCESS_TOKEN=
- REFRESH_TOKEN=
- DB_PASSWORD=
- API_KEY=
- SECRET_KEY=

단, 위 항목이 선언만 되어 있고 값이 비어 있는 경우는 경고 대상에서 제외한다.

허용 예시:
- MAIL_PASSWORD=
- GOOGLE_CLIENT_SECRET=
- NOTION_CLIENT_SECRET=

경고 예시:
- MAIL_PASSWORD=실제값
- GOOGLE_CLIENT_SECRET=실제값
- NOTION_CLIENT_SECRET=실제값

NEXT_PUBLIC_* 환경 변수는 공개 설정값으로 간주하며 기본적으로 경고 대상에서 제외한다.

예:
- NEXT_PUBLIC_WORKSPACE_API_BASE_URL
- NEXT_PUBLIC_NOTES_USE_MOCK

단, NEXT_PUBLIC_* 내부에 실제 Secret, Token, Password, API Key가 포함된 경우는 예외로 한다.

위 보안 규칙에 해당하는 파일 또는 정보가 발견되면:

- Commit Message 생성 전 사용자에게 경고
- PR 제목 생성 전 사용자에게 경고
- PR Description 생성 전 사용자에게 경고
- Git 추적 해제 여부 확인
- .gitignore 적용 여부 확인

커밋 메시지 생성보다 보안 검사를 우선한다.

실제 변경 내용 기준으로 작성하며 추측이나 과장은 금지한다.

아래 프롬프트 중 요청에 해당하는 규칙을 적용한다.

공통 규칙이 개별 프롬프트보다 우선한다.

```

---

# 1. PR Description 생성 프롬프트

```txt
당신은 BrainX 프로젝트의 Git 협업 규칙을 따르는 개발자입니다.

목표:
GitHub Pull Request Description 작성

작성 기준:
- 가능하면 git diff, git status, 최근 커밋 이력을 우선 분석
- 실제 변경된 파일과 코드 기준으로만 작성
- 변경 사실이 확인되지 않은 기능 추가 금지
- 변경 사실이 확인되지 않은 성능 개선 작성 금지
- 변경 사실이 확인되지 않은 UX 개선 작성 금지
- 추측 금지
- 과장 금지
- 구현 과정 설명보다 변경 결과 중심으로 작성
- 팀원이 PR 내용만 보고 변경 범위를 이해할 수 있어야 함
- 마크다운 형식 사용
- 불필요하게 긴 설명 금지
- 확인하지 못한 테스트 항목은 체크하지 말 것
- 테스트 여부를 모르면 [ ] 항목으로 남길 것
- 가능한 경우 git diff, git status, git log를 직접 확인하여 작성

작성 우선순위:
1. git diff
2. git status
3. git log
4. 변경 파일
5. 커밋 메시지
6. 사용자 입력 설명

출력 형식:

## 작업 내용

- 변경 사항 1
- 변경 사항 2
- 변경 사항 3

## 테스트

- [x] 실제로 확인한 항목
- [ ] 확인하지 못한 항목

## 주의할 점

- 다른 팀원이 알아야 할 내용
- package.json 변경 여부
- API 변경 여부
- DB 스키마 변경 여부
- pull 후 추가로 해야 할 작업

입력 정보:

### 작업 내용

[여기에 작업 내용 입력]

### 변경 파일

[여기에 변경 파일 입력]

### 커밋 메시지

[여기에 커밋 메시지 입력]

### 최근 커밋 이력 (git log)

[여기에 git log 입력]

요구사항:
Pull Request Description만 출력
설명, 해설, 인사말 출력 금지
```

---

# 2. Commit Message 생성 프롬프트

```txt
당신은 BrainX 프로젝트의 Git 협업 규칙을 따르는 개발자입니다.

목표:
Git 커밋 메시지 작성

커밋 메시지 형식:
type: 작업 내용

사용 타입:
feat     새로운 기능 추가
fix      버그 수정
refactor 기능 변화 없이 코드 구조 개선
perf     성능 개선
style    UI 및 디자인 수정
docs     문서 수정
test     테스트 코드 작성 및 수정
chore    프로젝트 설정 및 운영 관련 변경
build    빌드 및 의존성 관련 변경

작성 규칙:
- 한 줄로 작성
- 한국어 사용
- 실제 변경 내용 기반 작성
- 추측 금지
- 과장 금지
- 마침표 사용하지 않음
- Squash Merge를 사용하므로 작업 단위 중심으로 작성
- 커밋 메시지만 출력

작성 우선순위:
1. git diff
2. git status
3. git log
4. 변경 파일
5. 작업 내용 설명

입력 정보:

### 작업 내용

[여기에 작업 내용 입력]

### 변경 파일

[여기에 변경 파일 입력]

### git diff 요약

[여기에 git diff 요약 입력]

출력 예시:
feat: Mermaid 다이어그램 기능 추가
fix: 위키링크 Enter 입력 오류 수정
refactor: 노트 에디터 컴포넌트 분리
build: Gradle 의존성 추가
```

---

# 3. PR 제목 생성 프롬프트

```txt
당신은 BrainX 프로젝트의 Git 협업 규칙을 따르는 개발자입니다.

목표:
GitHub Pull Request 제목 작성

형식:
[type] 작업 내용

사용 타입:
feat
fix
refactor
perf
style
docs
test
chore
build

규칙:
- 한 줄로 작성
- 한국어 사용
- 실제 변경 내용 기반 작성
- 여러 작업이 포함된 경우 가장 중요한 작업을 기준으로 타입 결정
- 여러 작업이 포함된 경우 가장 큰 변경 사항 1개를 기준으로 제목 작성
- 추측 금지
- 과장 금지
- 제목만 출력

입력 정보:

### 작업 내용

[여기에 작업 내용 입력]

### 커밋 목록

[여기에 커밋 목록 입력]

출력 예시:
[feat] 노트 에디터 이미지 기능 추가
[fix] 위키링크 Enter 입력 오류 수정
[refactor] 노트 에디터 구조 정리
[docs] Git 협업 문서 추가
[build] Gradle 의존성 추가
```
