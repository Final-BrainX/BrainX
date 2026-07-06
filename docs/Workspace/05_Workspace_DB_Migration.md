# Workspace DB Migration

> BrainX Workspace Database Migration Guide
>
> Version: 1.0
>
> Status: Draft

---

# 1. 목적

Workspace(documentGroup)를
기존 데이터에 안전하게 도입하기 위한
Migration 절차를 정의합니다.

본 문서는

- 개발
- 운영
- QA

모두 동일한 절차를 따릅니다.

---

# 2. Migration 원칙

절대

```
NOT NULL
```

부터 추가하지 않습니다.

반드시

```
Nullable

↓

Backfill

↓

Validation

↓

Constraint
```

순서를 따릅니다.

---

# 3. STEP 1

## document_groups 생성

생성

```
document_groups
```

컬럼

- document_group_id
- user_id
- name
- is_default
- created_at
- updated_at

---

# 4. STEP 2

Note

추가

```
document_group_id
```

Nullable

---

Folder

추가

```
document_group_id
```

Nullable

---

# 5. STEP 3

Workspace Entity 생성

생성

```
Workspace Entity

WorkspaceRepository

WorkspaceService
```

---

# 6. STEP 4

Default Workspace 생성

모든 기존 회원

↓

Default Workspace 생성

예시

```
Default
```

또는

서비스 정책 이름

---

# 7. STEP 5

Backfill

기존

```
Note

Folder
```

↓

회원의 Default Workspace

귀속

---

# 8. STEP 6

Validation

확인

- NULL 존재 여부
- 고아 데이터
- Workspace 없는 Note
- Workspace 없는 Folder

---

# 9. STEP 7

Constraint 적용

```
NOT NULL
```

적용

---

추가

Foreign Key

```
Note

↓

Workspace
```

```
Folder

↓

Workspace
```

---

# 10. STEP 8

Unique Constraint

Default Workspace

회원당

```
1개
```

보장

---

Workspace 이름

동일 사용자

중복 불가

---

Note

동일

User

↓

Workspace

↓

Folder

중복 불가

---

Folder

동일

User

↓

Workspace

↓

Parent Folder

중복 불가

---

# 11. Guest

Guest는

Workspace 생성 안 함

Migration 없음

Redis Draft만 사용

---

# 12. Rollback

Migration 실패 시

새 Constraint 적용 전

Rollback 가능

Backfill 완료 후

Validation 실패 시

Constraint 적용 금지

---

# 13. Migration 완료 기준

완료 조건

- 모든 회원이 Default Workspace 보유
- 모든 Note가 Workspace 소속
- 모든 Folder가 Workspace 소속
- NULL 데이터 없음
- FK 정상
- Unique Constraint 정상
- 기존 기능 회귀 없음

---

# 14. 체크리스트

□ document_groups 생성

□ Workspace Entity 생성

□ Nullable 컬럼 추가

□ Default Workspace 생성

□ Backfill 완료

□ Validation 완료

□ NOT NULL 적용

□ FK 적용

□ Unique Constraint 적용

□ 회귀 테스트 완료
