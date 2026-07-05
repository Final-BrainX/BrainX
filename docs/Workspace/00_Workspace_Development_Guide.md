# Workspace Agent Guide

> BrainX Workspace 개발 가이드
>
> Version: 1.0
>
> Status: Active

---

# 목적

본 문서는 Workspace 기능을 개발하는 모든 개발자와 AI Agent가
가장 먼저 읽는 안내 문서입니다.

Workspace는 BrainX의 핵심 도메인이며,
모든 구현은 본 문서를 시작으로
Architecture → Policies → Tickets 순서로 진행합니다.

본 문서는 다음 내용을 정의합니다.

- 개발 원칙
- 작업 절차
- 역할 분담
- Ticket 진행 방식
- 작업 보고 규칙

---

# 반드시 먼저 읽을 문서

Workspace 관련 작업을 시작하기 전에 반드시 아래 문서를 순서대로 읽습니다.

1. 01_Workspace_Architecture.md
2. 02_Workspace_Policies.md
3. 03_Workspace_Tickets.md
4. 04_Workspace_API_Mapping.md
5. 05_Workspace_DB_Migration.md

위 문서를 읽지 않은 상태에서 Workspace 기능을 구현하지 않습니다.

---

# Workspace 개발 원칙

Workspace는 BrainX의 최상위 도메인입니다.

Workspace 아래에

- Folder
- Note
- WikiLink
- Graph
- AI

등의 데이터가 존재합니다.

Workspace 도입 이후에는

모든 데이터는 반드시 하나의 Workspace(documentGroup)에만 소속됩니다.

구현보다 정책을 우선합니다.

현재 코드와 문서가 다르다면,
Architecture와 Policies 문서를 우선 기준으로 합니다.

---

# 역할 분담

## 설계 및 검토

설계와 정책 검토를 담당합니다.

주요 역할

- 영향 범위 분석
- 아키텍처 검토
- 정책 검토
- 작업 순서 검토
- 회귀 위험 분석
- 코드 리뷰
- 리팩터링 방향 제안

---

## 구현

설계 문서를 기준으로 구현을 담당합니다.

주요 역할

- Entity 구현
- Repository 구현
- Controller 구현
- Service 구현
- DTO 수정
- API 구현
- Frontend 구현
- 테스트 코드 작성
- 리팩터링

---

# Ticket 진행 방식

Workspace 기능은 아래 순서로 진행합니다.

Architecture

↓

Policies

↓

Ticket

↓

API Mapping

↓

DB Migration

↓

구현

↓

리뷰

↓

테스트

↓

다음 Ticket

각 Ticket은 반드시 순서대로 진행합니다.

다른 Ticket 범위를 함께 구현하지 않습니다.

---

# 권장 작업 흐름

Workspace 개발은 아래 흐름을 권장합니다.

1. 설계 검토
2. 구현
3. 코드 리뷰
4. 테스트
5. 다음 Ticket 진행

---

# 작업 시작 전 체크리스트

Workspace 작업을 시작하기 전에 반드시 확인합니다.

□ Architecture를 읽었는가

□ Policies를 읽었는가

□ 현재 Ticket을 확인했는가

□ API Mapping을 확인했는가

□ DB Migration 순서를 확인했는가

□ 현재 Ticket 범위를 벗어나지 않는가

---

# 작업 중 원칙

현재 Ticket 범위만 구현합니다.

예를 들어

Ticket5 작업 중

Ticket10 기능을 함께 구현하지 않습니다.

필요한 경우

"후속 Ticket 필요"

라고 보고합니다.

---

추측으로 기능을 구현하지 않습니다.

정책이 모호하면

구현보다 먼저 검토를 요청합니다.

---

DB Migration에서는

절대로

NOT NULL

부터 적용하지 않습니다.

반드시

Nullable

↓

Backfill

↓

Validation

↓

Constraint

순서를 따릅니다.

---

구현 중 정책 변경이 필요하다고 판단되면

Architecture 또는 Policies 문서를 먼저 수정한 뒤

구현을 진행합니다.

---

# 작업 완료 후 보고

작업이 끝나면 반드시 아래 내용을 보고합니다.

## 변경 파일

수정한 파일 목록

---

## 구현 내용

무엇을 구현했는지

---

## 테스트

수행한 테스트

---

## 회귀 가능성

영향받는 기능

---

## 후속 작업

다음 Ticket 또는 추가로 필요한 작업

---

# Workspace 구현 목표

1차 목표는

Workspace라는 도메인을 시스템 전체에 안정적으로 도입하는 것입니다.

우선순위는 다음과 같습니다.

1. 데이터 무결성
2. Workspace 단위 데이터 분리
3. 확장 가능한 구조
4. 사용자 경험

고급 기능보다
안정적인 구조를 우선 완성합니다.

---

# 참고

Workspace 관련 구현은 항상 아래 문서를 기준으로 합니다.

- 01_Workspace_Architecture.md
- 02_Workspace_Policies.md
- 03_Workspace_Tickets.md
- 04_Workspace_API_Mapping.md
- 05_Workspace_DB_Migration.md

본 문서는 Workspace 개발의 시작점이며,
모든 Workspace 관련 작업은 본 문서를 먼저 확인한 후 진행합니다.
