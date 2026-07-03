# BrainX 버그 분석 보고서

**작성일**: 2026-07-01
**분석 범위**: 화이트박스 + 블랙박스 통합 분석
**분석 대상**: Next.js 프론트엔드, 크롬 익스텐션, 5개 Spring Boot 마이크로서비스
**작성 기준**: 실제 코드 파일 직접 확인 후 작성 (추측성 항목 제외)

---

## 요약 대시보드

| 심각도 | FE/EXT | BE | 합계 |
|--------|--------|----|------|
| HIGH   | 5      | 3  | 8    |
| MED    | 3      | 6  | 9    |
| LOW    | 1      | 2  | 3    |
| RESOLVED | 1   | 2  | 3    |
| NOT A BUG | 1  | 0  | 1    |
| **합계** | **11** | **13** | **24** |

---

## 1. 프론트엔드 (Next.js)

### [FE-01] completeOnboarding — provider 하드코딩

| 항목 | 내용 |
|------|------|
| 심각도 | HIGH |
| 파일 | `brainx-next/lib/auth-api.ts:482` |
| 분류 | 화이트박스 — 데이터 오염 |

**코드 확인**
```ts
// auth-api.ts:482 (completeOnboarding 내부)
provider: "email"  // 소셜 로그인 사용자도 "email"로 고정됨
```

**버그 설명**
소셜 로그인 후 온보딩 완료(`completeOnboarding`)를 호출할 때 `provider` 필드가 `"email"`로 하드코딩되어 전송된다. `completeOAuthLogin`(line 464)은 OAuth provider를 올바르게 처리하지만, `completeOnboarding`은 provider를 동적으로 받지 않는다.

**블랙박스 재현**
1. Google OAuth로 회원가입
2. 온보딩 단계(이름, 관심사 설정 등) 완료
3. DB의 `provider` 컬럼이 `"google"` 대신 `"email"`로 저장됨

**영향**: 소셜 로그인 사용자의 provider 불일치 → 추후 OAuth 재연동/분리 기능 오작동 가능성

---

### [FE-02] 데모 세션 분기 불일치

| 항목 | 내용 |
|------|------|
| 심각도 | — |
| 상태 | **RESOLVED** |

**확인 결과**: `ingestion-api.ts`에 `isDemoSession` / `USE_MOCK_NOTES` 분기 코드가 존재하지 않음. 이미 제거된 것으로 판단됨.

---

### [FE-03] workspace-api — 403 응답 미처리

| 항목 | 내용 |
|------|------|
| 심각도 | HIGH |
| 파일 | `brainx-next/lib/workspace-api.ts:163` |
| 분류 | 화이트박스 — 에러 핸들링 누락 |

**코드 확인**
```ts
// workspace-api.ts:163
if (response.status === 401) {
  clearAuthSession();
  throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
}
// 403 처리 없음 — payload?.message 에러로 폴백
```

**버그 설명**
`intelligence-api.ts`는 401·403을 모두 세션 만료로 처리(line 71)하지만, `workspace-api.ts`는 401만 처리한다. 403 응답 시 generic 에러 메시지가 노출되고 세션이 정리되지 않는다.

**블랙박스 재현**
1. 다른 사용자 소유의 노트 ID로 직접 API 호출
2. 403 응답 → UI에 "요청 처리에 실패했습니다." 표시 (로그인 만료와 구분 불가)

---

### [FE-06] XSS — 링크 href javascript: 스킴 미필터링

| 항목 | 내용 |
|------|------|
| 심각도 | HIGH |
| 파일 | `brainx-next/components/notes/NoteEditor.tsx:93` |
| 분류 | 화이트박스 — 보안 취약점 (OWASP A03) |

**코드 확인**
```ts
// NoteEditor.tsx:93 (inlineHtml 함수 내)
out += `<a href="${href.replace(/"/g, "&quot;")}">${text}</a>`;
// href에서 javascript: 스킴 필터링 없음
```

**버그 설명**
마크다운 인라인 링크 처리 시 `"` 이스케이프만 수행하고 `javascript:` 프로토콜은 필터링하지 않는다. 노트에 `[클릭](javascript:alert(document.cookie))` 형태의 링크를 저장하면 렌더링 시 그대로 실행된다.

