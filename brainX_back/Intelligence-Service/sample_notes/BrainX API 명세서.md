# BrainX 통합 API 명세서

> **작성 기준**: `BrainX_기능_상세_명세서.docx` 기반 + 구현 명세 통합  
> **공통 prefix**: `/api/v1`  
> **인증 방식**: Access Token (Bearer) + Refresh Token / HttpOnly Secure Cookie  
> **페이지네이션**: cursor 기반  
> **스트리밍**: SSE (AI 응답)

---

## 공통 규칙

### Base URL

```
http://localhost:8080
```

MSA Gateway 사용 시:

```
https://api.brainx.com
```

---

### 공통 응답 형식

```json
// 성공
{
  "success": true,
  "data": {},
  "message": "요청이 성공적으로 처리되었습니다."
}

// 실패
{
  "success": false,
  "data": null,
  "message": "오류 메시지"
}
```

---

### 공통 에러 응답 (상세)

```json
{
  "error": {
    "code": "NOTE_VERSION_CONFLICT",
    "message": "The note was changed by another device.",
    "traceId": "trc_01J...",
    "details": {
      "serverVersion": 17,
      "clientBaseVersion": 16
    }
  }
}
```

---

### 공통 이벤트 Envelope

```json
{
  "eventId": "evt_01J...",
  "eventType": "NoteContentSaved",
  "eventVersion": 1,
  "occurredAt": "2026-06-05T08:00:00Z",
  "producer": "knowledge-workspace",
  "tenantId": "ten_...",
  "userId": "usr_...",
  "correlationId": "req_...",
  "payload": {}
}
```

---

### 공통 상태 코드

|Status|의미|
|---|---|
|200|요청 성공|
|201|생성 성공|
|202|비동기 작업 접수|
|400|잘못된 요청|
|401|인증 필요|
|403|권한 없음|
|404|리소스 없음|
|409|충돌 발생|
|500|서버 내부 오류|

---

## 1. Identity & Access Service

> **도메인 책임**: 사용자 신원, 로그인 수단, 계정 보안, 개인정보 동의 이력  
> **관련 기능**: `1.1.1` `1.2.1` `1.3.1` `8.2.1` `14.1`

---

### 1-1. [POST] 이메일 인증 코드 요청

**URL**: `/api/v1/auth/email-verifications`

**인증 필요**: ❌

**설명**: 회원가입 또는 비밀번호 변경 시 이메일 인증 코드 발송

**발행 이벤트**: `EmailVerificationRequested`

```json
// Request Body
{
  "email": "user@brainx.com",
  "purpose": "SIGNUP"
}
// purpose: "SIGNUP" | "PASSWORD_CHANGE"
```

```json
// Response 200
{
  "success": true,
  "data": {
    "verificationId": "ver_01HZX123ABC",
    "email": "user@brainx.com",
    "expiresAt": "2026-06-08T15:30:00"
  },
  "message": "인증 코드가 이메일로 발송되었습니다."
}
```

```json
// Response 400 - 이메일 형식 오류
{
  "success": false,
  "data": null,
  "message": "이메일 형식이 올바르지 않습니다."
}
```

```json
// Response 400 - 이미 가입된 이메일
{
  "success": false,
  "data": null,
  "message": "이미 가입된 이메일입니다."
}
```

### **1-1-1. [POST] 이메일 인증 코드 확인**

**URL**: `/api/v1/auth/email-verifications/verify`

**인증 필요**: ❌

**설명**: 발송된 이메일 인증 코드가 올바른지 확인

**발행 이벤트**: 없음

```json
// Request Body
{
  "email": "user@brainx.com",
  "verificationCode": "123456",
  "purpose": "SIGNUP"
}
// purpose: "SIGNUP" | "PASSWORD_CHANGE"
```

```json
// Response 200
{
  "success": true,
  "data": {
    "verified": true,
    "email": "user@brainx.com"
  },
  "message": "인증 코드가 확인되었습니다."
}
```

```json
// Response 400 - 인증 코드 미요청
{
  "success": false,
  "data": null,
  "message": "인증 코드를 먼저 요청해 주세요."
}
```

```json
// Response 400 - 인증 코드 불일치
{
  "success": false,
  "data": null,
  "message": "인증 코드가 올바르지 않습니다."
}
```

```json
// Response 400 - 인증 코드 만료
{
  "success": false,
  "data": null,
  "message": "인증 코드가 만료되었습니다."
}
```

```json
// Response 400 - 이메일 형식 오류
{
  "success": false,
  "data": null,
  "message": "이메일 형식이 올바르지 않습니다."
}
```

---

### 1-2. [POST] 이메일 회원가입

**URL**: `/api/v1/auth/signup/email`

**인증 필요**: ❌

**설명**: 이메일 인증 코드 확인 후 계정 생성 및 JWT 발급

**발행 이벤트**: `UserRegistered`, `ConsentRecorded`

```json
// Request Body
{
  "email": "user@brainx.com",
  "verificationCode": "123456",
  "password": "Brainx123!",
  "passwordConfirm": "Brainx123!",
  "consents": {
    "termsRequired": true,
    "privacyRequired": true,
    "marketingOptional": false,
    "behaviorAnalyticsOptional": true
  }
}
```

```json
// Response 201
{
  "success": true,
  "data": {
    "userId": "usr_01HZXABC123",
    "email": "user@brainx.com",
    "nickname": "user",
    "profileImageUrl": null,
    "role": "ROLE_USER",
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiJ9...",
    "tokenType": "Bearer",
    "requires2fa": false,
    "next": "ONBOARDING"
  },
  "message": "회원가입이 완료되었습니다."
}
```

```json
// Response 400 - 인증 코드 오류
{
  "success": false,
  "data": null,
  "message": "인증 코드가 올바르지 않습니다."
}
```

```json
// Response 400 - 비밀번호 조건 불만족
{
  "success": false,
  "data": null,
  "message": "비밀번호는 영문, 숫자, 특수문자를 포함해 8자 이상이어야 합니다."
}
```

```json
// Response 400 - 필수 약관 미동의
{
  "success": false,
  "data": null,
  "message": "필수 약관에 동의해야 회원가입이 가능합니다."
}
```

---

---

### 1-3. [POST] 자체 로그인

**URL**: `/api/v1/auth/login/local`

**인증 필요**: ❌

**설명**: 이메일/비밀번호로 로그인, 2FA 활성화 시 추가 인증 필요

**발행 이벤트**: `UserLoggedIn`

```json
// Request Body
{
  "email": "user@brainx.com",
  "password": "Brainx123!"
}
```

```json
// Response 200 - 일반 로그인
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiJ9...",
    "tokenType": "Bearer",
    "userId": "usr_01HZXABC123",
    "email": "user@brainx.com",
    "nickname": "채영",
    "role": "ROLE_USER",
    "requires2fa": false
  },
  "message": "로그인 성공"
}
```

```json
// Response 200 - 2FA 필요
{
  "success": true,
  "data": {
    "accessToken": null,
    "refreshToken": null,
    "requires2fa": true
  },
  "message": "2단계 인증이 필요합니다."
}
```

```json
// Response 400 - 이메일 없음
{
  "success": false,
  "data": null,
  "message": "존재하지 않는 이메일입니다."
}
```

```json
// Response 400 - 비밀번호 불일치
{
  "success": false,
  "data": null,
  "message": "비밀번호가 올바르지 않습니다."
}
```

---

### 1-4. [POST] 로그아웃

**URL**: `/api/v1/auth/logout`

**인증 필요**: X

**설명**: `Refresh Token을 무효화하여 로그아웃 처리`

**발행 이벤트**: `UserLoggedOut`

```json
// Request Body
{
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

```json
// Response 200
{
  "success": true,
  "data": null,
  "message": "로그아웃되었습니다."
}
```

```jsx
// Response 400 - Refresh Token 오류
{
  "success": false,
  "data": null,
  "message": "Refresh Token이 올바르지 않습니다."
}
```

---

### 1-5. [POST] 토큰 재발급

**URL**: `/api/v1/auth/token/refresh`

**인증 필요**: ❌

**설명**: Refresh Token으로 새로운 Access Token 발급

```json
// Request Body
{
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiJ9...",
    "tokenType": "Bearer"
  },
  "message": "토큰이 재발급되었습니다."
}
```

```json
// Response 401
{
  "success": false,
  "data": null,
  "message": "Refresh Token이 만료되었습니다."
}
```

---

### 1-6. [GET] 소셜 로그인 인증 URL 요청

**URL**: `/api/v1/auth/oauth/{provider}/authorize`

**인증 필요**: ❌

**설명**: OAuth provider 인증 페이지 URL 반환

**Path Parameter**: `provider` = `kakao` | `google` | `apple` | `naver`

**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "provider": "google",
    "authorizationUrl": "<https://accounts.google.com/o/oauth2/v2/auth?.>..",
    "state": "st_01HZXABC"
  },
  "message": "소셜 로그인 URL이 생성되었습니다."
}
```

```json
// Response 400
{
  "success": false,
  "data": null,
  "message": "지원하지 않는 소셜 로그인 제공자입니다."
}
```

```jsx
// Response 400 - OAuth 설정 누락
{
  "success": false,
  "data": null,
  "message": "소셜 로그인 제공자 설정이 필요합니다."
}
```

---

### 1-7. [POST] 소셜 로그인 콜백

**URL**: `/api/v1/auth/oauth/{provider}/callback`

**인증 필요**: ❌

**설명**: OAuth 인가 코드 교환 및 계정 연결/생성

OAuth 인가 코드 교환 후 소셜 로그인 처리.

이미 연결된 소셜 계정이면 로그인 토큰을 발급한다.

소셜 이메일과 동일한 이메일 계정이 이미 존재하면 해당 계정에 소셜 계정을 자동 연결한 뒤 로그인 토큰을 발급한다.

신규 소셜 사용자는 온보딩 토큰을 발급한다.

**Path Parameter**: `provider` = `kakao` | `google` | `apple` | `naver`

**발행 이벤트**: `OAuthAccountLinked`, `UserRegistered`

```json
// Request Body
{
  "code": "4/0AfJohX...",
  "state": "st_01HZXABC"
}
```

```json
// Response 200 - 기존 연결된 소셜 계정 로그인
{
  "success": true,
  "data": {
    "userId": "usr_01HZXABC123",
    "email": "user@gmail.com",
    "nickname": "채영",
    "profileImageUrl": "<https://cdn.brainx.com/profile/user.png>",
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiJ9...",
    "tokenType": "Bearer",
    "onboardingToken": null,
    "accountLinked": true,
    "isNewUser": false,
    "next": null
  },
  "message": "소셜 로그인이 완료되었습니다."
}
```

```json
// Response 200 - 동일 이메일 기존 계정에 소셜 자동 연결 후 로그인
{
  "success": true,
  "data": {
    "userId": "usr_01HZXABC123",
    "email": "user@gmail.com",
    "nickname": "채영",
    "profileImageUrl": "<https://cdn.brainx.com/profile/user.png>",
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiJ9...",
    "tokenType": "Bearer",
    "onboardingToken": null,
    "accountLinked": true,
    "isNewUser": false,
    "next": null
  },
  "message": "소셜 로그인이 완료되었습니다."
}
```

```json
// Response 200 - 신규 소셜 사용자, 온보딩 필요
{
  "success": true,
  "data": {
    "userId": null,
    "email": "user@gmail.com",
    "nickname": "채영",
    "profileImageUrl": "<https://cdn.example.com/profile.png>",
    "accessToken": null,
    "refreshToken": null,
    "tokenType": "Bearer",
    "onboardingToken": "onb_01HZXABC123",
    "accountLinked": false,
    "isNewUser": true,
    "next": "ONBOARDING"
  },
  "message": "소셜 로그인이 완료되었습니다."
}
```

