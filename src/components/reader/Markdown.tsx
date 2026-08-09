import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';

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
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{ pre: CodeBlock }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
