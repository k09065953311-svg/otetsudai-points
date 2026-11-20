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

export type QuestCategory = "手伝い" | "勉強" | "生活";

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

export type EntryKind = "quest" | "urgent" | "shop" | "bonus";
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
}

export interface FamilyState {
  profiles: Profile[];
  quests: Quest[];
  rewards: Reward[];
  entries: Entry[];
  urgent: UrgentQuest | null;
}
