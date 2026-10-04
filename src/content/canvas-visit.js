// Runs on Canvas pages. Only tells the extension "you're on Canvas"; it reads nothing
// from the page. Login pages are skipped.
if (!location.pathname.startsWith('/login')) {
  browser.runtime.sendMessage({ type: 'canvas-visit' }).catch(() => {});
}
