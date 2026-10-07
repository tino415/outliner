import "./style.css";
import { start } from "./app";

start();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.error("service worker failed", error));
  });
}
