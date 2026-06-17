"use client";

import {
  EditorContent,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Extension, textblockTypeInputRule } from "@tiptap/core";
import { createLowlight, all } from "lowlight";
import { useRef, useState } from "react";
import { useBrainX } from "@/components/brainx-provider";
import { cx } from "@/lib/utils";
import { Copy, Check, Code2, FileJson, FileText, Trash2 } from "lucide-react";

const lowlight = createLowlight(all);
const STORAGE_KEY = "brainx_tiptap_code_test_v1";

// ── Language catalog ──────────────────────────────────────────────────────

type LangEntry = { id: string; label: string };
type LangGroup = { group: string; langs: LangEntry[] };

const LANG_GROUPS: LangGroup[] = [
  {
    group: "웹",
    langs: [
      { id: "javascript", label: "JavaScript" },
      { id: "typescript", label: "TypeScript" },
      { id: "html", label: "HTML" },
      { id: "css", label: "CSS" },
      { id: "scss", label: "SCSS" },
      { id: "json", label: "JSON" },
      { id: "xml", label: "XML" },
    ],
  },
  {
    group: "백엔드",
    langs: [
      { id: "java", label: "Java" },
      { id: "python", label: "Python" },
      { id: "go", label: "Go" },
      { id: "rust", label: "Rust" },
      { id: "c", label: "C" },
      { id: "cpp", label: "C++" },
      { id: "csharp", label: "C#" },
      { id: "php", label: "PHP" },
      { id: "ruby", label: "Ruby" },
      { id: "kotlin", label: "Kotlin" },
      { id: "swift", label: "Swift" },
    ],
  },
  {
    group: "데이터",
    langs: [
      { id: "sql", label: "SQL" },
      { id: "graphql", label: "GraphQL" },
      { id: "yaml", label: "YAML" },
      { id: "toml", label: "TOML" },
    ],
  },
  {
    group: "인프라",
    langs: [
      { id: "bash", label: "Bash" },
      { id: "shell", label: "Shell" },
      { id: "dockerfile", label: "Dockerfile" },
      { id: "nginx", label: "Nginx" },
      { id: "hcl", label: "Terraform" },
    ],
  },
  {
    group: "기타",
    langs: [
      { id: "markdown", label: "Markdown" },
      { id: "latex", label: "LaTeX" },
      { id: "r", label: "R" },
      { id: "scala", label: "Scala" },
      { id: "dart", label: "Dart" },
      { id: "lua", label: "Lua" },
    ],
  },
];

const ALL_LANGS: LangEntry[] = LANG_GROUPS.flatMap((g) => g.langs);

// ── Sample code snippets ──────────────────────────────────────────────────

