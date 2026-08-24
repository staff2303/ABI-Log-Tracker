interface ImportProgressProps {
  progress: number;
}

const stages = ["File Stream", "Carry Buffer", "Decode Count"];

export function ImportProgress({ progress }: ImportProgressProps) {
  return (
    <div className="border border-abi-line bg-abi-black p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-abi-text">Progress</span>
        <span className="font-mono text-abi-lime">{Math.min(100, Math.round(progress))}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden bg-abi-panel2">
        <div className="h-full bg-abi-lime transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {stages.map((stage, index) => {
          const active = progress >= index * 34;
          return (
            <div
              key={stage}
              className={`border px-2 py-1.5 text-[11px] ${
                active ? "border-abi-olive bg-abi-olive/10 text-abi-lime" : "border-abi-line text-abi-muted"
              }`}
            >
              {stage}
            </div>
          );
        })}
      </div>
    </div>
  );
}
