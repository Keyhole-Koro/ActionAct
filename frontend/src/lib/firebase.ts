import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// あなたのFirebaseコンソールから取得した設定をここに貼り付けてください
// もし手元になければ、一旦このままでもビルドエラーは消えます
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// サーバーサイドでの二重初期化を防ぐための記述
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// これが「db」の正体です！
export const db = getFirestore(app);
export const auth = getAuth(app);