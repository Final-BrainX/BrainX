# Workspace Tickets

> BrainX Workspace 개발 티켓
>
> Version: 1.0
>
> Status: Planning

---

# 목적

본 문서는 Workspace(documentGroup) 기능의 개발 계획을 정의합니다.

각 Ticket은

- 목표
- 구현 범위
- 선행 Ticket
- 담당
- 리뷰
- 완료 조건

을 명확하게 정의합니다.

Architecture 및 Policies 문서를 기준으로 구현합니다.

---

# Ticket 진행 규칙

모든 Ticket은 아래 순서를 따릅니다.

```
Planning
    ↓
Implementation
    ↓
Review
    ↓
Test
    ↓
Done
```

구현 범위를 넘어서는 작업은 하지 않습니다.

필요한 경우

"후속 Ticket 필요"

라고 보고합니다.

---

# Ticket 상태

| 상태           | 의미      |
| -------------- | --------- |
| ⬜ Planned     | 작업 예정 |
| 🟨 In Progress | 구현 중   |
| 🟦 Review      | 리뷰 중   |
| 🟩 Done        | 완료      |

---

# 우선순위

| Priority | 의미         |
| -------- | ------------ |
| High     | 반드시 먼저  |
| Medium   | 선행 완료 후 |
| Low      | 이후 진행    |

---

# Epic

Workspace(documentGroup) 기반 다중 Workspace 지원

목표

기존 단일 노트 공간을

Workspace(documentGroup)

기반 구조로 변경한다.

---

# Ticket 1

## SSOT 계약 정리

Status

🟩 Done

Priority

High

Owner

Codex

Reviewer

Claude Code

Depends On

없음

### 목표

Workspace 구조를 기준으로

OpenAPI

AsyncAPI

README

를 수정한다.

### 구현

- Workspace API 계약
- documentGroupId 계약
- Workspace 생성
- Workspace 이름 변경
- Selection API 제거
- Workspace 삭제 제거
- AI documentGroup 정책

### 완료 조건

SSOT가 최종 정책과 일치한다.

---

# Ticket 2

## Workspace Entity / DB Schema

Status

⬜ Planned

Priority

High

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 1

### 목표

Workspace 도메인을 DB에 추가한다.

### 구현

- document_groups 테이블
- Workspace Entity
- Repository
- document_group_id(nullable)

### 금지

❌ NOT NULL

❌ FK 강제

❌ Backfill

### 완료 조건

Workspace Entity가 추가된다.

---

# Ticket 3

## 기존 데이터 Migration

Status

⬜ Planned

Priority

High

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 2

### 목표

기존 데이터를 Default Workspace에 귀속한다.

### 구현

- Default Workspace 생성
- Note Backfill
- Folder Backfill

### 완료 조건

NULL 데이터가 없다.

---

# Ticket 4

## Default Workspace Provisioning

Status

⬜ Planned

Priority

High

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 3

### 목표

회원가입 시 Default Workspace 생성

### 구현

- Provisioning
- 중복 방지
- 실패 처리

### 완료 조건

회원가입 후 항상 Default Workspace 존재

---

# Ticket 5

## Workspace CRUD API

Status

⬜ Planned

Priority

High

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 4

### 구현

GET

POST

PATCH

### 제외

DELETE

### 완료 조건

Workspace CRUD 정상

---

# Ticket 6

## DTO/API 확장

Status

⬜ Planned

Priority

High

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 5

### 구현

Workspace DTO

Note DTO

Folder DTO

Snapshot DTO

documentGroupId 추가

---

# Ticket 7

## Validation

Status

⬜ Planned

Priority

High

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 6

### 구현

Workspace 검증

Parent 검증

Folder 검증

---

# Ticket 8

## Duplicate Rule

Status

⬜ Planned

Priority

High

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 7

### 구현

Workspace 이름

Note

Folder

중복 정책

---

# Ticket 9

## Guest Claim

Status

⬜ Planned

Priority

High

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 8

### 구현

Guest Draft

↓

Default Workspace

---

# Ticket 10

## Note Workspace Move

Status

⬜ Planned

Priority

Medium

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 9

### 구현

Workspace 이동

↓

Root 배치

folderId=null

---

# Ticket 11

## Workspace Context

Status

⬜ Planned

Priority

Medium

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 10

### 구현

Context

Provider

currentWorkspaceId

---

# Ticket 12

## Workspace 생성 UI

Status

⬜ Planned

Priority

Medium

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 11

### 구현

생성 버튼

생성 Modal

자동 선택

---

# Ticket 12.5

## Workspace 수동 전환 UI

Status

🟩 Done

Priority

Medium

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 12

### 목표

기존 Workspace 목록에서 다른 Workspace로 수동 전환하는 selector UI를 추가한다.

### 구현

- TopBar Selector
- Workspace 목록 드롭다운
- switchWorkspace(documentGroupId) 호출
- Guest/loading/empty 처리

### 제외

- Home/Notes 데이터 재조회
- Welcome Board 초기화
- split/tabs 초기화

### 완료 조건

Selector 클릭으로 currentWorkspaceId가 정상적으로 바뀐다.

---

# Ticket 13

## Home Workspace

Status

🟩 Done

Priority

Medium

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 12.5

### 구현

- Home이 useWorkspace() 구독
- 현재 Workspace 이름 표시
- currentWorkspaceId 변경 시 통계 재조회 트리거

### 제한

getMyWorkspaceStats()(`/api/v1/workspaces/me/stats`)는 전체 Workspace 합산 통계라
documentGroupId로 필터링되지 않는다. Workspace별 실제 통계/최근 활동을 보여주려면
SSOT에 이미 정의된 `GET /api/v1/workspaces/{documentGroupId}/sync` 라우트를
Backend가 실제로 노출해야 한다(후속 Backend Ticket 필요).

### 완료 조건

Workspace 전환 시 Home에 현재 Workspace 이름이 반영된다.

---

# Ticket 14

## Notes Workspace

Status

⬜ Planned

Priority

Medium

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 13

### 구현

Workspace 변경

↓

Notes

↓

Welcome Board

---

# Ticket 15

## Login Flow

Status

⬜ Planned

Priority

Medium

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 14

### 구현

로그인

↓

Default Workspace

---

# Ticket 16

## AI documentGroup

Status

⬜ Planned

Priority

Medium

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 15

### 구현

"default"

↓

currentWorkspaceId

---

# Ticket 17

## Regression Test

Status

⬜ Planned

Priority

High

Owner

Codex

Reviewer

Claude Code

Depends On

Ticket 16

### 테스트

- Workspace 생성
- 이름 변경
- Context
- Guest Claim
- AI
- Graph
- Search
- WikiLink
- Migration
- Note Move

### 완료 조건

Workspace 기능 도입 후

기존 기능 회귀 없음

---

# 2차 범위

다음 기능은 2차에서 구현합니다.

- Workspace 삭제
- Folder Workspace 이동
- Workspace 공유
- Workspace 권한
- Workspace별 Split/Tabs 복원
- 로그인 후 Workspace 선택
- 기본 Workspace 변경
- Workspace 색상
- Workspace 아이콘
- Workspace 즐겨찾기

---

# 구현 순서

```
Ticket1

↓

Ticket2

↓

Ticket3

↓

Ticket4

↓

Ticket5

↓

Ticket6

↓

Ticket7

↓

Ticket8

↓

Ticket9

↓

Ticket10

↓

Ticket11

↓

Ticket12

↓

Ticket12.5

↓

Ticket13

↓

Ticket14

↓

Ticket15

↓

Ticket16

↓

Ticket17
```