**블랙박스 재현**
1. 노트에 `[클릭](javascript:alert(1))` 입력
2. 미리보기/PDF 내보내기 → 링크 클릭 → XSS 실행

**영향**: 타 사용자가 공유한 노트를 열었을 때 쿠키·토큰 탈취 가능

---

### [FE-07] semantic-search 이중 경로

| 항목 | 내용 |
|------|------|
| 상태 | **NOT A BUG** |

**확인 결과**: `app/api/intelligence/[...path]/route.ts`의 프록시가 `path` 배열을 `/api/v1/` 접두사와 결합하므로, `/api/intelligence/intelligence/semantic-search`는 올바르게 `/api/v1/intelligence/semantic-search`로 매핑됨.

---

### [FE-09] createAssetUploadSession — 필드명 오류

| 항목 | 내용 |
|------|------|
| 심각도 | MED |
| 파일 | `brainx-next/lib/ingestion-api.ts:225` |
| 분류 | 화이트박스 — API 계약 위반 |

**코드 확인**
```ts
// ingestion-api.ts:218-227
async function createAssetUploadSession(file: File, targetFolderId?: string) {
  return authedRequest<AssetUploadSessionData>("/api/v1/assets/upload-sessions", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      targetNoteId: targetFolderId ?? null  // ← 파라미터명(targetFolderId)과 필드명(targetNoteId) 불일치
    })
  });
}
```

**버그 설명**
함수 파라미터는 `targetFolderId`인데 JSON body는 `targetNoteId`로 전송한다. 백엔드 `AssetUploadSession`이 `targetNoteId` 필드를 읽으면 폴더 ID가 노트 ID 필드에 저장된다.

**블랙박스 재현**
1. 특정 폴더를 대상으로 파일(ZIP 등) 업로드
2. 업로드된 에셋의 대상 폴더가 무시됨 (서버가 `targetNoteId`로 받아서 처리)

---

### [FE-10] 새 노트 autosave — draft ID prefix 불일치

| 항목 | 내용 |
|------|------|
| 심각도 | HIGH |
| 파일 | `brainx-next/components/notes/NotesWorkspace.tsx:60, :1548` |
| 분류 | 화이트박스 — 로직 오류 |

**코드 확인**
```ts
// NotesWorkspace.tsx:60 (makeBlankNote)
id: `note-${uid()}`,   // 하이픈(-)

// NotesWorkspace.tsx:1548 (autosave 조건)
if (note.id.startsWith("note_")) {  // 언더스코어(_)
  // 드래프트 저장 스킵
}
```

**버그 설명**
새로 생성된 노트 ID는 `note-` 접두사(하이픈)를 가지지만, 미저장 새 노트를 판별하는 autosave 로직은 `note_` 접두사(언더스코어)를 확인한다. 따라서 새 노트는 미저장 조건을 만족하지 못해 항상 드래프트 저장이 실행된다(의도와 반대거나, 혹은 새 노트 전용 초기화 경로 누락).

**블랙박스 재현**
1. 새 노트 생성 → 제목·내용 입력
2. 30초 대기 (autosave interval)
3. 예상: 드래프트로 임시 저장됨 / 실제: 조건 불일치로 동작이 의도와 다를 수 있음

---

### [FE-11] WikiLink 빈 쿼리 — 정렬 없음

| 항목 | 내용 |
|------|------|
| 심각도 | LOW |
| 파일 | `brainx-next/components/notes/WikiLinkAutocomplete.tsx:44` |
| 분류 | 화이트박스 — UX 결함 |

**버그 설명**
`[[` 입력 후 쿼리가 비어있을 때 정렬 없이 전체 노트 목록을 반환한다. 최근 수정순·이름순 등 일관된 순서가 없어 UX가 불안정하다.

---

## 2. 크롬 익스텐션

### [EXT-01 / FE-04] chrome.action.openPopup() MV3 제거된 API

| 항목 | 내용 |
|------|------|
| 심각도 | HIGH |
| 파일 | `extension/background.js:13` |
| 분류 | 화이트박스 — 플랫폼 API 오용 |

**코드 확인**
```js
// background.js:13
chrome.action.openPopup();
```

