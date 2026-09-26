import { Fragment, type ReactNode } from 'react';
import { Clock3 } from 'lucide-react';
import { TIMESTAMP_RE, dispatchSeek, parseTimestamp, useVideoScope } from '../../lib/videoSeek';

interface RichTextProps {
  /** Raw prose — captions, summaries, anything not rendered as markdown. */
  text: string;
  /** Override the surrounding video scope (rarely needed). */
  seekScope?: string;
  /** Fired after a timestamp chip is tapped — e.g. to open the reader. */
  onSeek?: (seconds: number) => void;
  className?: string;
}

/**
 * Plain prose, with one enrichment: `02:15` and `1:04:30` become chapter chips
 * that drive the video player owning the surrounding scope. Outside a scope the
 * timestamps stay inert text, so a stray "6:30 tomorrow" never grows a button.
 */
export default function RichText({ text, seekScope, onSeek, className }: RichTextProps) {
  const contextScope = useVideoScope();
  const scope = seekScope ?? contextScope;

  if (!text) return null;
  if (scope === 'none') return <span className={className}>{text}</span>;

  return <span className={className}>{renderWithTimestamps(text, scope, onSeek)}</span>;
}

export function renderWithTimestamps(
  text: string,
  scope: string,
  onSeek?: (seconds: number) => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  // A fresh RegExp per call — TIMESTAMP_RE is global and carries lastIndex.
  const re = new RegExp(TIMESTAMP_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const seconds = parseTimestamp(match[1]);
    if (seconds === null) continue;

    if (match.index > cursor) nodes.push(<Fragment key={key++}>{text.slice(cursor, match.index)}</Fragment>);
    nodes.push(
      <button
        key={key++}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          dispatchSeek(seconds, scope);
          onSeek?.(seconds);
        }}
        title={`Jump to ${match[1]}`}
        className="inline-flex items-center gap-1 align-baseline rounded-md bg-gold-500/15 px-1.5 py-[1px] font-mono text-[0.92em] font-semibold text-gold-700 hover:bg-gold-500/25 hover:text-gold-800 active:scale-95 transition-all"
      >
        <Clock3 size={11} className="shrink-0" />
        {match[1]}
      </button>,
    );
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) nodes.push(<Fragment key={key++}>{text.slice(cursor)}</Fragment>);
  return nodes;
}
