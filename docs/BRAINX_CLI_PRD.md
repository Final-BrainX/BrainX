# BrainX CLI PRD

- 작성일: 2026-07-03
- 대상 제품: BrainX CLI (`brainx`)
- 권장 소유 레포: 별도 레포 `brainx-cli`
- 권장 기술 스택: Go + Cobra
- 관련 BrainX 서버 기능: MCP OAuth, MCP Streamable HTTP, MCP API key fallback
- 현재 전제: BrainX 본체 PR #139의 MCP OAuth/User-Service/Mcp-Service 변경이 `main`에 병합되고 배포되어 있어야 한다.

## 1. Summary

BrainX CLI는 Windows Terminal, macOS/Linux shell에서 사용할 수 있는 독립 실행형 명령줄 앱이다. 사용자는 CLI로 BrainX에 로그인하고, Codex 같은 외부 AI 도구가 BrainX MCP 서버를 사용할 수 있도록 로컬 설정을 자동 구성한다.

1차 목표는 BrainX 서버에 새 API를 추가하지 않고, 이미 구현된 OAuth/MCP 공개 계약을 사용해 다음 흐름을 제공하는 것이다.

```powershell
brainx login
brainx status
brainx mcp install codex
brainx mcp whoami
brainx logout
```

CLI는 사용자 PC에서 실행되며 BrainX API를 직접 호출한다. 토큰은 OS credential store에 저장하고, Codex 설정은 사용자의 `~/.codex/config.toml`에 MCP 서버 항목을 추가하거나 갱신한다.

## 2. Problem

현재 BrainX MCP는 원격 MCP endpoint와 API key fallback을 제공하지만, 일반 사용자가 Codex에 연결하려면 다음을 직접 이해해야 한다.

- MCP server URL
- OAuth login 또는 API key 방식 차이
- Codex `config.toml` 위치와 TOML 문법
- scope 설정
- 토큰/키 보관 방식

이 방식은 개발자에게도 번거롭고, 일반 사용자에게는 사실상 진입 장벽이 된다. BrainX CLI는 GitHub CLI(`gh`)처럼 로컬에서 로그인, 토큰 저장, 설정 파일 갱신, 연결 검증을 담당해 설치 경험을 단순화한다.

## 3. Goals

- 사용자가 환경변수나 API key를 직접 복사하지 않고 BrainX MCP를 Codex에 연결할 수 있다.
- Windows Terminal에서 `brainx.exe` 단일 바이너리로 동작한다.
- macOS/Linux도 같은 코드베이스에서 후속 지원할 수 있다.
- BrainX OAuth 2.1 + PKCE 흐름을 사용한다.
- access token/refresh token은 평문 파일이 아니라 OS credential store에 저장한다.
- Codex 설정 파일을 안전하게 읽고, 기존 사용자 설정을 보존하면서 BrainX MCP 서버만 추가/갱신한다.
- 연결이 제대로 되었는지 CLI에서 즉시 확인할 수 있다.

## 4. Non-Goals

- BrainX 서버에 새 endpoint를 추가하지 않는다.
- CLI 안에 MCP server 전체를 새로 구현하지 않는다.
- 1차에서는 노트 검색/작성 명령어를 CLI native command로 제공하지 않는다. 노트 접근은 Codex MCP tool을 통해 수행한다.
- GUI 앱, tray 앱, installer UI는 1차 범위가 아니다.
- API key 발급 UI를 대체하지 않는다. API key 방식은 개발자 fallback으로 유지한다.
- BrainX 계정 생성/비밀번호 재설정 전체 흐름을 CLI에서 구현하지 않는다. 로그인은 브라우저로 위임한다.

## 5. Users

### Primary User

BrainX를 쓰는 개발자 또는 지식 작업자.

- Codex CLI/Desktop/IDE에서 BrainX 노트를 검색하고 싶다.
- 설정 파일을 직접 편집하고 싶지 않다.
- Windows Terminal에서 간단히 설치와 연결 상태를 확인하고 싶다.

### Secondary User

BrainX 운영자 또는 개발자.

