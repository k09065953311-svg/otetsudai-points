import type { GuildArt } from "../domain/types";

export type ArtSlot = keyof GuildArt;

export const ART_ROLES: Record<ArtSlot, { title: string; parent: string }> = {
  master: { title: "ギルドマスター", parent: "papa" },
  okami: { title: "ギルドの受付", parent: "mama" }
};

/** アーチ型の額縁に入ったキャラ。画像が未設定なら、それぞれの役のシルエットを出す */
export function Portrait({ slot, src, size = "lg" }: { slot: ArtSlot; src: string | null | undefined; size?: "lg" | "sm" }) {
  return (
    <div className={`portrait portrait-${size} portrait-${slot}`}>
      {src ? <img src={src} alt={ART_ROLES[slot].title} /> : slot === "master" ? <MasterShadow /> : <OkamiShadow />}
    </div>
  );
}

// 未設定のときの「謎めいた」シルエット。輪郭だけ真鍮色に光らせる
const RIM = { fill: "#0b1022", stroke: "var(--brass)", strokeWidth: 1.4, strokeOpacity: 0.75 } as const;

function MasterShadow() {
  return (
    <svg viewBox="0 0 120 160" role="img" aria-label="ギルドマスター（画像未設定）">
      <defs>
        <radialGradient id="pm-glow" cx="50%" cy="38%" r="60%">
          <stop offset="0" stopColor="#e0b354" stopOpacity=".28" />
          <stop offset="1" stopColor="#e0b354" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="120" height="160" fill="url(#pm-glow)" />
      {/* マント・肩当て */}
      <path {...RIM} d="M4 160 C6 124 22 106 44 100 L60 108 L76 100 C98 106 114 124 116 160 Z" />
      <path {...RIM} d="M14 122 C18 106 32 98 46 99 C40 108 34 118 30 130 Z" />
      <path {...RIM} d="M106 122 C102 106 88 98 74 99 C80 108 86 118 90 130 Z" />
      {/* 首 */}
      <path {...RIM} d="M50 86 L50 102 L60 108 L70 102 L70 86 Z" />
      {/* 頭・短い髪 */}
      <path {...RIM} d="M38 58 C38 40 48 32 60 32 C72 32 82 40 82 58 C82 74 74 88 60 90 C46 88 38 74 38 58 Z" />
      <path {...RIM} d="M36 56 C34 38 46 26 60 26 C76 26 88 38 84 58 C80 48 76 44 70 42 C64 46 52 46 44 42 C40 46 38 50 36 56 Z" />
      {/* あごひげ */}
      <path {...RIM} d="M44 72 C46 84 52 92 60 93 C68 92 74 84 76 72 C70 80 66 82 60 82 C54 82 50 80 44 72 Z" />
      {/* 留め金 */}
      <circle cx="60" cy="114" r="5" fill="var(--brass)" />
      <circle cx="60" cy="114" r="2" fill="#0b1022" />
    </svg>
  );
}

function OkamiShadow() {
  return (
    <svg viewBox="0 0 120 160" role="img" aria-label="ギルドの受付（画像未設定）">
      <defs>
        <radialGradient id="po-glow" cx="50%" cy="38%" r="60%">
          <stop offset="0" stopColor="#ff9a6a" stopOpacity=".25" />
          <stop offset="1" stopColor="#ff9a6a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="120" height="160" fill="url(#po-glow)" />
      {/* 肩・ブラウス */}
      <path {...RIM} d="M10 160 C12 128 28 110 48 104 L60 112 L72 104 C92 110 108 128 110 160 Z" />
      {/* エプロンの肩ひも */}
      <path d="M40 108 L46 160 M80 108 L74 160" stroke="var(--brass)" strokeOpacity=".6" strokeWidth="3" fill="none" />
      {/* スカーフ */}
      <path {...RIM} d="M46 100 C52 108 68 108 74 100 L68 118 L60 112 L52 118 Z" />
      {/* 首 */}
      <path {...RIM} d="M52 86 L52 102 L60 106 L68 102 L68 86 Z" />
      {/* 頭 */}
      <path {...RIM} d="M40 60 C40 42 49 34 60 34 C71 34 80 42 80 60 C80 76 72 88 60 89 C48 88 40 76 40 60 Z" />
      {/* 前髪・横髪 */}
      <path {...RIM} d="M37 70 C32 46 44 30 60 30 C76 30 88 46 83 70 C82 58 78 50 72 46 C64 52 52 52 46 46 C42 52 38 60 37 70 Z" />
      {/* おだんご＋かんざし */}
      <circle {...RIM} cx="60" cy="24" r="12" />
      <path d="M44 14 L80 30" stroke="var(--brass)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="80" cy="30" r="3" fill="var(--brass)" />
    </svg>
  );
}
