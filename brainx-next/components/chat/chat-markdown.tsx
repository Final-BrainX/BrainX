import { type ReactNode } from "react";
import { cx } from "@/lib/utils";

function safeMarkdownHref(href: string) {
  if (href.startsWith("/")) return href;
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenPattern =
    /(\*\*[^*\n]+?\*\*|~~[^~\n]+?~~|`[^`\n]+?`|\[([^\]\n]+)\]\(([^)\s]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = tokenPattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    const token = match[0];
    const key = `${keyPrefix}-inline-${index++}`;
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key}>
          {renderInlineMarkdown(token.slice(2, -2), key)}
        </strong>,
      );
    } else if (token.startsWith("~~")) {
      nodes.push(
        <s key={key}>{renderInlineMarkdown(token.slice(2, -2), key)}</s>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-surface2/70 px-1 py-0.5 text-[12px] text-accent"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const href = safeMarkdownHref(match[3] ?? "");
      nodes.push(
        href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {renderInlineMarkdown(match[2] ?? "", key)}
          </a>
        ) : (
          token
        ),
      );
    }

    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function MarkdownLine({ text, id }: { text: string; id: string }) {
  return <>{renderInlineMarkdown(text, id)}</>;
}

export function AiMarkdownMessage({
  text,
  streaming,
}: {
  text: string;
  streaming?: boolean;
}) {
  const blocks: ReactNode[] = [];
  const paragraph: string[] = [];
  const listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const key = `p-${blocks.length}`;
    blocks.push(
      <p
        key={key}
        className="whitespace-normal text-[16.5px] leading-[1.75] text-txt2"
      >
        {paragraph.map((line, index) => (
          <span key={`${key}-${index}`}>
            {index > 0 && <br />}
            <MarkdownLine text={line} id={`${key}-${index}`} />
          </span>
        ))}
      </p>,
    );
    paragraph.length = 0;
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) return;
    const key = `list-${blocks.length}`;
    const Tag = listType === "ul" ? "ul" : "ol";
    blocks.push(
      <Tag
        key={key}
        className="ml-4 space-y-1 pl-1 text-[16px] leading-7 text-txt2 marker:text-txt3"
      >
        {listItems.map((item, index) => (
          <li
            key={`${key}-${index}`}
            className={listType === "ul" ? "list-disc" : "list-decimal"}
          >
            <MarkdownLine text={item} id={`${key}-${index}`} />
          </li>
        ))}
      </Tag>,
    );
    listItems.length = 0;
    listType = null;
  };

  text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        flushList();
        return;
      }

      const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
      if (heading) {
        flushParagraph();
        flushList();
        blocks.push(
          <p key={`h-${blocks.length}`} className="font-semibold text-txt">
            <MarkdownLine text={heading[2]} id={`h-${blocks.length}`} />
          </p>,
        );
        return;
      }

      const quote = /^>\s+(.+)$/.exec(trimmed);
      if (quote) {
        flushParagraph();
        flushList();
        blocks.push(
          <blockquote
            key={`q-${blocks.length}`}
            className="border-l-2 border-line/70 pl-2 text-txt3"
          >
            <MarkdownLine text={quote[1]} id={`q-${blocks.length}`} />
          </blockquote>,
        );
        return;
      }

      const unordered = /^[-*]\s+(.+)$/.exec(trimmed);
      if (unordered) {
        flushParagraph();
        if (listType && listType !== "ul") flushList();
        listType = "ul";
        listItems.push(unordered[1]);
        return;
      }

      const ordered = /^\d+\.\s+(.+)$/.exec(trimmed);
      if (ordered) {
        flushParagraph();
        if (listType && listType !== "ol") flushList();
        listType = "ol";
        listItems.push(ordered[1]);
        return;
      }

      flushList();
      paragraph.push(line.trimEnd());
    });

  flushParagraph();
  flushList();

  return (
    <div
      className={cx("space-y-2 break-words", streaming ? "stream-caret" : "")}
    >
      {blocks.length > 0 ? blocks : <span>&nbsp;</span>}
    </div>
  );
}
