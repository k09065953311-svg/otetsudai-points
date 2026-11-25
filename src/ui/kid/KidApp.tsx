import { useCallback, useState } from "react";
import { newId, type GuildStore } from "../../data/store";
import {
  availableCoins,
  dayKey as dayKeyOf,
  findProfile,
  questBlockReason,
  questsFor,
  reportQuest,
  requestDeposit,
  requestExchange,
  requestVaultExchange,
  rewardBlockReason,
  exchangePending,
  potOf,
  potRemaining,
  takeUrgent
} from "../../domain/rules";
import { QUEST_CATEGORIES, type FamilyState, type Quest, type Reward } from "../../domain/types";
import { GuildDoor } from "./GuildDoor";
import { TitleScreen } from "./TitleScreen";
import { Empty, EntryRow, GuildCard, SharedRewardCard, Section, Sheet, Tabs, UrgentPanel, useFeedback, useGuildState, useNow } from "../common";

type Tab = "home" | "board" | "shop" | "log";

export function KidApp({ store, me }: { store: GuildStore; me: string }) {
  const state = useGuildState(store);
  const now = useNow();
  const [tab, setTab] = useState<Tab>("home");
  const [phase, setPhase] = useState<"title" | "door" | "app">("title");
  const doorDone = useCallback(() => setPhase("app"), []);
  const kid = state.profiles.find((p) => p.id === me);
  if (!kid) return <Empty>読み込み中…</Empty>;
  if (phase === "title") return <TitleScreen state={state} me={me} now={now} onStart={() => setPhase("door")} />;

  return (
    <>
      {phase === "door" && <GuildDoor onDone={doorDone} />}
      <main className="view">
        {tab === "home" && <Home store={store} state={state} me={me} now={now} />}
        {tab === "board" && <Board store={store} state={state} me={me} now={now} />}
        {tab === "shop" && <Shop store={store} state={state} me={me} now={now} />}
        {tab === "log" && <Log state={state} me={me} now={now} />}
      </main>
      <Tabs<Tab>
        current={tab}
        onChange={setTab}
        tabs={[
          { key: "home", label: "ギルド", icon: "home" },
          { key: "board", label: "依頼掲示板", icon: "board" },
          { key: "shop", label: "交換所", icon: "shop" },
          { key: "log", label: "冒険の記録", icon: "log" }
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

function Urgent({ store, state, me, now }: Props) {
  const fb = useFeedback();
  const u = state.urgent;
  if (!u) return null;
  // 終わった緊急クエストは、その日のうちだけ表示する
  if ((u.done || u.deadline <= now) && dayKeyOf(u.deadline) !== dayKeyOf(now)) return null;
  const open = !u.done && u.takenBy === null && u.deadline > now;
  return (
    <UrgentPanel
      urgent={u}
      state={state}
      now={now}
      action={
        open && (
          <button
            className="btn btn-red"
            onClick={() => fb.run(store, (s) => takeUrgent(s, me, Date.now(), newId("e")), "緊急クエストを報告しました！承認を待とう", true)}
          >
            達成したので報告する
          </button>
        )
      }
    />
  );
}

function QuestCard({ store, state, me, now, quest }: Props & { quest: Quest }) {
  const fb = useFeedback();
  const waiting = state.entries.some((e) => e.profileId === me && e.refId === quest.id && e.status === "wait");
  const blocked = questBlockReason(state, me, quest, now);
  return (
    <article className="quest">
      <h3>{quest.title}</h3>
      <div className="reward">
        {quest.reward} G<small>報酬</small>
      </div>
      <div className="meta">
        <span className="cat">{quest.category}</span>
        <span>{quest.dailyLimit === null ? "回数の上限なし" : `1日${quest.dailyLimit}回まで`}</span>
      </div>
      {blocked ? (
        <div className="state">{blocked}</div>
      ) : (
        <button
          className="btn btn-gold"
          onClick={() =>
            fb.run(store, (s) => reportQuest(s, me, quest.id, Date.now(), newId("e")), "報告しました！ギルドマスターの承認を待とう", true)
          }
        >
          {waiting ? "もう1回達成したので報告する" : "達成を報告する"}
        </button>
      )}
      {waiting && <div className="why">承認待ちの報告があります</div>}
    </article>
  );
}

function Home(props: Props) {
  const { state, me, now } = props;
  const kid = findProfile(state, me);
  const today = dayKeyOf(now);
  const doneToday = state.entries.filter((e) => e.profileId === me && e.kind !== "shop" && e.status !== "back" && dayKeyOf(e.createdAt) === today).length;
  const quests = questsFor(state, me).filter((q) => !questBlockReason(state, me, q, now));
  const waiting = state.entries.filter((e) => e.profileId === me && e.status === "wait").length;
  return (
    <>
      <GuildCard state={state} kid={kid} />
      <Urgent {...props} />
      <Section title="今日の冒険" aside={`達成 ${doneToday} 件${waiting ? `・承認待ち ${waiting} 件` : ""}`} />
      <div className="board">
        {quests.slice(0, 3).map((q) => (
          <QuestCard key={q.id} {...props} quest={q} />
        ))}
        {quests.length === 0 && <Empty>今日のクエストはぜんぶ達成！すごい！</Empty>}
      </div>
    </>
  );
}

function Board(props: Props) {
  const quests = questsFor(props.state, props.me);
  const cats = QUEST_CATEGORIES;
  return (
    <>
      <header className="board-hero">
        <h2>依頼掲示板</h2>
        <span>達成したら「報告」。ギルドの承認で G が入るぞ</span>
      </header>
      <Urgent {...props} />
      {cats.map((c) => {
        const list = quests.filter((q) => q.category === c);
        if (!list.length) return null;
        return (
          <div className="stack" key={c}>
            <Section title={`${c}の依頼`} aside={`${list.length} 件`} />
            <div className="board">
              {list.map((q) => (
                <QuestCard key={q.id} {...props} quest={q} />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Shop({ store, state, me, now }: Props) {
  const fb = useFeedback();
  const can = availableCoins(state, me);
  const live = state.rewards.filter((r) => !r.archived).sort((a, b) => a.price - b.price);
  const rewards = live.filter((r) => !r.shared);
  const shared = live.filter((r) => r.shared);
  const [target, setTarget] = useState<Reward | null>(null);
  const [amount, setAmount] = useState(10);
  const max = target ? Math.min(can, potRemaining(state, target)) : 0;
  return (
    <>
      {shared.length > 0 && (
        <>
          <Section title="みんなのごほうび" aside="3人で少しずつ入金" />
          <div className="pots">
            {shared.map((r) => {
              const rest = potRemaining(state, r);
              const asking = exchangePending(state, r.id);
              const full = potOf(state, r.id).balance >= r.price;
              return (
                <SharedRewardCard
                  key={r.id}
                  state={state}
                  reward={r}
                  now={now}
                  action={
                    full ? (
                      <button
                        className="btn btn-gold"
                        disabled={asking}
                        onClick={() =>
                          fb.run(store, (s) => requestVaultExchange(s, me, r.id, Date.now(), newId("x")), `「${r.title}」の交換を申請しました！親に渡してもらおう`, true)
                        }
                      >
                        {asking ? "交換の申請中" : "満額！交換を申請する"}
                      </button>
                    ) : (
                      <button
                        className="btn btn-gold"
                        disabled={asking || rest <= 0 || can <= 0}
                        onClick={() => {
                          setAmount(Math.max(1, Math.min(can, rest, 50)));
                          setTarget(r);
                        }}
                      >
                        {rest <= 0 ? "承認待ちの入金で満額です" : "入金する"}
                      </button>
                    )
                  }
                />
              );
            })}
          </div>
        </>
      )}
      <Section title="交換所" aside={`使える G：${can.toLocaleString()}`} />
      <div className="shop">
        {rewards.map((r) => {
          const blocked = rewardBlockReason(state, me, r, now);
          return (
            <div className="item" key={r.id}>
              <h3>{r.title}</h3>
              <span className="price">{r.price.toLocaleString()} G</span>
              <span className="short">{blocked ?? r.note}</span>
              <button
                className={blocked ? "btn btn-ghost" : "btn btn-gold"}
                disabled={!!blocked}
                onClick={() =>
                  fb.run(store, (s) => requestExchange(s, me, r.id, Date.now(), newId("x")), `${r.price} G を予約しました。親に渡してもらおう`)
                }
              >
                交換を申請
              </button>
            </div>
          );
        })}
      </div>
      <div className="note">申請すると G が予約され、親が渡した時点で確定します。</div>
      {target && (
        <Sheet title={`「${target.title}」に入金`} onClose={() => setTarget(null)}>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = target;
              if (await fb.run(store, (s) => requestDeposit(s, me, r.id, amount, Date.now(), newId("v")), `${amount} G の入金を申請しました。親の承認で入るよ`)) setTarget(null);
            }}
          >
            <div className="seg">
              {[10, 50, 100].filter((v) => v < max).map((v) => (
                <button key={v} type="button" aria-pressed={amount === v} onClick={() => setAmount(v)}>
                  {v} G
                </button>
              ))}
              <button type="button" aria-pressed={amount === max} onClick={() => setAmount(max)}>
                {max === potRemaining(state, target) ? "満額まで" : "全部"}
              </button>
            </div>
            <label htmlFor="deposit-amount">
              入金する G（使える G：{can.toLocaleString()}・満額まで あと {potRemaining(state, target).toLocaleString()} G）
              <input id="deposit-amount" type="number" inputMode="numeric" min={1} max={max} value={amount} onChange={(e) => setAmount(Math.floor(Number(e.target.value)))} />
            </label>
            <div className="warn">一度入金した G は、自分に戻すことはできません。このごほうびの交換にだけ使われます。</div>
            <button className="btn btn-gold" type="submit" disabled={!(amount >= 1 && amount <= max)}>
              {amount > 0 ? `${amount.toLocaleString()} G を入金する` : "入金する"}
            </button>
          </form>
        </Sheet>
      )}
    </>
  );
}

function Log({ state, me, now }: Omit<Props, "store">) {
  const mine = state.entries.filter((e) => e.profileId === me).slice().reverse();
  return (
    <>
      <Section title="冒険の記録" aside={`${mine.length} 件`} />
      <div className="list">
        {mine.map((e) => (
          <EntryRow key={e.id} e={e} state={state} now={now} />
        ))}
        {mine.length === 0 && <Empty>まだ記録がありません。依頼掲示板からクエストを選ぼう！</Empty>}
      </div>
    </>
  );
}
