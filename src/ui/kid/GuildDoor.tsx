import { useEffect } from "react";

/** 「冒険に出る」を押したとき、ギルドの扉が左右に開いて中に入る演出（約1秒） */
export function GuildDoor({ onDone }: { onDone(): void }) {
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onDone, reduce ? 0 : 1300);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="door" aria-hidden="true">
      <div className="door-half door-l">
        <i />
      </div>
      <div className="door-half door-r">
        <i />
      </div>
    </div>
  );
}