**버그 설명**
`chrome.action.openPopup()`은 Manifest V3에서 사용자 제스처 없이 프로그래매틱으로 팝업을 열 수 없도록 제한되어 있다. Chrome 127+에서 이 API는 사용자 액션 컨텍스트 외부에서 호출 시 에러를 던진다.

**블랙박스 재현**
1. 익스텐션 설치 후 background.js의 트리거 조건 충족
2. 팝업이 열리지 않고 콘솔에 에러 발생

---

### [EXT-02 / FE-05] capture 뷰 진입 시 pageInfo null

| 항목 | 내용 |
|------|------|
| 심각도 | HIGH |
| 파일 | `extension/popup.js:173-174` |
| 분류 | 화이트박스 — null 참조 |

**코드 확인**
```js
// popup.js:173-174
} catch (e) {
  showView('viewCapture');  // pageInfo가 null인 상태로 캡처 뷰 진입
}
```

**버그 설명**
페이지 정보 수집 중 예외 발생 시 catch 블록에서 `pageInfo=null` 상태로 `viewCapture` 뷰를 표시한다. 이후 캡처 시도 시 `pageInfo.url` 등에서 TypeError가 발생한다.

**블랙박스 재현**
1. 브라우저 내부 페이지(`chrome://...`)에서 익스텐션 팝업 열기
2. 에러 catch → 빈 캡처 뷰 표시 → "저장" 클릭 → TypeError

---

### [EXT-03 / FE-08] bodyText를 metaDescription 필드에 혼용

| 항목 | 내용 |
|------|------|
| 심각도 | MED |
| 파일 | `extension/content.js:40` |
| 분류 | 화이트박스 — 데이터 오염 |

**코드 확인**
```js
// content.js:40
metaDescription: bodyText || metaDescription
```

**버그 설명**
`<meta name="description">` 태그가 없을 때 페이지 전체 본문(`bodyText`)을 `metaDescription` 필드에 저장한다. 수천 자의 본문이 메타설명 필드에 담기므로 백엔드의 메타설명 기반 처리(요약, 인덱싱 등)가 오염된다.

---

## 3. 백엔드 마이크로서비스

---

### User-Service

#### [BE-01] dev-test-user fallback

| 항목 | 내용 |
|------|------|
| 상태 | **RESOLVED** |

**확인 결과**: `CurrentActor.java`에서 `devFallbackEnabled` 프로퍼티(기본값 `false`)로 보호됨. 프로덕션 환경에서 dev fallback이 동작하지 않음.

---

#### [BE-02 / USER-01] OAuth 상태 맵 TTL 없음 — 메모리 무한 누적

| 항목 | 내용 |
|------|------|
| 심각도 | HIGH |
| 파일 | `brainX_back/User-Service/src/main/java/com/brainx/user/service/AuthService.java:72-73` |
| 분류 | 화이트박스 — 메모리 누수 |

**코드 확인**
```java
// AuthService.java:72-73
private final ConcurrentHashMap<String, OAuthState> oauthStates = new ConcurrentHashMap<>();
private final ConcurrentHashMap<String, PendingOAuthSignup> pendingOAuthSignups = new ConcurrentHashMap<>();
```

**버그 설명**
OAuth 흐름 중단(브라우저 닫기, 타임아웃 등) 시 `oauthStates`와 `pendingOAuthSignups`에 항목이 영구 누적된다. 만료 스캔·TTL 없이 항목 제거가 성공 경로에서만 이루어진다.

**블랙박스 재현**
1. OAuth 로그인 시작 → 브라우저 닫기 (수백 회 반복)
2. 서버 재시작 없이 장기 운영 → 힙 증가 → OOM

**영향**: 프로덕션 장기 운영 시 OOM 가능성, 만료된 state token CSRF 재사용 가능성

---

#### [BE-06 / USER-02] JWT 서명 비상수시간 비교 — 타이밍 공격

| 항목 | 내용 |
|------|------|
| 심각도 | MED |
| 파일 | `brainX_back/User-Service/src/main/java/com/brainx/user/security/JwtTokenProvider.java:104` |
| 분류 | 화이트박스 — 보안 취약점 |

**코드 확인**
```java
// JwtTokenProvider.java:104
if (!sign(unsignedToken).equals(parts[2])) {
    throw new IllegalArgumentException("Invalid signature");
}
```

