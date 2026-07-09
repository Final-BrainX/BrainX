export type Screen = "dashboard" | "users" | "support" | "billing";
export type AdminRole = "owner" | "admin" | "support" | "billing";
export type UserStatus = "active" | "suspended" | "withdrawn";
export type Plan = "free" | "pro" | "max";
export type InquiryStatus = "pending" | "progress" | "done";
export type PaymentStatus = "success" | "failed" | "refunded" | "canceled";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  status: UserStatus;
  joined: string;
  notes: number;
  storage: string;
  lastActive: string;
  lastActiveAt: string | null;
  location: string;
  device: string;
  activities: Array<{ text: string; time: string }>;
};

export type AdminInquiry = {
  id: string;
  user: string;
  email: string;
  status: InquiryStatus;
  category: string;
  subject: string;
  created: string;
  agent: string;
  urgent: boolean;
  body: string;
  replyContent?: string | null;
  repliedAt?: string | null;
};

export type BillingTransaction = {
  id: string;
  user: string;
  plan: Plan;
  amount: number;
  method: string;
  status: PaymentStatus;
  date: string;
};

export type BillingSubscription = {
  subscriptionId: string;
  user: string;
  initial: string;
  plan: Plan;
  started: string;
  next: string;
  billingCycle?: "monthly" | "yearly";
  amount: number;
};

export type FailedBilling = {
  paymentId: string;
  user: string;
  initial: string;
  plan: string;
  amount: string;
  reason: string;
  date: string;
};

export type PlanCard = {
  key: Plan;
  name: string;
  label: string;
  price: number;
  desc: string;
};

