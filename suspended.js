// suspended.js — reads hash params and populates the suspended page

(function () {
  // Data is passed via hash fragment to avoid browsers stripping query params on extension pages
  const hash = location.hash.slice(1); // remove leading #
  const params = new URLSearchParams(hash);
  const url = params.get('url') || '';
  const title = params.get('title') || url;
  const suspendedAt = params.get('at');

  // Update the browser tab title
  document.title = title ? `[Suspended] ${title}` : 'Tab Suspended';

  document.getElementById('page-title').textContent = title || '(no title)';
  document.getElementById('page-url').textContent = url || '(no URL)';

  if (suspendedAt) {
    const ts = parseInt(suspendedAt, 10);
    if (!isNaN(ts)) {
      const date = new Date(ts);
      document.getElementById('suspended-time').textContent =
        `Suspended at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  const btn = document.getElementById('btn-restore');
  if (url) {
    btn.addEventListener('click', () => {
      window.location.replace(url);
    });
  } else {
    btn.disabled = true;
    btn.textContent = 'No URL to restore';
  }
})();