**버그 설명**
`String.equals()`는 첫 번째 불일치 바이트에서 즉시 반환(비상수시간)하여 타이밍 사이드채널이 발생한다. 공격자가 서명의 각 바이트를 통계적으로 추론할 수 있다.

**수정 방법**: `MessageDigest.isEqual()` 또는 `java.security.MessageDigest.isEqual(byte[], byte[])` 사용

---

### Workspace-Service

#### [BE-04 / WS-01] 공유링크 expiresAt null NPE

| 항목 | 내용 |
|------|------|
| 심각도 | HIGH |
| 파일 | `brainX_back/Workspace-Service/src/main/java/com/brainx/workspace/service/WorkspaceService.java:542` |
| 분류 | 화이트박스 — NPE |

**코드 확인**
```java
// WorkspaceService.java:542
if (share.getExpiresAt().isBefore(Instant.now())) {  // getExpiresAt() → null 가능
    throw BrainXException.forbidden("만료된 공유 링크입니다.");
}
```

**버그 설명**
만료일 없는 영구 공유링크를 생성한 경우 `getExpiresAt()`이 `null`을 반환하므로 `NullPointerException`이 발생한다.

**블랙박스 재현**
1. 노트 공유 시 만료일 미설정 → 공유링크 생성
2. 해당 공유링크 접근 → 500 Internal Server Error

---

#### [BE-05 / WS-02] 드래프트 스케줄러 fixedDelay 단위 오류

| 항목 | 내용 |
|------|------|
| 심각도 | HIGH |
| 파일 | `brainX_back/Workspace-Service/src/main/java/com/brainx/workspace/scheduler/NoteDraftFlushScheduler.java:16` |
| 분류 | 화이트박스 — 설정 오류 |

**코드 확인**
```java
// NoteDraftFlushScheduler.java:16
@Scheduled(fixedDelayString = "${brainx.draft.flush-delay-ms}000")
```

**버그 설명**
`"${...}000"` 문자열 결합으로 밀리초 변환을 구현했다. `application.yml`에서 `flush-delay-ms: 5`로 설정하면 `"5000"` ms = 5초가 되지만, `flush-delay-ms: 300`이면 `"300000"` ms = 5분으로 의도치 않게 늘어난다. 설정자가 단위를 혼동하여 `flush-delay-ms: 5000`(이미 ms 단위)으로 입력하면 `"5000000"` ms = 83분이 된다.

**수정 방법**: `fixedDelayString = "${brainx.draft.flush-delay-ms}"` 사용 후 `application.yml`에서 ms 단위로 직접 설정

---

#### [BE-07 / WS-03] Draft Redis payload 필드 null NPE

| 항목 | 내용 |
|------|------|
| 심각도 | MED |
| 파일 | `brainX_back/Workspace-Service/src/main/java/com/brainx/workspace/service/NoteDraftService.java:89-90` |
| 분류 | 화이트박스 — NPE |

**코드 확인**
```java
// NoteDraftService.java:89-90
int baseVersion = ((Number) payload.get("baseVersion")).intValue();  // null NPE
Instant clientSavedAt = Instant.parse((String) payload.get("clientSavedAt"));  // null NPE
```

**버그 설명**
Redis에 저장된 드래프트 payload에 `baseVersion` 또는 `clientSavedAt` 필드가 없으면(이전 버전 호환성 문제, 손상된 데이터 등) NPE가 발생한다.

**블랙박스 재현**
1. Redis에서 특정 드래프트 key의 `baseVersion` 필드 제거
2. 해당 노트 드래프트 읽기 API 호출 → 500 에러

---

#### [BE-08] Redis keys() 블로킹

| 항목 | 내용 |
|------|------|
| 상태 | **RESOLVED** |

**확인 결과**: `NoteDraftService.java`에서 이미 `scan()`을 사용하도록 교체됨.

---

#### [BE-11 / WS-04] 폴더 depth 계산 오류

| 항목 | 내용 |
|------|------|
| 심각도 | MED |
| 파일 | `brainX_back/Workspace-Service/src/main/java/com/brainx/workspace/service/WorkspaceService.java:675` |
| 분류 | 화이트박스 — 로직 오류 |

