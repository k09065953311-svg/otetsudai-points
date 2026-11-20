import { useState, type ReactNode } from "react";
import { newId, type GuildStore } from "../../data/store";
import {
  approve,
  cancelUrgent,
  giveBonus,
  issueUrgent,
  pendingEntries,
  rankOf,
  saveQuest,
  saveReward,
  sendBack
} from "../../domain/rules";
import type { Entry, FamilyState, Quest, QuestCategory, Reward } from "../../domain/types";
import { Crest, Empty, EntryRow, Section, Tabs, UrgentPanel, timeLabel, useFeedback, useGuildState, useNow } from "../common";

type Tab = "check" | "kids" | "urgent" | "settings";

interface Slots {
  /** 冒険者タブの下に出す追加の内容（Firebase モードの「スマホの登録」など） */
  kidsExtra?: ReactNode;
  /** 設定タブの下に出す追加の内容（ログアウトなど） */
  settingsExtra?: ReactNode;
}

export function ParentApp({ store, me, kidsExtra, settingsExtra }: { store: GuildStore; me: string } & Slots) {
  const state = useGuildState(store);
  const now = useNow();
  const [tab, setTab] = useState<Tab>("check");
  const pending = pendingEntries(state).length;
  const props = { store, state, me, now };
  return (
    <>
      <main className="view">
        {tab === "check" && <Check {...props} />}
        {tab === "kids" && <Kids {...props} extra={kidsExtra} />}
        {tab === "urgent" && <Urgent {...props} />}
        {tab === "settings" && <Settings {...props} extra={settingsExtra} />}
      </main>
      <Tabs<Tab>
        current={tab}
        onChange={setTab}
        tabs={[
          { key: "check", label: "承認", icon: "check", badge: pending },
          { key: "kids", label: "冒険者", icon: "kids" },
          { key: "urgent", label: "緊急発令", icon: "flag" },
          { key: "settings", label: "設定", icon: "gear" }
        ]}
      />
    </>
  );
}

interface Props {
  store: GuildStore;
  state: FamilyState;
  me: string;
  now: number;
}

