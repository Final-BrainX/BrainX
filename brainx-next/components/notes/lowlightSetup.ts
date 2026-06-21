import { createLowlight } from "lowlight";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import java from "highlight.js/lib/languages/java";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import sql from "highlight.js/lib/languages/sql";
import bash from "highlight.js/lib/languages/bash";
import markdown from "highlight.js/lib/languages/markdown";

/** 노트 코드블록 하이라이팅. 예전에는 `createLowlight(all)`로 highlight.js가 지원하는 약
    190개 언어 그래머를 전부 한 번에 로딩했다(/notes 진입 즉시) — 실제로 자주 쓰는 언어는
    소수라 대부분 낭비였다. 우선 자주 쓰는 9종만 즉시 등록하고, 나머지는 `ensureLanguageRegistered`로
    실제 선택되는 순간에만 불러온다. "xml"은 highlight.js 내부적으로 "html"의 별칭 그래머라
    드롭다운의 HTML도 함께 커버된다. */
export const lowlight = createLowlight();
lowlight.register({ javascript, typescript, java, json, xml, css, sql, bash, markdown });
// "html" id로 선택했을 때도 바로 registered()가 true가 되도록 lowlight 자체 registry에도 등록.
lowlight.register("html", xml);

/** CodeBlockView의 언어 드롭다운(ALL_LANGS) 기준 — 위 9종 + html 외 나머지 언어의 지연 로더.
    각 항목을 리터럴 경로로 import()해서 번들러가 언어별로 정확히 쪼갤 수 있게 한다(템플릿
    문자열 동적 경로는 webpack/turbopack이 해당 폴더 전체를 한 청크로 묶어버려 분할 효과가
    없어진다). "toml"/"latex" 등 highlight.js에 그래머가 없는 언어는 목록에 없으며, 그 경우
    lowlight-plugin이 자동으로 highlightAuto로 폴백한다(기존 `all` 사용 시에도 toml은 원래
    지원되지 않았어서 동작 차이 없음). */
const LANGUAGE_LOADERS: Record<string, () => Promise<{ default: Parameters<typeof lowlight.register>[1] }>> = {
  scss: () => import("highlight.js/lib/languages/scss"),
  graphql: () => import("highlight.js/lib/languages/graphql"),
  python: () => import("highlight.js/lib/languages/python"),
  go: () => import("highlight.js/lib/languages/go"),
  rust: () => import("highlight.js/lib/languages/rust"),
  c: () => import("highlight.js/lib/languages/c"),
  cpp: () => import("highlight.js/lib/languages/cpp"),
  csharp: () => import("highlight.js/lib/languages/csharp"),
  php: () => import("highlight.js/lib/languages/php"),
  ruby: () => import("highlight.js/lib/languages/ruby"),
  kotlin: () => import("highlight.js/lib/languages/kotlin"),
  swift: () => import("highlight.js/lib/languages/swift"),
  scala: () => import("highlight.js/lib/languages/scala"),
  dart: () => import("highlight.js/lib/languages/dart"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  shell: () => import("highlight.js/lib/languages/shell"),
  dockerfile: () => import("highlight.js/lib/languages/dockerfile"),
  latex: () => import("highlight.js/lib/languages/latex"),
  r: () => import("highlight.js/lib/languages/r"),
  lua: () => import("highlight.js/lib/languages/lua"),
};

const pendingLoads = new Set<string>();

/** 코드블록 언어 드롭다운에서 위 기본 9종 밖의 언어를 고르는 순간 호출한다. 등록 전까지는
    lowlight-plugin이 이미 가진 highlightAuto 폴백이 그대로 동작하므로(에러 없음) 등록이
    끝날 때까지 코드가 깨지거나 비어 보이는 일은 없다 — 등록이 끝나면 onRegistered로 정확한
    하이라이팅을 강제로 다시 적용한다. */
export function ensureLanguageRegistered(id: string, onRegistered?: () => void) {
  if (!id || lowlight.registered(id) || pendingLoads.has(id)) return;
  const load = LANGUAGE_LOADERS[id];
  if (!load) return;
  pendingLoads.add(id);
  load()
    .then((mod) => {
      if (!lowlight.registered(id)) lowlight.register(id, mod.default);
      onRegistered?.();
    })
    .catch(() => {
      // 해당 언어 그래머를 불러오지 못해도 highlightAuto 폴백이 있어 화면이 깨지지 않는다.
    })
    .finally(() => pendingLoads.delete(id));
}