```json
// Response 400
{
  "success": false,
  "data": null,
  "message": "소셜 로그인 인증에 실패했습니다."
}
```

---

### 1-8. [GET] 내 프로필 조회

**URL**: `/api/v1/users/me`

**인증 필요**: ✅

**설명**: 현재 로그인한 사용자 정보 반환

**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "userId": "usr_01HZXABC123",
    "email": "user@brainx.com",
    "nickname": "채영",
    "profileImageUrl": "<https://cdn.brainx.com/profile/user.png>",
    "role": "ROLE_USER",
    "security": {
      "twoFactorEnabled": false,
      "linkedProviders": ["google"],
      "hasPassword": true
    },
    "consents": {
      "termsRequired": true,
      "privacyRequired": true,
      "marketingOptional": false,
      "behaviorAnalyticsOptional": true,
      "updatedAt": "2026-06-01T00:00:00Z"
    }
  },
  "message": "내 정보 조회 성공"
}
```

---

### 1-9. [PATCH] 프로필 수정

**URL**: `/api/v1/users/me/profile`

**인증 필요**: ✅

**설명**: 닉네임 또는 프로필 이미지 변경

`profileImageAssetId` 처리 규칙:

- 필드 생략 또는 `null`: 기존 프로필 이미지 유지
- 빈 문자열 `""`: 프로필 이미지 삭제
- 문자열 값: 해당 값을 프로필 이미지 URL/식별자로 저장

**발행 이벤트**: `UserProfileUpdated`

```json
// Request Body
{
  "nickname": "채영",
  "profileImageAssetId": "ast_01HZXPROFILE"
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "userId": "usr_01HZXABC123",
    "nickname": "채영",
    "profileImageUrl": ""
  },
  "message": "프로필이 저장되었습니다."
}
```

```json
// Response 400
{
  "success": false,
  "data": null,
  "message": "닉네임은 2자 이상 20자 이하로 입력해주세요."
}
```

---

### 1-10. [PATCH] 비밀번호 변경

**URL**: `/api/v1/users/me/password`

**인증 필요**: ✅

**설명**: 현재 비밀번호 확인 후 새 비밀번호로 변경

현재 API는 기존 이메일 비밀번호가 있는 계정의 비밀번호 변경만 지원한다. 소셜 로그인 전용 계정에서 이메일 비밀번호 로그인을 새로 설정하는 별도 API는 현재 구현되어 있지 않다.

**발행 이벤트**: `PasswordChanged`

```json
// Request Body
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword123!",
  "newPasswordConfirm": "NewPassword123!"
}
```

```json
// Response 200
{
  "success": true,
  "data": null,
  "message": "비밀번호가 변경되었습니다."
}
```

```json
// Response 400
{
  "success": false,
  "data": null,
  "message": "현재 비밀번호가 올바르지 않습니다."
}
```

---

### 1-11. [POST] 이메일 2FA 설정

**URL**: `/api/v1/users/me/2fa/email`

**인증 필요**: ✅

**설명**: 이메일 기반 2단계 인증 활성화 요청

**발행 이벤트**: `TwoFactorConfigured`

```json
// Request Body
{
  "enabled": true
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "verificationId": "vrf_01J..."
  },
  "message": "2단계 인증 설정이 요청되었습니다."
}
```

---

### 1-12. [POST] 소셜 계정 연결

**URL**: `/api/v1/users/me/social-accounts`

**인증 필요**: ✅

**설명**: 기존 계정에 소셜 로그인 추가 연결

**발행 이벤트**: `OAuthAccountLinked`

```json
// Request Body
{
  "provider": "google",
  "oauthCode": "oauth_code_from_provider"
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "provider": "google",
    "linked": true
  },
  "message": "소셜 계정이 연결되었습니다."
}
```

---

### 1-13. [DELETE] 소셜 계정 연결 해제

**URL**: `/api/v1/users/me/social-accounts/{provider}`

**인증 필요**: ✅

**설명**: 연결된 소셜 계정 해제

**Path Parameter**: `provider` = `kakao` | `google` | `apple` | `naver`

**발행 이벤트**: `OAuthAccountUnlinked`

```json
// Response 200
{
  "success": true,
  "data": {
    "provider": "google",
    "linked": false
  },
  "message": "소셜 계정 연결이 해제되었습니다."
}
```

---

### 1-14. [PUT] 개인정보 동의 수정

**URL**: `/api/v1/users/me/consents`

**인증 필요**: ✅

**설명**: 필수/선택 동의 항목 변경

**발행 이벤트**: `ConsentUpdated`

```json
// Request Body
{
  "termsRequired": true,
  "privacyRequired": true,
  "marketingOptional": true,
  "behaviorAnalyticsOptional": false
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "termsRequired": true,
    "privacyRequired": true,
    "marketingOptional": true,
    "behaviorAnalyticsOptional": false,
    "updatedAt": "2026-06-08T15:00:00"
  },
  "message": "동의 정보가 수정되었습니다."
}
```

---

### 1-15. [POST] 회원 탈퇴 요청

**URL**: `/api/v1/users/me/deletion-request`

**인증 필요**: ✅

**설명**: 회원 탈퇴 예약 (30일 유예 기간 후 삭제)

**발행 이벤트**: `UserDeletionRequested`

```json
// Request Body
{
  "reason": "서비스를 더 이상 사용하지 않습니다."
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "deletionScheduledAt": "2026-07-08T00:00:00"
  },
  "message": "회원 탈퇴 요청이 접수되었습니다. 30일 후 데이터가 삭제됩니다."
}
```

---

### 1-16. [DELETE] 회원 탈퇴 요청 취소

**URL**: `/api/v1/users/me/deletion-request`

**인증 필요**: ✅

**설명**: 탈퇴 유예 기간 내 탈퇴 요청 철회

**발행 이벤트**: `UserDeletionCancelled`

```json
// Response 200
{
  "success": true,
  "data": null,
  "message": "회원 탈퇴 요청이 취소되었습니다."
}
```

---
### 1-17. [DELETE] 회원 탈퇴 요청 취소

**URL**: `/api/v1/users/me/deletion-request`  
**인증 필요**: ✅  
**설명**: 탈퇴 유예 기간 내 탈퇴 요청 철회  
**발행 이벤트**: `UserDeletionCancelled`

```json
// Response 200
{
  "success": true,
  "data": null,
  "message": "회원 탈퇴 요청이 취소되었습니다."
}
```

### 2. 문의하기 (Support / Inquiry)

---

#### 2-1. [POST] 문의 접수

**URL**: `/api/v1/support/inquiries`

**인증 필요**: ✅
**설명**: 사용자가 관리자에게 문의를 등록. 문의 접수 시 사용자 이메일로 접수 확인 메일 발송.
**발행 이벤트**: `InquirySubmitted`

```json
// Request Body
{
  "category": "ACCOUNT",
  "title": "계정 접근이 안됩니다.",
  "content": "로그인 시도 시 계속 오류가 발생합니다.",
  "attachmentAssetIds": ["ast_01HZXFILE1", "ast_01HZXFILE2"]
}
// category: "ACCOUNT" | "BILLING" | "BUG" | "FEATURE_REQUEST" | "DATA" | "OTHER"
// attachmentAssetIds: 생략 가능 (최대 5개)
```

```json
// Response 201
{
  "success": true,
  "data": {
    "inquiryId": "inq_01HZXABC123",
    "category": "ACCOUNT",
    "title": "계정 접근이 안됩니다.",
    "status": "PENDING",
    "createdAt": "2026-06-16T10:00:00Z"
  },
  "message": "문의가 접수되었습니다. 확인 후 이메일로 답변 드리겠습니다."
}
```

```json
// Response 400 - 제목 누락
{
  "success": false,
  "data": null,
  "message": "문의 제목을 입력해주세요."
}
```

```json
// Response 400 - 내용 누락
{
  "success": false,
  "data": null,
  "message": "문의 내용을 입력해주세요."
}
```


```json
// Response 400 - 첨부파일 초과
{
  "success": false,
  "data": null,
  "message": "첨부파일은 최대 5개까지 업로드할 수 있습니다."
}
```

---

#### 2-2. [GET] 내 문의 목록 조회

**URL**: `/api/v1/support/inquiries`
**인증 필요**: ✅
**설명**: 본인이 접수한 문의 목록을 최신순으로 페이징 조회
**발행 이벤트**: 없음

**Query Parameters**:

|파라미터|타입|필수|설명|
|---|---|---|---|
|`page`|integer|❌|페이지 번호 (기본값: 0)|
|`size`|integer|❌|페이지 크기 (기본값: 10)|
|`status`|string|❌|필터: `PENDING` \| `IN_PROGRESS` \| `RESOLVED` \| `CLOSED`|

```json
// Response 200
{
  "success": true,
  "data": {
    "content": [
      {
        "inquiryId": "inq_01HZXABC123",
        "category": "ACCOUNT",
        "title": "계정 접근이 안됩니다.",
        "status": "IN_PROGRESS",
        "hasNewReply": true,
        "createdAt": "2026-06-16T10:00:00Z",
        "updatedAt": "2026-06-16T13:00:00Z"
      }
    ],
    "page": 0,
    "size": 10,
    "totalElements": 1,
    "totalPages": 1
  },
  "message": "문의 목록 조회 성공"
}
```

---

#### 2-3. [GET] 문의 상세 조회

**URL**: `/api/v1/support/inquiries/{inquiryId}`
**인증 필요**: ✅
**설명**: 특정 문의 및 관리자 답변 스레드 전체 조회. 조회 시 `hasNewReply` 플래그 초기화.
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "inquiryId": "inq_01HZXABC123",
    "category": "ACCOUNT",
    "title": "계정 접근이 안됩니다.",
    "status": "IN_PROGRESS",
    "createdAt": "2026-06-16T10:00:00Z",
    "messages": [
      {
        "messageId": "msg_01HZXMSG001",
        "senderType": "USER",
        "content": "로그인 시도 시 계속 오류가 발생합니다.",
        "attachments": [
          {
            "assetId": "ast_01HZXFILE1",
            "fileName": "screenshot.png",
            "fileUrl": "https://cdn.brainx.com/assets/screenshot.png"
          }
        ],
        "createdAt": "2026-06-16T10:00:00Z"
      },
      {
        "messageId": "msg_01HZXMSG002",
        "senderType": "ADMIN",
        "content": "안녕하세요. 해당 이슈를 확인 중입니다. 잠시만 기다려 주세요.",
        "attachments": [],
        "createdAt": "2026-06-16T13:00:00Z"
      }
    ]
  },
  "message": "문의 상세 조회 성공"
}
```


```json
// Response 403 - 본인 문의 아님
{
  "success": false,
  "data": null,
  "message": "해당 문의에 접근할 권한이 없습니다."
}
```

```json
// Response 404
{
  "success": false,
  "data": null,
  "message": "존재하지 않는 문의입니다."
}
```

---
## 2. Knowledge Workspace Service

> **도메인 책임**: 노트 원장, 문서 버전, 폴더, 태그, 즐겨찾기, 최근 활동, 백링크, 마인드맵 그래프 데이터  
> **관련 기능**: `2.1.1` `2.2.1` `3.1.1` `3.2.1` `3.4.1` `3.6.1` `4.1.1` `4.2.1` `4.3.1` `6.1.1` `6.4.1` `6.5.1` `6.6.1`

---

