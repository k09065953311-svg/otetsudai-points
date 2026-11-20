import { useEffect, useMemo } from "react";
import { availableCoins, rankOf, urgentIsOpen } from "../../domain/rules";
import type { FamilyState } from "../../domain/types";
import { ART_ROLES, Portrait, type ArtSlot } from "../Portrait";

interface Line {
  who: ArtSlot;
  text: string;
}

/** その時の状況に合わせた、ギルドマスターか受付のひと言 */
export function greeting(state: FamilyState, me: string, now: number): Line {
  const kid = state.profiles.find((p) => p.id === me);
  const name = kid?.name ?? "冒険者";
  if (urgentIsOpen(state.urgent, now)) {
    return { who: "master", text: `緊急クエストだ！「${state.urgent.title}」先着1名、急げ ${name}！` };
  }
  const mine = state.entries.filter((e) => e.profileId === me);
  const praised = mine
    .filter((e) => e.status === "ok" && e.kind !== "shop" && e.decidedAt !== null && now - e.decidedAt < 12 * 3600_000)
    .sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0))[0];
  if (praised) return { who: "master", text: `「${praised.title}」、見事だった。報酬 ${praised.value} G を受け取れ！` };
  const waiting = mine.filter((e) => e.status === "wait" && e.kind !== "shop").length;
  if (waiting > 0) return { who: "okami", text: `報告${waiting}件、たしかにお預かりしています。承認までもう少しお待ちくださいね` };
  const hour = new Date(now).getHours();
  if (hour >= 21 || hour < 5) return { who: "master", text: `もう夜も遅い。明日に備えて休むのも、冒険者の大事な仕事だぞ` };
  if (hour < 10) return { who: "okami", text: `おはようございます、${name}さん！ 今日の依頼も掲示板に貼り出してありますよ` };
  if (hour >= 17) return { who: "okami", text: `おかえりなさい、${name}さん。夕飯の前に、ひと仕事いかがですか？` };
  const r = kid ? rankOf(kid.total).rank : "F";
  return { who: "master", text: `よく来たな、${name}。${r}ランクの腕前、見せてもらおうか` };
}

export function TitleScreen({ state, me, now, onStart }: { state: FamilyState; me: string; now: number; onStart(): void }) {
  const kid = state.profiles.find((p) => p.id === me);
  // 開いた瞬間のひと言で固定する（1秒ごとに変わらないように）
  const line = useMemo(() => greeting(state, me, now), [me]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Enter" && onStart();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart]);
  const art = state.art ?? null;
  const hour = new Date(now).getHours();
  const time = hour >= 18 || hour < 5 ? "night" : hour >= 16 ? "dusk" : "day";

  return (
    <section className="title" data-time={time} aria-label="タイトル画面" onClick={onStart}>
      <div className="title-hero" aria-hidden="true" />
      <div className="title-lamps" aria-hidden="true" />
      <div className="title-dust" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.9) % 7}s`, animationDuration: `${7 + (i % 4)}s` }} />
        ))}
      </div>

      <header className="title-logo">
        <span className="title-kicker">ADVENTURERS' GUILD</span>
        <h1>おうちギルド</h1>
        <span className="title-sub">― 冒険者ギルド本部 ―</span>
      </header>

      <div className="title-cast">
        {(["master", "okami"] as const).map((slot) => (
          <figure key={slot} className={`cast cast-${slot}${line.who === slot ? " speaking" : ""}`}>
            <Portrait slot={slot} src={art?.[slot]} />
            <figcaption>{ART_ROLES[slot].title}</figcaption>
          </figure>
        ))}
      </div>

      <p className={`bubble bubble-${line.who}`} role="status">
        <b>{ART_ROLES[line.who].title}</b>
        {line.text}
      </p>

      <div className="title-foot">
        {kid && (
          <span className="title-me">
            冒険者 {kid.name}・{rankOf(kid.total).rank}ランク・{availableCoins(state, me).toLocaleString()} G
          </span>
        )}
        <button
          type="button"
          className="btn btn-gold title-start"
          onClick={(e) => {
            e.stopPropagation();
            onStart();
          }}
        >
          冒険に出る
        </button>
      </div>
    </section>
  );
}
