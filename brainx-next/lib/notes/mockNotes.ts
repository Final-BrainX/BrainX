import { MockFolder, MockNote } from "./noteTypes";

/* ── 타임스탬프 헬퍼 (daysAgo 기준) ─────────────────── */
const D = (daysAgo: number): number => 1750000000000 - daysAgo * 86_400_000;

/* ── 폴더 구조 ─────────────────────────────────────── */
/* color/favorite는 일부 폴더에만 데모용으로 미리 지정 — 나머지는 기본(노랑) */
export const MOCK_FOLDERS: MockFolder[] = [
  { id: "f-root",               name: "BrainX",      parentFolderId: null },
  { id: "f-plan",               name: "기획",         parentFolderId: "f-root" },
  { id: "f-plan-spec",          name: "기능명세",      parentFolderId: "f-plan" },
  { id: "f-plan-spec-note",     name: "노트기능",      parentFolderId: "f-plan-spec" },
  { id: "f-plan-spec-page",     name: "작성페이지",    parentFolderId: "f-plan-spec" },
  { id: "f-dev",                name: "개발",          parentFolderId: "f-root", color: "#3b82f6", favorite: true },
  { id: "f-dev-fe",             name: "Frontend",     parentFolderId: "f-dev" },
  { id: "f-dev-fe-tiptap",      name: "TipTap",       parentFolderId: "f-dev-fe", color: "#f97316" },
  { id: "f-dev-fe-split",       name: "Split View",   parentFolderId: "f-dev-fe" },
  { id: "f-dev-be",             name: "Backend",      parentFolderId: "f-dev" },
  { id: "f-dev-be-msa",         name: "MSA",          parentFolderId: "f-dev-be" },
  { id: "f-dev-be-api",         name: "API Contract", parentFolderId: "f-dev-be" },
  { id: "f-ai",                 name: "AI",           parentFolderId: "f-root", color: "#8b5cf6", favorite: true },
  { id: "f-arch",               name: "아키텍처",      parentFolderId: "f-root" },
  { id: "f-db",                 name: "데이터베이스",  parentFolderId: "f-root" },
  { id: "f-devops",             name: "DevOps",       parentFolderId: "f-root" },
  { id: "f-study",              name: "학습",          parentFolderId: "f-root", color: "#22c55e" },
  { id: "f-study-spring",       name: "Spring",       parentFolderId: "f-study" },
  { id: "f-study-spring-sec",   name: "Security",     parentFolderId: "f-study-spring" },
  { id: "f-study-spring-sec-jwt", name: "JWT",        parentFolderId: "f-study-spring-sec" },
];