### 2-1. [GET] 워크스페이스 동기화

**URL**: `/api/v1/workspace/sync`  
**인증 필요**: ✅  
**설명**: 클라이언트 로컬 인덱스 구성용 증분 동기화. 키워드 검색은 이 데이터를 기반으로 클라이언트에서 처리  
**발행 이벤트**: 없음

```json
// Query Parameters
{
  "cursor": "cur_01J...",     // optional
  "includeDeleted": true       // optional
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "cursor": "cur_01J...",
    "notes": [
      {
        "noteId": "nte_01J...",
        "title": "노트 제목",
        "folderId": "fld_01J...",
        "tags": ["ai", "backend"],
        "version": 5,
        "updatedAt": "2026-06-05T08:00:00Z",
        "deleted": false
      }
    ],
    "folders": [],
    "tags": [],
    "links": [],
    "favorites": [],
    "recentActivities": []
  },
  "message": "동기화 데이터 조회 성공"
}
```

---

### 2-2. [POST] 노트 생성

**URL**: `/api/v1/notes`  
**인증 필요**: ✅  
**설명**: 새 노트 생성  
**발행 이벤트**: `NoteCreated`

```json
// Request Body
{
  "title": "Spring Boot JWT 정리",
  "markdown": "# JWT란?\nJWT는 인증 정보를 담는 토큰입니다.",
  "folderId": "fld_01HZXBACKEND",
  "tags": ["Spring", "JWT", "Backend"]
}
```

```json
// Response 201
{
  "success": true,
  "data": {
    "noteId": "note_01HZXNOTE123",
    "title": "Spring Boot JWT 정리",
    "folderId": "fld_01HZXBACKEND",
    "version": 1,
    "createdAt": "2026-06-08T15:00:00"
  },
  "message": "노트가 생성되었습니다."
}
```

```json
// Response 400
{
  "success": false,
  "data": null,
  "message": "노트 제목은 필수입니다."
}
```

---

### 2-3. [GET] 노트 상세 조회

**URL**: `/api/v1/notes/{noteId}`  
**인증 필요**: ✅  
**설명**: 노트 본문 및 메타데이터 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "noteId": "note_01HZXNOTE123",
    "title": "Spring Boot JWT 정리",
    "markdown": "# JWT란?\nJWT는 인증 정보를 담는 토큰입니다.",
    "folder": {
      "folderId": "fld_01HZXBACKEND",
      "name": "Backend"
    },
    "tags": ["Spring", "JWT", "Backend"],
    "version": 3,
    "createdAt": "2026-06-08T15:00:00",
    "updatedAt": "2026-06-08T15:10:00",
    "permissions": {
      "canEdit": true,
      "canShare": true
    }
  },
  "message": "노트 조회 성공"
}
```

```json
// Response 404
{
  "success": false,
  "data": null,
  "message": "노트를 찾을 수 없습니다."
}
```

---

### 2-4. [PUT] 노트 본문 저장 (자동 저장)

**URL**: `/api/v1/notes/{noteId}/content`  
**인증 필요**: ✅  
**설명**: 노트 본문 저장. 버전 충돌 발생 시 conflict 반환. 클라이언트는 IndexedDB 선저장 후 호출  
**발행 이벤트**: `NoteContentSaved`

```json
// Request Body
{
  "baseVersion": 3,
  "markdown": "# JWT란?\nJWT는 인증 정보를 담는 토큰입니다.\n\n## 구조\nHeader, Payload, Signature",
  "clientSavedAt": "2026-06-08T15:12:00"
}
```

```json
// Response 200 - 정상 저장
{
  "success": true,
  "data": {
    "noteId": "note_01HZXNOTE123",
    "version": 4,
    "savedAt": "2026-06-08T15:12:01",
    "status": "SAVED",
    "conflict": null
  },
  "message": "자동 저장되었습니다."
}
```

```json
// Response 409 - 버전 충돌
{
  "success": false,
  "data": {
    "serverVersion": 5,
    "clientBaseVersion": 3
  },
  "message": "다른 기기에서 수정된 내용이 있습니다. 병합이 필요합니다."
}
```

---

### 2-5. [PATCH] 노트 메타데이터 수정

**URL**: `/api/v1/notes/{noteId}/metadata`  
**인증 필요**: ✅  
**설명**: 제목, 폴더, 태그, 아카이브 상태 변경  
**발행 이벤트**: `NoteMetadataChanged`

```json
// Request Body
{
  "title": "Spring Boot JWT 완전 정리",
  "folderId": "fld_01HZXSECURITY",
  "tags": ["Spring", "Security", "JWT"],
  "archived": false
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "noteId": "note_01HZXNOTE123",
    "title": "Spring Boot JWT 완전 정리",
    "folderId": "fld_01HZXSECURITY",
    "tags": ["Spring", "Security", "JWT"],
    "version": 5
  },
  "message": "노트 정보가 수정되었습니다."
}
```

---

### 2-6. [DELETE] 노트 삭제

**URL**: `/api/v1/notes/{noteId}`  
**인증 필요**: ✅  
**설명**: 노트를 휴지통으로 이동하거나 영구 삭제  
**Query Parameter**: `mode` = `trash` | `permanent`  
**발행 이벤트**: `NoteTrashed` 또는 `NoteDeleted`

```json
// Response 200 - trash
{
  "success": true,
  "data": {
    "noteId": "note_01HZXNOTE123",
    "deletedAt": "2026-06-08T15:20:00",
    "purgeAt": "2026-07-08T15:20:00"
  },
  "message": "노트가 휴지통으로 이동되었습니다."
}
```

```json
// Response 200 - permanent
{
  "success": true,
  "data": {
    "noteId": "note_01HZXNOTE123",
    "deletedAt": "2026-06-08T15:20:00",
    "purgeAt": null
  },
  "message": "노트가 영구 삭제되었습니다."
}
```

```json
// Response 403
{
  "success": false,
  "data": null,
  "message": "노트를 삭제할 권한이 없습니다."
}
```

---

### 2-7. [GET] 노트 버전 목록 조회

**URL**: `/api/v1/notes/{noteId}/versions`  
**인증 필요**: ✅  
**설명**: 노트의 저장 버전 이력 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "versions": [
      {
        "versionId": "ver_01J...",
        "version": 5,
        "savedAt": "2026-06-05T08:00:00Z"
      },
      {
        "versionId": "ver_00J...",
        "version": 4,
        "savedAt": "2026-06-04T10:00:00Z"
      }
    ]
  },
  "message": "버전 목록 조회 성공"
}
```

---

### 2-8. [POST] 노트 버전 복원

**URL**: `/api/v1/notes/{noteId}/versions/{versionId}/restore`  
**인증 필요**: ✅  
**설명**: 특정 버전으로 노트 내용 복원  
**발행 이벤트**: `NoteContentSaved`

```json
// Response 200
{
  "success": true,
  "data": {
    "version": 7
  },
  "message": "노트가 복원되었습니다."
}
```

---

### 2-9. [POST] 노트 열람 기록 저장

**URL**: `/api/v1/notes/{noteId}/views`  
**인증 필요**: ✅  
**설명**: 노트 열람 이벤트 기록. 최근 활동 및 통계 반영  
**발행 이벤트**: `NoteViewed`

```json
// Request Body
{
  "viewedAt": "2026-06-08T15:20:00"
}
```

```json
// Response 200
{
  "success": true,
  "data": null,
  "message": "노트 열람 기록이 저장되었습니다."
}
```

---

### 2-10. [GET] 최근 열람 노트 조회

**URL**: `/api/v1/recent-activities`  
**인증 필요**: ✅  
**설명**: 최근 열람/수정한 노트 목록 조회  
**Query Parameter**: `limit` (기본값 10)  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "items": [
      {
        "noteId": "note_01HZXNOTE123",
        "title": "Spring Boot JWT 정리",
        "activityType": "viewed",
        "activityAt": "2026-06-08T15:20:00"
      }
    ]
  },
  "message": "최근 열람 노트 조회 성공"
}
```

---

### 2-11. [POST] 폴더 생성

**URL**: `/api/v1/folders`  
**인증 필요**: ✅  
**설명**: 새 폴더 생성. 상위 폴더 지정으로 중첩 구조 가능  
**발행 이벤트**: `FolderCreated`

```json
// Request Body
{
  "name": "Backend",
  "parentFolderId": null
}
```

```json
// Response 201
{
  "success": true,
  "data": {
    "folderId": "fld_01HZXBACKEND",
    "name": "Backend",
    "parentFolderId": null,
    "depth": 1
  },
  "message": "폴더가 생성되었습니다."
}
```

```json
// Response 400 - 최대 깊이 초과
{
  "success": false,
  "data": null,
  "message": "폴더는 최대 5단계까지만 생성할 수 있습니다."
}
```

---

### 2-12. [GET] 폴더 트리 조회

**URL**: `/api/v1/folders/tree`  
**인증 필요**: ✅  
**설명**: 사용자의 폴더 구조를 트리 형태로 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "folders": [
      {
        "folderId": "fld_01HZXBACKEND",
        "name": "Backend",
        "parentFolderId": null,
        "children": [
          {
            "folderId": "fld_01HZXSPRING",
            "name": "Spring",
            "parentFolderId": "fld_01HZXBACKEND",
            "children": []
          }
        ]
      }
    ]
  },
  "message": "폴더 트리 조회 성공"
}
```

---

### 2-13. [PATCH] 폴더 수정

**URL**: `/api/v1/folders/{folderId}`  
**인증 필요**: ✅  
**설명**: 폴더명 변경 또는 상위 폴더 이동  
**발행 이벤트**: `FolderChanged`

```json
// Request Body
{
  "name": "Backend Study",
  "parentFolderId": null
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "folderId": "fld_01HZXBACKEND",
    "name": "Backend Study",
    "parentFolderId": null
  },
  "message": "폴더가 수정되었습니다."
}
```

---

### 2-14. [DELETE] 폴더 삭제

**URL**: `/api/v1/folders/{folderId}`  
**인증 필요**: ✅  
**설명**: 폴더 삭제. 하위 노트 처리 방식 지정 필수  
**발행 이벤트**: `FolderDeleted`, `NotesMoved`

```json
// Request Body
{
  "childNoteAction": "MOVE",
  "targetFolderId": "fld_01HZXDEFAULT"
}
// childNoteAction: "MOVE" | "TRASH"
```

```json
// Response 200
{
  "success": true,
  "data": null,
  "message": "폴더가 삭제되었습니다."
}
```

```json
// Response 400
{
  "success": false,
  "data": null,
  "message": "하위 노트 처리 방식을 선택해주세요."
}
```

---

### 2-15. [GET] 태그 자동완성 조회