export const SAMPLES: Record<string, string> = {
  javascript: `// Fibonacci with memoization
function fibonacci(n, memo = {}) {
  if (n in memo) return memo[n];
  if (n <= 1) return n;
  return (memo[n] = fibonacci(n - 1, memo) + fibonacci(n - 2, memo));
}
console.log(fibonacci(10)); // 55`,

  typescript: `interface Note {
  id: string;
  title: string;
  tags: string[];
  createdAt: Date;
}

function createNote(title: string): Note {
  return { id: crypto.randomUUID(), title, tags: [], createdAt: new Date() };
}

const note: Note = createNote("Hello, TypeScript!");
console.log(note);`,

  html: `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>BrainX</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <h1 class="hero">Hello, <strong>BrainX</strong>!</h1>
    <script src="app.js"></script>
  </body>
</html>`,

  css: `/* BrainX Design Tokens */
:root {
  --color-primary: #3b82f6;
  --color-surface: hsl(220 20% 14%);
  --font-sans: "Pretendard Variable", system-ui, sans-serif;
}

.card {
  background: var(--color-surface);
  border-radius: 1rem;
  padding: 1.5rem;
  transition: transform 0.2s ease;
}

.card:hover {
  transform: translateY(-2px);
}`,

  scss: `$primary: #3b82f6;
$surface: hsl(220, 20%, 14%);

@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.card {
  background: $surface;
  border-radius: 1rem;

  &:hover { transform: translateY(-2px); }

  &__title {
    font-size: 1.25rem;
    color: $primary;
  }
}`,

  json: `{
  "name": "brainx-next",
  "version": "0.1.0",
  "dependencies": {
    "@tiptap/react": "^3.26.0",
    "@blocknote/core": "^0.51.4",
    "next": "^16.2.7",
    "react": "^19.1.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build"
  }
}`,

  xml: `<?xml version="1.0" encoding="UTF-8"?>
<notes>
  <note id="1">
    <title>Meeting Notes</title>
    <content>Discuss Q3 roadmap</content>
    <tags>
      <tag>work</tag>
      <tag>meeting</tag>
    </tags>
    <createdAt>2026-06-12T09:00:00Z</createdAt>
  </note>
</notes>`,

  java: `import java.util.HashMap;

public class Fibonacci {
    private final HashMap<Integer, Long> memo = new HashMap<>();

    public long compute(int n) {
        if (n <= 1) return n;
        return memo.computeIfAbsent(n,
            k -> compute(k - 1) + compute(k - 2));
    }

    public static void main(String[] args) {
        System.out.println(new Fibonacci().compute(10)); // 55
    }
}`,

  python: `from functools import lru_cache

@lru_cache(maxsize=None)
def fibonacci(n: int) -> int:
    """Compute nth Fibonacci number."""
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

if __name__ == "__main__":
    print(fibonacci(10))  # 55`,

  go: `package main

import "fmt"

func fibonacci(n int, memo map[int]int) int {
	if n <= 1 {
		return n
	}
	if v, ok := memo[n]; ok {
		return v
	}
	memo[n] = fibonacci(n-1, memo) + fibonacci(n-2, memo)
	return memo[n]
}

func main() {
	fmt.Println(fibonacci(10, map[int]int{})) // 55
}`,

  rust: `use std::collections::HashMap;

fn fibonacci(n: u64, memo: &mut HashMap<u64, u64>) -> u64 {
    if n <= 1 { return n; }
    if let Some(&v) = memo.get(&n) { return v; }
    let result = fibonacci(n - 1, memo) + fibonacci(n - 2, memo);
    memo.insert(n, result);
    result
}

fn main() {
    let mut memo = HashMap::new();
    println!("{}", fibonacci(10, &mut memo)); // 55
}`,

  c: `#include <stdio.h>
#include <string.h>

#define MAX 100
long long memo[MAX];

long long fibonacci(int n) {
    if (n <= 1) return n;
    if (memo[n]) return memo[n];
    return (memo[n] = fibonacci(n - 1) + fibonacci(n - 2));
}

int main(void) {
    memset(memo, 0, sizeof(memo));
    printf("%lld\n", fibonacci(10)); // 55
    return 0;
}`,

  cpp: `#include <iostream>
#include <unordered_map>

class Fibonacci {
    std::unordered_map<int, long long> memo;
public:
    long long compute(int n) {
        if (n <= 1) return n;
        auto it = memo.find(n);
        if (it != memo.end()) return it->second;
        return memo[n] = compute(n - 1) + compute(n - 2);
    }
};

int main() {
    std::cout << Fibonacci().compute(10) << "\n"; // 55
}`,

  csharp: `using System;
using System.Collections.Generic;

class Fibonacci {
    readonly Dictionary<int, long> _memo = new();

    public long Compute(int n) {
        if (n <= 1) return n;
        if (_memo.TryGetValue(n, out long v)) return v;
        return _memo[n] = Compute(n - 1) + Compute(n - 2);
    }

    static void Main() {
        Console.WriteLine(new Fibonacci().Compute(10)); // 55
    }
}`,

  php: `<?php

function fibonacci(int $n, array &$memo = []): int {
    if ($n <= 1) return $n;
    if (isset($memo[$n])) return $memo[$n];
    return $memo[$n] = fibonacci($n - 1, $memo) + fibonacci($n - 2, $memo);
}

echo fibonacci(10) . PHP_EOL; // 55`,

  ruby: `def fibonacci(n, memo = {})
  return n if n <= 1
  memo[n] ||= fibonacci(n - 1, memo) + fibonacci(n - 2, memo)
end

puts fibonacci(10) # 55`,

  kotlin: `fun fibonacci(n: Int, memo: MutableMap<Int, Long> = mutableMapOf()): Long {
    if (n <= 1) return n.toLong()
    return memo.getOrPut(n) { fibonacci(n - 1, memo) + fibonacci(n - 2, memo) }
}

fun main() {
    println(fibonacci(10)) // 55
    println((0..9).map { fibonacci(it) })
}`,

  swift: `import Foundation

func fibonacci(_ n: Int, memo: inout [Int: Int]) -> Int {
    guard n > 1 else { return n }
    if let v = memo[n] { return v }
    let result = fibonacci(n - 1, memo: &memo) + fibonacci(n - 2, memo: &memo)
    memo[n] = result
    return result
}

var memo: [Int: Int] = [:]
print(fibonacci(10, memo: &memo)) // 55`,

  sql: `-- BrainX notes schema
CREATE TABLE notes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL,
    content     TEXT,
    user_id     UUID        NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ DEFAULT now()
);

SELECT
    n.title,
    n.created_at,
    COUNT(t.id) AS tag_count
FROM notes n
LEFT JOIN note_tags t ON t.note_id = n.id
WHERE n.user_id = $1
GROUP BY n.id
ORDER BY n.created_at DESC
LIMIT 20;`,

  graphql: `type Note {
  id: ID!
  title: String!
  content: String
  tags: [Tag!]!
  createdAt: DateTime!
  author: User!
}

type Query {
  notes(userId: ID!, limit: Int = 20): [Note!]!
  note(id: ID!): Note
}

type Mutation {
  createNote(input: CreateNoteInput!): Note!
  deleteNote(id: ID!): Boolean!
}

input CreateNoteInput {
  title: String!
  content: String
  tags: [String!]
}`,

  yaml: `# BrainX Docker Compose
version: "3.9"

services:
  app:
    image: brainx-next:latest
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: \${DATABASE_URL}
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: brainx
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}`,

  toml: `# BrainX configuration
[app]
name = "BrainX"
version = "0.1.0"
debug = false

[database]
host = "localhost"
port = 5432
name = "brainx"
pool_size = 10

[features]
enable_ai = true
enable_graph = true
max_notes_per_user = 1000`,

  bash: `#!/usr/bin/env bash
set -euo pipefail

APP_NAME="brainx-next"

echo "==> Deploying \${APP_NAME}..."
git pull origin main
npm ci --production
npm run build
pm2 reload "\${APP_NAME}" || pm2 start npm --name "\${APP_NAME}" -- start
echo "==> Deploy complete!"`,

  shell: `# Environment setup
export NODE_ENV=production
export PORT=3000

check_deps() {
    for dep in node npm git; do
        if ! command -v "$dep" &> /dev/null; then
            echo "Error: $dep not found" >&2
            exit 1
        fi
    done
}

check_deps
echo "All dependencies satisfied"`,

  dockerfile: `FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
USER nextjs
EXPOSE 3000
CMD ["npm", "start"]`,

  nginx: `server {
    listen 80;
    server_name brainx.app;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name brainx.app;

    ssl_certificate /etc/letsencrypt/live/brainx.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/brainx.app/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}`,

  hcl: `terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

resource "aws_s3_bucket" "brainx_assets" {
  bucket = "brainx-assets-\${var.env}"

  tags = {
    Name        = "BrainX Assets"
    Environment = var.env
  }
}

variable "env" {
  type    = string
  default = "staging"
}`,

  markdown: `# BrainX Note System

## Overview

BrainX is a **knowledge management** system that helps you _organize_ your thoughts.

### Features

- Smart note clustering
- Graph visualization
- AI-powered search

## Getting Started

\`\`\`bash
npm install && npm run dev
\`\`\`

> **Tip:** Use \`/\` commands to quickly create different block types.`,

  latex: `\\documentclass{article}
\\usepackage{amsmath}

\\title{Fibonacci Sequence}
\\author{BrainX}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Definition}
\\[
  F(n) = \\begin{cases}
    n & \\text{if } n \\leq 1 \\\\
    F(n-1) + F(n-2) & \\text{otherwise}
  \\end{cases}
\\]

\\end{document}`,

  r: `# Fibonacci sequence in R
fibonacci <- function(n, memo = list()) {
  if (n <= 1) return(n)
  key <- as.character(n)
  if (!is.null(memo[[key]])) return(memo[[key]])
  result <- fibonacci(n - 1, memo) + fibonacci(n - 2, memo)
  memo[[key]] <<- result
  result
}

fib_seq <- sapply(0:9, fibonacci)
plot(fib_seq, type = "l", col = "steelblue",
     main = "Fibonacci Sequence", xlab = "n", ylab = "F(n)")`,

  scala: `import scala.collection.mutable

object Fibonacci {
  private val memo = mutable.Map[Int, BigInt]()

  def compute(n: Int): BigInt = n match {
    case _ if n <= 1 => BigInt(n)
    case _ => memo.getOrElseUpdate(n, compute(n - 1) + compute(n - 2))
  }

  def main(args: Array[String]): Unit = {
    println(compute(10)) // 55
    println((0 to 9).map(compute).mkString(", "))
  }
}`,

  dart: `import 'dart:collection';

int fibonacci(int n, [Map<int, int>? memo]) {
  memo ??= HashMap<int, int>();
  if (n <= 1) return n;
  return memo.putIfAbsent(n,
    () => fibonacci(n - 1, memo) + fibonacci(n - 2, memo));
}

void main() {
  print(fibonacci(10)); // 55
  final seq = List.generate(10, (i) => fibonacci(i));
  print(seq); // [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
}`,

  lua: `-- Fibonacci with memoization
local function fibonacci(n, memo)
  memo = memo or {}
  if n <= 1 then return n end
  if memo[n] then return memo[n] end
  memo[n] = fibonacci(n - 1, memo) + fibonacci(n - 2, memo)
  return memo[n]
end

print(fibonacci(10)) -- 55

local seq = {}
for i = 0, 9 do seq[#seq + 1] = fibonacci(i) end
print(table.concat(seq, ", ")) -- 0, 1, 1, 2, 3, 5, 8, 13, 21, 34`,
};

