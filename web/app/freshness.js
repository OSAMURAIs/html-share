// Narrow, non-visual background freshness check (ORBIT Data Operations Phase).
//
// No DOM, no CSS, no notification, no route change, no new history entry -- this only detects
// that production has published a newer generation than the one currently rendered, and then
// reloads the current page. `location.reload()` preserves `location.hash` and does not push a
// history entry, so Back/Forward semantics are untouched.
//
// Signal reused as-is from the existing shell loading pattern (see manifest.js's `getJson`):
// `manifest.v2.json`'s `generated_at` field, already written on every publish. No new endpoint.
(function () {
  var CHECK_INTERVAL_MS = 60000;
  var baseline = null;
  var checking = false;

  function fetchGeneratedAt() {
    return fetch('manifest.v2.json', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('manifest request failed: ' + response.status);
        return response.json();
      })
      .then(function (manifest) {
        return manifest && typeof manifest.generated_at === 'string' ? manifest.generated_at : null;
      });
  }

  function check() {
    if (checking) return;
    checking = true;
    fetchGeneratedAt()
      .then(function (generatedAt) {
        checking = false;
        if (!generatedAt) return; // unrecognized/empty response: silent no-op
        if (baseline === null) { baseline = generatedAt; return; }
        if (generatedAt !== baseline) { window.location.reload(); }
      })
      .catch(function () { checking = false; }); // network/parse failure: silent, retried next check
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);
  setInterval(function () {
    if (document.visibilityState === 'visible') check();
  }, CHECK_INTERVAL_MS);

  check();
})();