**URL**: `/api/v1/tags/suggestions`  
**인증 필요**: ✅  
**설명**: 태그 입력 시 자동완성 후보 조회  
**Query Parameter**: `q` (검색어, 필수)  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "tags": [
      {
        "tagId": "tag_01HZXSPRING",
        "name": "Spring",
        "usageCount": 12
      },
      {
        "tagId": "tag_01HZXSECURITY",
        "name": "Security",
        "usageCount": 5
      }
    ]
  },
  "message": "태그 추천 조회 성공"
}
```

---

### 2-16. [PUT] 노트 태그 설정

**URL**: `/api/v1/notes/{noteId}/tags`  
**인증 필요**: ✅  
**설명**: 노트에 태그 일괄 설정 (기존 태그 전체 대체)  
**발행 이벤트**: `NoteTagsChanged`

```json
// Request Body
{
  "tagNames": ["Spring", "JWT", "Security"]
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "noteId": "note_01HZXNOTE123",
    "tags": ["Spring", "JWT", "Security"]
  },
  "message": "노트 태그가 수정되었습니다."
}
```

---

### 2-17. [PUT] 즐겨찾기 설정/해제

**URL**: `/api/v1/favorites/{targetType}/{targetId}`  
**인증 필요**: ✅  
**설명**: 노트 또는 폴더 즐겨찾기 토글  
**Path Parameter**: `targetType` = `NOTE` | `FOLDER`  
**발행 이벤트**: `FavoriteChanged`

```json
// Request Body
{
  "enabled": true
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "targetType": "NOTE",
    "targetId": "note_01HZXNOTE123",
    "enabled": true
  },
  "message": "즐겨찾기에 등록되었습니다."
}
```

```json
// Response 400
{
  "success": false,
  "data": null,
  "message": "즐겨찾기는 최대 10개까지 등록할 수 있습니다."
}
```

---

### 2-18. [POST] 노트 링크 생성

**URL**: `/api/v1/notes/{noteId}/links`  
**인증 필요**: ✅  
**설명**: 노트 간 수동 링크 생성. 대상 노트가 없으면 생성 가능  
**발행 이벤트**: `NoteLinkCreated`

```json
// Request Body
{
  "targetNoteId": "note_01HZXTARGET",
  "targetTitle": "JWT 인증 흐름",
  "createIfMissing": false
}
```

```json
// Response 201
{
  "success": true,
  "data": {
    "linkId": "lnk_01HZX123",
    "sourceNoteId": "note_01HZXNOTE123",
    "targetNoteId": "note_01HZXTARGET",
    "targetTitle": "JWT 인증 흐름"
  },
  "message": "노트 링크가 생성되었습니다."
}
```

---

### 2-19. [DELETE] 노트 링크 삭제

**URL**: `/api/v1/notes/{noteId}/links/{linkId}`  
**인증 필요**: ✅  
**설명**: 노트 간 링크 제거  
**발행 이벤트**: `NoteLinkDeleted`

```json
// Response 200
{
  "success": true,
  "data": null,
  "message": "노트 링크가 삭제되었습니다."
}
```

---

### 2-20. [GET] 백링크 조회

**URL**: `/api/v1/notes/{noteId}/backlinks`  
**인증 필요**: ✅  
**설명**: 현재 노트를 참조하는 다른 노트 목록 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "backlinks": [
      {
        "sourceNoteId": "note_01HZXAAA",
        "sourceTitle": "Spring Security 정리",
        "linkedText": "[[JWT 인증 흐름]]",
        "createdAt": "2026-06-08T15:30:00"
      }
    ]
  },
  "message": "백링크 조회 성공"
}
```

---

### 2-21. [GET] 마인드맵 그래프 조회

**URL**: `/api/v1/graph`  
**인증 필요**: ✅  
**설명**: 2D/3D 마인드맵, 시간별 필터, 타임랩스용 노드/엣지 데이터 조회  
**발행 이벤트**: 없음

|Query Parameter|타입|필수|설명|
|---|---|---|---|
|folderId|String|❌|특정 폴더 기준 필터|
|tag|String|❌|특정 태그 기준 필터|
|since|String|❌|시작 날짜|
|until|String|❌|종료 날짜|

```json
// Response 200
{
  "success": true,
  "data": {
    "nodes": [
      {
        "noteId": "note_01HZXNOTE123",
        "title": "Spring Boot JWT 정리",
        "summary": "JWT 인증 구조와 Spring Security 적용 방법을 정리한 노트입니다.",
        "createdAt": "2026-06-08T15:00:00",
        "tags": ["Spring", "JWT"],
        "lastViewedAt": "2026-06-08T15:20:00",
        "x": 120,
        "y": 80
      }
    ],
    "edges": [
      {
        "linkId": "lnk_01HZX123",
        "sourceNoteId": "note_01HZXNOTE123",
        "targetNoteId": "note_01HZXTARGET",
        "linkType": "MANUAL"
      }
    ],
    "summaries": {},
    "lastViewedAt": "2026-06-05T07:00:00Z"
  },
  "message": "그래프 조회 성공"
}
```

---

### 2-22. [PUT] 그래프 레이아웃 저장

**URL**: `/api/v1/graph/layouts/{layoutId}`  
**인증 필요**: ✅  
**설명**: 마인드맵 노드 위치/레이아웃 저장  
**발행 이벤트**: `GraphLayoutSaved`

```json
// Request Body
{
  "nodePositions": [
    { "noteId": "note_01HZXNOTE123", "x": 120, "y": 80 },
    { "noteId": "note_01HZXTARGET", "x": 300, "y": 180 }
  ],
  "quality": "HIGH"
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "layoutId": "layout_default",
    "savedAt": "2026-06-08T15:40:00"
  },
  "message": "그래프 레이아웃이 저장되었습니다."
}
```

---

### 2-23. [POST] 공유 링크 생성

**URL**: `/api/v1/share-links`  
**인증 필요**: ✅  
**설명**: 노트 공유 링크 생성. 유료 플랜 권한 확인 필요  
**발행 이벤트**: `ShareLinkCreated`

```json
// Request Body
{
  "noteId": "note_01HZXNOTE123",
  "permission": "READ",
  "expiresAt": "2026-06-15T23:59:59"
}
// permission: "READ" | "EDIT"
```

```json
// Response 201
{
  "success": true,
  "data": {
    "shareId": "shr_01HZX123",
    "url": "https://brainx.com/share/shr_01HZX123",
    "permission": "READ",
    "expiresAt": "2026-06-15T23:59:59"
  },
  "message": "공유 링크가 생성되었습니다."
}
```

```json
// Response 403
{
  "success": false,
  "data": null,
  "message": "현재 플랜에서는 해당 공유 기간을 사용할 수 없습니다."
}
```

---

### 2-24. [GET] 공개 공유 노트 조회

**URL**: `/api/v1/share-links/{shareId}`  
**인증 필요**: ❌  
**설명**: 공유 링크로 공개 노트 조회

```json
// Response 200
{
  "success": true,
  "data": {
    "shareId": "shr_01HZX123",
    "noteId": "note_01HZXNOTE123",
    "title": "Spring Boot JWT 정리",
    "markdown": "# JWT란?\nJWT는 인증 정보를 담는 토큰입니다.",
    "author": {
      "nickname": "채영"
    },
    "permission": "READ",
    "expiresAt": "2026-06-15T23:59:59"
  },
  "message": "공유 노트 조회 성공"
}
```

```json
// Response 404
{
  "success": false,
  "data": null,
  "message": "공유 링크를 찾을 수 없습니다."
}
```

---

### 2-25. [PATCH] 공유 링크 수정/폐기

**URL**: `/api/v1/share-links/{shareId}`  
**인증 필요**: ✅  
**설명**: 공유 링크 만료일 변경 또는 폐기  
**발행 이벤트**: `ShareLinkChanged`

```json
// Request Body
{
  "expiresAt": "2026-08-05T08:00:00Z",
  "revoked": false
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "shareId": "shr_01HZX123",
    "expiresAt": "2026-08-05T08:00:00Z",
    "revoked": false
  },
  "message": "공유 링크가 수정되었습니다."
}
```

---

## 3. Content Ingestion & Publishing Service

> **도메인 책임**: 파일 수집, 파일 변환, 원본 파일 저장, 외부 플랫폼 연동, 내보내기/발행  
> **관련 기능**: `2.3.1` `2.3.2` `3.3.1` `3.3.2` `3.6.1` `3.6.2` `3.7.1` `5.4.1` `5.5.1`

---

### 3-1. [POST] 파일 업로드 세션 생성

**URL**: `/api/v1/assets/upload-sessions`  
**인증 필요**: ✅  
**설명**: 파일 업로드를 위한 사전 서명 URL 발급. 클라이언트는 반환된 URL로 오브젝트 스토리지에 직접 업로드  
**발행 이벤트**: 없음

```json
// Request Body
{
  "fileName": "spring-jwt.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 1048576,
  "targetNoteId": "note_01HZXNOTE123"
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "uploadSessionId": "ups_01HZX123",
    "uploadUrl": "https://storage.brainx.com/upload/ups_01HZX123",
    "maxSizeBytes": 52428800
  },
  "message": "업로드 세션이 생성되었습니다."
}
```

```json
// Response 400
{
  "success": false,
  "data": null,
  "message": "파일당 최대 업로드 용량은 50MB입니다."
}
```

---

### 3-2. [POST] 파일 업로드 완료 처리

**URL**: `/api/v1/assets/upload-sessions/{uploadSessionId}/complete`  
**인증 필요**: ✅  
**설명**: 오브젝트 스토리지 업로드 완료 후 서버에 알림. 변환 모드 선택 가능  
**발행 이벤트**: `AssetUploaded`, `ConversionJobRequested`

```json
// Request Body
{
  "checksum": "sha256:abc123...",
  "conversionMode": "MARKDOWN"
}
// conversionMode: "KEEP_ORIGINAL" | "MARKDOWN"
```

```json
// Response 200
{
  "success": true,
  "data": {
    "assetId": "ast_01HZXFILE123",
    "conversionJobId": "conv_01HZX123",
    "status": "CONVERTING"
  },
  "message": "파일 업로드가 완료되었습니다. 변환을 시작합니다."
}
```

---

### 3-3. [GET] 파일 상세 조회

