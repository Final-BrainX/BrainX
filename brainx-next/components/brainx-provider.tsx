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

type ThemeMode = "dark" | "light";
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
const SIDEBAR_KEY = "brainx_sidebar_collapsed_v1";

const BrainXContext = createContext<BrainXContextValue | null>(null);

function readJson<T>(key: string, fallback: T) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_KEY);
  return stored === "light" ? "light" : "dark";
}

function readSidebarCollapsed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_KEY) === "true";
}

function readNotes(): BrainXNote[] {
  if (typeof window === "undefined") return seedNotes();
  const parsed = readJson<BrainXNote[] | null>(NOTES_KEY, null);
  if (!Array.isArray(parsed)) return seedNotes();
  return parsed;
}

export function BrainXProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [notes, setNotes] = useState<BrainXNote[]>(() => seedNotes());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notesRef = useRef(notes);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    const nextTheme = readTheme();
    const nextSidebarCollapsed = readSidebarCollapsed();
    const nextNotes = readNotes();
    setTheme(nextTheme);
    setSidebarCollapsed(nextSidebarCollapsed);
    setNotes(nextNotes);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const handle = window.setTimeout(() => {
      try {
        writeJson(NOTES_KEY, notes);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 350);
    setSaveStatus("saving");
    return () => window.clearTimeout(handle);
  }, [hydrated, notes]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      document.documentElement.classList.toggle("light", theme === "light");
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.style.colorScheme = theme;
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore storage issues
    }
  }, [hydrated, theme]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed));
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

  const value = useMemo<BrainXContextValue>(
    () => ({
      hydrated,
      theme,
      setTheme,
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