function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose(): void }) {
  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h2>{title}</h2>
          <button type="button" className="mini" onClick={onClose}>
            閉じる
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- 承認 ----

function Check({ store, state, me, now }: Props) {
  const fb = useFeedback();
  const [back, setBack] = useState<Entry | null>(null);
  const [comment, setComment] = useState("");
  const list = pendingEntries(state).slice().reverse();
  const quests = list.filter((e) => e.kind === "quest");
  const name = (id: string) => state.profiles.find((p) => p.id === id)?.name ?? "";

  const ok = (e: Entry) =>
    fb.run(
      store,
      (s) => approve(s, e.id, me, Date.now()),
      e.kind === "shop" ? `${name(e.profileId)}に「${e.title}」を渡しました` : `${name(e.profileId)}に ${e.value} G を付与しました`,
      e.kind !== "shop"
    );

  const approveAll = async () => {
    for (const e of quests) {
      if (!(await fb.run(store, (s) => approve(s, e.id, me, Date.now())))) return;
    }
    fb.toast(`${quests.length} 件をまとめて承認しました`);
    fb.celebrate();
  };

  return (
    <>
      <Section title="承認待ち" aside={`${list.length} 件`} />
      {quests.length >= 2 && (
        <button className="btn btn-ghost" onClick={approveAll}>
          クエスト報告 {quests.length} 件をまとめて承認
        </button>
      )}
      <div className="list">
        {list.map((e) => {
          const kid = state.profiles.find((p) => p.id === e.profileId);
          if (!kid) return null;
          const kind = e.kind === "shop" ? "ごほうびの交換申請" : e.kind === "urgent" ? "緊急クエストの達成報告" : "クエストの達成報告";
          return (
            <div className="approve" key={e.id}>
              <div className="head">
                <Crest p={kid} />
                <div>
                  <div style={{ fontWeight: 800 }}>
                    {kid.name}：{e.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                    {kind}・{timeLabel(e.createdAt, now)}・{e.kind === "shop" ? "−" : "+"}
                    {e.value} G
                  </div>
                </div>
              </div>
              <div className="acts">
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setBack(e);
                    setComment(e.kind === "shop" ? "今回は見送り" : "");
                  }}
                >
                  {e.kind === "shop" ? "キャンセル" : "差し戻す"}
                </button>
                <button className="btn btn-gold" onClick={() => ok(e)}>
                  {e.kind === "shop" ? "渡した" : "承認する"}
                </button>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <Empty>承認待ちはありません。冒険者たちの報告を待ちましょう。</Empty>}
      </div>
      {back && (
        <Sheet title={back.kind === "shop" ? "交換をキャンセル" : "差し戻す"} onClose={() => setBack(null)}>
          <div className="form">
            <label htmlFor="back-comment">
              {name(back.profileId)}へのひと言（なくてもOK）
              <input id="back-comment" value={comment} maxLength={40} onChange={(e) => setComment(e.target.value)} placeholder="例：もう少しでOK、もう一回！" />
            </label>
            <div className="seg">
              {["もう少しでOK、もう一回！", "まだ終わってないよ", "今回は見送り"].map((c) => (
                <button key={c} type="button" aria-pressed={comment === c} onClick={() => setComment(c)} style={{ fontSize: 11 }}>
                  {c}
                </button>
              ))}
            </div>
            <button
              className="btn btn-red"
              onClick={async () => {
                const e = back;
                setBack(null);
                await fb.run(
                  store,
                  (s) => sendBack(s, e.id, me, comment, Date.now()),
                  e.kind === "shop" ? "申請をキャンセルし、G を戻しました" : "ひと言を添えて差し戻しました"
                );
              }}
            >
              {back.kind === "shop" ? "キャンセルする" : "差し戻す"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

// ---- 冒険者 ----

function Kids({ store, state, me, now, extra }: Props & { extra?: ReactNode }) {
  const fb = useFeedback();
  const kids = state.profiles.filter((p) => p.role === "kid");
  const [bonusFor, setBonusFor] = useState<string | null>(null);
  const [value, setValue] = useState(20);
  const [reason, setReason] = useState("");
  const recent = state.entries.slice(-40).reverse();
  return (
    <>
      <Section title="冒険者たち" aside="所持 G" />
      <div className="kids">
        {kids.map((k) => (
          <div className="kid" key={k.id}>
            <Crest p={k} />
            <span>
              {k.name}・{k.grade}
            </span>
            <b>{k.coins.toLocaleString()}</b>
            <span>
              {rankOf(k.total).rank}ランク・累計 {k.total.toLocaleString()}
            </span>
            <button className="mini" onClick={() => setBonusFor(k.id)}>
              ボーナス
            </button>
          </div>
        ))}
      </div>
      {extra}
      <Section title="最近の記録" aside={`${recent.length} 件`} />
      <div className="list">
        {recent.map((e) => (
          <EntryRow key={e.id} e={e} state={state} now={now} showName />
        ))}
        {recent.length === 0 && <Empty>まだ記録がありません</Empty>}
      </div>
      {bonusFor && (
        <Sheet title={`${state.profiles.find((p) => p.id === bonusFor)?.name}にボーナス`} onClose={() => setBonusFor(null)}>
          <div className="form">
            <div className="seg">
              {[10, 20, 50, 100].map((v) => (
                <button key={v} type="button" aria-pressed={value === v} onClick={() => setValue(v)}>
                  {v} G
                </button>
              ))}
            </div>
            <label htmlFor="bonus-reason">
              理由（子どもの記録に残ります）
              <input id="bonus-reason" value={reason} maxLength={30} onChange={(e) => setReason(e.target.value)} placeholder="例：弟に優しくできた" />
            </label>
            <button
              className="btn btn-gold"
              onClick={async () => {
                const kid = bonusFor;
                setBonusFor(null);
                if (await fb.run(store, (s) => giveBonus(s, kid, me, value, reason, Date.now(), newId("b")), `ボーナス ${value} G を付けました`, true))
                  setReason("");
              }}
            >
              {value} G を付ける
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

// ---- 緊急クエスト ----

function Urgent({ store, state, me, now }: Props) {
  const fb = useFeedback();
  const [title, setTitle] = useState("寝る前に全員の靴をそろえよ");
  const [reward, setReward] = useState(40);
  const [minutes, setMinutes] = useState(60);
  const u = state.urgent;
  const live = u && !u.done && u.deadline > now;
  return (
    <>
      {u && (
        <UrgentPanel
          urgent={u}
          state={state}
          now={now}
          action={
            live && !u.takenBy && (
              <button className="btn btn-ghost" onClick={() => fb.run(store, (s) => cancelUrgent(s, me), "緊急クエストを取り消しました")}>
                取り消す
              </button>
            )
          }
        />
      )}
      <Section title="緊急クエストを発令" aside="時限ミッション・先着1名" />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          fb.run(store, (s) => issueUrgent(s, me, title, reward, minutes, Date.now(), newId("u")), "緊急クエストを発令しました！");
        }}
      >
        <label htmlFor="u-title">
          依頼内容
          <input id="u-title" value={title} maxLength={30} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="two">
          <label htmlFor="u-reward">
            報酬（G）
            <input id="u-reward" type="number" inputMode="numeric" min={1} max={1000} value={reward} onChange={(e) => setReward(Number(e.target.value))} />
          </label>
          <label htmlFor="u-min">
            制限時間
            <select id="u-min" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              <option value={15}>15分</option>
              <option value={30}>30分</option>
              <option value={60}>1時間</option>
              <option value={120}>2時間</option>
              <option value={180}>3時間</option>
              <option value={untilMidnight(now)}>今日中</option>
            </select>
          </label>
        </div>
        <button className="btn btn-red" type="submit">
          {live ? "新しく発令する（いまの依頼は終了）" : "発令する"}
        </button>
      </form>
      <div className="note">先に達成報告した1人だけが受注できます。差し戻すと、ほかの子がまた受けられます。</div>
    </>
  );
}

function untilMidnight(now: number): number {
  const d = new Date(now);
  d.setHours(23, 59, 0, 0);
  return Math.max(15, Math.round((d.getTime() - now) / 60_000));
}

// ---- 設定 ----

function Settings({ store, state, me, extra }: Props & { extra?: ReactNode }) {
  const fb = useFeedback();
  const [quest, setQuest] = useState<Quest | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const kids = state.profiles.filter((p) => p.role === "kid");
  const quests = state.quests.filter((q) => !q.archived);
  const rewards = state.rewards.filter((r) => !r.archived).sort((a, b) => a.price - b.price);

  return (
    <>
      <Section title="クエスト" aside={`${quests.length} 件`} />
      <div className="rowlist">
        {quests.map((q) => (
          <div className="rowitem" key={q.id}>
            <div className="grow">
              <div className="t">{q.title}</div>
              <div className="s">
                {q.category}・{q.reward} G・{q.dailyLimit === null ? "上限なし" : `1日${q.dailyLimit}回`}
                {q.visibleTo.length > 0 && `・${q.visibleTo.map((id) => state.profiles.find((p) => p.id === id)?.name).join("、")}だけ`}
              </div>
            </div>
            <button className="mini" onClick={() => setQuest(q)}>
              編集
            </button>
          </div>
        ))}
      </div>
      <button className="btn btn-ghost" onClick={() => setQuest({ id: newId("q"), title: "", category: "手伝い", reward: 10, dailyLimit: 1, visibleTo: [] })}>
        クエストを追加
      </button>

      <Section title="ごほうび" aside={`${rewards.length} 件`} />
      <div className="rowlist">
        {rewards.map((r) => (
          <div className="rowitem" key={r.id}>
            <div className="grow">
              <div className="t">{r.title}</div>
              <div className="s">
                {r.price} G・{r.weeklyLimit === null ? "上限なし" : `週${r.weeklyLimit}回まで`}・{r.note}
              </div>
            </div>
            <button className="mini" onClick={() => setReward(r)}>
              編集
            </button>
          </div>
        ))}
      </div>
      <button className="btn btn-ghost" onClick={() => setReward({ id: newId("r"), title: "", price: 100, note: "", weeklyLimit: null })}>
        ごほうびを追加
      </button>
      {extra}

      {quest && (
        <Sheet title={quest.title ? "クエストを編集" : "クエストを追加"} onClose={() => setQuest(null)}>
          <QuestForm
            quest={quest}
            kids={kids}
            onSave={async (q) => {
              if (await fb.run(store, (s) => saveQuest(s, me, q), "保存しました")) setQuest(null);
            }}
          />
        </Sheet>
      )}
      {reward && (
        <Sheet title={reward.title ? "ごほうびを編集" : "ごほうびを追加"} onClose={() => setReward(null)}>
          <RewardForm
            reward={reward}
            onSave={async (r) => {
              if (await fb.run(store, (s) => saveReward(s, me, r), "保存しました")) setReward(null);
            }}
          />
        </Sheet>
      )}
    </>
  );
}

const LIMITS: Array<[string, number | null]> = [
  ["1回", 1],
  ["2回", 2],
  ["3回", 3],
  ["なし", null]
];

function QuestForm({ quest, kids, onSave }: { quest: Quest; kids: FamilyState["profiles"]; onSave(q: Quest): void }) {
  const [q, setQ] = useState(quest);
  const toggleKid = (id: string) =>
    setQ((x) => ({ ...x, visibleTo: x.visibleTo.includes(id) ? x.visibleTo.filter((k) => k !== id) : [...x.visibleTo, id] }));
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(q);
      }}
    >
      <label htmlFor="q-title">
        クエスト名
        <input id="q-title" value={q.title} maxLength={24} onChange={(e) => setQ({ ...q, title: e.target.value })} placeholder="例：玄関の靴をそろえる" />
      </label>
      <div className="seg" role="group" aria-label="種類">
        {(["手伝い", "勉強", "生活"] as QuestCategory[]).map((c) => (
          <button key={c} type="button" aria-pressed={q.category === c} onClick={() => setQ({ ...q, category: c })}>
            {c}
          </button>
        ))}
      </div>
      <label htmlFor="q-reward">
        報酬（G）
        <input id="q-reward" type="number" inputMode="numeric" min={1} value={q.reward} onChange={(e) => setQ({ ...q, reward: Number(e.target.value) })} />
      </label>
      <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>1日に報告できる回数</span>
      <div className="seg">
        {LIMITS.map(([label, v]) => (
          <button key={label} type="button" aria-pressed={q.dailyLimit === v} onClick={() => setQ({ ...q, dailyLimit: v })}>
            {label}
          </button>
        ))}
      </div>
      <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>表示する子ども（選ばなければ全員）</span>
      <div className="checks">
        {kids.map((k) => (
          <label key={k.id}>
            <input type="checkbox" checked={q.visibleTo.includes(k.id)} onChange={() => toggleKid(k.id)} />
            {k.name}
          </label>
        ))}
      </div>
      <button className="btn btn-gold" type="submit">
        保存する
      </button>
      {quest.title && (
        <button className="btn btn-ghost" type="button" onClick={() => onSave({ ...q, archived: true })}>
          このクエストをしまう（記録は残ります）
        </button>
      )}
    </form>
  );
}

function RewardForm({ reward, onSave }: { reward: Reward; onSave(r: Reward): void }) {
  const [r, setR] = useState(reward);
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(r);
      }}
    >
      <label htmlFor="r-title">
        ごほうび名
        <input id="r-title" value={r.title} maxLength={24} onChange={(e) => setR({ ...r, title: e.target.value })} placeholder="例：お小遣い100円" />
      </label>
      <div className="two">
        <label htmlFor="r-price">
          必要 G
          <input id="r-price" type="number" inputMode="numeric" min={1} value={r.price} onChange={(e) => setR({ ...r, price: Number(e.target.value) })} />
        </label>
        <label htmlFor="r-limit">
          週の上限
          <select id="r-limit" value={r.weeklyLimit ?? ""} onChange={(e) => setR({ ...r, weeklyLimit: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">なし</option>
            {[1, 2, 3, 5, 7].map((n) => (
              <option key={n} value={n}>
                週{n}回
              </option>
            ))}
          </select>
        </label>
      </div>
      <label htmlFor="r-note">
        ひと言メモ（子どもに表示）
        <input id="r-note" value={r.note} maxLength={20} onChange={(e) => setR({ ...r, note: e.target.value })} placeholder="例：現金で受け取り" />
      </label>
      <button className="btn btn-gold" type="submit">
        保存する
      </button>
      {reward.title && (
        <button className="btn btn-ghost" type="button" onClick={() => onSave({ ...r, archived: true })}>
          このごほうびをしまう
        </button>
      )}
    </form>
  );
}