**URL**: `/api/v1/assets/{assetId}`  
**인증 필요**: ✅  
**설명**: 파일 메타데이터 및 다운로드 URL 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "assetId": "ast_01HZXFILE123",
    "fileName": "spring-jwt.pdf",
    "contentType": "application/pdf",
    "sizeBytes": 1048576,
    "variants": [
      {
        "variantId": "var_01J...",
        "format": "webp",
        "sizeBytes": 51200
      }
    ],
    "downloadUrl": "https://cdn.brainx.com/files/spring-jwt.pdf",
    "createdAt": "2026-06-08T15:50:00"
  },
  "message": "파일 조회 성공"
}
```

---

### 3-4. [POST] 파일 변환 요청

**URL**: `/api/v1/conversions`  
**인증 필요**: ✅  
**설명**: 업로드된 파일을 다른 형식으로 변환 요청  
**발행 이벤트**: `ConversionJobRequested`

```json
// Request Body
{
  "assetId": "ast_01HZXFILE123",
  "targetFormat": "MARKDOWN"
}
// targetFormat: "MARKDOWN" | "TEXT" | "WEBP"
```

```json
// Response 202
{
  "success": true,
  "data": {
    "conversionJobId": "conv_01HZX123",
    "status": "PENDING"
  },
  "message": "파일 변환 요청이 접수되었습니다."
}
```

---

### 3-5. [GET] 파일 변환 상태 조회

**URL**: `/api/v1/conversions/{conversionJobId}`  
**인증 필요**: ✅  
**설명**: 변환 작업 진행 상태 폴링  
**발행 이벤트**: 없음

```json
// Response 200 - 완료
{
  "success": true,
  "data": {
    "conversionJobId": "conv_01HZX123",
    "status": "COMPLETED",
    "resultAssetId": "ast_01HZXMARKDOWN",
    "extractedText": "# Spring JWT\nJWT 인증 정리 내용..."
  },
  "message": "파일 변환이 완료되었습니다."
}
```

```json
// Response 200 - 실패
{
  "success": true,
  "data": {
    "conversionJobId": "conv_01HZX123",
    "status": "FAILED",
    "error": "지원하지 않는 파일 형식입니다."
  },
  "message": "파일 변환에 실패했습니다."
}
```

---

### 3-6. [POST] Notion OAuth 연결 URL 생성

**URL**: `/api/v1/imports/notion/oauth/authorize`  
**인증 필요**: ✅  
**설명**: Notion 연동을 위한 OAuth 인증 URL 발급  
**발행 이벤트**: 없음

```json
// Request Body
{
  "redirectUri": "https://brainx.com/import/notion/callback"
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "authorizationUrl": "https://api.notion.com/v1/oauth/authorize?...",
    "state": "st_01HZXNOTION"
  },
  "message": "Notion 연결 URL이 생성되었습니다."
}
```

---

### 3-7. [POST] Notion OAuth 콜백

**URL**: `/api/v1/imports/notion/oauth/callback`  
**인증 필요**: ✅  
**설명**: Notion OAuth 인가 코드 교환 및 연동 계정 생성  
**발행 이벤트**: `IntegrationConnected`

```json
// Request Body
{
  "code": "notion_oauth_code",
  "state": "st_01HZXNOTION"
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "integrationAccountId": "int_01HZXNOTION"
  },
  "message": "Notion 연동이 완료되었습니다."
}
```

---

### 3-8. [POST] Notion 가져오기 작업 요청

**URL**: `/api/v1/imports/notion/jobs`  
**인증 필요**: ✅  
**설명**: Notion 페이지/데이터베이스 가져오기 또는 포크 요청. MVP는 import/fork만 지원  
**발행 이벤트**: `ImportJobRequested`

```json
// Request Body
{
  "integrationAccountId": "int_01HZXNOTION",
  "sourceId": "notion_page_123",
  "mode": "IMPORT",
  "targetFolderId": "fld_01HZXIMPORT"
}
// mode: "IMPORT" | "FORK" | "SYNC"
```

```json
// Response 202
{
  "success": true,
  "data": {
    "importJobId": "imp_01HZX123",
    "status": "PENDING"
  },
  "message": "Notion 가져오기를 시작합니다."
}
```

---

### 3-9. [POST] Obsidian Vault 가져오기 요청

**URL**: `/api/v1/imports/obsidian/jobs`  
**인증 필요**: ✅  
**설명**: 압축된 Obsidian Vault zip 파일로부터 노트 일괄 가져오기  
**발행 이벤트**: `ImportJobRequested`

```json
// Request Body
{
  "uploadedZipAssetId": "ast_01HZXOBSIDIAN",
  "targetFolderId": "fld_01HZXIMPORT"
}
```

```json
// Response 202
{
  "success": true,
  "data": {
    "importJobId": "imp_01HZXOBSIDIAN",
    "status": "PENDING"
  },
  "message": "Obsidian Vault 가져오기를 시작합니다."
}
```

---

### 3-10. [GET] 가져오기 작업 상태 조회

**URL**: `/api/v1/imports/{importJobId}`  
**인증 필요**: ✅  
**설명**: Notion 또는 Obsidian 가져오기 진행 상황 및 결과 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "importJobId": "imp_01HZX123",
    "status": "COMPLETED",
    "createdNotes": [
      {
        "noteId": "note_01HZXIMPORTED",
        "title": "가져온 노트"
      }
    ],
    "failedFiles": [
      {
        "fileName": "broken.md",
        "reason": "파일 인코딩을 읽을 수 없습니다."
      }
    ],
    "conflicts": []
  },
  "message": "가져오기 작업 조회 성공"
}
```

---

### 3-11. [POST] 내보내기 작업 요청

**URL**: `/api/v1/exports`  
**인증 필요**: ✅  
**설명**: 노트를 PDF/TXT/MD 형식으로 내보내기 요청  
**발행 이벤트**: `ExportJobRequested`

```json
// Request Body
{
  "noteId": "note_01HZXNOTE123",
  "format": "PDF",
  "clientType": "WEB"
}
// format: "PDF" | "TXT" | "MD"
// clientType: "WEB" | "APP"
```

```json
// Response 202
{
  "success": true,
  "data": {
    "exportJobId": "exp_01HZX123",
    "status": "PENDING"
  },
  "message": "문서 내보내기 요청이 접수되었습니다."
}
```

---

### 3-12. [GET] 내보내기 작업 상태 조회

**URL**: `/api/v1/exports/{exportJobId}`  
**인증 필요**: ✅  
**설명**: 내보내기 작업 완료 여부 및 다운로드 URL 조회  
**발행 이벤트**: 없음

```json
// Response 200 - 완료
{
  "success": true,
  "data": {
    "exportJobId": "exp_01HZX123",
    "status": "COMPLETED",
    "downloadUrl": "https://cdn.brainx.com/export/spring-jwt.pdf"
  },
  "message": "문서 내보내기가 완료되었습니다."
}
```

```json
// Response 200 - 실패
{
  "success": true,
  "data": {
    "exportJobId": "exp_01HZX123",
    "status": "FAILED",
    "downloadUrl": null,
    "error": "PDF generation timeout"
  },
  "message": "문서 내보내기에 실패했습니다."
}
```

---

### 3-13. [GET] 블로그 템플릿 목록 조회

**URL**: `/api/v1/blog-templates`  
**인증 필요**: ✅  
**설명**: 사용 가능한 블로그 발행 템플릿 목록 조회  
**Query Parameter**: `category` (optional)  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "templates": [
      {
        "templateId": "tpl_01J...",
        "name": "기술 블로그",
        "category": "tech",
        "previewUrl": "https://cdn.brainx.com/templates/..."
      }
    ]
  },
  "message": "블로그 템플릿 목록 조회 성공"
}
```

---

### 3-14. [POST] 발행 작업 요청

**URL**: `/api/v1/publish-jobs`  
**인증 필요**: ✅  
**설명**: 노트를 외부 블로그 플랫폼에 발행하거나 복사  
**발행 이벤트**: `PublishJobRequested`

```json
// Request Body
{
  "noteId": "note_01HZXNOTE123",
  "platform": "tistory",
  "templateId": "tpl_01J..."
}
// platform: "tistory" | "notion" | "copy"
```

```json
// Response 200
{
  "success": true,
  "data": {
    "publishJobId": "pbj_01J...",
    "status": "PENDING"
  },
  "message": "발행 작업이 요청되었습니다."
}
```

---

### 3-15. [POST] 크롬 확장 캡처 저장

**URL**: `/api/v1/extension/captures`  
**인증 필요**: ✅  
**설명**: 크롬 확장에서 웹 페이지 캡처 내용을 노트로 저장  
**발행 이벤트**: `CaptureReceived`

```json
// Request Body
{
  "url": "https://example.com/article",
  "title": "참고 아티클",
  "selectedText": "중요한 본문 내용...",
  "metaDescription": "페이지 설명",
  "folderId": "fld_01J..."
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "noteId": "nte_01J..."
  },
  "message": "캡처 내용이 노트로 저장되었습니다."
}
```

---

### 3-16. [POST] API 클라이언트 생성

**URL**: `/api/v1/api-clients`  
**인증 필요**: ✅  
**설명**: 외부 agent 또는 자동화 도구용 API 키 발급. Secret은 최초 1회만 반환  
**발행 이벤트**: `ApiClientCreated`

```json
// Request Body
{
  "name": "My Automation",
  "scopes": ["notes:read", "notes:write", "ai:chat"],
  "expiresAt": "2027-06-05T08:00:00Z"
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "clientId": "cli_01J...",
    "clientSecretOnce": "sk_brainx_..."
  },
  "message": "API 클라이언트가 생성되었습니다. Secret은 이 화면에서만 확인 가능합니다."
}
```

---

### 3-17. [GET] MCP 도구 목록 조회

**URL**: `/api/v1/mcp/tools`  
**인증 필요**: ✅  
**설명**: 외부 agent가 호출 가능한 MCP 도구 목록 반환  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "tools": [
      {
        "toolName": "create_note",
        "description": "새 노트를 생성합니다.",
        "requiredScope": "notes:write",
        "inputSchema": {}
      }
    ]
  },
  "message": "MCP 도구 목록 조회 성공"
}
```

---

### 3-18. [POST] MCP 도구 호출

**URL**: `/api/v1/mcp/tool-calls`  
**인증 필요**: ✅ (scoped API key)  
**설명**: 외부 agent가 BrainX 도구를 호출. 모든 호출은 감사 로그 기록  
**발행 이벤트**: `ExternalToolCalled`

```json
// Request Body
{
  "toolName": "create_note",
  "arguments": {
    "title": "Agent가 만든 노트",
    "markdown": "# 내용\n\nAgent가 작성한 내용"
  }
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "result": {
      "noteId": "nte_01J...",
      "version": 1
    }
  },
  "message": "MCP 도구 호출이 완료되었습니다."
}
```

---

## 4. Knowledge Intelligence Service

> **도메인 책임**: 시맨틱 검색, RAG, LLM, AI 추천, 요약, 인사이트. 원본 노트는 소유하지 않으며 이벤트 기반 read model만 보유  
> **관련 기능**: `2.1.2` `3.5.1` `4.1.2` `4.3.1` `5.1.1` `5.2.1` `5.3.1` `6.2.1` `6.3.2` `6.3.3` `7.1.1` `7.4.1`

---

### 4-1. [POST] 시맨틱 검색

**URL**: `/api/v1/intelligence/semantic-search`  
**인증 필요**: ✅  
**설명**: 벡터 유사도 기반 시맨틱 검색. 클라이언트 키워드 검색 결과와 병합 가능  
**발행 이벤트**: `SemanticSearchPerformed`, `TokenUsageRecordedRequested`

```json
// Request Body
{
  "query": "JWT랑 세션 인증 차이",
  "filters": {
    "folderId": "fld_01HZXBACKEND",
    "tags": ["Security"],
    "from": "2026-01-01",
    "to": "2026-06-08"
  },
  "limit": 10,
  "hybridWithClientKeywordIds": ["note_01HZXNOTE123"]
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "results": [
      {
        "noteId": "note_01HZXNOTE123",
        "title": "Spring Boot JWT 정리",
        "excerpt": "JWT는 서버에 세션을 저장하지 않는 인증 방식입니다.",
        "score": 0.91,
        "matchedType": "SEMANTIC"
      }
    ],
    "tokenEstimate": 120,
    "charged": true
  },
  "message": "시맨틱 검색이 완료되었습니다."
}
```

```json
// Response 403
{
  "success": false,
  "data": null,
  "message": "시맨틱 검색은 Pro 플랜부터 사용할 수 있습니다."
}
```

---

### 4-2. [POST] AI 인라인 어시스트

**URL**: `/api/v1/ai/inline-assists`  
**인증 필요**: ✅  
**설명**: 선택한 텍스트 또는 현재 노트 문맥 기반으로 AI 글쓰기 보조. SSE 스트리밍 응답  
**발행 이벤트**: `AiSuggestionCreated`, `TokenUsageRecordedRequested`

**Request Header**:

```http
Accept: text/event-stream
Authorization: Bearer {accessToken}
```

```json
// Request Body
{
  "noteId": "note_01HZXNOTE123",
  "selectedText": "JWT는 인증 정보를 담는 토큰입니다.",
  "action": "SUMMARIZE",
  "language": "ko"
}
// action: "SUMMARIZE" | "REWRITE" | "CONTINUE" | "TRANSLATE" | "SPELLCHECK"
```

```text
// SSE Response
event: delta
data: {"text": "JWT는 "}

event: delta
data: {"text": "인증 정보를 담는 토큰입니다."}

event: done
data: {"suggestionId": "sug_01HZX123"}
```

```json
// Response 403
{
  "success": false,
  "data": null,
  "message": "AI 사용 가능 토큰이 부족합니다."
}
```