/* ── 노트 데이터 ─────────────────────────────────────── */
export const MOCK_NOTES: MockNote[] = [
  {
    id: "spring",
    title: "Spring 정리",
    category: "backend",
    folderId: "f-study-spring",
    tags: ["backend", "java"],
    createdAt: D(60),
    updatedAt: D(0),
    content: `# Spring Framework

Spring은 Java 기반의 오픈소스 애플리케이션 프레임워크입니다.
엔터프라이즈급 애플리케이션 개발을 단순화하는 것이 핵심 목표입니다.

## 핵심 개념

### IoC (Inversion of Control)
제어의 역전: 객체 생성과 의존성 주입을 프레임워크가 담당합니다.
개발자는 비즈니스 로직에 집중할 수 있습니다.

### DI (Dependency Injection)
- Constructor Injection (권장)
- Setter Injection
- Field Injection (@Autowired)

### AOP (Aspect Oriented Programming)
횡단 관심사를 분리합니다.
로깅, 트랜잭션, 보안 처리에 활용됩니다.

## Spring Boot
- 자동 설정 (Auto Configuration)
- 내장 서버 (Tomcat, Jetty, Undertow)
- Starter 의존성으로 간편한 설정
- Actuator로 모니터링 지원`,
  },
  {
    id: "jwt",
    title: "JWT 정리",
    category: "backend",
    folderId: "f-study-spring-sec-jwt",
    tags: ["security", "auth"],
    createdAt: D(55),
    updatedAt: D(2),
    content: `# JWT (JSON Web Token)

JWT는 JSON 기반의 토큰 인증 방식입니다.
RFC 7519 표준으로 정의되어 있습니다.

## 구조

Header.Payload.Signature

### Header
{
  "alg": "HS256",
  "typ": "JWT"
}

### Payload (Claims)
{
  "sub": "user123",
  "iat": 1234567890,
  "exp": 1234654290,
  "roles": ["USER"]
}

### Signature
HMACSHA256(base64(header) + "." + base64(payload), secret)

## 장단점

### 장점
- Stateless: 서버 세션 불필요
- 수평 확장에 유리
- 다양한 클라이언트 지원 (웹, 모바일)

### 단점
- 토큰 크기가 세션 ID보다 큼
- 서버에서 토큰 즉시 무효화 어려움
- payload는 암호화 아닌 인코딩(base64)만`,
  },
  {
    id: "oauth",
    title: "OAuth 2.0 정리",
    category: "backend",
    folderId: "f-dev-be",
    tags: ["security", "auth"],
    createdAt: D(60),
    updatedAt: D(3),
    content: `# OAuth 2.0

위임 권한 부여 프레임워크입니다.
RFC 6749 표준. "로그인 with Google"의 기반 기술.

## 주요 역할
- Resource Owner: 사용자 (데이터 주인)
- Client: 우리 애플리케이션
- Authorization Server: 인증 서버 (Google, Kakao 등)
- Resource Server: 보호된 API 서버

## Authorization Code Flow
1. 사용자 → 인증 서버 리다이렉트
   /authorize?client_id=...&scope=...&state=...
2. 로그인 및 동의 → Authorization Code 발급
3. Code로 Token 교환 (서버-서버, 안전)
4. Access Token으로 API 호출

## PKCE (for SPA/Mobile)
Code Verifier (랜덤 문자열)
Code Challenge = SHA256(Code Verifier)
인가 코드 탈취 공격 방어

## OpenID Connect (OIDC)
OAuth 2.0 위에 인증 레이어 추가
ID Token (JWT) 발급
사용자 정보 표준화 (sub, email, name, picture)
/.well-known/openid-configuration 디스커버리

## Token 종류
Access Token: API 호출용, 단명 (1시간)
Refresh Token: Access Token 갱신용, 장명 (30일)
ID Token: 사용자 정보 포함 JWT (OIDC)`,
  },
  {
    id: "redis",
    title: "Redis 정리",
    category: "backend",
    folderId: "f-dev-be",
    tags: ["cache", "database"],
    createdAt: D(50),
    updatedAt: D(1),
    content: `# Redis

인메모리 데이터 구조 저장소입니다.
"REmote DIctionary Server"의 약자입니다.

## 특징
- Key-Value 저장소 (최상위 개념)
- 메모리 기반으로 초고속 읽기/쓰기 (< 1ms)
- 다양한 자료구조 지원
- 싱글 스레드 기반 (원자성 보장)
- 클러스터 모드 지원

## 자료구조
- String: 기본 문자열, 카운터
- List: 연결 리스트, 메시지 큐
- Hash: 해시맵, 객체 저장
- Set: 중복 없는 집합, 태그 시스템
- Sorted Set: 점수 기반 정렬, 랭킹
- Bitmap, HyperLogLog, Stream

## 주요 사용 사례
1. 세션 관리
2. 캐시 (Cache-Aside, Write-Through)
3. 실시간 랭킹 (Sorted Set)
4. Pub/Sub 메시징
5. 분산 락 (Redlock 알고리즘)
6. Rate Limiting

## 영속성
- RDB: 주기적 스냅샷 (성능 우선)
- AOF: 모든 명령어 로그 (데이터 안전)`,
  },
  {
    id: "rabbitmq",
    title: "RabbitMQ 정리",
    category: "backend",
    folderId: "f-dev-be",
    tags: ["messaging", "queue"],
    createdAt: D(70),
    updatedAt: D(7),
    content: `# RabbitMQ

AMQP 프로토콜 기반의 메시지 브로커입니다.
Erlang으로 구현되어 높은 안정성을 자랑합니다.

## 구성 요소
- Producer: 메시지 발행자
- Exchange: 메시지 라우팅 규칙 적용
- Queue: 메시지 저장소 (버퍼)
- Consumer: 메시지 소비자
- Binding: Exchange와 Queue를 연결

## Exchange 타입

### Direct Exchange
Routing Key가 정확히 일치하는 Queue로 전달
예) error -> error_queue

### Topic Exchange
패턴 매칭으로 라우팅
* = 단어 하나, # = 0개 이상의 단어
예) *.error.* -> 다양한 큐에 분기

### Fanout Exchange
바인딩된 모든 Queue에 브로드캐스트
예) 이벤트 알림 시스템

### Headers Exchange
헤더 속성 기반 라우팅

## Dead Letter Exchange (DLX)
처리 실패한 메시지를 별도 큐로 라우팅
재처리 및 모니터링에 활용`,
  },
  {
    id: "kafka",
    title: "Kafka 정리",
    category: "backend",
    folderId: "f-dev-be",
    tags: ["messaging", "streaming"],
    createdAt: D(85),
    updatedAt: D(9),
    content: `# Apache Kafka

분산 스트리밍 플랫폼입니다.
LinkedIn이 개발, 현재 Apache 재단이 관리합니다.

## 핵심 개념
- Topic: 메시지 분류 단위 (채널)
- Partition: 토픽의 병렬 처리 단위
- Offset: 파티션 내 메시지 위치 (단조 증가)
- Consumer Group: 협력 소비자 그룹
- Broker: Kafka 서버 노드
- ZooKeeper/KRaft: 클러스터 메타데이터 관리

## 특징
- Pull 방식: Consumer가 직접 가져감 (배압 제어 용이)
- 높은 처리량: 초당 수백만 메시지
- 메시지 영속성: 디스크 저장 (기본 7일 보관)
- 재처리 가능: Offset 조절로 과거 메시지 재소비
- 분산 저장: Partition 복제로 내결함성

## RabbitMQ vs Kafka
항목: RabbitMQ / Kafka
방식: Push / Pull
처리량: 중간 / 매우 높음
메시지 보관: 소비 후 삭제 / 기간 보관
주 용도: 태스크 큐, RPC / 이벤트 스트리밍, 로그
순서 보장: 큐 단위 / 파티션 단위

## 이벤트 소싱 + Kafka
도메인 이벤트를 Kafka에 발행
Consumer가 이벤트를 소비해 읽기 모델 생성
CQRS 패턴과 잘 어울림`,
  },
  {
    id: "react",
    title: "React 정리",
    category: "frontend",
    folderId: "f-dev-fe",
    tags: ["frontend", "library"],
    createdAt: D(45),
    updatedAt: D(0),
    content: `# React

UI 구축을 위한 JavaScript 라이브러리입니다.
Meta(Facebook)가 개발, 선언적 UI가 핵심입니다.

## 핵심 Hooks

### useState / useReducer
const [count, setCount] = useState(0);
const [state, dispatch] = useReducer(reducer, init);

### useEffect
useEffect(() => {
  const sub = subscribe(id);
  return () => sub.unsubscribe();  // cleanup
}, [id]);  // 의존성 배열

### useCallback / useMemo
const handler = useCallback(() => doWork(id), [id]);
const result = useMemo(() => expensive(data), [data]);

### useRef
const inputRef = useRef<HTMLInputElement>(null);
// DOM 접근 또는 렌더링 무관한 값 저장

### useContext
const theme = useContext(ThemeContext);

## React 19 새 기능
- use() hook: Promise / Context를 동기처럼 소비
- Server Actions: 클라이언트에서 서버 함수 직접 호출
- ref as prop: forwardRef 불필요

## 성능 최적화
- React.memo: 컴포넌트 불필요한 리렌더링 방지
- key prop: 리스트 항목 안정적 식별
- lazy + Suspense: 코드 스플리팅`,
  },
  {
    id: "typescript",
    title: "TypeScript 정리",
    category: "frontend",
    folderId: "f-dev-fe",
    tags: ["language", "frontend"],
    createdAt: D(40),
    updatedAt: D(1),
    content: `# TypeScript

JavaScript의 정적 타입 슈퍼셋입니다.
Microsoft가 개발, 오픈소스로 관리됩니다.

## 기본 타입
let name: string = "BrainX";
let count: number = 42;
let active: boolean = true;
let ids: number[] = [1, 2, 3];
let tuple: [string, number] = ["age", 30];

## 인터페이스 vs 타입
interface Note {
  id: string;
  title: string;
  content?: string;  // optional
}

type Status = "draft" | "published" | "archived";  // 유니온

## 제네릭
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

## 유틸리티 타입
Partial<Note>   // 모든 속성 optional
Required<Note>  // 모든 속성 required
Pick<Note, "id" | "title">  // 특정 속성만
Omit<Note, "content">       // 특정 속성 제외
Record<string, Note>        // 키-값 맵

## 타입 가드
function isNote(x: unknown): x is Note {
  return typeof x === "object" && x !== null && "id" in x;
}

## as const (리터럴 타입 추론)
const DIRECTIONS = ["left", "right", "up", "down"] as const;
type Direction = typeof DIRECTIONS[number];`,
  },
  {
    id: "nextjs",
    title: "Next.js 정리",
    category: "frontend",
    folderId: "f-dev-fe",
    tags: ["frontend", "framework"],
    createdAt: D(42),
    updatedAt: D(2),
    content: `# Next.js

React 기반의 풀스택 웹 프레임워크입니다.
Vercel이 개발하고 관리합니다.

## App Router (Next.js 13+)
app/
  layout.tsx     # 공통 레이아웃 (중첩 가능)
  page.tsx       # 루트 페이지
  loading.tsx    # 로딩 UI (Suspense)
  error.tsx      # 에러 UI (ErrorBoundary)
  not-found.tsx  # 404 페이지
  (group)/       # 라우트 그룹 (URL에 미포함)
  [id]/          # 동적 세그먼트
  [...slug]/     # 캐치올 세그먼트

## 렌더링 방식
- SSG: 빌드 시 HTML 생성 (블로그, 문서)
- SSR: 요청 시 HTML 생성 (동적 데이터)
- ISR: 주기적 재생성 (뉴스, 커머스)
- CSR: 클라이언트 렌더링 (대시보드)
- PPR: Partial Pre-rendering (Next.js 14+)

## Server vs Client Component
// Server Component (기본)
async function Notes() {
  const notes = await db.getNotes(); // 직접 DB 접근
  return <NoteList notes={notes} />;
}

// Client Component
"use client"
function SearchBar() {
  const [q, setQ] = useState("");
  return <input onChange={e => setQ(e.target.value)} />;
}

## BrainX에서 활용
- App Router로 노트, 그래프, 채팅 페이지 구성
- Server Actions로 API 레이어 간소화
- editor-lab: 에디터 실험 전용 공간`,
  },
  {
    id: "graphql",
    title: "GraphQL 정리",
    category: "frontend",
    folderId: "f-dev-fe",
    tags: ["api", "query"],
    createdAt: D(55),
    updatedAt: D(6),
    content: `# GraphQL

Facebook이 개발한 API 쿼리 언어 + 런타임입니다.
REST의 단점을 보완하기 위해 2015년에 공개되었습니다.

## REST vs GraphQL
항목 / REST / GraphQL
Over-fetching: 발생 / 없음 (필요한 필드만)
Under-fetching: N+1 문제 / 단일 요청으로 해결
엔드포인트: 여러 개 / 단일 (/graphql)
타입시스템: 없음 / 강타입 (Schema)
버전관리: /v1, /v2 / Schema evolution

## Schema 정의
type Note {
  id: ID!
  title: String!
  content: String
  tags: [String!]!
  links: [Note!]!
  author: User!
}

type Query {
  note(id: ID!): Note
  notes(filter: NoteFilter): [Note!]!
}

type Mutation {
  createNote(input: CreateNoteInput!): Note!
  updateNote(id: ID!, input: UpdateNoteInput!): Note!
}

type Subscription {
  noteUpdated(id: ID!): Note!
}

## DataLoader
N+1 문제 해결을 위한 배치 로딩 라이브러리
관계형 데이터 조회 시 쿼리 수를 최소화`,
  },
  {
    id: "tiptap-test",
    title: "TipTap 에디터 테스트",
    category: "frontend",
    folderId: "f-dev-fe-tiptap",
    tags: ["editor", "frontend"],
    createdAt: D(20),
    updatedAt: D(0),
    content: `# TipTap 에디터

ProseMirror 기반의 헤드리스 에디터 프레임워크입니다.
BrainX의 1순위 에디터 후보입니다.

## 핵심 특징
- Headless: UI 없이 로직만 제공, 완전한 커스터마이징 가능
- 확장 기반 아키텍처: 필요한 기능만 확장으로 추가
- React 19 호환
- TypeScript 완벽 지원

## 주요 확장
- StarterKit: Bold, Italic, Heading, List, CodeBlock 등 기본 제공
- Placeholder: 빈 에디터 안내 텍스트
- CodeBlockLowlight: 40+ 언어 코드 하이라이팅
- DragHandle: 블록 드래그 (유료 Pro 플랜)
- Collaboration: Y.js 기반 실시간 협업

## BrainX 검토 결과
장점: 커스터마이징 자유도 최고, 마크다운 단축키 내장
단점: 드래그앤드롭은 Pro 확장 필요, 초기 설정 복잡

## 실험 결과 (editor-lab)
- StarterKit: 정상 동작
- CodeBlockLowlight: \`\`\` 단축키로 코드블록 생성 가능
- 글씨 크기 변경: em 단위 비례 스케일 적용
- Light Mode: CSS 변수 오버라이드로 즉시 반영`,
  },
  {
    id: "rag-flow",
    title: "RAG 검색 흐름",
    category: "ai",
    folderId: "f-ai",
    tags: ["ai", "search"],
    createdAt: D(30),
    updatedAt: D(1),
    content: `# RAG (Retrieval-Augmented Generation)

외부 지식 베이스를 활용해 LLM의 답변 품질을 높이는 기법입니다.
BrainX AI 채팅의 핵심 아키텍처입니다.

## 흐름 요약
1. 사용자 질문 입력
2. 질문을 임베딩 벡터로 변환
3. 벡터 DB에서 유사 문서 검색 (Top-K)
4. 검색된 문서를 컨텍스트로 LLM에 전달
5. LLM이 컨텍스트 기반으로 답변 생성

## 구성 요소

### Embedding Model
- text-embedding-3-small (OpenAI)
- 또는 한국어 특화 모델
- 문서를 고차원 벡터로 변환

### Vector Database
- Qdrant: 고성능 벡터 검색
- pgvector: PostgreSQL 확장
- Pinecone: 관리형 서비스

### LLM
- Claude 3.5 Sonnet (Anthropic)
- GPT-4o (OpenAI)
- 컨텍스트 윈도우 내 문서 활용

## BrainX에서의 RAG
사용자 노트 → 임베딩 → Qdrant 저장
채팅 질문 → 관련 노트 검색 → 개인화 답변 생성`,
  },
  {
    id: "qdrant",
    title: "Qdrant 벡터 검색",
    category: "ai",
    folderId: "f-ai",
    tags: ["database", "ai"],
    createdAt: D(35),
    updatedAt: D(4),
    content: `# Qdrant

고성능 벡터 유사도 검색 엔진입니다.
Rust로 구현되어 뛰어난 성능을 자랑합니다.

## 특징
- HNSW 인덱스: 빠른 근사 최근접 이웃 검색
- 페이로드 필터링: 벡터 검색 + 메타데이터 필터 동시 적용
- 스칼라/바이너리 양자화로 메모리 절약
- REST API + gRPC 지원
- Docker로 간편 배포

## 핵심 개념
- Collection: 벡터의 논리적 그룹 (테이블 개념)
- Point: 벡터 + 페이로드 + ID
- Vector: 고차원 부동소수점 배열
- Payload: 메타데이터 (JSON)

## BrainX 활용
Collection: brainx_notes
Point 구조:
{
  id: note_uuid,
  vector: float[1536],    // text-embedding-3-small
  payload: {
    noteId: string,
    userId: string,
    title: string,
    tags: string[],
    createdAt: timestamp
  }
}

## 검색 예시
POST /collections/brainx_notes/points/search
{
  "vector": [0.1, 0.2, ...],
  "filter": { "must": [{ "key": "userId", "match": { "value": "user123" } }] },
  "limit": 5
}`,
  },
  {
    id: "embedding",
    title: "임베딩 생성 과정",
    category: "ai",
    folderId: "f-ai",
    tags: ["ai", "nlp"],
    createdAt: D(25),
    updatedAt: D(2),
    content: `# 임베딩 생성 과정

텍스트를 고차원 벡터 공간으로 변환하는 과정입니다.
BrainX RAG 파이프라인의 핵심 전처리 단계입니다.

## 전체 흐름

1. 원본 텍스트 (노트 콘텐츠)
2. 청킹 (Chunking): 적절한 크기로 분할
3. 임베딩 모델 추론
4. 벡터 생성 (1536차원)
5. 벡터 DB에 저장 (Qdrant)

## 청킹 전략

### 고정 크기 청킹
- 글자 수 또는 토큰 수로 분할
- 오버랩 설정으로 문맥 유지
- 구현 간단, 의미 단위 분리 위험

### 재귀적 청킹
- 문단 → 문장 → 단어 순으로 분할
- LangChain RecursiveCharacterTextSplitter

### 시맨틱 청킹
- 의미 유사도 기반 분할
- 가장 정확하나 계산 비용 높음

## OpenAI 임베딩 모델

text-embedding-3-small
- 차원: 1536
- 비용: $0.02 / 1M tokens
- 한국어 품질: 양호

text-embedding-3-large
- 차원: 3072
- 비용: $0.13 / 1M tokens
- 정확도 더 높음

## BrainX 구현

노트 저장 시 자동으로 임베딩 생성
백그라운드 Job으로 처리 (RabbitMQ)
Qdrant에 저장 후 RAG 검색에 활용`,
  },
  {
    id: "msa",
    title: "MSA 정리",
    category: "architecture",
    folderId: "f-dev-be-msa",
    tags: ["architecture"],
    createdAt: D(90),
    updatedAt: D(5),
    content: `# MSA (Microservices Architecture)

마이크로서비스 아키텍처는 애플리케이션을 작은 독립 서비스로 분리합니다.

## 핵심 원칙
- 단일 책임 원칙 (Single Responsibility)
- 독립 배포 가능 (Independently Deployable)
- 서비스 간 느슨한 결합 (Loose Coupling)
- 높은 응집도 (High Cohesion)

## 주요 패턴

### API Gateway
- 단일 진입점 역할
- 라우팅, 인증, 로드밸런싱 처리
- Spring Cloud Gateway, Kong, Nginx

### Service Discovery
- Eureka (Netflix OSS)
- Consul (HashiCorp)
- 동적 서비스 등록 및 조회

### Circuit Breaker
- Hystrix (deprecated), Resilience4j
- 장애 격리 및 빠른 실패 (Fail Fast)
- Fallback 전략으로 안정성 유지

## 모놀리식 vs MSA
모놀리식: 단순, 낮은 지연, 단일 배포
MSA: 복잡, 높은 확장성, 독립 배포`,
  },
  {
    id: "brainx-arch",
    title: "BrainX 아키텍처",
    category: "architecture",
    folderId: "f-arch",
    tags: ["architecture", "brainx"],
    createdAt: D(100),
    updatedAt: D(6),
    content: `# BrainX 시스템 아키텍처

AI 기반 개인 지식 관리 플랫폼입니다.

## 프론트엔드
- Next.js 16 (App Router)
- React 19
- TypeScript
- TailwindCSS
- TipTap 에디터

## 백엔드
- Spring Boot 3.x (Java 21)
- Spring Security + JWT
- JPA + QueryDSL

## 데이터베이스
- PostgreSQL: 사용자, 노트, 구독 데이터
- Neo4j: 노트 간 링크 그래프
- Qdrant: 노트 임베딩 (벡터 검색)
- Redis: 세션, 캐시

## AI 파이프라인
- Embedding: OpenAI text-embedding-3-small
- LLM: Claude 3.5 Sonnet
- RAG: Qdrant 기반 노트 검색 후 생성

## 핵심 기능
1. 노트 작성 (TipTap 에디터)
2. 링크 기반 지식 그래프 (Neo4j + 시각화)
3. AI 채팅 (RAG 기반 개인화)
4. Split Pane 멀티 노트 뷰 (현재 PoC 중)
5. 임포트 (마크다운, Obsidian Vault)

## Split Demo 위치
editor-lab/split-demo
→ BrainX Split Pane 기능의 기술 검증 페이지`,
  },
  {
    id: "knowledge-link",
    title: "Obsidian 링크 구조",
    category: "architecture",
    folderId: "f-arch",
    tags: ["knowledge", "graph"],
    createdAt: D(95),
    updatedAt: D(12),
    content: `# Obsidian 링크 구조

Obsidian의 핵심 가치는 노트 간 양방향 링크(Backlink)입니다.

## [[이중 대괄호 링크]]
- [[노트 제목]]으로 다른 노트 참조
- 존재하지 않는 노트도 미리 참조 가능 (생성 예고)
- 자동으로 역방향 링크(Backlink) 생성

## 링크 종류
- [[노트]] — 기본 링크
- [[노트|표시 텍스트]] — 앨리어스 링크
- [[노트#제목]] — 특정 섹션으로 링크
- [[노트^블록ID]] — 특정 블록으로 링크

## Graph View
- 노트 간 연결을 시각화
- 클러스터로 지식 영역 파악
- 고립 노트 발견 가능

## BrainX와의 연관
BrainX는 Neo4j를 백엔드로 사용해
Obsidian의 [[링크 구조]]를 웹에서 구현합니다.
노트 간 관계: (Note)-[:LINKS_TO]->(Note)

## Pane 분할과의 시너지
Split Pane에서 링크 클릭 시
새 패널에서 참조 노트를 열 수 있습니다.
이것이 BrainX Split Demo의 최종 목표입니다.`,
  },
  {
    id: "neo4j",
    title: "Neo4j 그래프 설계",
    category: "architecture",
    folderId: "f-arch",
    tags: ["database", "graph"],
    createdAt: D(80),
    updatedAt: D(10),
    content: `# Neo4j 그래프 설계

그래프 데이터베이스입니다.
BrainX의 지식 그래프 저장소로 핵심 역할!

## 핵심 개념
- Node: 데이터 엔티티 (관계형 DB의 Row)
- Relationship: 노드 간 연결 (항상 방향성)
- Property: 노드/관계의 속성 (Key-Value)
- Label: 노드 분류 (관계형 DB의 Table)

## Cypher 쿼리 언어

### 노드 생성
CREATE (u:User {name: "Alice", age: 30})

### 관계 생성
MATCH (a:User {name: "Alice"}), (b:User {name: "Bob"})
CREATE (a)-[:FOLLOWS]->(b)

### 최단 경로 탐색
MATCH path = shortestPath(
  (a:User {name:"Alice"})-[*]-(b:User {name:"Charlie"})
)
RETURN path

### 지식 그래프 쿼리
MATCH (n:Note)-[:LINKS_TO]->(m:Note)
WHERE n.id = $noteId
RETURN m.title, m.id

## 관계형 DB vs 그래프 DB
관계형: JOIN 필요, 깊은 관계 쿼리 느림
그래프: 관계 탐색이 O(1), 깊이 무관하게 빠름

## BrainX 적용
노트 간 링크 관계, 태그 네트워크,
추천 시스템 등에 최적화`,
  },
  {
    id: "postgresql",
    title: "PostgreSQL 정리",
    category: "database",
    folderId: "f-db",
    tags: ["database", "sql"],
    createdAt: D(75),
    updatedAt: D(8),
    content: `# PostgreSQL

오픈소스 관계형 데이터베이스입니다.
"세계에서 가장 발전된 오픈소스 RDB"를 표방합니다.

## 특징
- ACID 완전 지원 (Atomicity, Consistency, Isolation, Durability)
- MVCC 기반 동시성 제어 (잠금 최소화)
- JSON/JSONB 지원 (NoSQL처럼 활용)
- 풀텍스트 검색 내장
- 확장 시스템 (pgvector, PostGIS, TimescaleDB 등)

## 인덱스 종류
-- B-Tree (기본, 범위 쿼리)
CREATE INDEX idx_title ON notes(title);

-- GIN (배열, JSONB, 전문검색)
CREATE INDEX idx_tags ON notes USING GIN(tags);

-- BRIN (시계열, 대용량)
CREATE INDEX idx_created ON events USING BRIN(created_at);

-- pgvector (벡터 유사도 검색)
CREATE INDEX idx_embedding ON notes
  USING ivfflat(embedding vector_cosine_ops)
  WITH (lists = 100);

## CTE (Common Table Expressions)
WITH recent AS (
  SELECT * FROM notes
  WHERE created_at > NOW() - INTERVAL '7 days'
),
linked AS (
  SELECT n.* FROM notes n
  JOIN note_links l ON n.id = l.target_id
  WHERE l.source_id = ANY(SELECT id FROM recent)
)
SELECT * FROM linked ORDER BY created_at DESC;`,
  },
  {
    id: "docker",
    title: "Docker 정리",
    category: "devops",
    folderId: "f-devops",
    tags: ["devops", "container"],
    createdAt: D(45),
    updatedAt: D(3),
    content: `# Docker

컨테이너 기반 가상화 플랫폼입니다.
"한 번 빌드, 어디서나 실행" (Build Once, Run Anywhere)

## 핵심 개념
- Image: 불변의 실행 환경 템플릿
- Container: 이미지의 실행 인스턴스
- Dockerfile: 이미지 빌드 명령어 파일
- Registry: 이미지 저장소 (Docker Hub, ECR)
- Volume: 컨테이너 외부 영구 저장소
- Network: 컨테이너 간 통신

## Dockerfile 예시
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
USER node
CMD ["node", "server.js"]

## 멀티 스테이지 빌드
빌드 환경과 실행 환경을 분리해
이미지 크기를 최소화합니다.

## 주요 명령어
docker build -t myapp:1.0 .
docker run -p 3000:3000 -d myapp:1.0
docker ps, docker logs, docker exec
docker-compose up -d (멀티 컨테이너)`,
  },
  {
    id: "kubernetes",
    title: "Kubernetes 정리",
    category: "devops",
    folderId: "f-devops",
    tags: ["devops", "orchestration"],
    createdAt: D(50),
    updatedAt: D(4),
    content: `# Kubernetes (K8s)

컨테이너 오케스트레이션 플랫폼입니다.
Google이 설계하고 CNCF가 관리합니다.

## Control Plane
- API Server: 모든 통신의 중앙 허브
- etcd: 클러스터 상태를 저장하는 분산 KV 스토어
- Scheduler: 어느 노드에 Pod를 배치할지 결정
- Controller Manager: 원하는 상태(Desired State) 유지

## Worker Node
- kubelet: 노드 에이전트, Pod 실행 담당
- kube-proxy: 네트워크 규칙 관리
- Container Runtime: containerd, CRI-O

## 핵심 오브젝트
- Pod: 최소 배포 단위 (1개 이상의 컨테이너)
- ReplicaSet: Pod 복제 수 유지
- Deployment: ReplicaSet 관리, 롤링 업데이트
- Service: Pod 네트워크 노출 (ClusterIP, NodePort, LoadBalancer)
- Ingress: 외부 HTTP/HTTPS 트래픽 라우팅
- ConfigMap: 환경 설정 분리
- Secret: 민감한 정보 관리
- PersistentVolume: 영구 스토리지

## 자가 치유 (Self-Healing)
Pod 장애 시 자동 재시작
노드 장애 시 다른 노드로 자동 이동`,
  },
];

