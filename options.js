const DEFAULTS = {
  suspendMinutes: 30,
  closeMinutes: 120,
  suspendEnabled: true,
  closeEnabled: true,
  dupEnabled: true,
};

const dupToggle     = document.getElementById('dup-toggle');
const suspendToggle = document.getElementById('suspend-toggle');
const closeToggle   = document.getElementById('close-toggle');
const suspendMins   = document.getElementById('suspend-minutes');
const closeMins     = document.getElementById('close-minutes');
const suspendField  = document.getElementById('suspend-field');
const closeField    = document.getElementById('close-field');
const btnSave       = document.getElementById('btn-save');
const btnReset      = document.getElementById('btn-reset');
const savedMsg      = document.getElementById('saved-msg');

function load(settings) {
  dupToggle.checked     = settings.dupEnabled;
  suspendToggle.checked = settings.suspendEnabled;
  closeToggle.checked   = settings.closeEnabled;
  suspendMins.value     = settings.suspendMinutes;
  closeMins.value       = settings.closeMinutes;
  updateFields();
}

function updateFields() {
  suspendField.classList.toggle('disabled-field', !suspendToggle.checked);
  closeField.classList.toggle('disabled-field', !closeToggle.checked);
}

chrome.storage.sync.get(DEFAULTS, load);

suspendToggle.addEventListener('change', updateFields);
closeToggle.addEventListener('change', updateFields);

btnSave.addEventListener('click', () => {
  const settings = {
    dupEnabled:     dupToggle.checked,
    suspendEnabled: suspendToggle.checked,
    closeEnabled:   closeToggle.checked,
    suspendMinutes: Math.max(1, parseInt(suspendMins.value, 10) || 30),
    closeMinutes:   Math.max(1, parseInt(closeMins.value, 10) || 120),
  };
  chrome.storage.sync.set(settings, () => {
    savedMsg.classList.add('show');
    setTimeout(() => savedMsg.classList.remove('show'), 2000);
  });
});

btnReset.addEventListener('click', () => {
  load(DEFAULTS);
  chrome.storage.sync.set(DEFAULTS, () => {
    savedMsg.classList.add('show');
    setTimeout(() => savedMsg.classList.remove('show'), 2000);
  });
});
