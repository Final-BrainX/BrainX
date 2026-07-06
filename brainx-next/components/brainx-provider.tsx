"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";
import {
  type BrainXNote,
  type ClusterId,
  createNoteSeed,
  seedNotes,
  updateNoteDerived
} from "@/lib/brainx-data";
import { getLocalStoredValue, setLocalStoredValue } from "@/lib/client-storage";
import { clearAuthSession, getAuthIdentityKey, readAuthSession } from "@/lib/auth-api";
import { getBrainxDesktopConfig, isElectronDesktop } from "@/lib/desktop-bridge";
import { translate, type I18nKey, type LanguageCode } from "@/lib/i18n";
import { USE_MOCK_NOTES } from "@/lib/workspace-api";
import { loadWorkspaceBrainXNotes } from "@/lib/workspace-live-notes";

export type ThemeMode = "dark" | "light" | "system";
export type EffectiveTheme = "dark" | "light";
type SaveStatus = "saving" | "saved" | "error";
type ToastKind = "info" | "ok" | "err";

type Toast = {
  id: string;
  message: string;
  kind: ToastKind;
};

type BrainXContextValue = {
  hydrated: boolean;
  theme: ThemeMode;
  setTheme: Dispatch<SetStateAction<ThemeMode>>;
  effectiveTheme: EffectiveTheme;
  language: LanguageCode;
  setLanguage: Dispatch<SetStateAction<LanguageCode>>;
  t: (key: I18nKey) => string;
  notes: BrainXNote[];
  setNotes: Dispatch<SetStateAction<BrainXNote[]>>;
  createNote: (folderId?: ClusterId) => BrainXNote;
  updateNote: (id: string, patch: Partial<BrainXNote>) => void;
  deleteNote: (id: string) => void;
  saveStatus: SaveStatus;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  toasts: Toast[];
  pushToast: (message: string, kind?: ToastKind) => void;
};

const NOTES_KEY = "brainx_notes_v1";
const THEME_KEY = "brainx_theme_v1";
const LANGUAGE_KEY = "brainx_language_v1";
const SIDEBAR_KEY = "brainx_sidebar_collapsed_v1";
const DESKTOP_AUTH_APP_VERSION_KEY = "brainx_desktop_auth_app_version_v1";

const BrainXContext = createContext<BrainXContextValue | null>(null);

function readJson<T>(key: string, fallback: T) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = getLocalStoredValue(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  setLocalStoredValue(key, JSON.stringify(value));
}

function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = getLocalStoredValue(THEME_KEY);
  return stored === "dark" || stored === "light" || stored === "system" ? stored : "light";
}

function readLanguage(): LanguageCode {
  if (typeof window === "undefined") return "ko";
  return getLocalStoredValue(LANGUAGE_KEY) === "en" ? "en" : "ko";
}

function getSystemTheme(): EffectiveTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readSidebarCollapsed() {
  if (typeof window === "undefined") return false;
  return getLocalStoredValue(SIDEBAR_KEY) === "true";
}

function readNotes(): BrainXNote[] {
  if (typeof window === "undefined") return [];
  if (!USE_MOCK_NOTES) return [];
  const session = readAuthSession();
  if (session && session.accessToken !== "demo-access-token") return [];
  const parsed = readJson<BrainXNote[] | null>(NOTES_KEY, null);
  if (Array.isArray(parsed)) return parsed;
  return seedNotes();
}