**코드 확인**
```java
// WorkspaceService.java:675
int depth = folder.getParentFolderId() == null ? 0 : 1;
```

**버그 설명**
폴더 중첩 깊이를 최대 1로 고정한다. 루트 폴더가 아닌 모든 폴더의 depth가 1이 되어, 3단계 이상 중첩된 폴더 구조에서 depth 정보가 부정확하다.

**블랙박스 재현**
1. 루트 → A → B → C 폴더 구조 생성
2. C 폴더의 depth 조회 → 3이 아닌 1 반환

---

#### [BE-12 / WS-05] 태그 집계 시 전체 노트 메모리 로드

| 항목 | 내용 |
|------|------|
| 심각도 | LOW |
| 파일 | `brainX_back/Workspace-Service/src/main/java/com/brainx/workspace/service/WorkspaceService.java:386` |
| 분류 | 화이트박스 — 성능 문제 |

**버그 설명**
태그 집계를 위해 사용자의 모든 노트를 메모리에 로드한 뒤 Java 스트림으로 집계한다. 노트 수가 수천 개 이상일 때 응답 지연 및 메모리 압박이 발생한다.

**수정 방법**: `GROUP BY tag` 쿼리 또는 별도 태그 인덱스 테이블 사용

---

#### [BE-13 / WS-06] payload() 홀수 인수 → ArrayIndexOutOfBoundsException

| 항목 | 내용 |
|------|------|
| 심각도 | LOW |
| 파일 | `brainX_back/Workspace-Service/src/main/java/com/brainx/workspace/service/WorkspaceService.java:706` |
| 분류 | 화이트박스 — 방어 코드 없음 |

**버그 설명**
내부 `payload()` 빌더가 홀수 개 인수(key만 있고 value 없는 경우)를 받으면 배열 쌍 처리 중 `ArrayIndexOutOfBoundsException`이 발생한다.

---

### Ingestion-Service

#### [BE-09 / ING-01] Notion 토큰 교환 — res.getBody() null NPE

| 항목 | 내용 |
|------|------|
| 심각도 | MED |
| 파일 | `brainX_back/Ingestion-Service/src/main/java/com/brainx/ingestion/service/NotionApiService.java:61` |
| 분류 | 화이트박스 — NPE |

**코드 확인**
```java
// NotionApiService.java:61
Map<String, Object> data = res.getBody();   // null 가능
String accessToken = (String) data.get("access_token");  // NPE
```

**버그 설명**
Notion OAuth 토큰 교환 API가 빈 바디 또는 비정상 응답을 반환할 때 `res.getBody()`가 `null`이어서 NPE가 발생한다. Notion API 레이트 리밋, 네트워크 오류 등 다양한 상황에서 트리거된다.

**블랙박스 재현**
1. Notion 연동 OAuth flow 진행 중 토큰 교환 요청 시 Notion API 측 장애
2. 서버에서 NPE → 500 에러, Notion 연동 실패

---

#### [BE-10 / ING-02] 익스텐션 URL 입력값 XSS

| 항목 | 내용 |
|------|------|
| 심각도 | MED |
| 파일 | `brainX_back/Ingestion-Service/src/main/java/com/brainx/ingestion/service/ExtensionCaptureService.java:36` |
| 분류 | 화이트박스 — 보안 취약점 (OWASP A03) |

**코드 확인**
```java
// ExtensionCaptureService.java:36
String url = req.getUrl();   // 입력값 검증 없이 사용
```

**버그 설명**
익스텐션에서 전송하는 `url` 필드가 서버에서 검증 없이 사용된다. `javascript:alert(1)` 또는 악성 URL이 저장·반환될 경우 프론트엔드에서 XSS로 이어질 수 있다.

---

#### [BE-03 / ING-03] column 중첩 재귀 탐색 — 깊이 제한 없음

| 항목 | 내용 |
|------|------|
| 심각도 | MED |
| 파일 | `brainX_back/Ingestion-Service/src/main/java/com/brainx/ingestion/service/NotionApiService.java:459` |
| 분류 | 화이트박스 — 잠재적 StackOverflow |

**코드 확인**
```java
// NotionApiService.java:459
} else if (List.of("column_list", "column").contains(type)
           && Boolean.TRUE.equals(block.get("has_children"))) {
    collectChildPagesDeep(id, accessToken, refs, seenIds);  // 깊이 제한 없음
}
```