---

### 4-3. [POST] AI 제안 수락/거절

**URL**: `/api/v1/ai/suggestions/{suggestionId}/decision`  
**인증 필요**: ✅  
**설명**: AI 제안에 대한 사용자 결정 기록. 수락 시에만 Workspace 변경 적용  
**발행 이벤트**: `AiSuggestionAccepted` 또는 `AiSuggestionRejected`

```json
// Request Body
{
  "decision": "ACCEPTED"
}
// decision: "ACCEPTED" | "REJECTED" | "REGENERATED"
```

```json
// Response 200
{
  "success": true,
  "data": {
    "suggestionId": "sug_01HZX123",
    "decision": "ACCEPTED"
  },
  "message": "AI 제안이 수락되었습니다."
}
```

---

### 4-4. [POST] AI 채팅 스레드 생성

**URL**: `/api/v1/ai/chat-threads`  
**인증 필요**: ✅  
**설명**: RAG 기반 문서 챗봇 대화 스레드 생성  
**발행 이벤트**: `ChatThreadCreated`

```json
// Request Body
{
  "title": "JWT 공부 질문",
  "modelId": "claude-sonnet-4-6"
}
```

```json
// Response 201
{
  "success": true,
  "data": {
    "threadId": "chat_01HZX123",
    "title": "JWT 공부 질문",
    "modelId": "claude-sonnet-4-6",
    "createdAt": "2026-06-08T16:00:00"
  },
  "message": "채팅 스레드가 생성되었습니다."
}
```

---

### 4-5. [POST] AI 채팅 메시지 전송

**URL**: `/api/v1/ai/chat-threads/{threadId}/messages`  
**인증 필요**: ✅  
**설명**: RAG 기반 질의응답. 벡터 검색 후 LLM으로 응답. SSE 스트리밍  
**발행 이벤트**: `ChatMessageCreated`, `TokenUsageRecordedRequested`

**Request Header**:

```http
Accept: text/event-stream
Authorization: Bearer {accessToken}
```

```json
// Request Body
{
  "message": "JWT랑 세션 인증의 차이를 내 노트 기준으로 설명해줘",
  "noteScope": {
    "folderId": "fld_01HZXBACKEND",
    "tagNames": ["Security"]
  },
  "modelId": "claude-sonnet-4-6"
}
```

```text
// SSE Response
event: delta
data: {"text": "네 노트 기준으로 보면 JWT는..."}

event: citation
data: {"noteId": "note_01HZXNOTE123", "title": "Spring Boot JWT 정리"}

event: done
data: {"messageId": "msg_01HZX123", "inputTokens": 520, "outputTokens": 780}
```

```json
// Response 403
{
  "success": false,
  "data": null,
  "message": "AI 챗봇 사용 가능 토큰이 부족합니다."
}
```

---

### 4-6. [GET] AI 채팅 스레드 조회

**URL**: `/api/v1/ai/chat-threads/{threadId}`  
**인증 필요**: ✅  
**설명**: 특정 스레드의 메시지 이력 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "thread": {
      "threadId": "chat_01HZX123",
      "title": "JWT 공부 질문",
      "modelId": "claude-sonnet-4-6",
      "createdAt": "2026-06-08T16:00:00"
    },
    "messages": [
      {
        "messageId": "msg_01HZXUSER",
        "role": "USER",
        "content": "JWT랑 세션 인증 차이를 알려줘",
        "createdAt": "2026-06-08T16:00:00"
      },
      {
        "messageId": "msg_01HZXAI",
        "role": "ASSISTANT",
        "content": "JWT는 토큰 기반 인증이고 세션은 서버 저장 기반 인증입니다.",
        "citations": [
          {
            "noteId": "note_01HZXNOTE123",
            "title": "Spring Boot JWT 정리"
          }
        ],
        "createdAt": "2026-06-08T16:00:10"
      }
    ]
  },
  "message": "채팅 스레드 조회 성공"
}
```

---

### 4-7. [GET] 사용 가능한 AI 모델 목록

**URL**: `/api/v1/ai/models`  
**인증 필요**: ✅  
**설명**: 사용 가능한 LLM 모델 목록 및 비용 정보 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "models": [
      {
        "modelId": "claude-sonnet-4-6",
        "name": "Claude Sonnet 4.6",
        "provider": "anthropic",
        "costPer1kTokens": 0.003
      },
      {
        "modelId": "gpt-4o",
        "name": "GPT-4o",
        "provider": "openai",
        "costPer1kTokens": 0.005
      }
    ],
    "enabledModels": ["claude-sonnet-4-6"],
    "costInfo": {
      "currency": "USD"
    }
  },
  "message": "AI 모델 목록 조회 성공"
}
```

---

### 4-8. [PUT] AI 모델 설정 변경

**URL**: `/api/v1/ai/model-settings`  
**인증 필요**: ✅  
**설명**: 기본 모델 설정 및 사용자 API 키 등록  
**발행 이벤트**: `AiModelSettingsChanged`

```json
// Request Body
{
  "defaultModelId": "gpt-4o",
  "userApiKeys": {
    "openai": "sk-..."
  }
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "settings": {
      "defaultModelId": "gpt-4o",
      "userApiKeysRegistered": ["openai"]
    }
  },
  "message": "AI 모델 설정이 변경되었습니다."
}
```

---

### 4-9. [GET] 노트 요약 조회

**URL**: `/api/v1/notes/{noteId}/summary`  
**인증 필요**: ✅  
**설명**: 마인드맵 노드 hover 요약 팝업용. 캐시된 AI 요약 또는 앞부분 발췌 반환  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "noteId": "note_01HZXNOTE123",
    "summary": "JWT 인증의 개념과 구조를 정리한 노트입니다.\nSpring Security 적용 방법을 포함합니다.\nAccess Token과 Refresh Token 차이를 설명합니다.",
    "source": "AI"
  },
  "message": "노트 요약 조회 성공"
}
// source: "AI" | "EXCERPT"
```

---

### 4-10. [POST] AI 폴더 정리 제안 요청

**URL**: `/api/v1/ai/folder-organization-proposals`  
**인증 필요**: ✅  
**설명**: AI가 폴더 구조 개선안 제안. 사용자 승인 후에만 실제 변경 적용  
**발행 이벤트**: `AiSuggestionCreated`

```json
// Request Body
{
  "scope": "folder",
  "folderId": "fld_01J..."
}
// scope: "all" | "folder"
```

```json
// Response 200
{
  "success": true,
  "data": {
    "proposalId": "prp_01J...",
    "proposedFolders": [
      { "name": "AI & ML", "noteIds": ["nte_01J...", "nte_02J..."] }
    ],
    "proposedMoves": [
      { "noteId": "nte_03J...", "targetFolderName": "Backend" }
    ]
  },
  "message": "AI 폴더 정리 제안이 생성되었습니다."
}
```

---

### 4-11. [POST] AI 링크 추천

**URL**: `/api/v1/ai/link-suggestions`  
**인증 필요**: ✅  
**설명**: 현재 노트와 의미적으로 연결 가능한 다른 노트 제안. 사용자 승인 필요  
**발행 이벤트**: `AiSuggestionCreated`

```json
// Request Body
{
  "noteId": "note_01HZXNOTE123"
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "suggestions": [
      {
        "suggestionId": "sug_01HZXLINK",
        "targetNoteId": "note_01HZXTARGET",
        "targetTitle": "Spring Security 인증 흐름",
        "score": 0.87,
        "reason": "두 노트 모두 인증 처리와 토큰 검증 흐름을 다룹니다."
      }
    ]
  },
  "message": "AI 링크 추천이 완료되었습니다."
}
```

---

### 4-12. [POST] AI 클러스터링 요청

**URL**: `/api/v1/ai/clusters`  
**인증 필요**: ✅  
**설명**: 노트들을 의미 기반으로 클러스터링. 비동기 처리  
**발행 이벤트**: `ClusterJobRequested`

```json
// Request Body
{
  "scope": {
    "type": "ALL"
  },
  "algorithmOptions": {
    "minClusterSize": 3,
    "maxClusters": 10
  }
}
```

```json
// Response 202
{
  "success": true,
  "data": {
    "clusterJobId": "clu_01HZX123",
    "status": "PENDING"
  },
  "message": "AI 클러스터링 작업이 시작되었습니다."
}
```

---

### 4-13. [GET] AI 클러스터링 결과 조회

**URL**: `/api/v1/ai/clusters/{clusterJobId}`  
**인증 필요**: ✅  
**설명**: 클러스터링 작업 결과 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "clusterJobId": "clu_01HZX123",
    "status": "COMPLETED",
    "clusters": [
      {
        "clusterId": "cls_01J...",
        "label": "Spring Security",
        "noteIds": ["note_01HZXNOTE123", "note_01HZXTARGET"],
        "color": "#3B82F6"
      }
    ]
  },
  "message": "AI 클러스터링 결과 조회 성공"
}
```

---

### 4-14. [POST] 징검다리 개념 추천

**URL**: `/api/v1/ai/bridge-concepts`  
**인증 필요**: ✅  
**설명**: 두 노트 사이를 연결하는 중간 개념 노트 추천  
**발행 이벤트**: `AiSuggestionCreated`

```json
// Request Body
{
  "fromNoteId": "nte_01J...",
  "toNoteId": "nte_10J..."
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "noteId": "nte_05J...",
        "title": "중간 개념 노트",
        "bridgeReason": "두 노트의 공통 도메인 주제를 연결합니다."
      }
    ]
  },
  "message": "징검다리 개념 추천이 완료되었습니다."
}
```

---

### 4-15. [POST] AI 인사이트 리포트 요청

**URL**: `/api/v1/ai/insight-reports`  
**인증 필요**: ✅  
**설명**: 학습 공백 탐지 및 브레인스토밍용 AI 인사이트 리포트 생성 요청  
**발행 이벤트**: `InsightReportRequested`

```json
// Request Body
{
  "scope": {
    "type": "ALL"
  },
  "includeLearningRecommendations": true
}
```

```json
// Response 202
{
  "success": true,
  "data": {
    "reportJobId": "rep_01HZX123",
    "status": "PENDING"
  },
  "message": "AI 인사이트 리포트 생성을 시작합니다."
}
```

---

### 4-16. [GET] AI 인사이트 리포트 조회

**URL**: `/api/v1/ai/insight-reports/{reportId}`  
**인증 필요**: ✅  
**설명**: 생성된 인사이트 리포트 내용 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "reportId": "rep_01HZX123",
    "summary": "최근 백엔드와 인증 관련 노트가 집중적으로 작성되었습니다.",
    "knowledgeGaps": [
      "OAuth 2.0 Authorization Code Flow",
      "Refresh Token Rotation"
    ],
    "recommendations": [
      {
        "topic": "JWT 보안 취약점 정리",
        "reason": "현재 JWT 개념은 정리되어 있지만 보안 위협에 대한 내용이 부족합니다."
      }
    ],
    "completedAt": "2026-06-08T16:30:00"
  },
  "message": "AI 인사이트 리포트 조회 성공"
}
```

---

### 4-17. [GET] 문체 프로필 조회

**URL**: `/api/v1/users/me/style-profile`  
**인증 필요**: ✅  
**설명**: 사용자 AI 글쓰기 문체 프로필 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "style": {
      "tone": "formal",
      "language": "ko",
      "customInstructions": "기술 문서 스타일로 작성"
    },
    "detectedFromNotesAt": "2026-06-01T00:00:00Z"
  },
  "message": "문체 프로필 조회 성공"
}
```

---

### 4-18. [PUT] 문체 프로필 설정