export type AdminProfile = {
  adminUserId: string;
  name: string;
  email: string | null;
  role: AdminRole;
  permissions: string[];
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export const services = [
  { name: "User-Service", latency: "42ms", uptime: "99.99%", state: "UP" },
  { name: "Workspace-Service", latency: "68ms", uptime: "99.97%", state: "UP" },
  { name: "AI-Service", latency: "1,240ms", uptime: "99.40%", state: "DEGRADED" },
  { name: "Ingestion-Service", latency: "96ms", uptime: "99.91%", state: "UP" },
  { name: "Commerce-Service", latency: "73ms", uptime: "99.95%", state: "UP" }
] as const;

export const kpis = [
  { label: "실시간 접속", value: "1,284", delta: "+8.2%", tone: "good", sub: "어제 대비 +97명" },
  { label: "오늘 매출", value: "₩2.82M", delta: "+12.4%", tone: "good", sub: "목표 대비 84% 달성" },
  { label: "활성 구독", value: "142", delta: "+3.1%", tone: "good", sub: "무료 118 · 유료 24" },
  { label: "AI 응답 성공률", value: "99.2%", delta: "-0.3%", tone: "bad", sub: "지연 0.8% 포함" }
] as const;

export const users = [
  {
    id: "USR-1001",
    name: "김서연",
    email: "seoyeon.kim@gmail.com",
    plan: "max",
    status: "active",
    joined: "2024-03-12",
    notes: 842,
    storage: "8.2GB",
    lastActive: "5분 전",
    lastActiveAt: "2026-06-25T09:09:00+09:00",
    location: "서울",
    device: "Chrome / macOS",
    activities: ["노트 12개 생성 · 워크스페이스 리서치", "AI 요약 실행 x3, AI 대화 x8", "새 워크스페이스 제품 기획 생성", "Max 플랜으로 업그레이드", "로그인 (서울, Chrome / macOS)"].map((text, i) => ({ text, time: ["5분 전", "1시간 전", "어제", "3일 전", "2주 전"][i] }))
  },
  {
    id: "USR-1002",
    name: "이준호",
    email: "junho.lee@naver.com",
    plan: "pro",
    status: "active",
    joined: "2024-07-29",
    notes: 317,
    storage: "3.7GB",
    lastActive: "1시간 전",
    lastActiveAt: "2026-06-25T08:14:00+09:00",
    location: "부산",
    device: "Edge / Windows",
    activities: ["PDF 가져오기 4건", "Pro 플랜 결제 성공", "그래프 뷰 탐색", "노트 링크 8개 생성"].map((text, i) => ({ text, time: ["1시간 전", "어제", "3일 전", "1주 전"][i] }))
  },
  {
    id: "USR-1003",
    name: "박지민",
    email: "jimin.park@kakao.com",
    plan: "free",
    status: "active",
    joined: "2025-01-04",
    notes: 48,
    storage: "420MB",
    lastActive: "어제",
    lastActiveAt: "2026-06-24T14:00:00+09:00",
    location: "대전",
    device: "Safari / iOS",
    activities: ["첫 노트 작성", "온보딩 완료", "메일 인증 완료"].map((text, i) => ({ text, time: ["어제", "1주 전", "1주 전"][i] }))
  },
  {
    id: "USR-1004",
    name: "최예린",
    email: "yerin.choi@gmail.com",
    plan: "pro",
    status: "suspended",
    joined: "2023-11-20",
    notes: 521,
    storage: "5.1GB",
    lastActive: "3일 전",
    lastActiveAt: "2026-06-22T14:00:00+09:00",
    location: "인천",
    device: "Chrome / Windows",
    activities: ["결제 실패 알림 발송", "계정 정지 처리", "AI 채팅 사용량 한도 초과"].map((text, i) => ({ text, time: ["3일 전", "3일 전", "4일 전"][i] }))
  },
  {
    id: "USR-1005",
    name: "정우진",
    email: "woojin.jung@outlook.com",
    plan: "free",
    status: "active",
    joined: "2025-05-18",
    notes: 12,
    storage: "92MB",
    lastActive: "방금",
    lastActiveAt: "2026-06-25T09:14:00+09:00",
    location: "서울",
    device: "Chrome / Android",
    activities: ["모바일 로그인", "노트 2개 수정"].map((text, i) => ({ text, time: ["방금", "10분 전"][i] }))
  },
  {
    id: "USR-1006",
    name: "한소희",
    email: "sohee.han@gmail.com",
    plan: "max",
    status: "active",
    joined: "2023-06-02",
    notes: 1204,
    storage: "11.4GB",
    lastActive: "2분 전",
    lastActiveAt: "2026-06-25T09:12:00+09:00",
    location: "서울",
    device: "Chrome / macOS",
    activities: ["팀 멤버 3명 초대", "워크스페이스 권한 변경", "월간 리포트 다운로드"].map((text, i) => ({ text, time: ["2분 전", "오늘", "어제"][i] }))
  },
  {
    id: "USR-1007",
    name: "오현우",
    email: "hyunwoo.oh@naver.com",
    plan: "pro",
    status: "withdrawn",
    joined: "2024-12-11",
    notes: 0,
    storage: "0MB",
    lastActive: "탈퇴",
    lastActiveAt: null,
    location: "광주",
    device: "Firefox / Windows",
    activities: ["탈퇴 처리", "데이터 내보내기 완료"].map((text, i) => ({ text, time: ["1개월 전", "1개월 전"][i] }))
  },
  {
    id: "USR-1008",
    name: "윤채원",
    email: "chaewon.yoon@gmail.com",
    plan: "pro",
    status: "active",
    joined: "2025-02-08",
    notes: 73,
    storage: "730MB",
    lastActive: "오늘",
    lastActiveAt: "2026-06-25T07:30:00+09:00",
    location: "수원",
    device: "Chrome / Windows",
    activities: ["Obsidian 가져오기", "Pro 결제 완료", "태그 5개 생성"].map((text, i) => ({ text, time: ["오늘", "오늘", "오늘"][i] }))
  },
  {
    id: "USR-1009",
    name: "임도현",
    email: "dohyun.lim@kakao.com",
    plan: "pro",
    status: "active",
    joined: "2024-09-14",
    notes: 289,
    storage: "2.9GB",
    lastActive: "30분 전",
    lastActiveAt: "2026-06-25T08:44:00+09:00",
    location: "대구",
    device: "Whale / Windows",
    activities: ["AI 인사이트 리포트 생성", "Pro 갱신 결제"].map((text, i) => ({ text, time: ["30분 전", "2일 전"][i] }))
  },
  {
    id: "USR-1010",
    name: "신아린",
    email: "arin.shin@gmail.com",
    plan: "max",
    status: "active",
    joined: "2023-04-18",
    notes: 956,
    storage: "9.6GB",
    lastActive: "12분 전",
    lastActiveAt: "2026-06-25T09:02:00+09:00",
    location: "서울",
    device: "Safari / macOS",
    activities: ["팀 워크스페이스 백업", "공유 링크 생성"].map((text, i) => ({ text, time: ["12분 전", "어제"][i] }))
  },
  {
    id: "USR-1011",
    name: "문태오",
    email: "taeo.moon@outlook.com",
    plan: "free",
    status: "suspended",
    joined: "2025-03-01",
    notes: 34,
    storage: "380MB",
    lastActive: "4일 전",
    lastActiveAt: "2026-06-21T14:00:00+09:00",
    location: "울산",
    device: "Chrome / Windows",
    activities: ["신고 누적 검토", "계정 정지 처리"].map((text, i) => ({ text, time: ["4일 전", "4일 전"][i] }))
  },
  {
    id: "USR-1012",
    name: "서하늘",
    email: "haneul.seo@gmail.com",
    plan: "pro",
    status: "active",
    joined: "2024-01-27",
    notes: 411,
    storage: "4.4GB",
    lastActive: "오늘",
    lastActiveAt: "2026-06-25T06:30:00+09:00",
    location: "제주",
    device: "Chrome / macOS",
    activities: ["노트 버전 복구", "AI 링크 추천 수락"].map((text, i) => ({ text, time: ["오늘", "어제"][i] }))
  },
  {
    id: "USR-1013",
    name: "권라온",
    email: "raon.kwon@naver.com",
    plan: "max",
    status: "active",
    joined: "2023-09-08",
    notes: 777,
    storage: "7.8GB",
    lastActive: "어제",
    lastActiveAt: "2026-06-24T13:00:00+09:00",
    location: "성남",
    device: "Edge / Windows",
    activities: ["팀 결제 수단 변경", "폴더 권한 수정"].map((text, i) => ({ text, time: ["어제", "2일 전"][i] }))
  },
  {
    id: "USR-1014",
    name: "배유진",
    email: "yujin.bae@gmail.com",
    plan: "free",
    status: "active",
    joined: "2025-06-10",
    notes: 9,
    storage: "64MB",
    lastActive: "방금",
    lastActiveAt: "2026-06-25T09:14:00+09:00",
    location: "서울",
    device: "Chrome / Android",
    activities: ["가입 완료", "첫 워크스페이스 생성"].map((text, i) => ({ text, time: ["방금", "방금"][i] }))
  }
] satisfies AdminUser[];

export const inquiries = [
  { id: "TKT-7218", user: "김서연", email: "seoyeon.kim@gmail.com", status: "progress", category: "버그", subject: "AI 요약이 일부 노트에서 생성되지 않습니다", created: "06-25 09:14", agent: "", urgent: true, body: "Max 플랜을 사용 중인데 특정 워크스페이스의 노트에서 AI 요약 버튼을 눌러도 결과가 나오지 않습니다.\n어제 오후부터 계속 발생하고 있어요. 다른 워크스페이스는 정상입니다." },
  { id: "TKT-7217", user: "정우진", email: "woojin.jung@outlook.com", status: "pending", category: "문의", subject: "무료 플랜에서 만들 수 있는 노트 개수가 궁금합니다", created: "06-25 08:51", agent: "", urgent: false, body: "무료 플랜에서 최대 몇 개의 노트를 생성할 수 있는지 확인하고 싶습니다." },
  { id: "TKT-7216", user: "임도현", email: "dohyun.lim@kakao.com", status: "progress", category: "결제", subject: "결제는 됐는데 Pro 기능이 활성화되지 않아요", created: "06-24 17:30", agent: "김운영", urgent: true, body: "Pro 플랜 결제는 완료됐는데 계정 화면에는 무료 플랜으로 표시됩니다. 영수증은 메일로 받았습니다." },
  { id: "TKT-7215", user: "윤채원", email: "chaewon.yoon@gmail.com", status: "progress", category: "버그", subject: "다른 기기에서 노트 동기화가 느립니다", created: "06-24 14:02", agent: "정관리", urgent: false, body: "PC에서 작성한 노트가 모바일에 반영되기까지 시간이 오래 걸립니다." },
  { id: "TKT-7214", user: "한소희", email: "sohee.han@gmail.com", status: "pending", category: "문의", subject: "대량 초대 메일은 한 번에 몇 명까지 가능한가요?", created: "06-24 11:20", agent: "", urgent: false, body: "팀 워크스페이스에서 멤버를 초대할 때 한 번에 보낼 수 있는 인원 수를 알고 싶습니다." },
  { id: "TKT-7213", user: "정태양", email: "taeyang.shin@gmail.com", status: "done", category: "기능요청", subject: "AI 대화 기록도 내보내기 되면 좋겠습니다", created: "06-23 16:45", agent: "김운영", urgent: false, body: "AI 채팅 기록을 PDF나 Markdown으로 내보내는 기능이 있으면 좋겠습니다." },
  { id: "TKT-7212", user: "이지은", email: "eunji.cho@gmail.com", status: "done", category: "계정", subject: "비밀번호 재설정 링크가 만료되었습니다", created: "06-23 10:08", agent: "정관리", urgent: false, body: "비밀번호 재설정 메일은 받았지만 링크가 만료되었다는 메시지가 나옵니다." }
] satisfies AdminInquiry[];

export const billingTransactions = [
  { id: "TXN-8F2A91", user: "한소희", plan: "max", amount: 39000, method: "신한카드", status: "success", date: "06-25 08:42" },
  { id: "TXN-7B14C2", user: "이준호", plan: "pro", amount: 19000, method: "카카오페이", status: "success", date: "06-25 07:15" },
  { id: "TXN-3D90E5", user: "임도현", plan: "pro", amount: 19000, method: "국민카드", status: "failed", date: "06-25 02:30" },
  { id: "TXN-1A77F8", user: "배준영", plan: "max", amount: 39000, method: "토스페이", status: "success", date: "06-24 22:10" },
  { id: "TXN-9C03B1", user: "최예린", plan: "pro", amount: 19000, method: "현대카드", status: "canceled", date: "06-24 18:55" },
  { id: "TXN-5E62A0", user: "신태양", plan: "pro", amount: 19000, method: "네이버페이", status: "success", date: "06-24 13:40" },
  { id: "TXN-2F48D7", user: "강민서", plan: "max", amount: 39000, method: "삼성카드", status: "failed", date: "06-24 09:12" },
  { id: "TXN-6B91C4", user: "김서연", plan: "max", amount: 39000, method: "신한카드", status: "success", date: "06-23 20:05" },
  { id: "TXN-4A20E9", user: "윤채원", plan: "pro", amount: 19000, method: "카카오페이", status: "success", date: "06-23 16:30" },
  { id: "TXN-8D55F3", user: "박지민", plan: "pro", amount: 19000, method: "국민카드", status: "failed", date: "06-23 11:48" }
] satisfies BillingTransaction[];

export const billingSubscriptions = [
  { subscriptionId: "SUB-USR-1001", user: "김서연", initial: "김", plan: "max", started: "2024-03-12", next: "07-12", amount: 39000 },
  { subscriptionId: "SUB-USR-1002", user: "이준호", initial: "이", plan: "pro", started: "2024-07-29", next: "07-29", amount: 19000 },
  { subscriptionId: "SUB-USR-1006", user: "한소희", initial: "한", plan: "max", started: "2023-06-02", next: "08-02", amount: 39000 },
  { subscriptionId: "SUB-USR-1008", user: "윤채원", initial: "윤", plan: "pro", started: "2025-06-23", next: "07-23", amount: 19000 },
  { subscriptionId: "SUB-USR-1009", user: "임도현", initial: "임", plan: "pro", started: "2024-09-11", next: "07-30", amount: 19000 },
  { subscriptionId: "SUB-USR-1100", user: "신태양", initial: "신", plan: "pro", started: "2024-04-23", next: "08-11", amount: 19000 },
  { subscriptionId: "SUB-USR-1101", user: "배준영", initial: "배", plan: "max", started: "2023-10-15", next: "07-23", amount: 39000 }
] satisfies BillingSubscription[];

export const failedBilling = [
  { paymentId: "TXN-3D90E5", user: "임도현", initial: "임", plan: "Pro", amount: "₩19,000", reason: "카드 한도 초과 · 재시도 2회", date: "06-25 02:30" },
  { paymentId: "TXN-2F48D7", user: "강민서", initial: "강", plan: "Max", amount: "₩39,000", reason: "유효기간 만료 · 재시도 1회", date: "06-24 09:12" },
  { paymentId: "TXN-8D55F3", user: "박지민", initial: "박", plan: "Pro", amount: "₩19,000", reason: "PG 승인 거절 · 재시도 3회", date: "06-23 11:48" }
] satisfies FailedBilling[];

export const planCards = [
  { key: "free", name: "무료", label: "무료", price: 0, desc: "노트 100개 · 기본 AI 요약" },
  { key: "pro", name: "Pro", label: "Pro", price: 19000, desc: "무제한 노트 · 고급 AI · 대화" },
  { key: "max", name: "Max", label: "Max", price: 39000, desc: "워크스페이스 · 권한 관리 · 자동화" }
] satisfies PlanCard[];

export const payments = billingTransactions;

export const logs = [
  { level: "WARN", service: "AI-Service", message: "P95 latency exceeded threshold: 1.24s", time: "09:45:18" },
  { level: "ERROR", service: "Commerce-Service", message: "Payment confirm retry queued for PAY-8920", time: "09:43:02" },
  { level: "INFO", service: "Ingestion-Service", message: "Notion import job completed: 382 pages", time: "09:41:55" },
  { level: "WARN", service: "Gateway-Service", message: "Kafka consumer lag above 1,000 messages", time: "09:39:11" }
] as const;

export const revenueBars = [42, 48, 39, 56, 61, 58, 73, 66, 70, 78, 82, 76, 91, 98];
export const traffic = [420, 520, 490, 680, 730, 710, 920, 840, 960, 1120, 1180, 1090, 1240, 1284];

export const adminProfile = {
  adminUserId: "adm_001",
  name: "김운영",
  email: "admin@brainx.io",
  role: "owner",
  permissions: ["최고관리자", "전체 작업 권한"],
  mustChangePassword: false,
  lastLoginAt: "2026-06-25T08:31:00+09:00",
  createdAt: "2023-01-09T00:00:00+09:00"
} satisfies AdminProfile;