**버그 설명**
`child_page` 중복은 `seenIds`로 방지되지만, `column_list`/`column` 타입의 중첩 재귀는 깊이 제한이 없다. 비정상적으로 깊은 column 중첩 구조의 Notion 페이지 임포트 시 StackOverflow가 발생할 수 있다.

---

### Admin-Service

#### [ADM-01] Admin JWT 서명 비상수시간 비교

| 항목 | 내용 |
|------|------|
| 심각도 | MED |
| 파일 | `brainX_back/Admin-Service/src/main/java/com/brainx/admin/security/AdminJwtTokenProvider.java:87` |
| 분류 | 화이트박스 — 보안 취약점 |

**코드 확인**
```java
// AdminJwtTokenProvider.java:87
if (!sign(unsignedToken).equals(parts[2])) {
    throw new IllegalArgumentException("Invalid signature");
}
```

**버그 설명**
User-Service의 BE-06(JwtTokenProvider.java:104)와 동일한 비상수시간 비교 패턴. 두 서비스 모두 수정이 필요하다.

---

### Commerce-Service

**확인 결과**: Commerce-Service 주요 로직(`CommerceService.java`)에서 명시적 버그 미발견.
- `request.getAmount() != session.getAmount()` — `Long` vs `long` 비교지만 null 체크 후 auto-unboxing으로 올바른 기본형 비교가 이루어짐
- `orElseThrow()` 패턴으로 null 처리 일관됨
- `@Transactional(noRollbackFor = CommerceException.class)` — 의도적 설계

---

## 4. 우선순위 정리

### 즉시 수정 필요 (HIGH)

| ID | 파일 | 설명 |
|----|------|------|
| FE-06 | NoteEditor.tsx:93 | XSS — javascript: 스킴 미필터링 |
| BE-02 / USER-01 | AuthService.java:72 | OAuth 맵 TTL 없음 → OOM 위험 |
| BE-04 / WS-01 | WorkspaceService.java:542 | 공유링크 expiresAt NPE → 500 에러 |
| BE-05 / WS-02 | NoteDraftFlushScheduler.java:16 | 스케줄러 단위 오류 → 드래프트 지연 |
| FE-10 | NotesWorkspace.tsx:60,1548 | draft ID prefix 불일치 |
| FE-03 | workspace-api.ts:163 | 403 미처리 |
| EXT-01 / FE-04 | background.js:13 | MV3 제거된 API |
| EXT-02 / FE-05 | popup.js:173 | pageInfo null → TypeError |

### 보안 수정 필요 (MED)

| ID | 파일 | 설명 |
|----|------|------|
| BE-06 / USER-02 | JwtTokenProvider.java:104 | 타이밍 공격 |
| ADM-01 | AdminJwtTokenProvider.java:87 | 타이밍 공격 (동일 패턴) |
| BE-10 / ING-02 | ExtensionCaptureService.java:36 | URL XSS |
| FE-09 | ingestion-api.ts:225 | 필드명 오류 → 파일 업로드 폴더 무시 |

### 개선 권장 (MED~LOW)

| ID | 파일 | 설명 |
|----|------|------|
| BE-07 / WS-03 | NoteDraftService.java:89 | null payload 필드 NPE |
| BE-09 / ING-01 | NotionApiService.java:61 | Notion 토큰 null NPE |
| BE-11 / WS-04 | WorkspaceService.java:675 | 폴더 depth 고정 |
| BE-03 / ING-03 | NotionApiService.java:459 | column 재귀 깊이 제한 없음 |
| EXT-03 / FE-08 | content.js:40 | bodyText → metaDescription 혼용 |
| FE-01 | auth-api.ts:482 | completeOnboarding provider 하드코딩 |
| BE-12 / WS-05 | WorkspaceService.java:386 | 태그 집계 전체 로드 |
| BE-13 / WS-06 | WorkspaceService.java:706 | payload() 홀수 인수 AIOOBE |
| FE-11 | WikiLinkAutocomplete.tsx:44 | 빈 쿼리 정렬 없음 |

---

*분석 완료: 2026-07-01*
*참조 문서: `docs/test/BUG_REPORT.md` (원본 24개 항목)*
