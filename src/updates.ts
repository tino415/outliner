import { toast } from "./chrome";

/*
 * The service worker serves the app from its cache (doc/adr/0005, 0010) and
 * takes over as soon as a new version is installed. A phone keeps an
 * installed app alive for days, so coming back to it looks for a new version
 * too, and when one takes over the page offers to reload into it.
 */
export function keepUpToDate(): void {
  if (!("serviceWorker" in navigator)) return;
  const updatingAnInstalledApp = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updatingAnInstalledApp) offerReload();
  });
  if (document.readyState === "complete") void register();
  else window.addEventListener("load", register);
}

/** Startup waits for stored data, so the page may have loaded before this runs. */
async function register(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && registration.update().catch(() => undefined));
  } catch (error) {
    console.error("service worker failed", error);
  }
}

function offerReload(): void {
  toast("A new version is ready", { label: "Reload", run: () => location.reload() }, { stays: true });
}
