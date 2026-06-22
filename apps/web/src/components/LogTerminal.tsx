import { useEffect, useRef } from "react";

interface LogTerminalProps {
  logs: string[];
}

export function LogTerminal({ logs }: LogTerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="terminal-log">
      {logs.length === 0 ? (
        <span className="text-zinc-500">Waiting for logs...</span>
      ) : (
        logs.map((log, i) => (
          <div key={i} className="leading-relaxed">
            <span className="text-zinc-600 mr-2">~</span>
            {log}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
