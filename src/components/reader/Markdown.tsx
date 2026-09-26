import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import { renderWithTimestamps } from '../common/RichText';
import { useVideoScope } from '../../lib/videoSeek';

/**
 * Walk rendered markdown children and turn every `mm:ss` / `h:mm:ss` run into a
 * chapter chip bound to `scope`. Element children are left untouched — code,
 * math and links keep their own rendering.
 */
function withTimestamps(children: React.ReactNode, scope: string): React.ReactNode {
  if (scope === 'none') return children;
  if (typeof children === 'string') return renderWithTimestamps(children, scope);
  if (Array.isArray(children)) {
    return children.map((child, idx) => (
      <React.Fragment key={idx}>{withTimestamps(child, scope)}</React.Fragment>
    ));
  }
  return children;
}

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const extractText = (node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (node && typeof node === 'object' && 'props' in node) {
      const el = node as React.ReactElement<{ children?: React.ReactNode }>;
      return extractText(el.props.children);
    }
    return '';
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(extractText(children));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="relative group/code my-5">
      <div className="absolute right-2.5 top-2.5 z-10">
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-parchment/10 hover:bg-parchment/20 border border-parchment/15 text-sand-200 text-[11px] font-medium px-2.5 py-1.5 backdrop-blur transition-colors"
        >
          {copied ? <Check size={12} className="text-neem-300" /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto !my-0">{children}</pre>
    </div>
  );
}

export default function Markdown({ source }: { source: string }) {
  const scope = useVideoScope();

  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          pre: CodeBlock,
          p: ({ children }) => <p>{withTimestamps(children, scope)}</p>,
          li: ({ children }) => <li>{withTimestamps(children, scope)}</li>,
          h2: ({ children }) => <h2>{withTimestamps(children, scope)}</h2>,
          h3: ({ children }) => <h3>{withTimestamps(children, scope)}</h3>,
          td: ({ children }) => <td>{withTimestamps(children, scope)}</td>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
