export function Disclaimer({ text }: { text: string }) {
  return (
    <p className="px-4 text-center text-[12px] leading-relaxed text-muted">
      {text}
    </p>
  );
}
