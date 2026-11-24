export function Toast({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      role="status"
      className="fixed bottom-28 left-1/2 z-50 w-[min(100%-2rem,380px)] -translate-x-1/2 rounded-2xl bg-primary-dark px-4 py-3 text-center text-[14px] font-medium text-white shadow-lg"
    >
      {message}
    </div>
  );
}
