"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { adminApi, isAuthErrorMessage } from "@/lib/admin-api";
import { clearSession, getSession, setSession, getToken } from "@/lib/admin-auth";

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    const sessionToken = session.accessToken;

    let active = true;
    adminApi
      .getMe()
      .then((admin) => {
        if (!active) return;
        router.replace(admin.mustChangePassword ? "/change-password" : "/");
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "";
        if (isAuthErrorMessage(message) && getToken() === sessionToken) {
          clearSession();
          return;
        }
        setError("기존 관리자 세션을 확인하는 중 오류가 발생했습니다. 다시 로그인해 주세요.");
      });

    return () => {
      active = false;
    };
  }, [router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!loginId.trim() || !password) {
      setError("아이디와 비밀번호를 입력해 주세요");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const data = await adminApi.login(loginId.trim(), password);
      setSession(data);
      router.replace(data.admin.mustChangePassword ? "/change-password" : "/");
    } catch {
      setError("아이디 또는 비밀번호가 일치하지 않습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand" style={{ padding: 0, marginBottom: 26 }}>
          <div className="brand-mark">B</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.4px" }}>BrainX</div>
            <div style={{ marginTop: 1, color: "#a8a29e", fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>ADMIN CONSOLE</div>
          </div>
        </div>
        <h1 className="auth-title">관리자 로그인</h1>
        <p className="auth-desc">관리자 계정으로 로그인해 BrainX 운영 콘솔에 접속하세요.</p>
        <label className="price-label" style={{ display: "block", marginTop: 20 }}>
          아이디
          <input value={loginId} onChange={(event) => setLoginId(event.target.value)} placeholder="admin" autoFocus />
        </label>
        <label className="price-label" style={{ display: "block", marginTop: 14 }}>
          비밀번호
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호 입력" />
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <button className="btn primary wide" type="submit" disabled={submitting} style={{ marginTop: 20, height: 44 }}>
          {submitting ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}
