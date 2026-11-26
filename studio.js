'use strict';

const recipes = {
  application: { format: 'jpeg', limit: '500000', quality: '85', size: 'original' },
  web: { format: 'webp', limit: '0', quality: '80', size: '1920' },
  transparent: { format: 'png', limit: '0', quality: '85', size: 'original' }
};
const recipeButtons = [...document.querySelectorAll('[data-recipe]')];
const formatButtons = [...document.querySelectorAll('[name="outputFormat"]')];
let selectedRecipe = null;

function syncFormatButtons() {
  for (const radio of formatButtons) radio.checked = radio.value === ui.format.value;
}
function selectRecipe(name) {
  selectedRecipe = name;
  for (const button of recipeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.recipe === name));
  }
}
for (const button of recipeButtons) {
  button.addEventListener('click', () => {
    const recipe = recipes[button.dataset.recipe];
    selectRecipe(button.dataset.recipe);
    invalidate();
    ui.format.value = recipe.format;
    ui.limit.value = recipe.limit;
    ui.quality.value = recipe.quality;
    ui.shrink.checked = false;
    ui.lock.checked = true;
    applySizePreset(recipe.size);
    refreshControls();
    syncFormatButtons();
    indicate(button.querySelector('strong').textContent + ' ayarları seçildi.', 'ready');
  });
}
ui.settings.addEventListener('input', event => {
  if (event.target.name === 'outputFormat') {
    ui.format.value = event.target.value;
    refreshControls();
  }
  syncFormatButtons();
  selectRecipe(null);
});
ui.reset.addEventListener('click', () => selectRecipe(null));
document.addEventListener('source-ready', () => {
  if (selectedRecipe) applySizePreset(recipes[selectedRecipe].size);
});
ui.guideOpen.onclick = () => ui.guide.showModal();
ui.guideClose.onclick = () => ui.guide.close();
ui.guide.addEventListener('click', event => {
  if (event.target !== ui.guide) return;
  const bounds = ui.guide.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) ui.guide.close();
});
selectRecipe(null);
syncFormatButtons();


const studioTabs = [ui.hubMode, ui.singleMode, ui.batchMode];
function activateMode(selected) {
  for (const tab of studioTabs) {
    const active = tab === selected;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
}
for (const [index, tab] of studioTabs.entries()) {
  tab.addEventListener('click', () => activateMode(tab));
  tab.addEventListener('keydown', event => {
    const next = {ArrowLeft:(index + 2) % 3, ArrowRight:(index + 1) % 3, Home:0, End:2}[event.key];
    if (next === undefined) return;
    event.preventDefault();
    studioTabs[next].click();
    studioTabs[next].focus();
  });
}
function openFileQueue(files, event) {
  if (files.length < 2 || ui.singlePanel.hidden) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  activateMode(ui.batchMode);
  ui.batchMode.focus();
  document.dispatchEvent(new CustomEvent('batch-add-files', { detail: Array.from(files) }));
}
document.addEventListener('change', event => {
  if (event.target === ui.file && ui.file.files.length > 1) {
    openFileQueue(ui.file.files, event);
    ui.file.value = '';
  }
}, true);
document.addEventListener('drop', event => {
  if (event.dataTransfer?.files.length) openFileQueue(event.dataTransfer.files, event);
}, true);
document.addEventListener('paste', event => {
  if (event.clipboardData?.files.length) openFileQueue(event.clipboardData.files, event);
}, true);