**URL**: `/api/v1/users/me/style-profile`  
**인증 필요**: ✅  
**설명**: AI 글쓰기 보조에 적용할 문체 직접 설정  
**발행 이벤트**: `UserStyleProfileChanged`

```json
// Request Body
{
  "style": {
    "tone": "casual",
    "language": "ko",
    "customInstructions": "친근한 말투로 작성"
  }
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "style": {
      "tone": "casual",
      "language": "ko",
      "customInstructions": "친근한 말투로 작성"
    }
  },
  "message": "문체 설정이 저장되었습니다."
}
```

---

## 5. Commerce & Operations Service

> **도메인 책임**: 플랜, 결제, 토큰 사용량, 관리자 운영, 문의, 알림, 사용자 행동/통계  
> **관련 기능**: `7.2.1` `7.3.1` `10.1` `11.1` `12.1` `13.1` `13.2`

---

### 5-1. [GET] 플랜 목록 조회

**URL**: `/api/v1/plans`  
**인증 필요**: ❌  
**설명**: 가입 가능한 구독 플랜 목록 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "plans": [
      {
        "planId": "free",
        "name": "Free",
        "price": 0,
        "currency": "KRW",
        "features": ["기본 노트 작성", "키워드 검색", "기본 마인드맵"],
        "entitlements": {
          "tokenQuotaPerMonth": 50000,
          "exportEnabled": false,
          "shareLinkMaxDays": 7
        }
      },
      {
        "planId": "pro",
        "name": "Pro",
        "price": 9900,
        "currency": "KRW",
        "features": ["시맨틱 검색", "RAG 챗봇", "AI 인사이트 리포트", "공유 링크 30일"],
        "entitlements": {
          "tokenQuotaPerMonth": 500000,
          "exportEnabled": true,
          "shareLinkMaxDays": -1
        }
      },
      {
        "planId": "team",
        "name": "Team",
        "price": 29900,
        "currency": "KRW",
        "features": ["팀 워크스페이스", "관리자 기능", "공유 링크 무제한"],
        "entitlements": {
          "tokenQuotaPerMonth": -1,
          "exportEnabled": true,
          "shareLinkMaxDays": -1
        }
      }
    ]
  },
  "message": "플랜 목록 조회 성공"
}
```

---

### 5-2. [GET] 내 구독 정보 조회

**URL**: `/api/v1/users/me/subscription`  
**인증 필요**: ✅  
**설명**: 현재 구독 플랜 및 권한 정보 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "plan": {
      "planId": "pro",
      "name": "Pro"
    },
    "status": "ACTIVE",
    "renewalAt": "2026-07-08T00:00:00",
    "entitlements": {
      "tokenQuotaPerMonth": 500000,
      "exportEnabled": true,
      "shareLinkMaxDays": 30,
      "semanticSearch": true,
      "ragChat": true
    }
  },
  "message": "구독 정보 조회 성공"
}
```

---

### 5-3. [POST] 결제 체크아웃 세션 생성

**URL**: `/api/v1/subscriptions/checkout-sessions`  
**인증 필요**: ✅  
**설명**: 구독 결제를 위한 PG 체크아웃 세션 URL 발급  
**발행 이벤트**: `CheckoutSessionCreated`

```json
// Request Body
{
  "planId": "pro",
  "successUrl": "https://brainx.com/billing/success",
  "cancelUrl": "https://brainx.com/billing/cancel"
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "checkoutUrl": "https://payment.brainx.com/checkout/session_123"
  },
  "message": "결제 세션이 생성되었습니다."
}
```

---

### 5-4. [POST] 구독 플랜 변경

**URL**: `/api/v1/subscriptions/change`  
**인증 필요**: ✅  
**설명**: 현재 플랜을 다른 플랜으로 변경  
**발행 이벤트**: `SubscriptionChanged`

```json
// Request Body
{
  "targetPlanId": "team"
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "planId": "team",
    "status": "ACTIVE",
    "changedAt": "2026-06-08T17:00:00"
  },
  "message": "구독 플랜이 변경되었습니다."
}
```

---

### 5-5. [POST] 구독 취소

**URL**: `/api/v1/subscriptions/cancel`  
**인증 필요**: ✅  
**설명**: 구독 취소. 기간 만료 후 취소 또는 즉시 취소 선택  
**발행 이벤트**: `SubscriptionChanged`

```json
// Request Body
{
  "cancelAtPeriodEnd": true
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "planId": "pro",
    "status": "CANCEL_SCHEDULED",
    "cancelAt": "2026-07-08T00:00:00"
  },
  "message": "구독 해지가 예약되었습니다."
}
```

---

### 5-6. [POST] 결제 웹훅 수신

**URL**: `/api/v1/payments/webhooks/{provider}`  
**인증 필요**: ❌ (provider 서명 검증)  
**설명**: PG사 결제 이벤트 수신 처리  
**Path Parameter**: `provider` = `toss` | `stripe`  
**발행 이벤트**: `PaymentSucceeded`, `PaymentFailed`, `InvoiceIssued`

```json
// Request Body - provider signed payload
{
  // provider별 서명 포함 원본 페이로드
}
```

```json
// Response 200
{
  "success": true,
  "data": null,
  "message": "웹훅 처리 완료"
}
```

---

### 5-7. [POST] 권한/쿼터 확인

**URL**: `/api/v1/entitlements/check`  
**인증 필요**: ✅  
**설명**: 특정 기능 사용 가능 여부 사전 확인. AI 기능 호출 전 필수  
**발행 이벤트**: 없음

```json
// Request Body
{
  "capability": "RAG_CHAT",
  "quantity": 1
}
```

```json
// Response 200 - 허용
{
  "success": true,
  "data": {
    "allowed": true,
    "reason": null,
    "remaining": 84500
  },
  "message": "기능 사용이 가능합니다."
}
```

```json
// Response 200 - 불허
{
  "success": true,
  "data": {
    "allowed": false,
    "reason": "FREE_PLAN_NOT_ALLOWED",
    "remaining": 0
  },
  "message": "현재 플랜에서는 사용할 수 없는 기능입니다."
}
```

---

### 5-8. [POST] 토큰 사용량 기록

**URL**: `/api/v1/token-usage`  
**인증 필요**: ✅ (서비스 간 내부 호출)  
**설명**: AI 기능 사용 토큰 원장 기록. Knowledge Intelligence의 `TokenUsageRecordedRequested` 이벤트에 의해 트리거  
**발행 이벤트**: `TokenUsageRecorded`

```json
// Request Body
{
  "sourceService": "knowledge-intelligence",
  "featureId": "RAG_CHAT",
  "modelId": "claude-sonnet-4-6",
  "inputTokens": 520,
  "outputTokens": 780,
  "cost": 0.012
}
```

```json
// Response 201
{
  "success": true,
  "data": {
    "ledgerId": "tok_01HZX123",
    "remainingQuota": 83700
  },
  "message": "토큰 사용량이 기록되었습니다."
}
```

---

### 5-9. [GET] 내 토큰 사용량 조회

**URL**: `/api/v1/users/me/token-usage`  
**인증 필요**: ✅  
**설명**: 기간별 토큰 사용량 통계  
**발행 이벤트**: 없음

|Query Parameter|타입|필수|설명|
|---|---|---|---|
|from|String|✅|시작일|
|to|String|✅|종료일|
|groupBy|String|❌|DAILY, WEEKLY, MONTHLY|

```json
// Response 200
{
  "success": true,
  "data": {
    "usage": [
      {
        "date": "2026-06-08",
        "inputTokens": 12000,
        "outputTokens": 18000,
        "cost": 0.21
      }
    ],
    "total": {
      "inputTokens": 12000,
      "outputTokens": 18000,
      "cost": 0.21
    }
  },
  "message": "토큰 사용량 조회 성공"
}
```

---

### 5-10. [GET] 지식 성장 대시보드 조회

**URL**: `/api/v1/users/me/knowledge-dashboard`  
**인증 필요**: ✅  
**설명**: 마이페이지용 개인 지식 성장 통계  
**Query Parameter**: `period` (DAILY | WEEKLY | MONTHLY)  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "noteCount": 128,
    "nodeCount": 128,
    "edgeCount": 342,
    "streak": 12,
    "trends": [
      {
        "date": "2026-06-08",
        "createdNotes": 3,
        "updatedNotes": 7
      }
    ],
    "topLinkedNotes": [
      {
        "noteId": "note_01HZXNOTE123",
        "title": "Spring Boot JWT 정리",
        "linkCount": 14
      }
    ]
  },
  "message": "지식 성장 대시보드 조회 성공"
}
```

---

### 5-11. [GET] 워드클라우드 데이터 조회

**URL**: `/api/v1/users/me/wordcloud`  
**인증 필요**: ✅  
**설명**: 노트 본문 기반 단어 빈도 통계. 클라이언트에서 시각화  
**발행 이벤트**: 없음

|Query Parameter|타입|필수|설명|
|---|---|---|---|
|folderId|String|❌|폴더 필터|
|from|String|❌|시작일|
|to|String|❌|종료일|

```json
// Response 200
{
  "success": true,
  "data": {
    "words": [
      { "text": "Spring", "count": 42, "weight": 0.95 },
      { "text": "JWT", "count": 28, "weight": 0.78 }
    ]
  },
  "message": "워드클라우드 조회 성공"
}
```

---

### 5-12. [POST] 클라이언트 행동 이벤트 수집

**URL**: `/api/v1/events/client`  
**인증 필요**: ✅  
**설명**: 사용자 행동 패턴 분석용 이벤트 수집. 행동 분석 동의 여부에 따라 저장 여부 결정  
**발행 이벤트**: `ClientEventReceived`

```json
// Request Body
{
  "eventName": "note_editor_opened",
  "properties": {
    "noteId": "note_01HZXNOTE123",
    "editorMode": "wysiwyg"
  },
  "occurredAt": "2026-06-08T08:00:00"
}
```

```json
// Response 200
{
  "success": true,
  "data": null,
  "message": "이벤트가 수집되었습니다."
}
```

---

### 5-13. [GET] 사용 가이드 목록 조회

**URL**: `/api/v1/users/me/guides`  
**인증 필요**: ✅  
**설명**: 행동 패턴 분석 기반 노출할 UI 가이드/툴팁 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "guideTriggers": [
      {
        "guideId": "gid_01J...",
        "type": "tooltip",
        "targetFeature": "graph_view",
        "message": "마인드맵에서 노드를 클릭해 노트로 이동하세요."
      }
    ]
  },
  "message": "사용 가이드 조회 성공"
}
```

---

### 5-14. [PUT] 사용 가이드 닫기

**URL**: `/api/v1/users/me/guides/{guideId}`  
**인증 필요**: ✅  
**설명**: 가이드/툴팁 다시 안 보기 처리  
**발행 이벤트**: `GuideDismissed`

```json
// Request Body
{
  "dismissed": true
}
```

```json
// Response 200
{
  "success": true,
  "data": null,
  "message": "가이드가 닫혔습니다."
}
```

---

### 5-15. [POST] 문의 접수

**URL**: `/api/v1/support/tickets`  
**인증 필요**: ✅  
**설명**: 사용자 문의 등록. 접수 시 알림 발송  
**발행 이벤트**: `SupportTicketCreated`, `NotificationRequested`

```json
// Request Body
{
  "category": "PAYMENT",
  "subject": "결제 취소 문의",
  "body": "Pro 플랜 결제를 취소하고 싶습니다.",
  "attachments": ["ast_01HZXFILE123"]
}
```