- 사용자 연결 문제를 재현하고 진단하고 싶다.
- OAuth/MCP 배포가 정상인지 터미널에서 빠르게 확인하고 싶다.

## 6. User Stories

- 사용자는 `brainx login`을 실행하면 브라우저에서 BrainX 로그인/동의 화면을 보고 승인할 수 있다.
- 사용자는 로그인 후 `brainx status`로 현재 연결된 계정과 서버를 확인할 수 있다.
- 사용자는 `brainx mcp install codex`로 Codex MCP 설정을 자동 추가할 수 있다.
- 사용자는 `brainx mcp whoami`로 BrainX MCP 인증이 실제로 동작하는지 확인할 수 있다.
- 사용자는 `brainx logout`으로 로컬에 저장된 BrainX 토큰을 삭제할 수 있다.
- 운영자는 `brainx doctor`로 OAuth metadata, protected resource metadata, Codex config 상태를 점검할 수 있다.

## 7. Command Requirements

### 7.1 `brainx login`

OAuth PKCE authorization code flow로 BrainX에 로그인한다.

동작:

1. `--server`가 없으면 기본 서버 `https://brainx.p-e.kr`를 사용한다.
2. `GET /.well-known/oauth-protected-resource` 또는 서버 설정으로 MCP resource를 확인한다.
3. `GET /.well-known/oauth-authorization-server`에서 authorization/token/registration endpoint를 확인한다.
4. 필요 시 `POST /oauth/register`로 public client를 dynamic registration한다.
5. 로컬 loopback callback server를 띄운다.
6. 브라우저로 `/oauth/authorize` URL을 연다.
7. callback으로 받은 authorization code를 `/oauth/token`에 PKCE verifier와 함께 교환한다.
8. access token/refresh token/client metadata를 OS credential store와 최소 로컬 config에 저장한다.
9. 로그인 성공 후 계정 식별 정보를 출력한다.

필수 옵션:

```powershell
brainx login
brainx login --server https://brainx.p-e.kr
brainx login --scopes "whoami notes:read ai:search notes:write"
```

출력 예:

```text
Logged in to BrainX
Server: https://brainx.p-e.kr
Scopes: whoami, notes:read, ai:search, notes:write
```

보안 요구:

- authorization code verifier는 메모리에만 둔다.
- token 응답 원문은 로그에 출력하지 않는다.
- refresh token은 OS credential store에 저장한다.
- access token은 가능하면 credential store에 저장하고, 만료 시 refresh한다.

### 7.2 `brainx status`

현재 로컬 로그인 상태를 보여준다.

동작:

1. 로컬 config에서 server/resource/client 정보를 읽는다.
2. credential store에서 token 존재 여부를 확인한다.
3. access token이 만료되었으면 refresh token으로 갱신한다.
4. `GET /api/v1/mcp/whoami`로 인증 상태를 확인한다.

출력 예:

```text
BrainX: connected
Server: https://brainx.p-e.kr
User: usr_...
Client: oauth_...
Scopes: whoami, notes:read, ai:search, notes:write
Codex MCP: installed
```

### 7.3 `brainx logout`

로컬 저장 토큰을 삭제한다.

1차 범위:

- OS credential store의 BrainX token 삭제
- 로컬 CLI config의 민감하지 않은 session metadata 삭제 또는 비활성화

후속 범위:

- 서버 refresh token revoke endpoint가 제공되면 원격 revoke까지 수행한다.

### 7.4 `brainx mcp install codex`

Codex가 BrainX MCP 서버를 사용할 수 있도록 `~/.codex/config.toml`에 설정을 추가한다.

Codex 공식 manual 기준으로 Codex MCP 설정은 기본적으로 `~/.codex/config.toml`에 저장되며, Streamable HTTP MCP server는 `url`, OAuth `scopes`, `oauth_resource`를 사용할 수 있다. Codex가 OAuth MCP server에 대해 `codex mcp login <server>` 흐름을 지원하므로, CLI는 token을 Codex config에 직접 쓰지 않는다.

추가/갱신할 설정:

```toml
[mcp_servers.brainx]
url = "https://brainx.p-e.kr/mcp"
scopes = ["whoami", "notes:read", "ai:search", "notes:write"]
oauth_resource = "https://brainx.p-e.kr/mcp"
startup_timeout_sec = 10
tool_timeout_sec = 60
```

요구사항:

- 기존 `~/.codex/config.toml`이 있으면 보존한다.
- 기존 `[mcp_servers.brainx]`가 있으면 사용자 확인 없이 BrainX 관리 필드만 갱신하되, 알 수 없는 필드는 가능한 보존한다.
- TOML 파서는 정식 라이브러리를 사용한다. 문자열 replace로 처리하지 않는다.
- `--dry-run` 옵션으로 변경 예정 diff를 출력한다.
- `--global`은 user config를 대상으로 한다. 1차 기본값은 global이다.
- `--project <path>`는 후속 범위로 둔다.

명령 예:

```powershell
brainx mcp install codex
brainx mcp install codex --dry-run
brainx mcp install codex --server https://brainx.p-e.kr
```

### 7.5 `brainx mcp whoami`

BrainX MCP 인증이 실제로 동작하는지 확인한다.

동작:

1. 저장된 OAuth access token을 가져온다.
2. 만료된 경우 refresh한다.
3. `GET /api/v1/mcp/whoami` 호출.
4. userId/clientId/scopes를 출력한다.

출력 예:

```text
MCP authentication OK
User: usr_...
Client: oauth_...
Scopes: whoami, notes:read, ai:search, notes:write
```

### 7.6 `brainx doctor`

문제 진단용 명령이다.

검사 항목:

- BrainX base URL 접근 가능 여부
- OAuth authorization server metadata 응답
- MCP protected resource metadata 응답
- 로컬 credential store 접근 가능 여부
- 토큰 refresh 가능 여부
- `/api/v1/mcp/whoami` 성공 여부
- Codex config 파일 존재 여부
- `[mcp_servers.brainx]` 설정 여부

출력은 문제와 해결 힌트를 함께 보여준다.

## 8. Architecture

```text
User Terminal
  |
  | brainx login
  v
BrainX CLI
  |-- opens browser --> BrainX /oauth/authorize
  |<-- localhost callback with code
  |-- POST /oauth/token
  |-- stores token in OS credential store
  |
  | brainx mcp install codex
  v
~/.codex/config.toml
  |
  | Codex starts MCP session
  v
Codex -> https://brainx.p-e.kr/mcp
```

CLI는 BrainX API gateway가 아니라 공개 배포 origin을 기준으로 호출한다.

기본값:

- BrainX base URL: `https://brainx.p-e.kr`
- MCP resource: `https://brainx.p-e.kr/mcp`
- MCP endpoint: `https://brainx.p-e.kr/mcp`
- scopes: `whoami notes:read ai:search notes:write`

## 9. Existing API Dependencies

새 endpoint 없이 다음 기존 계약을 사용한다.

| 기능 | Endpoint | 소유 |
| --- | --- | --- |
| OAuth AS metadata | `GET /.well-known/oauth-authorization-server` | User-Service |
| OIDC-compatible metadata | `GET /.well-known/openid-configuration` | User-Service |
| OAuth DCR | `POST /oauth/register` | User-Service |
| OAuth token exchange | `POST /oauth/token` | User-Service |
| MCP protected resource metadata | `GET /.well-known/oauth-protected-resource` | Mcp-Service |
| MCP 인증 확인 | `GET /api/v1/mcp/whoami` | Mcp-Service |
| MCP protocol | `POST /mcp` | Mcp-Service |

프론트 consent 화면 `/oauth/authorize`는 사용자가 브라우저에서 BrainX 로그인 세션으로 승인하는 UI다. CLI는 해당 URL을 열 뿐, 사용자 비밀번호를 직접 입력받지 않는다.

## 10. Local Storage And Credentials

### 10.1 Config File

민감하지 않은 설정만 저장한다.

권장 위치:

