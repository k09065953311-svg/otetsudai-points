// おうちギルドのデータの形。Firestore とお試しモードの両方で同じ形を使う。

export type Role = "parent" | "kid";

/** 家族の一人（冒険者 or ギルドマスター） */
export interface Profile {
  id: string;
  name: string;
  role: Role;
  /** 子どものみ: 学年の表示用 (例: "中2") */
  grade?: string;
  color: string;
  /** 今持っている G（交換で減る） */
  coins: number;
  /** これまでに稼いだ G の合計（ランク用。交換しても減らない） */
  total: number;
}

export const QUEST_CATEGORIES = ["手伝い", "勉強", "運動"] as const;
export type QuestCategory = (typeof QUEST_CATEGORIES)[number];

export interface Quest {
  id: string;
  title: string;
  category: QuestCategory;
  reward: number;
  /** 1日に報告できる回数。null は上限なし */
  dailyLimit: number | null;
  /** 表示する子どもの id。空配列なら全員 */
  visibleTo: string[];
  archived?: boolean;
}

export interface Reward {
  id: string;
  title: string;
  price: number;
  note: string;
  /** 1週間に交換できる回数。null は上限なし */
  weeklyLimit: number | null;
  archived?: boolean;
  /** みんなのごほうび: 3人が少しずつ入金して、満額になったら交換できる */
  shared?: boolean;
}

/** みんなのごほうび1つぶんの貯金箱。入れた G は戻せず、そのごほうびの交換にだけ使える */
export interface Pot {
  /** 今入っている G */
  balance: number;
  /** 子どもごとの、今回入れた G */
  deposits: Record<string, number>;
}

/** みんなのごほうびの貯金箱（ごほうびの id ごと） */
export interface Vault {
  pots: Record<string, Pot>;
}

/** 緊急クエスト（時限ミッション）。同時に1つだけ */
export interface UrgentQuest {
  id: string;
  title: string;
  reward: number;
  /** 締め切り (ミリ秒) */
  deadline: number;
  issuedBy: string;
  /** 受注した子どもの id。先着1名 */
  takenBy: string | null;
  /** 承認済みなら true */
  done: boolean;
}

/** deposit = みんなのごほうびへの入金 / vaultShop = 満額になったみんなのごほうびの交換 */
export type EntryKind = "quest" | "urgent" | "shop" | "bonus" | "deposit" | "vaultShop";
export type EntryStatus = "wait" | "ok" | "back";

/** 報告・交換・ボーナスの記録。G の増減はすべてこの記録の承認で起きる */
export interface Entry {
  id: string;
  profileId: string;
  kind: EntryKind;
  /** クエスト / ごほうび / 緊急クエストの id */
  refId: string | null;
  title: string;
  value: number;
  status: EntryStatus;
  createdAt: number;
  decidedAt: number | null;
  decidedBy: string | null;
  comment: string | null;
  /** みんなのごほうびを交換したとき、誰がいくら入れていたか（取り消しで戻すため） */
  contributions?: Record<string, number> | null;
  /** 親が承認を取り消した時刻（取り消していなければ無し） */
  revokedAt?: number | null;
}

/** タイトル画面のキャラ画像（data URL）。未設定ならシルエットを表示する */
export interface GuildArt {
  /** ギルドマスター（父） */
  master: string | null;
  /** ギルドの受付（母） */
  okami: string | null;
}

export interface FamilyState {
  profiles: Profile[];
  quests: Quest[];
  rewards: Reward[];
  entries: Entry[];
  urgent: UrgentQuest | null;
  art?: GuildArt | null;
  vault?: Vault | null;
}
