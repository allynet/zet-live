import { createRoot } from "react-dom/client";
import "@/app.css";
import { App } from "@/app";

createRoot(document.getElementById("app")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed", err);
    });
  });
}