export function getNoteById(id: string): MockNote | undefined {
  return MOCK_NOTES.find((n) => n.id === id);
}

export function getRandomNote(excludeId?: string): MockNote {
  const pool = excludeId ? MOCK_NOTES.filter((n) => n.id !== excludeId) : MOCK_NOTES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ── 노트별 컨텍스트 Mock 데이터 ─────────────────────────── */

export interface MockContextEntry {
  backlinks: string[];
  connections: string[];
  aiSuggestions: string[];
}

export const MOCK_CONTEXT_DATA: Record<string, MockContextEntry> = {
  spring: {
    backlinks: ["MSA 정리", "Kafka 정리"],
    connections: ["JWT 정리", "Redis 정리"],
    aiSuggestions: ["Bean Lifecycle 심화", "Transaction 관리 패턴", "Spring Security 연결"],
  },
  jwt: {
    backlinks: ["Spring 정리"],
    connections: ["OAuth 2.0 정리"],
    aiSuggestions: ["OAuth2 흐름 이해", "Access Token vs Refresh Token", "CORS 설정 정리"],
  },
  oauth: {
    backlinks: ["JWT 정리"],
    connections: ["JWT 정리"],
    aiSuggestions: ["소셜 로그인 구현", "PKCE 흐름 정리", "토큰 갱신 전략"],
  },
  redis: {
    backlinks: ["Spring 정리", "MSA 정리"],
    connections: ["MSA 정리"],
    aiSuggestions: ["Redis Cluster 운영", "캐시 무효화 전략", "분산 락 구현"],
  },
  rabbitmq: {
    backlinks: ["MSA 정리"],
    connections: ["MSA 정리", "Kafka 정리"],
    aiSuggestions: ["Kafka vs RabbitMQ 비교", "Dead Letter Queue 설계", "메시지 재처리 전략"],
  },
  kafka: {
    backlinks: ["MSA 정리", "RabbitMQ 정리"],
    connections: ["MSA 정리", "Redis 정리"],
    aiSuggestions: ["Consumer Group 설계", "파티션 전략", "Kafka Streams 활용"],
  },
  react: {
    backlinks: ["TypeScript 정리", "Next.js 정리"],
    connections: ["TypeScript 정리", "Next.js 정리"],
    aiSuggestions: ["Server Components 이해", "React Query 연동", "Zustand 상태관리"],
  },
  typescript: {
    backlinks: ["React 정리", "TipTap 에디터 테스트"],
    connections: ["React 정리", "Next.js 정리"],
    aiSuggestions: ["제네릭 타입 패턴", "타입 체조 실전", "Zod 스키마 연계"],
  },
  nextjs: {
    backlinks: ["React 정리"],
    connections: ["React 정리", "TypeScript 정리"],
    aiSuggestions: ["App Router 마이그레이션", "ISR vs SSG", "Edge Runtime 활용"],
  },
  graphql: {
    backlinks: ["Next.js 정리"],
    connections: ["PostgreSQL 정리"],
    aiSuggestions: ["DataLoader 패턴", "Federation 설계", "REST vs GraphQL 비교"],
  },
  "tiptap-test": {
    backlinks: ["BrainX 아키텍처"],
    connections: ["TypeScript 정리", "React 정리"],
    aiSuggestions: ["ProseMirror 스키마 이해", "Y.js 협업 연동", "에디터 확장 개발"],
  },
  "rag-flow": {
    backlinks: ["BrainX 아키텍처", "Qdrant 벡터 검색"],
    connections: ["Qdrant 벡터 검색", "Neo4j 그래프 설계"],
    aiSuggestions: ["청킹 전략 비교", "재순위화(Rerank) 기법", "하이브리드 검색 구성"],
  },
  qdrant: {
    backlinks: ["RAG 검색 흐름"],
    connections: ["RAG 검색 흐름", "임베딩 생성 과정"],
    aiSuggestions: ["벡터 인덱스 종류", "페이로드 필터링", "Qdrant vs Pinecone 비교"],
  },
  embedding: {
    backlinks: ["RAG 검색 흐름"],
    connections: ["Qdrant 벡터 검색", "RabbitMQ 정리"],
    aiSuggestions: ["한국어 임베딩 모델 비교", "청킹 최적화", "파인튜닝 vs RAG"],
  },
  msa: {
    backlinks: ["Kafka 정리", "Docker 정리"],
    connections: ["Spring 정리", "Redis 정리", "RabbitMQ 정리"],
    aiSuggestions: ["CQRS 패턴", "Saga 패턴", "Event Sourcing"],
  },
  "brainx-arch": {
    backlinks: [],
    connections: ["Neo4j 그래프 설계", "RAG 검색 흐름", "TipTap 에디터 테스트"],
    aiSuggestions: ["멀티테넌시 설계", "검색 인프라 확장", "AI 파이프라인 고도화"],
  },
  "knowledge-link": {
    backlinks: ["BrainX 아키텍처"],
    connections: ["BrainX 아키텍처", "RAG 검색 흐름"],
    aiSuggestions: ["Obsidian Graph 분석", "양방향 링크 구현", "Vault 마이그레이션"],
  },
  neo4j: {
    backlinks: ["BrainX 아키텍처"],
    connections: ["RAG 검색 흐름", "BrainX 아키텍처"],
    aiSuggestions: ["지식 그래프 설계", "Cypher 쿼리 최적화", "그래프 임베딩"],
  },
  postgresql: {
    backlinks: ["GraphQL 정리"],
    connections: ["Redis 정리"],
    aiSuggestions: ["인덱스 설계 전략", "EXPLAIN 분석법", "파티셔닝 기법"],
  },
  docker: {
    backlinks: ["Kubernetes 정리", "MSA 정리"],
    connections: ["Kubernetes 정리"],
    aiSuggestions: ["Multi-stage 빌드 최적화", "Docker Compose 패턴", "컨테이너 보안"],
  },
  kubernetes: {
    backlinks: ["Docker 정리"],
    connections: ["Docker 정리", "MSA 정리"],
    aiSuggestions: ["Helm Chart 작성법", "HPA 설정", "서비스 메시(Istio)"],
  },
};
