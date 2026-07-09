const BLOCKED_TAGS = new Set([
  "script",
  "style",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "select",
]);

const ALLOWED_TAGS = new Set([
  "a",
  "article",
  "blockquote",
  "br",
  "code",
  "details",
  "div",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "iframe",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "span",
  "strong",
  "summary",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);

const URL_ATTRS = new Set(["href", "src"]);
const STYLE_ALLOWED_PROPERTIES = new Set([
  "flex",
  "flex-basis",
  "width",
  "min-width",
  "max-width",
  "text-align",
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isAllowedAttribute(tagName: string, attrName: string): boolean {
  if (attrName === "class" || attrName === "title" || attrName === "alt") return true;
  if (attrName === "open" && tagName === "details") return true;
  if (attrName === "target" || attrName === "rel") return tagName === "a";
  if (attrName === "sandbox") return tagName === "iframe";
  if (attrName === "style") return tagName === "div" || tagName === "span";
  if (attrName === "colspan" || attrName === "rowspan") return tagName === "td" || tagName === "th";
  if (attrName.startsWith("aria-") || attrName.startsWith("data-")) return true;
  return URL_ATTRS.has(attrName);
}

function sanitizeStyle(styleValue: string): string {
  const safeDeclarations: string[] = [];

  for (const declaration of styleValue.split(";")) {
    const [rawProperty, ...rawValueParts] = declaration.split(":");
    if (!rawProperty || rawValueParts.length === 0) continue;

    const property = rawProperty.trim().toLowerCase();
    if (!STYLE_ALLOWED_PROPERTIES.has(property)) continue;

    const value = rawValueParts.join(":").trim();
    if (!value) continue;

    const loweredValue = value.toLowerCase();
    if (
      loweredValue.includes("expression(") ||
      loweredValue.includes("javascript:") ||
      loweredValue.includes("url(")
    ) {
      continue;
    }

    safeDeclarations.push(`${property}: ${value}`);
  }

  return safeDeclarations.join("; ");
}

function sanitizeUrl(value: string, tagName: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  if (
    lowered.startsWith("javascript:") ||
    lowered.startsWith("vbscript:") ||
    lowered.startsWith("data:text/html") ||
    lowered.startsWith("data:application")
  ) {
    return null;
  }

  if (lowered.startsWith("data:")) {
    return tagName === "img" && lowered.startsWith("data:image/") ? trimmed : null;
  }

  if (
    lowered.startsWith("http://") ||
    lowered.startsWith("https://") ||
    lowered.startsWith("mailto:") ||
    lowered.startsWith("tel:") ||
    lowered.startsWith("/") ||
    lowered.startsWith("./") ||
    lowered.startsWith("../") ||
    lowered.startsWith("#")
  ) {
    return trimmed;
  }

  return null;
}

function unwrapElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function sanitizeElement(element: Element) {
  const tagName = element.tagName.toLowerCase();

  if (BLOCKED_TAGS.has(tagName)) {
    element.remove();
    return;
  }

  if (!ALLOWED_TAGS.has(tagName)) {
    unwrapElement(element);
    return;
  }

  for (const attr of [...element.attributes]) {
    const attrName = attr.name.toLowerCase();

    if (attrName.startsWith("on") || !isAllowedAttribute(tagName, attrName)) {
      element.removeAttribute(attr.name);
      continue;
    }

    if (attrName === "style") {
      const sanitizedStyle = sanitizeStyle(attr.value);
      if (sanitizedStyle) {
        element.setAttribute("style", sanitizedStyle);
      } else {
        element.removeAttribute(attr.name);
      }
      continue;
    }

    if (URL_ATTRS.has(attrName)) {
      const sanitizedUrl = sanitizeUrl(attr.value, tagName);
      if (sanitizedUrl) {
        element.setAttribute(attr.name, sanitizedUrl);
      } else {
        element.removeAttribute(attr.name);
      }
    }
  }

  if (tagName === "a") {
    const href = element.getAttribute("href");
    if (!href) {
      unwrapElement(element);
      return;
    }

    if (element.getAttribute("target") === "_blank") {
      element.setAttribute("rel", "noreferrer noopener");
    }
  }

  if (tagName === "iframe") {
    const src = element.getAttribute("src");
    if (!src) {
      element.remove();
      return;
    }
    element.setAttribute("sandbox", "allow-same-origin allow-scripts allow-popups");
  }

  for (const child of [...element.children]) {
    sanitizeElement(child);
  }
}

export function sanitizeHtml(html: string): string {
  if (!html) return "";

  if (typeof DOMParser === "undefined") {
    return escapeHtml(html);
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(`<body>${html}</body>`, "text/html");
  const body = document.body;

  for (const child of [...body.children]) {
    sanitizeElement(child);
  }

  return body.innerHTML;
}
