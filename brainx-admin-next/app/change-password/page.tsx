"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { adminApi, isAuthErrorMessage } from "@/lib/admin-api";
import { clearSession, getSession, getToken, updateSessionAdmin } from "@/lib/admin-auth";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [forced, setForced] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const hasLength = newPassword.length >= 8;
  const hasMix = /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    const sessionToken = session.accessToken;

    let active = true;
    setForced(session.admin.mustChangePassword);

    adminApi
      .getMe()
      .then((fresh) => {
        if (!active) return;
        if (!fresh.mustChangePassword) {
          updateSessionAdmin(fresh);
        }
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "";
        if (isAuthErrorMessage(message) && getToken() === sessionToken) {
          clearSession();
          router.replace("/login");
          return;
        }
        setError("관리자 세션을 확인하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      });

    return () => {
      active = false;
    };
  }, [router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("비밀번호 입력값을 확인해 주세요");
      return;
    }
    if (!hasLength || !hasMix) {
      setError("새 비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호 확인이 일치하지 않습니다");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await adminApi.changePassword({ currentPassword, newPassword });
      const session = getSession();
      if (session) {
        updateSessionAdmin({ ...session.admin, mustChangePassword: false });
      }
      router.replace("/");
    } catch {
      setError("현재 비밀번호가 일치하지 않습니다");
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
        <h1 className="auth-title">비밀번호 변경</h1>
        <p className="auth-desc">영문과 숫자를 포함해 8자 이상으로 새 비밀번호를 설정하세요.</p>
        {forced ? <p className="auth-notice">임시 비밀번호로 로그인하셨습니다. 계속 진행하려면 비밀번호를 변경해야 합니다.</p> : null}

        <label className="price-label" style={{ display: "block", marginTop: 20 }}>
          현재 비밀번호
          <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="현재 비밀번호 입력" />
        </label>
        <label className="price-label" style={{ display: "block", marginTop: 14 }}>
          새 비밀번호
          <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="새 비밀번호 입력" />
        </label>
        <div className="password-rules">
          <span className={hasLength ? "valid" : ""}>8자 이상</span>
          <span className={hasMix ? "valid" : ""}>영문+숫자 포함</span>
        </div>
        <label className="price-label" style={{ display: "block", marginTop: 14 }}>
          새 비밀번호 확인
          <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="새 비밀번호 재입력" />
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <button className="btn primary wide" type="submit" disabled={submitting} style={{ marginTop: 20, height: 44 }}>
          {submitting ? "변경 중..." : "비밀번호 변경"}
        </button>
      </form>
    </div>
  );
}