- Windows: `%APPDATA%\BrainX\config.toml`
- macOS: `~/Library/Application Support/brainx/config.toml`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/brainx/config.toml`

저장 가능 항목:

```toml
server = "https://brainx.p-e.kr"
resource = "https://brainx.p-e.kr/mcp"
client_id = "..."
scopes = ["whoami", "notes:read", "ai:search", "notes:write"]
```

저장 금지:

- access token
- refresh token
- authorization code
- PKCE verifier

### 10.2 Credential Store

권장 라이브러리:

- Go: `github.com/zalando/go-keyring`

서비스명:

- `BrainX CLI`

계정 키 예:

- `brainx:https://brainx.p-e.kr:access_token`
- `brainx:https://brainx.p-e.kr:refresh_token`

## 11. Security Requirements

- CLI는 사용자의 BrainX 비밀번호를 직접 받지 않는다.
- OAuth는 PKCE S256만 사용한다.
- redirect URI는 loopback 주소만 사용한다.
- state 파라미터를 생성하고 callback에서 검증한다.
- token, authorization code, API key 원문은 stdout/stderr/log에 출력하지 않는다.
- `--verbose`에서도 민감값은 마스킹한다.
- Codex config에는 bearer token이나 API key를 쓰지 않는다.
- API key fallback을 지원하더라도 `~/.codex/config.toml`의 정적 `http_headers`에 API key를 쓰는 UX는 제공하지 않는다.
- CLI가 생성한 임시 callback server는 로그인 완료 또는 timeout 후 종료한다.
- timeout 기본값은 120초로 둔다.

## 12. Error Handling

| 상황 | 사용자 메시지 |
| --- | --- |
| 브라우저 열기 실패 | authorize URL을 수동으로 열 수 있게 출력한다. |
| callback timeout | 로그인 시간이 초과되었다고 알리고 재시도 명령을 제시한다. |
| PKCE/state 불일치 | 보안 검증 실패로 중단하고 다시 로그인하게 한다. |
| token exchange 실패 | OAuth 서버 응답의 안전한 error/error_description만 표시한다. |
| credential store 실패 | OS credential store 접근 권한/상태를 확인하라고 안내한다. |
| Codex config parse 실패 | 원본 파일을 건드리지 않고 실패한다. |
| Codex config write 실패 | 권한 문제와 대상 path를 표시한다. |
| whoami 401/403 | `brainx login` 재실행을 안내한다. |

## 13. Implementation Plan

### Phase 1: CLI Skeleton

- 별도 레포 `brainx-cli` 생성.
- Go module 생성.
- Cobra command 구조 생성.
- `brainx version`, `brainx help` 동작.
- GitHub Actions에서 Windows/Linux/macOS build 확인.

### Phase 2: OAuth Login

- OAuth metadata discovery 구현.
- Dynamic Client Registration 구현.
- PKCE S256 생성/검증 구현.
- loopback callback server 구현.
- `/oauth/token` authorization code exchange 구현.
- credential store 저장 구현.
- `brainx login`, `brainx logout`, `brainx status` 완성.

### Phase 3: MCP Verification

- token refresh 구현.
- `/api/v1/mcp/whoami` client 구현.
- `brainx mcp whoami` 구현.
- `brainx doctor` 기본 진단 구현.

### Phase 4: Codex Installer

- Codex config path 탐색.
- TOML parse/write 구현.
- `[mcp_servers.brainx]` 추가/갱신.
- `--dry-run` 지원.
- 기존 config 보존 테스트 추가.

### Phase 5: Release

- `goreleaser` 또는 GitHub Actions release workflow 구성.
- Windows amd64 artifact `brainx-windows-amd64.exe` 생성.
- README에 설치/업데이트/삭제 절차 작성.
- 후속으로 winget/Scoop/Homebrew 배포 검토.

## 14. Suggested Repository Structure

```text
brainx-cli/
  cmd/brainx/
    main.go
  internal/auth/
    oauth.go
    pkce.go
    callback.go
  internal/api/
    mcp.go
    discovery.go
  internal/codex/
    config.go
    install.go
  internal/config/
    config.go
    paths.go
  internal/credentials/
    keyring.go
  internal/output/
    printer.go
  testdata/
    codex-config/
  go.mod
  README.md
  .github/workflows/ci.yml
  .github/workflows/release.yml
```

