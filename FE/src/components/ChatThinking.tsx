import { Mascot } from './Mascot';

/** Assistant-side typing bubble; the loading message is for screen readers only. */
export function ChatThinking() {
  return <div role="status" aria-label="답변 준비 중" className="flex items-end gap-2.5 py-2">
    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f5efe3]">
      <Mascot className="size-7" />
    </span>
    <div aria-hidden="true" className="flex h-12 items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-5 shadow-sm">
      {[0, 1, 2].map(index => <span key={index} className="chat-thinking-dot size-2 rounded-full bg-primary/60" style={{ animationDelay: `${index * 160}ms` }} />)}
    </div>
  </div>;
}