```json
// Response 201
{
  "success": true,
  "data": {
    "ticketId": "tic_01HZX123",
    "status": "OPEN",
    "createdAt": "2026-06-08T17:20:00"
  },
  "message": "문의가 등록되었습니다."
}
```

---

### 5-16. [GET] 내 문의 목록 조회

**URL**: `/api/v1/support/tickets`  
**인증 필요**: ✅  
**설명**: 접수한 문의 내역 목록 조회  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "tickets": [
      {
        "ticketId": "tic_01HZX123",
        "category": "PAYMENT",
        "subject": "결제 취소 문의",
        "status": "OPEN",
        "createdAt": "2026-06-08T17:20:00"
      }
    ]
  },
  "message": "문의 목록 조회 성공"
}
```

---

### 5-17. [GET] 랜딩 페이지 설정 조회

**URL**: `/api/v1/landing/config`  
**인증 필요**: ❌  
**설명**: 인덱스/랜딩 페이지 운영 설정 조회. SEO 및 히어로 섹션 동적 구성  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "hero": {
      "headline": "당신의 두 번째 뇌, BrainX",
      "subheadline": "AI가 당신의 지식을 연결합니다.",
      "ctaText": "무료로 시작하기"
    },
    "demos": [
      {
        "title": "마인드맵",
        "videoUrl": "https://cdn.brainx.com/demos/mindmap.mp4"
      }
    ],
    "seo": {
      "title": "BrainX - AI 지식 관리 플랫폼",
      "description": "마크다운 기반 노트와 AI가 결합된 두 번째 뇌",
      "ogImageUrl": "https://cdn.brainx.com/og-image.png"
    }
  },
  "message": "랜딩 페이지 설정 조회 성공"
}
```

---

### 5-18. [POST] 관리자 계정 생성

**URL**: `/api/v1/admin/users`  
**인증 필요**: ✅ (ROLE_ADMIN)  
**설명**: 관리자 계정 생성  
**발행 이벤트**: `AdminUserCreated`

```json
// Request Body
{
  "email": "admin@brainx.com",
  "role": "support",
  "temporaryPassword": "temp1234!"
}
```

```json
// Response 200
{
  "success": true,
  "data": {
    "adminUserId": "adm_01J..."
  },
  "message": "관리자 계정이 생성되었습니다."
}
```

---

### 5-19. [GET] 관리자 토큰 사용량 조회

**URL**: `/api/v1/admin/token-usage`  
**인증 필요**: ✅ (ROLE_ADMIN)  
**설명**: 전체 또는 특정 사용자의 토큰 사용량 및 비용 통계  
**발행 이벤트**: 없음

|Query Parameter|타입|필수|설명|
|---|---|---|---|
|userId|String|❌|특정 사용자 필터|
|modelId|String|❌|특정 모델 필터|
|from|String|✅|시작일|
|to|String|✅|종료일|

```json
// Response 200
{
  "success": true,
  "data": {
    "usage": [
      {
        "userId": "usr_01HZXABC123",
        "email": "user@brainx.com",
        "modelId": "claude-sonnet-4-6",
        "totalInputTokens": 52000,
        "totalOutputTokens": 78000,
        "cost": 1.24
      }
    ],
    "totalCost": 1.24
  },
  "message": "관리자 토큰 사용량 조회 성공"
}
```

```json
// Response 403
{
  "success": false,
  "data": null,
  "message": "관리자 권한이 필요합니다."
}
```

---

### 5-20. [GET] 관리자 문의 목록 조회

**URL**: `/api/v1/admin/support/tickets`  
**인증 필요**: ✅ (ROLE_ADMIN)  
**설명**: 전체 사용자 문의 목록 및 상태별 필터 조회  
**Query Parameter**: `status` = `OPEN` | `IN_PROGRESS` | `CLOSED`  
**발행 이벤트**: 없음

```json
// Response 200
{
  "success": true,
  "data": {
    "tickets": [
      {
        "ticketId": "tic_01HZX123",
        "userId": "usr_01HZXABC123",
        "email": "user@brainx.com",
        "category": "PAYMENT",
        "subject": "결제 취소 문의",
        "status": "OPEN",
        "createdAt": "2026-06-08T17:20:00"
      }
    ]
  },
  "message": "관리자 문의 목록 조회 성공"
}
```

---

### 5-21. [POST] 관리자 문의 답변 등록

**URL**: `/api/v1/admin/support/tickets/{ticketId}/replies`  
**인증 필요**: ✅ (ROLE_ADMIN)  
**설명**: 문의에 답변 등록. 종료 처리 가능  
**발행 이벤트**: `SupportTicketReplied`, `NotificationRequested`

```json
// Request Body
{
  "body": "안녕하세요. 결제 취소 처리를 도와드리겠습니다.",
  "close": true
}
```

```json
// Response 201
{
  "success": true,
  "data": {
    "replyId": "rep_01HZX123",
    "ticketId": "tic_01HZX123",
    "status": "CLOSED"
  },
  "message": "문의 답변이 등록되었습니다."
}
```

---

## 6. 프론트 페이지별 API 매칭

---

### 랜딩 `/`

|기능|API|
|---|---|
|플랜 미리보기|`GET /api/v1/plans`|
|랜딩 설정|`GET /api/v1/landing/config`|

---

### 로그인 `/login`

|기능|API|
|---|---|
|자체 로그인|`POST /api/v1/auth/login/local`|
|소셜 로그인 URL|`GET /api/v1/auth/oauth/{provider}/authorize`|
|소셜 콜백|`POST /api/v1/auth/oauth/{provider}/callback`|
|토큰 재발급|`POST /api/v1/auth/token/refresh`|

---

### 회원가입 `/signup`

|기능|API|
|---|---|
|이메일 인증 요청|`POST /api/v1/auth/email-verifications`|
|이메일 회원가입|`POST /api/v1/auth/signup/email`|

---

### 온보딩 `/onboarding`

|기능|API|
|---|---|
|프로필 저장|`PATCH /api/v1/users/me/profile`|
|동의 저장|`PUT /api/v1/users/me/consents`|

---

### 홈 `/home`

|기능|API|
|---|---|
|동기화 데이터 조회|`GET /api/v1/workspace/sync`|
|최근 노트|`GET /api/v1/recent-activities`|
|즐겨찾기|`PUT /api/v1/favorites/{targetType}/{targetId}`|
|시맨틱 검색|`POST /api/v1/intelligence/semantic-search`|

---

### 노트 에디터 `/notes/:id`

|기능|API|
|---|---|
|노트 상세|`GET /api/v1/notes/{noteId}`|
|자동 저장|`PUT /api/v1/notes/{noteId}/content`|
|메타데이터 수정|`PATCH /api/v1/notes/{noteId}/metadata`|
|태그 수정|`PUT /api/v1/notes/{noteId}/tags`|
|백링크 조회|`GET /api/v1/notes/{noteId}/backlinks`|
|노트 링크 생성|`POST /api/v1/notes/{noteId}/links`|
|버전 목록|`GET /api/v1/notes/{noteId}/versions`|
|버전 복원|`POST /api/v1/notes/{noteId}/versions/{versionId}/restore`|
|AI 인라인 보조|`POST /api/v1/ai/inline-assists`|
|AI 링크 추천|`POST /api/v1/ai/link-suggestions`|
|파일 업로드|`POST /api/v1/assets/upload-sessions`|
|공유 링크 생성|`POST /api/v1/share-links`|
|내보내기|`POST /api/v1/exports`|
|열람 기록 저장|`POST /api/v1/notes/{noteId}/views`|

---

### 마인드맵 `/graph`

|기능|API|
|---|---|
|그래프 조회|`GET /api/v1/graph`|
|레이아웃 저장|`PUT /api/v1/graph/layouts/{layoutId}`|
|노트 요약|`GET /api/v1/notes/{noteId}/summary`|
|AI 클러스터링|`POST /api/v1/ai/clusters`|
|클러스터 결과|`GET /api/v1/ai/clusters/{clusterJobId}`|
|징검다리 추천|`POST /api/v1/ai/bridge-concepts`|
|폴더 정리 제안|`POST /api/v1/ai/folder-organization-proposals`|

---

### 챗봇 `/chat`

|기능|API|
|---|---|
|채팅 스레드 생성|`POST /api/v1/ai/chat-threads`|
|RAG 메시지 전송|`POST /api/v1/ai/chat-threads/{threadId}/messages`|
|채팅 내역 조회|`GET /api/v1/ai/chat-threads/{threadId}`|
|모델 목록|`GET /api/v1/ai/models`|

---

### 가져오기 `/import`

|기능|API|
|---|---|
|Notion 연결 URL|`POST /api/v1/imports/notion/oauth/authorize`|
|Notion OAuth 콜백|`POST /api/v1/imports/notion/oauth/callback`|
|Notion 가져오기|`POST /api/v1/imports/notion/jobs`|
|Obsidian 가져오기|`POST /api/v1/imports/obsidian/jobs`|
|가져오기 상태|`GET /api/v1/imports/{importJobId}`|

---

### 마이페이지 `/mypage`

|기능|API|
|---|---|
|내 정보|`GET /api/v1/users/me`|
|지식 성장 대시보드|`GET /api/v1/users/me/knowledge-dashboard`|
|토큰 사용량|`GET /api/v1/users/me/token-usage`|
|워드클라우드|`GET /api/v1/users/me/wordcloud`|
|AI 인사이트 리포트 요청|`POST /api/v1/ai/insight-reports`|
|AI 인사이트 리포트 조회|`GET /api/v1/ai/insight-reports/{reportId}`|

---

### 결제 `/billing`

|기능|API|
|---|---|
|플랜 목록|`GET /api/v1/plans`|
|내 구독 정보|`GET /api/v1/users/me/subscription`|
|결제 세션 생성|`POST /api/v1/subscriptions/checkout-sessions`|
|구독 변경|`POST /api/v1/subscriptions/change`|
|구독 해지|`POST /api/v1/subscriptions/cancel`|

---

### 설정 `/settings`

|기능|API|
|---|---|
|내 정보 조회|`GET /api/v1/users/me`|
|프로필 수정|`PATCH /api/v1/users/me/profile`|
|비밀번호 변경|`PATCH /api/v1/users/me/password`|
|동의 수정|`PUT /api/v1/users/me/consents`|
|문체 설정|`PUT /api/v1/users/me/style-profile`|
|소셜 계정 연결|`POST /api/v1/users/me/social-accounts`|
|소셜 계정 연결 해제|`DELETE /api/v1/users/me/social-accounts/{provider}`|
|2FA 설정|`POST /api/v1/users/me/2fa/email`|
|AI 모델 설정|`PUT /api/v1/ai/model-settings`|
|API 클라이언트 생성|`POST /api/v1/api-clients`|
|회원 탈퇴|`POST /api/v1/users/me/deletion-request`|
|회원 탈퇴 취소|`DELETE /api/v1/users/me/deletion-request`|

---

### 문의하기 `/support`

|기능|API|
|---|---|
|문의 등록|`POST /api/v1/support/tickets`|
|내 문의 목록|`GET /api/v1/support/tickets`|

---

### 공유 노트 `/share/:id`

|기능|API|
|---|---|
|공유 노트 조회|`GET /api/v1/share-links/{shareId}`|

---

### 관리자 `/admin`

|기능|API|
|---|---|
|관리자 계정 생성|`POST /api/v1/admin/users`|
|토큰 사용량 조회|`GET /api/v1/admin/token-usage`|
|문의 목록 조회|`GET /api/v1/admin/support/tickets`|
|문의 답변|`POST /api/v1/admin/support/tickets/{ticketId}/replies`|