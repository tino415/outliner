/** The click a browser sends after a swipe or a tap that changed the page, aimed at whatever is now under the finger. */
export function swallowNextClick(): void {
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const stopSwallowing = () => window.removeEventListener("click", swallow, { capture: true });
  window.addEventListener("click", swallow, { capture: true, once: true });
  window.addEventListener("pointerdown", stopSwallowing, { capture: true, once: true });
  setTimeout(stopSwallowing, 400);
}
