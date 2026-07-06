# Workspace Architecture

> BrainX Workspace(DocumentGroup) 아키텍처 설계 문서
>
> Version: 1.0
>
> Status: Draft (1차 설계 확정)

---

# 1. 목적

기존 BrainX는 사용자당 하나의 노트 공간만 존재하는 구조였습니다.

이번 Workspace 개편의 목적은 하나의 사용자(User)가 여러 개의 독립적인 작업 공간(Workspace)을 가질 수 있도록 확장하는 것입니다.

Workspace는 프로젝트, 회사, 학교, 개인 등 서로 다른 지식 공간을 완전히 분리하기 위한 최상위 도메인입니다.

Workspace 내부에는 노트, 폴더, 태그, WikiLink, AI Index 등이 포함됩니다.

---

# 2. 기존 구조

기존에는 User 아래에 Folder와 Note가 직접 존재했습니다.

```text
User
 ├── Folder
 ├── Folder
 ├── Note
 ├── Note
 └── ...
```

이 구조에서는

- 프로젝트 분리
- AI 인덱스 분리
- Workspace 단위 공유
- Workspace 단위 권한

등을 구현하기 어렵습니다.

---

# 3. 변경 후 구조

Workspace(documentGroup)를 최상위 계층으로 추가합니다.

```text
User
│
├── Workspace
│     ├── Folder
│     ├── Folder
│     ├── Note
│     ├── Note
│     └── ...
│
├── Workspace
│     ├── Folder
│     ├── Note
│     └── ...
│
└── Workspace
      ├── Folder
      └── Note
```

모든 Note와 Folder는 반드시 하나의 Workspace에만 소속됩니다.

Workspace를 넘는 Folder 구조는 존재하지 않습니다.

---

# 4. documentGroup의 의미

이번 설계에서

documentGroup == Workspace

입니다.

기존 Intelligence-Service에서 사용하던 documentGroup 개념을
Workspace의 공식 도메인 모델로 승격합니다.

즉,

```text
documentGroupId

↓

Workspace Primary Key
```

로 사용합니다.

---

# 5. Workspace의 역할

Workspace는 하나의 독립된 지식 저장소입니다.

Workspace는 다음 데이터를 포함합니다.

- Folder
- Note
- Tag
- WikiLink
- AI Context
- Graph
- Search Index
- Intelligence Index

Workspace 밖의 데이터를 참조하지 않습니다.

---

# 6. 데이터 소속 원칙

모든 데이터는 하나의 Workspace에만 속합니다.

```text
Workspace A

Note A
Note B
Folder A

--------------------

Workspace B

Note C
Folder B
```

Workspace A의 Note는
Workspace B의 Folder에 들어갈 수 없습니다.

Workspace 간 Folder 이동 역시 허용되지 않습니다.

---

# 7. Workspace 식별

모든 Workspace는 documentGroupId로 식별합니다.

Workspace 이름은 변경 가능하지만

documentGroupId는 절대 변경되지 않습니다.

```text
Workspace

id (documentGroupId)
name
ownerUserId
isDefault
createdAt
updatedAt
```

---

# 8. Default Workspace

모든 회원은 반드시 하나의 Default Workspace를 가집니다.

회원가입 시 자동 생성됩니다.

```text
회원가입

↓

Default Workspace 생성

↓

첫 로그인

↓

Default Workspace 진입
```

Default Workspace는 삭제할 수 없습니다.

---

# 9. Guest 구조

Guest는 Workspace를 가지지 않습니다.

Guest는 Redis Draft만 사용합니다.

```text
Guest

Redis Draft
```

Guest는

- Workspace 생성
- Workspace 변경
- Workspace 저장

을 할 수 없습니다.

로그인 또는 회원가입 후

Redis Draft는 회원의 Default Workspace로 Claim됩니다.

```text
Guest

↓

회원가입

↓

Default Workspace

↓

Draft Claim
```

---

# 10. Workspace 전환

Workspace 전환은 화면(Context)의 변경입니다.

Workspace를 변경하면

- Home
- Notes
- Graph
- AI

모든 조회는 새로운 Workspace 기준으로 수행됩니다.

Workspace 전환은

서버에 "현재 선택된 Workspace"를 저장하지 않습니다.

현재 선택 상태는 프론트 Context에서 관리합니다.

모든 API는 documentGroupId를 기준으로 데이터를 조회합니다.

---

# 11. Workspace 생성

사용자는 여러 Workspace를 생성할 수 있습니다.

Workspace 생성 시

```text
Workspace 생성

↓

Workspace 목록 갱신

↓

생성한 Workspace 자동 선택

↓

현재 화면 이동
```

Home에서 생성했다면

새 Workspace Home으로 이동합니다.

Notes에서 생성했다면

새 Workspace Welcome Board로 이동합니다.

---

# 12. Workspace 이름 변경

Workspace 이름 변경은 지원합니다.

이름 변경은 Workspace의 표시 이름만 변경합니다.

documentGroupId는 변경되지 않습니다.

---

# 13. Workspace 삭제

Workspace 삭제는 2차 범위입니다.

1차에서는 지원하지 않습니다.

삭제 정책은 별도 문서에서 정의합니다.

---

# 14. Workspace 이동 정책

## Note

Workspace 간 이동 가능

```text
Workspace A

↓

Workspace B
```

이동 시

```text
folderId = null
```

로 변경되어

대상 Workspace Root에 배치됩니다.

---

## Folder

Workspace 간 이동은 지원하지 않습니다.

2차에서 검토합니다.

---

# 15. AI

AI는 현재 선택된 Workspace를 기준으로 동작합니다.

기존처럼

```text
"default"
```

문자열을 사용하지 않습니다.

항상

```text
documentGroupId
```

를 전달합니다.

---

# 16. 설계 원칙

이번 1차 목표는

**Workspace라는 도메인 모델을 시스템 전체에 도입하는 것**입니다.

고급 UX보다

- 데이터 무결성
- Workspace 단위 분리
- AI 분리
- 확장 가능한 구조

를 우선합니다.

Workspace는 BrainX의 최상위 도메인입니다.