// Default content shown on first visit (before any localStorage)
const DEFAULT_CONTENT = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "TipTap 코드 하이라이팅 테스트 페이지입니다. 빈 줄에서 ``` 를 입력하면 코드블록이 생성됩니다. 위의 '샘플 삽입' 패널에서 원하는 언어 예제를 에디터에 삽입해보세요.",
        },
      ],
    },
    {
      type: "codeBlock",
      attrs: { language: "javascript" },
      content: [{ type: "text", text: SAMPLES.javascript }],
    },
    { type: "paragraph" },
    {
      type: "codeBlock",
      attrs: { language: "python" },
      content: [{ type: "text", text: SAMPLES.python }],
    },
    { type: "paragraph" },
    {
      type: "codeBlock",
      attrs: { language: "sql" },
      content: [{ type: "text", text: SAMPLES.sql }],
    },
    { type: "paragraph" },
  ],
};

// ── ``` + Enter → code block shortcut ────────────────────────────────────
// textblockTypeInputRule only fires on Space; this extension handles Enter.
// Priority 150 ensures it runs before StarterKit's paragraph-split Enter handler.
const MarkdownCodeFenceEnter = Extension.create({
  name: "markdownCodeFenceEnter",
  priority: 150,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty || $from.parent.type.name !== "paragraph") return false;
        const fullText = $from.parent.textContent;
        // Only trigger when the ENTIRE paragraph is ``` or ```lang and cursor is at the end
        if ($from.parentOffset !== fullText.length) return false;
        const fenceMatch = /^```([a-z]*)$/.exec(fullText);
        if (!fenceMatch) return false;
        const lang = fenceMatch[1] || null;
        const codeBlockType = this.editor.schema.nodes.codeBlock;
        if (!codeBlockType) return false;
        return this.editor
          .chain()
          .command(({ tr }) => {
            // Convert paragraph → codeBlock, then clear the ``` fence text
            tr.setNodeMarkup($from.before(), codeBlockType, { language: lang });
            tr.delete($from.pos - $from.parentOffset, $from.pos);
            return true;
          })
          .run();
      },
    };
  },
});

