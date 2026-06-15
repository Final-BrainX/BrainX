"use client";

import { useEffect, useRef, useState } from "react";

import { useBrainX } from "@/components/brainx-provider";

import { Avatar, Badge, Btn, Card, Icon, SectionHead, ThemeToggle, Toggle } from "@/components/brainx-ui";

import { ADMIN_FLAGS, SETTINGS_KEY, SectionCard, readPreferences, type WorkspacePreferences } from "@/components/utility/utility-shared";

export function SettingsScreen() {
  const { theme, setTheme, sidebarCollapsed, setSidebarCollapsed, pushToast } = useBrainX();
  const [preferences, setPreferences] = useState<WorkspacePreferences>({
    autoTag: true,
    semanticSearch: true,
    aiSummaries: true,
    shareLinks: true,
    emailDigest: false,
    compactMode: false
  });
  const [nickname, setNickname] = useState("연우");
  const loadedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WorkspacePreferences> & { nickname?: string };
        setPreferences({
          autoTag: parsed.autoTag ?? true,
          semanticSearch: parsed.semanticSearch ?? true,
          aiSummaries: parsed.aiSummaries ?? true,
          shareLinks: parsed.shareLinks ?? true,
          emailDigest: parsed.emailDigest ?? false,
          compactMode: parsed.compactMode ?? false
        });
        if (parsed.nickname) setNickname(parsed.nickname);
      }
    } catch {
      // ignore localStorage errors
    } finally {
      loadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...preferences, nickname }));
    } catch {
      // ignore localStorage errors
    }
  }, [nickname, preferences]);

  const updatePreference = (key: keyof WorkspacePreferences) => {
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div data-route className="mx-auto max-w-[1180px] px-6 py-7 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge color="139 92 246" dot className="mb-2.5">
            설정 · 환경 관리
          </Badge>
          <h1 className="text-[27px] font-bold tracking-tight">설정</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] text-txt2">테마, 검색, 공유, 알림, 레이아웃을 로컬에 저장합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Btn variant="soft" icon="refresh" onClick={() => {
            setPreferences({
              autoTag: true,
              semanticSearch: true,
              aiSummaries: true,
              shareLinks: true,
              emailDigest: false,
              compactMode: false
            });
            setNickname("연우");
            pushToast("설정을 기본값으로 되돌렸어요", "ok");
          }}>
            초기화
          </Btn>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="p-5">
          <SectionHead icon="user" title="프로필" sub="변경 내용은 로컬 저장소에만 보관됩니다." />
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={nickname} size={64} ring />
              <div className="min-w-0 flex-1">
                <div className="text-[18px] font-semibold text-txt">{nickname}</div>
                <div className="mt-1 text-[12px] text-txt3">research@brainx.app</div>
              </div>
            </div>
            <label className="block">
              <div className="mb-1.5 text-[12px] font-medium text-txt2">닉네임</div>
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                className="h-11 w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 text-[14px] text-txt outline-none focus:border-primary/60"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Btn variant="soft" icon="copy" onClick={() => pushToast("프로필 설정을 저장했어요", "ok")}>
                저장하기
              </Btn>
              <Btn variant="outline" icon="globe" onClick={() => pushToast("공개 프로필 링크를 준비했어요")}>
                공유 링크
              </Btn>
            </div>
          </div>
        </Card>

        <div className="grid gap-4">
          <SectionCard title="레이아웃" sub="사이드바와 테마는 즉시 반영됩니다.">
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                <div>
                  <div className="text-[13px] font-medium text-txt">사이드바 접기</div>
                  <div className="text-[11.5px] text-txt3">워크스페이스 폭을 넓힙니다.</div>
                </div>
                <Toggle on={sidebarCollapsed} onChange={setSidebarCollapsed} />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                <div>
                  <div className="text-[13px] font-medium text-txt">테마</div>
                  <div className="text-[11.5px] text-txt3">{theme === "dark" ? "다크" : "라이트"} 모드</div>
                </div>
                <Toggle on={theme === "light"} onChange={(value) => setTheme(value ? "light" : "dark")} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="검색과 자동화" sub="노트 저장과 검색 경험을 조절합니다.">
            <div className="space-y-2.5">
              {ADMIN_FLAGS.map((flag) => (
                <div key={flag.key} className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                  <div>
                    <div className="text-[13px] font-medium text-txt">{flag.label}</div>
                    <div className="text-[11.5px] text-txt3">{flag.desc}</div>
                  </div>
                  <Toggle on={preferences[flag.key]} onChange={() => updatePreference(flag.key)} />
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard title="알림과 요약" sub="이메일 알림과 주간 요약을 설정합니다.">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
              <div>
                <div className="text-[13px] font-medium text-txt">이메일 요약</div>
                <div className="text-[11.5px] text-txt3">주간 활동 리포트 전송</div>
              </div>
              <Toggle on={preferences.emailDigest} onChange={() => updatePreference("emailDigest")} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
              <div>
                <div className="text-[13px] font-medium text-txt">컴팩트 모드</div>
                <div className="text-[11.5px] text-txt3">목록 밀도를 높입니다</div>
              </div>
              <Toggle on={preferences.compactMode} onChange={() => updatePreference("compactMode")} />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="내보내기"
          sub="데이터는 로컬에 남아 있고, 내보내기는 브라우저에서 처리됩니다."
          action={<Btn variant="soft" size="sm" icon="upload" onClick={() => pushToast("설정 백업 파일을 준비했어요", "ok")}>백업</Btn>}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="rounded-xl border border-line/50 bg-surface2/40 px-3 py-3 text-left" onClick={() => pushToast("노트 JSON 내보내기를 준비했어요", "ok")}>
              <div className="text-[13px] font-medium text-txt">노트 JSON</div>
              <div className="mt-1 text-[11.5px] text-txt3">메타데이터 포함</div>
            </button>
            <button type="button" className="rounded-xl border border-line/50 bg-surface2/40 px-3 py-3 text-left" onClick={() => pushToast("설정 JSON 내보내기를 준비했어요", "ok")}>
              <div className="text-[13px] font-medium text-txt">설정 JSON</div>
              <div className="mt-1 text-[11.5px] text-txt3">테마·레이아웃 포함</div>
            </button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
