const DEFAULTS = {
  suspendMinutes: 30,
  closeMinutes: 120,
  suspendEnabled: true,
  closeEnabled: true,
};

const suspendToggle = document.getElementById('suspend-toggle');
const closeToggle   = document.getElementById('close-toggle');
const suspendMins   = document.getElementById('suspend-minutes');
const closeMins     = document.getElementById('close-minutes');
const suspendGroup  = document.getElementById('suspend-group');
const closeGroup    = document.getElementById('close-group');
const btnSave       = document.getElementById('btn-save');
const btnOptions    = document.getElementById('btn-options');
const savedMsg      = document.getElementById('saved-msg');

chrome.storage.sync.get(DEFAULTS, (settings) => {
  suspendToggle.checked = settings.suspendEnabled;
  closeToggle.checked   = settings.closeEnabled;
  suspendMins.value     = settings.suspendMinutes;
  closeMins.value       = settings.closeMinutes;
  updateGroups();
});

function updateGroups() {
  suspendGroup.classList.toggle('disabled-group', !suspendToggle.checked);
  closeGroup.classList.toggle('disabled-group', !closeToggle.checked);
}

suspendToggle.addEventListener('change', updateGroups);
closeToggle.addEventListener('change', updateGroups);

btnSave.addEventListener('click', () => {
  const settings = {
    suspendEnabled: suspendToggle.checked,
    closeEnabled:   closeToggle.checked,
    suspendMinutes: Math.max(1, parseInt(suspendMins.value, 10) || 30),
    closeMinutes:   Math.max(1, parseInt(closeMins.value, 10) || 120),
  };

  chrome.storage.sync.set(settings, () => {
    savedMsg.classList.add('show');
    setTimeout(() => savedMsg.classList.remove('show'), 1800);
  });
});

btnOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
