"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  compact?: boolean;
}

export function MarkdownPreview({
  content,
  className,
  compact = false,
}: MarkdownPreviewProps) {
  if (!content.trim()) return null;

  return (
    <div
      className={cn(
        "markdown-preview max-w-none break-words text-muted",
        compact ? "text-xs" : "text-sm",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 mt-3 text-base font-semibold text-foreground first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-3 text-sm font-semibold text-foreground first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 mt-2 text-sm font-medium text-foreground first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-muted">{children}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-700 underline hover:text-cyan-600 dark:text-cyan-300 dark:hover:text-cyan-200"
            >
              {children}
            </a>
          ),
          code: ({ className: codeClass, children }) => {
            const isBlock = Boolean(codeClass);
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-lg bg-surface p-3 font-mono text-[11px] text-cyan-800 dark:text-cyan-100">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] text-cyan-800 dark:text-cyan-200">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-lg bg-surface last:mb-0">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-violet-500/40 pl-3 text-muted-soft last:mb-0">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto last:mb-0">
              <table className="w-full min-w-[280px] border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-border text-foreground">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-2 py-1.5 font-medium">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-t border-border px-2 py-1.5 align-top">{children}</td>
          ),
          hr: () => <hr className="my-3 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
