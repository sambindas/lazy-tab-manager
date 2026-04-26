(function () {
  'use strict';

  let banner = null;

  function removeBanner() {
    if (banner) {
      banner.remove();
      banner = null;
    }
  }

  function showDuplicateBanner(duplicateTabId, duplicateWindowId) {
    removeBanner();

    banner = document.createElement('div');
    banner.id = '__lazy-tab-banner__';

    Object.assign(banner.style, {
      position: 'fixed',
      top: '0',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      background: '#1a1a2e',
      color: '#e0e0e0',
      border: '1px solid #e94560',
      borderTop: 'none',
      borderRadius: '0 0 10px 10px',
      padding: '10px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '13px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      maxWidth: '520px',
      width: 'max-content',
    });

    const msg = document.createElement('span');
    msg.textContent = 'This tab is already open.';
    Object.assign(msg.style, { flexShrink: '0' });

    const btnSwitch = document.createElement('button');
    btnSwitch.textContent = 'Switch to it';
    styleBtn(btnSwitch, '#e94560');

    const btnStay = document.createElement('button');
    btnStay.textContent = 'Stay here';
    styleBtn(btnStay, '#333');

    banner.appendChild(msg);
    banner.appendChild(btnSwitch);
    banner.appendChild(btnStay);
    document.documentElement.appendChild(banner);

    btnSwitch.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'SWITCH_TO_DUPLICATE',
        duplicateTabId,
        duplicateWindowId,
      });
      removeBanner();
    });

    btnStay.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'DISMISS_DUPLICATE' });
      removeBanner();
    });

    setTimeout(removeBanner, 12_000);
  }

  function styleBtn(btn, bg) {
    Object.assign(btn.style, {
      background: bg,
      color: '#fff',
      border: 'none',
      borderRadius: '6px',
      padding: '5px 12px',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'DUPLICATE_DETECTED') {
      showDuplicateBanner(msg.duplicateTabId, msg.duplicateWindowId);
    }
  });
})();