## 15. Tests

### Unit Tests

- PKCE verifier/challenge 생성.
- OAuth state 생성/검증.
- metadata parsing.
- DCR request/response parsing.
- token refresh request.
- Codex TOML config 추가/갱신.
- 기존 Codex config의 unrelated setting 보존.
- token masking.

### Integration Tests

- `httptest` OAuth server로 `brainx login` flow 검증.
- callback timeout 검증.
- credential store는 fake adapter로 테스트.
- MCP whoami 성공/401/500 처리.

### Manual Tests

Windows Terminal에서:

```powershell
brainx login
brainx status
brainx mcp install codex
codex mcp login brainx
brainx mcp whoami
brainx doctor
brainx logout
```

Codex에서:

```text
/mcp
```

BrainX MCP server가 활성 상태이고 `brainx_whoami`, 노트 검색/열람/생성 tool이 보이는지 확인한다.

## 16. Acceptance Criteria

- Windows에서 `brainx.exe` 단일 파일로 실행된다.
- `brainx login` 후 token이 평문 파일에 저장되지 않는다.
- `brainx status`가 BrainX 사용자와 scope를 보여준다.
- `brainx mcp install codex`가 기존 Codex config를 보존하면서 BrainX MCP 설정을 추가한다.
- `brainx mcp whoami`가 배포 환경에서 성공한다.
- `brainx logout` 후 `brainx status`가 disconnected를 표시한다.
- 테스트에서 token 원문이 로그에 노출되지 않는다.
- 새 BrainX 서버 endpoint 없이 동작한다.

## 17. Open Questions

- Codex OAuth credential store를 CLI가 직접 건드릴 필요가 있는가, 아니면 `codex mcp login brainx`에 맡길 것인가?
  - 1차 결정: Codex credential store는 Codex가 관리한다. BrainX CLI는 Codex config 설치까지만 담당한다.
- CLI 자체 로그인과 Codex MCP OAuth 로그인을 둘 다 해야 하는가?
  - 1차 결정: `brainx login`은 CLI 진단/운영용으로 제공하고, Codex MCP 사용 토큰은 `codex mcp login brainx`가 관리한다.
- `brainx mcp install codex` 후 자동으로 `codex mcp login brainx`를 실행할 것인가?
  - 1차 결정: 실행하지 않고 다음 명령을 안내한다. 후속에서 `--login` 옵션으로 추가 가능하다.
- API key fallback을 CLI에서 지원할 것인가?
  - 1차 결정: OAuth를 기본 경로로 한다. API key import는 후속 개발자 옵션으로만 검토한다.

## 18. Implementation Prompt For Next Chat

다른 구현 채팅에서는 아래 요청으로 시작하면 된다.

```text
BrainX CLI를 별도 레포 brainx-cli에 Go + Cobra로 구현해줘.

기준 문서:
- BrainX 본체: C:\Edu\final-project\BrainX\docs\BRAINX_CLI_PRD.md
- BrainX OpenAPI SSOT: C:\Edu\final-project\BrainX\contracts-v2\brainx-openapi.ssot.yaml

1차 범위:
- brainx login
- brainx logout
- brainx status
- brainx mcp install codex
- brainx mcp whoami
- brainx doctor

서버에 새 endpoint는 만들지 말고, 기존 OAuth/MCP endpoint를 사용해.
토큰은 OS credential store에 저장하고, Codex config에는 token/API key를 절대 쓰지 마.
Windows 단일 실행 파일 배포를 우선으로 해.
```

## 19. References

- BrainX SSOT: `contracts-v2/brainx-openapi.ssot.yaml`
- BrainX AsyncAPI: `contracts-v2/brainx-asyncapi.ssot.yaml`
- BrainX README: `README.md`
- Codex manual 확인 결과: Codex는 MCP 설정을 `~/.codex/config.toml`에 저장하고, Streamable HTTP MCP server와 OAuth login을 지원한다. OAuth callback port/url override와 server-advertised scopes 우선 사용도 지원한다.