// ── Custom code block NodeView ────────────────────────────────────────────
// Uses CSS variables (bg-surface2, text-txt2, etc.) instead of useBrainX()
// so theme changes automatically apply without prop drilling into the NodeView.

function CodeBlockNodeView({ node, updateAttributes }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const lang = (node.attrs.language as string) || "";

  function copy() {
    navigator.clipboard.writeText(node.textContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <NodeViewWrapper className="my-4 rounded-xl overflow-hidden border border-line/40">
      <div
        contentEditable={false}
        className="flex items-center justify-between gap-2 px-3 py-1.5 bg-surface2 border-b border-line/30 select-none"
      >
        <select
          value={lang}
          onChange={(e) => updateAttributes({ language: e.target.value })}
          className="bg-transparent text-[11px] text-txt2 outline-none cursor-pointer font-mono hover:text-txt transition-colors"
        >
          <option value="">plaintext</option>
          {ALL_LANGS.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          {lang && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              {lang}
            </span>
          )}
          <button
            onClick={copy}
            className={cx(
              "flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors",
              copied ? "text-green-400" : "text-txt3 hover:text-txt"
            )}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
      </div>

      <pre className="m-0 p-4 overflow-x-auto bg-surface2/50 text-sm font-mono leading-relaxed">
        {/* NodeViewContent renders as div; pre wrapper provides mono styling */}
        <NodeViewContent />
      </pre>
    </NodeViewWrapper>
  );
}

// ── Main editor component ─────────────────────────────────────────────────

export default function TipTapCodeEditor() {
  const { effectiveTheme } = useBrainX();
  const isLight = effectiveTheme === "light";
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  const [debugMode, setDebugMode] = useState<"none" | "html" | "json">("none");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted content once at init — avoids flushSync inside useEffect
  const [initContent] = useState<object>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as object;
    } catch {}
    return DEFAULT_CONTENT;
  });

  const editor = useEditor({
    immediatelyRender: false,
    content: initContent,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({
        placeholder:
          "내용을 입력하세요. 빈 줄에서 ``` 를 입력하면 코드블록이 생성됩니다...",
      }),
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockNodeView);
        },
        // Explicit input rules so ``` and ~~~ shortcuts work reliably after extend()
        addInputRules() {
          return [
            textblockTypeInputRule({
              find: /^```([a-z]+)?[\s\n]$/,
              type: this.type,
              getAttributes: (match) => ({ language: match[1] ?? null }),
            }),
            textblockTypeInputRule({
              find: /^~~~([a-z]+)?[\s\n]$/,
              type: this.type,
              getAttributes: (match) => ({ language: match[1] ?? null }),
            }),
          ];
        },
      }).configure({ lowlight, exitOnTripleEnter: true, exitOnArrowDown: true }),
      MarkdownCodeFenceEnter,
    ],
    onUpdate({ editor: ed }) {
      setSaveStatus("saving");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ed.getJSON()));
        setSaveStatus("saved");
      }, 600);
    },
  });

  function insertSample(langId: string) {
    editor
      ?.chain()
      .focus()
      .insertContent([
        {
          type: "codeBlock",
          attrs: { language: langId },
          content: [
            {
              type: "text",
              text:
                SAMPLES[langId] ??
                `// ${langId} example\nconsole.log("Hello from ${langId}")`,
            },
          ],
        },
        { type: "paragraph" },
      ])
      .run();
  }

  function insertGroupSamples(groupIdx: number) {
    const group = LANG_GROUPS[groupIdx];
    editor
      ?.chain()
      .focus()
      .insertContent(
        group.langs.flatMap(({ id }) => [
          {
            type: "codeBlock",
            attrs: { language: id },
            content: [{ type: "text", text: SAMPLES[id] ?? `// ${id} example` }],
          },
          { type: "paragraph" },
        ])
      )
      .run();
  }

  function insertAllSamples() {
    editor
      ?.chain()
      .focus()
      .insertContent(
        ALL_LANGS.flatMap(({ id }) => [
          {
            type: "codeBlock",
            attrs: { language: id },
            content: [{ type: "text", text: SAMPLES[id] ?? `// ${id} example` }],
          },
          { type: "paragraph" },
        ])
      )
      .run();
  }

  function clearEditor() {
    editor
      ?.chain()
      .focus()
      .setContent({ type: "doc", content: [{ type: "paragraph" }] })
      .run();
    localStorage.removeItem(STORAGE_KEY);
    setSaveStatus("saved");
  }

  if (!editor) return <EditorSkeleton />;

  const activeGroup = LANG_GROUPS[activeGroupIdx];

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ─────────────────────────────────── */}
      <div
        className={cx(
          "flex flex-wrap items-center gap-1 px-3 py-2 rounded-xl border",
          isLight
            ? "bg-slate-50 border-slate-200"
            : "bg-surface2/40 border-line/40"
        )}
      >
        <ToolBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          isLight={isLight}
          title="Bold (Ctrl+B)"
        >
          <span className="font-bold">B</span>
        </ToolBtn>
        <ToolBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isLight={isLight}
          title="Italic (Ctrl+I)"
        >
          <span className="italic">I</span>
        </ToolBtn>
        <Sep isLight={isLight} />
        {([1, 2, 3] as const).map((level) => (
          <ToolBtn
            key={level}
            active={editor.isActive("heading", { level })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level }).run()
            }
            isLight={isLight}
            title={`H${level}`}
          >
            <span className="text-[10px] font-bold font-mono">H{level}</span>
          </ToolBtn>
        ))}
        <Sep isLight={isLight} />
        <ToolBtn
          active={false}
          onClick={() => editor.chain().focus().setCodeBlock().run()}
          isLight={isLight}
          title="코드블록 삽입 (또는 빈 줄에서 ``` 입력)"
        >
          <Code2 size={12} />
        </ToolBtn>

        <div className="flex-1" />

        {/* Debug panel toggle */}
        <div
          className={cx(
            "flex rounded-lg overflow-hidden",
            isLight
              ? "bg-white border border-slate-200"
              : "bg-surface/60"
          )}
        >
          {(["html", "json"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() =>
                setDebugMode(debugMode === mode ? "none" : mode)
              }
              title={`${mode.toUpperCase()} 출력 패널`}
              className={cx(
                "flex items-center gap-1 px-2.5 py-1 text-[11px] transition-all",
                debugMode === mode
                  ? "bg-primary/20 text-primary font-medium"
                  : isLight
                    ? "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    : "text-txt3 hover:text-txt"
              )}
            >
              {mode === "html" ? (
                <FileText size={11} />
              ) : (
                <FileJson size={11} />
              )}
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
        <Sep isLight={isLight} />

        <button
          onClick={clearEditor}
          title="에디터 초기화 (localStorage 삭제)"
          className={cx(
            "p-1.5 rounded transition-colors",
            isLight
              ? "text-slate-400 hover:text-red-500"
              : "text-txt3 hover:text-red-400"
          )}
        >
          <Trash2 size={13} />
        </button>
        <span
          className={cx(
            "text-[11px] tabular-nums pr-1 transition-colors",
            saveStatus === "saving" ? "text-primary" : "text-txt3"
          )}
        >
          {saveStatus === "saving" ? "저장 중..." : "✓ 저장됨"}
        </span>
      </div>

      {/* ── Sample insertion panel ──────────────────── */}
      <div
        className={cx(
          "rounded-xl border px-3 py-2.5",
          isLight
            ? "bg-slate-50 border-slate-200"
            : "bg-surface2/30 border-line/40"
        )}
      >
        {/* Group tabs + action buttons */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          <span className="text-[11px] text-txt3 font-medium shrink-0">
            샘플 삽입
          </span>
          {LANG_GROUPS.map(({ group }, idx) => (
            <button
              key={group}
              onClick={() => setActiveGroupIdx(idx)}
              className={cx(
                "px-2.5 py-0.5 rounded-full text-[11px] transition-all",
                activeGroupIdx === idx
                  ? "bg-primary/20 text-primary font-medium"
                  : isLight
                    ? "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    : "text-txt3 hover:text-txt hover:bg-surface2/60"
              )}
            >
              {group}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => insertGroupSamples(activeGroupIdx)}
            className={cx(
              "px-2.5 py-1 rounded-lg text-[11px] border transition-all",
              isLight
                ? "bg-white border-slate-200 text-slate-600 hover:border-primary/40 hover:text-primary"
                : "border-line/40 text-txt3 hover:text-txt hover:bg-surface2 hover:border-primary/30"
            )}
          >
            {activeGroup.group} 전체 삽입
          </button>
          <button
            onClick={insertAllSamples}
            className="px-2.5 py-1 rounded-lg text-[11px] bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-all font-medium"
          >
            전체 삽입 ({ALL_LANGS.length}개)
          </button>
        </div>

        {/* Language chips for active group */}
        <div className="flex flex-wrap gap-1.5">
          {activeGroup.langs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => insertSample(id)}
              title={`${label} 샘플 삽입`}
              className={cx(
                "px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all",
                isLight
                  ? "bg-white border-slate-200 text-slate-700 hover:border-primary/40 hover:text-primary hover:bg-primary/5"
                  : "bg-surface/50 border-line/30 text-txt2 hover:border-primary/40 hover:text-primary hover:bg-primary/10"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Editor area ─────────────────────────────── */}
      <div
        className={cx(
          "rounded-2xl border overflow-hidden",
          isLight
            ? "border-slate-200 bg-white"
            : "border-line/40 bg-surface/20"
        )}
      >
        <EditorContent
          editor={editor}
          className={cx(
            "tiptap-code-content p-5 min-h-[420px]",
            isLight && "tiptap-code-content--light"
          )}
        />
      </div>

      {/* ── Debug panel ─────────────────────────────── */}
      {debugMode !== "none" && (
        <div
          className={cx(
            "rounded-2xl border overflow-hidden",
            isLight ? "border-slate-200" : "border-line/40"
          )}
        >
          <div
            className={cx(
              "flex items-center gap-2 px-4 py-2 border-b text-xs",
              isLight
                ? "bg-slate-50 border-slate-200 text-slate-500"
                : "bg-surface2/50 border-line/30 text-txt3"
            )}
          >
            {debugMode === "html" ? (
              <FileText size={12} />
            ) : (
              <FileJson size={12} />
            )}
            <span className="font-medium text-txt2">
              {debugMode.toUpperCase()} 출력
            </span>
            <span>실시간 업데이트</span>
          </div>
          <pre
            className={cx(
              "p-4 text-xs font-mono leading-relaxed overflow-auto max-h-[360px]",
              isLight
                ? "bg-white text-slate-700"
                : "bg-surface/30 text-txt2"
            )}
          >
            {debugMode === "html"
              ? editor.getHTML()
              : JSON.stringify(editor.getJSON(), null, 2)}
          </pre>
        </div>
      )}

      <p className="text-[11px] text-txt3">
        TipTap v3 · CodeBlockLowlight · lowlight (highlight.js) ·{" "}
        {ALL_LANGS.length}개 언어 지원 · localStorage 자동 저장
      </p>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function ToolBtn({
  active,
  onClick,
  title,
  isLight,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  isLight: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cx(
        "min-w-[28px] h-7 px-2 rounded-lg text-sm transition-all",
        active
          ? "bg-primary/20 text-primary shadow-[inset_0_0_0_1px_rgb(var(--primary)/0.3)]"
          : isLight
            ? "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            : "text-txt2 hover:text-txt hover:bg-surface2"
      )}
    >
      {children}
    </button>
  );
}

function Sep({ isLight }: { isLight: boolean }) {
  return (
    <div
      className={cx("w-px h-4 mx-0.5", isLight ? "bg-slate-200" : "bg-line/50")}
    />
  );
}

function EditorSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-10 rounded-xl shimmer" />
      <div className="h-16 rounded-xl shimmer" />
      <div className="h-96 rounded-xl shimmer" />
    </div>
  );
}