export function BrainXProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>("light");
  const [language, setLanguage] = useState<LanguageCode>("ko");
  const [notes, setNotes] = useState<BrainXNote[]>(() => readNotes());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notesRef = useRef(notes);
  const [authIdentityKey, setAuthIdentityKey] = useState(() => getAuthIdentityKey(readAuthSession()));

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (isElectronDesktop()) {
        try {
          const config = await getBrainxDesktopConfig();
          const currentVersion = config?.appVersion?.trim();
          if (currentVersion) {
            const storedVersion = getLocalStoredValue(DESKTOP_AUTH_APP_VERSION_KEY);
            if (storedVersion && storedVersion !== currentVersion && readAuthSession()?.accessToken) {
              clearAuthSession();
            }
            setLocalStoredValue(DESKTOP_AUTH_APP_VERSION_KEY, currentVersion);
          }
        } catch {
          // ignore desktop config read failures during boot
        }
      }

      if (!active) return;
      const nextTheme = readTheme();
      const nextLanguage = readLanguage();
      const nextSidebarCollapsed = readSidebarCollapsed();
      const nextNotes = readNotes();
      setTheme(nextTheme);
      setLanguage(nextLanguage);
      setSidebarCollapsed(nextSidebarCollapsed);
      setNotes(nextNotes);
      setHydrated(true);
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !USE_MOCK_NOTES) return;
    const handle = window.setTimeout(() => {
      try {
        writeJson(NOTES_KEY, notes);
        setSaveStatus((prev) => (prev === "saved" ? prev : "saved"));
      } catch {
        setSaveStatus((prev) => (prev === "error" ? prev : "error"));
      }
    }, 350);
    setSaveStatus((prev) => (prev === "saving" ? prev : "saving"));
    return () => window.clearTimeout(handle);
  }, [hydrated, notes]);

  useEffect(() => {
    if (!hydrated || USE_MOCK_NOTES) return;
    const syncAuthIdentity = () => {
      const nextSession = readAuthSession();
      const nextIdentityKey = getAuthIdentityKey(nextSession);
      setAuthIdentityKey((prev) => (prev === nextIdentityKey ? prev : nextIdentityKey));
    };
    window.addEventListener("brainx-auth-session-changed", syncAuthIdentity);
    return () => {
      window.removeEventListener("brainx-auth-session-changed", syncAuthIdentity);
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || USE_MOCK_NOTES) return;
    let active = true;
    let requestNonce = 0;

    const loadLiveNotes = () => {
      const nextNonce = requestNonce + 1;
      requestNonce = nextNonce;
      setSaveStatus((prev) => (prev === "saving" ? prev : "saving"));
      loadWorkspaceBrainXNotes()
        .then((nextNotes) => {
          if (!active || requestNonce !== nextNonce) return;
          setNotes(nextNotes);
          setSaveStatus((prev) => (prev === "saved" ? prev : "saved"));
        })
        .catch(() => {
          if (!active || requestNonce !== nextNonce) return;
          setSaveStatus((prev) => (prev === "error" ? prev : "error"));
        });
    };

    loadLiveNotes();
    window.addEventListener("brainx:notes-refresh", loadLiveNotes);
    return () => {
      active = false;
      window.removeEventListener("brainx:notes-refresh", loadLiveNotes);
    };
  }, [authIdentityKey, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const applyTheme = () => {
      const pathname = window.location.pathname;
      const isThemeEnabledRoute = ["/home", "/notes", "/chat", "/graph", "/billing", "/admin", "/settings"].some((prefix) => pathname.startsWith(prefix));
      const nextEffectiveTheme = isThemeEnabledRoute ? (theme === "system" ? getSystemTheme() : theme) : "light";
      setEffectiveTheme(nextEffectiveTheme);
      document.documentElement.classList.toggle("light", nextEffectiveTheme === "light");
      document.documentElement.classList.toggle("dark", nextEffectiveTheme === "dark");
      document.documentElement.style.colorScheme = nextEffectiveTheme;
    };

    try {
      applyTheme();
      setLocalStoredValue(THEME_KEY, theme);
    } catch {
      // ignore storage issues
    }

    const media = window.matchMedia("(prefers-color-scheme: light)");
    if (theme !== "system") return;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [hydrated, theme]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      document.documentElement.lang = language;
      setLocalStoredValue(LANGUAGE_KEY, language);
    } catch {
      // ignore storage issues
    }
  }, [hydrated, language]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      setLocalStoredValue(SIDEBAR_KEY, String(sidebarCollapsed));
    } catch {
      // ignore storage issues
    }
  }, [hydrated, sidebarCollapsed]);

  const createNote = useCallback((folderId?: ClusterId) => {
    const next = createNoteSeed(notesRef.current, folderId);
    setNotes((prev) => [next, ...prev]);
    return next;
  }, []);

  const updateNote = useCallback((id: string, patch: Partial<BrainXNote>) => {
    setNotes((prev) =>
      prev.map((note) => (note.id === id ? updateNoteDerived(note, patch) : note))
    );
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((note) => note.id !== id));
  }, []);

  const pushToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const t = useCallback((key: I18nKey) => translate(language, key), [language]);

  const value = useMemo<BrainXContextValue>(
    () => ({
      hydrated,
      theme,
      setTheme,
      effectiveTheme,
      language,
      setLanguage,
      t,
      notes,
      setNotes,
      createNote,
      updateNote,
      deleteNote,
      saveStatus,
      sidebarCollapsed,
      setSidebarCollapsed,
      toasts,
      pushToast
    }),
    [
      hydrated,
      theme,
      effectiveTheme,
      language,
      t,
      notes,
      createNote,
      updateNote,
      deleteNote,
      saveStatus,
      sidebarCollapsed,
      toasts,
      pushToast
    ]
  );

  return <BrainXContext.Provider value={value}>{children}</BrainXContext.Provider>;
}

export function useBrainX() {
  const context = useContext(BrainXContext);
  if (!context) {
    throw new Error("useBrainX must be used within BrainXProvider");
  }
  return context;
}
