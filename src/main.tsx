import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { firebaseConfigured } from "./data/config";
import { FeedbackProvider } from "./ui/common";
import { DemoRoot } from "./ui/DemoRoot";
import "./ui/styles.css";

// Firebase の部品は大きいので、使うときだけ読み込む
const FirebaseRoot = lazy(() => import("./ui/FirebaseRoot").then((m) => ({ default: m.FirebaseRoot })));

// Firebase の設定（.env.local）があれば家族共有モード、なければお試しモードで起動する
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FeedbackProvider>
      {firebaseConfigured ? (
        <Suspense fallback={<div className="app"><div className="hero"><p>読み込み中…</p></div></div>}>
          <FirebaseRoot />
        </Suspense>
      ) : (
        <DemoRoot />
      )}
    </FeedbackProvider>
  </StrictMode>
);
