/** 로컬 개발 전용 "가짜 로그인 사용자" 스위치의 단일 진실 소스.
    NEXT_PUBLIC_WORKSPACE_DEV_USER_ID 값만으로 X-User-Id 헤더를 붙이면, 로컬에서 정말로
    로그인하지 않은 게스트 상태를 테스트하려 해도(예: 게스트→로그인 claim 흐름 검증) 값이
    남아있는 것만으로 매번 dev-test-user로 취급돼버린다 — NEXT_PUBLIC_ENABLE_DEV_USER를 별도
    on/off 스위치로 두어, 값은 유지한 채 필요할 때만 켜고 끌 수 있게 한다.

    workspace-api.ts / graph-api.ts / intelligence-api.ts는 전부 이 모듈의 DEV_USER_ID를
    사용해야 한다 — 각자 process.env를 직접 읽으면 조건이 어긋나기 쉽다. */
export const ENABLE_DEV_USER = process.env.NEXT_PUBLIC_ENABLE_DEV_USER === "true";

const RAW_WORKSPACE_DEV_USER_ID = process.env.NEXT_PUBLIC_WORKSPACE_DEV_USER_ID?.trim();

/** ENABLE_DEV_USER가 꺼져 있으면 값이 설정돼 있어도 undefined — X-User-Id를 절대 붙이지 않는다. */
export const DEV_USER_ID = ENABLE_DEV_USER ? RAW_WORKSPACE_DEV_USER_ID : undefined;
