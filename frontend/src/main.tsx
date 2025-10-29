import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  // StrictMode를 제거하여 개발 모드에서도 useEffect가 한 번만 실행되도록 함
  <App />
);
