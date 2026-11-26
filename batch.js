'use strict';

(() => {
  const panel = document.getElementById('batchPanel');
  const icon = name => '<svg class="ico" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  const formatOptions = '<option value="jpeg">JPG</option><option value="png">PNG</option><option value="webp">WebP</option><option value="bmp">BMP</option>';
  panel.innerHTML = `
    <div class="batch-grid">
      <section class="card batch-files">
        <div class="card-head"><span class="tile">${icon('layers')}</span><h2>Dosya kuyruğu</h2></div>
        <div class="source-body">
          <div id="batchDrop" class="batch-drop">
            
            <h3>Görselleri buraya sürükleyip bırakın</h3>
            <p>JPG, PNG, WebP, BMP ve tek kareli GIF · Dosya başına 50 MB</p>
            <button type="button" class="primary" id="batchChoose">${icon('upload')} Dosya ekle</button>
            <input hidden id="batchFiles" type="file" multiple>
          </div>
          <p class="privacy">${icon('lock')} Dosyalar cihazınızda işlenir.</p>
          <div class="batch-list-head" id="batchListHead" hidden><h3 id="batchCount"></h3><button type="button" id="batchClear">Kuyruğu temizle</button></div>
          <ul class="batch-list" id="batchList" aria-label="Dönüştürme kuyruğu"></ul>
        </div>
      </section>
      <section class="card batch-controls">
        <div class="card-head"><span class="tile">${icon('sliders')}</span><h2>Toplu dönüşüm ayarları</h2></div>
        <div class="batch-settings">
          <label class="field">Yeni dosyaların çıktı formatı<select id="batchFormat">${formatOptions}</select></label>
          <button type="button" id="batchApplyFormat">Bu formatı tümüne uygula</button>
          <label class="quality"><span>Kalite <b>%<span id="batchPercent">85</span></b></span><input id="batchQuality" type="range" min="1" max="100" value="85"></label>
          <small class="note" id="batchQualityHint">JPG ve WebP çıktılarına uygulanır.</small>
          <label class="field">Uzun kenar<select id="batchEdge"><option value="0">Orijinal ölçüler</option><option value="1920">En fazla 1920 px</option><option value="1280">En fazla 1280 px</option><option value="800">En fazla 800 px</option></select></label>
          <label class="field">Dosya başına boyut sınırı (KB)<input type="number" inputmode="decimal" step="any" min="0.001" id="batchLimit" placeholder="Sınır yok" aria-describedby="batchLimitHint"></label>
          <small class="note" id="batchLimitHint">500 KB = 500.000 bayt. Hedef aşılırsa ilgili dosya için hata gösterilir.</small>
        </div>
        <div class="convert-foot">
          <button class="primary" type="button" id="batchConvert">${icon('wand')} Kuyruğu dönüştür</button>
          <button type="button" id="batchCancel" hidden>İşlemi durdur</button>
          <p id="batchStatus" role="status" aria-live="polite"></p>
          <div class="batch-exports" id="batchExports" hidden>
            <p id="batchExportCount"></p>
            <button type="button" id="batchZip">${icon('download')} ZIP indir</button>
            <button type="button" id="batchPdf">${icon('doc')} PDF’de birleştir</button>
          </div>
        </div>
      </section>
    </div>`;

  const controls = Object.fromEntries([...panel.querySelectorAll('[id]')].map(element => [element.id, element]));
  const items = [];
  let working = false;
  let converting = false;
  let cancelled = false;
  controls.batchFiles.accept = document.getElementById('file').accept;

  function report(message) {
    controls.batchStatus.textContent = message;
  }

  function updateControls() {
    const completed = items.filter(item => item.result).length;
    controls.batchChoose.disabled = working;
    controls.batchClear.disabled = working;
    controls.batchFormat.disabled = working;
    controls.batchApplyFormat.disabled = working || !items.length;
    controls.batchQuality.disabled = working || controls.batchLimit.value !== '';
    controls.batchQualityHint.textContent = controls.batchLimit.value
      ? 'JPG ve WebP kalitesi otomatik ayarlanır. PNG ve BMP seçilen ölçülerde sınanır.'
      : 'JPG ve WebP çıktılarına uygulanır.';
    controls.batchEdge.disabled = working;
    controls.batchLimit.disabled = working;
    controls.batchConvert.disabled = working || items.length === completed;
    controls.batchCancel.hidden = !converting;
    controls.batchCancel.disabled = cancelled;
    controls.batchZip.disabled = controls.batchPdf.disabled = working || completed === 0;
    controls.batchExports.hidden = completed === 0;
    controls.batchExportCount.textContent = 'İndirmeye hazır ' + completed + ' dosya';
    controls.batchListHead.hidden = !items.length;
    controls.batchCount.textContent = items.length + ' dosya';
    for (const item of items) {
      item.formatPicker.disabled = item.removeButton.disabled = working;
      item.limitInput.disabled = item.edgeSelect.disabled = working;
      const cap = item.limitInput.value === '' ? controls.batchLimit.valueAsNumber : item.limitInput.valueAsNumber;
      item.qualityInput.disabled = working || cap > 0 || !hasQuality(item.formatPicker.value);
    }
  }

  function clearResult(item) {
    if (item.result) URL.revokeObjectURL(item.result.url);
    item.result = null;
    item.link.removeAttribute('href');
    item.link.removeAttribute('download');
    item.link.hidden = true;
    setState(item, 'waiting', 'Bekliyor');
  }

  function setState(item, state, text) {
    item.row.dataset.state = state;
    item.status.textContent = text;
  }

  function removeItem(item) {
    if (working) return;
    clearResult(item);
    items.splice(items.indexOf(item), 1);
    item.row.remove();
    report('');
    updateControls();
  }

  function appendFiles(files) {
    if (!files.length) return;
    if (working) {
      report('Şu anda bir işlem yürütülüyor. Tamamlandığında dosyaları yeniden ekleyebilirsin.');
      return;
    }
    for (const file of files) {
      const row = document.createElement('li');
      row.className = 'batch-row';
      row.innerHTML = `
        <div class="batch-file-info"><strong></strong><small></small></div>
        <label class="batch-file-format">Çıktı<select>${formatOptions}</select></label>
        <div class="batch-row-actions"><a hidden>İndir</a><button type="button">Kaldır</button></div>
        <p class="batch-row-status"></p>
        <details class="batch-overrides">
          <summary>Dosyaya özel ayarlar</summary>
          <div class="batch-override-fields">
            <label>Kalite (%)<input type="number" class="batch-item-quality" min="1" max="100" step="1" placeholder="Ortak ayar"></label>
            <label>Dosya sınırı (KB)<input type="number" class="batch-item-limit" min="0" step="any" placeholder="Ortak ayar"></label>
            <label>Uzun kenar<select class="batch-item-edge"><option value="inherit">Ortak ayar</option><option value="0">Orijinal ölçüler</option><option value="1920">En fazla 1920 px</option><option value="1280">En fazla 1280 px</option><option value="800">En fazla 800 px</option></select></label>
          </div>
          <small class="note">Boş alanlar ortak ayarları kullanır. Dosya sınırını kaldırmak için 0 gir.</small>
        </details>`;
      const item = {
        file, row, formatPicker: row.querySelector('select'),
        removeButton: row.querySelector('button'), link: row.querySelector('a'),
        status: row.querySelector('.batch-row-status'), info: row.querySelector('.batch-file-info small'),
        qualityInput: row.querySelector('.batch-item-quality'), limitInput: row.querySelector('.batch-item-limit'),
        edgeSelect: row.querySelector('.batch-item-edge'), result: null
      };
      row.querySelector('strong').textContent = file.name;
      item.info.textContent = size(file.size);
      item.formatPicker.value = controls.batchFormat.value;
      item.formatPicker.setAttribute('aria-label', file.name + ' çıktı formatı');
      item.removeButton.setAttribute('aria-label', file.name + ' dosyasını kuyruktan kaldır');
      item.link.setAttribute('aria-label', file.name + ' dönüşümünü indir');
      function rowChanged() {
        clearResult(item);
        report('');
        updateControls();
      }
      item.formatPicker.onchange = rowChanged;
      for (const control of [item.qualityInput, item.limitInput, item.edgeSelect]) {
        control.addEventListener('input', rowChanged);
      }
      item.removeButton.onclick = () => removeItem(item);
      setState(item, 'waiting', 'Bekliyor');
      controls.batchList.append(row);
      items.push(item);
    }
    report(files.length + ' dosya kuyruğa eklendi.');
    updateControls();
  }

  controls.batchChoose.onclick = () => controls.batchFiles.click();
  controls.batchFiles.onchange = () => {
    appendFiles([...controls.batchFiles.files]);
    controls.batchFiles.value = '';
  };
  document.addEventListener('batch-add-files', event => appendFiles(event.detail));
  document.addEventListener('dragover', event => {
    if (!panel.hidden && event.dataTransfer.types.includes('Files')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.dataTransfer.dropEffect = working ? 'none' : 'copy';
      controls.batchDrop.classList.toggle('over', !working && controls.batchDrop.contains(event.target));
    }
  }, true);
  controls.batchDrop.ondragleave = event => {
    if (!controls.batchDrop.contains(event.relatedTarget)) controls.batchDrop.classList.remove('over');
  };
  document.addEventListener('drop', event => {
    if (panel.hidden || !event.dataTransfer.files.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    controls.batchDrop.classList.remove('over');
    appendFiles([...event.dataTransfer.files]);
  }, true);
  document.addEventListener('paste', event => {
    if (panel.hidden) return;
    const pasted = [...event.clipboardData.items]
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile()).filter(Boolean);
    if (pasted.length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      appendFiles(pasted);
    }
  }, true);
  controls.batchClear.onclick = () => {
    if (working) return;
    items.forEach(clearResult);
    items.length = 0;
    controls.batchList.replaceChildren();
    report('Kuyruk temizlendi.');
    updateControls();
  };
  controls.batchApplyFormat.onclick = () => {
    for (const item of items) {
      if (item.formatPicker.value !== controls.batchFormat.value) {
        item.formatPicker.value = controls.batchFormat.value;
        clearResult(item);
      }
    }
    report('Seçilen çıktı formatı kuyruktaki tüm dosyalara uygulandı.');
    updateControls();
  };
  for (const input of [controls.batchQuality, controls.batchEdge, controls.batchLimit]) {
    input.addEventListener('input', () => {
      for (const item of items) clearResult(item);
      controls.batchPercent.textContent = controls.batchQuality.value;
      report('');
      updateControls();
    });
  }

  function readSettings() {
    const input = controls.batchLimit;
    const limit = input.value === '' ? 0 : Math.floor(input.valueAsNumber * 1000);
    if (input.validity.badInput || (input.value !== '' && (!Number.isSafeInteger(limit) || limit < 1))) {
      throw Error('En az 0,001 KB değerinde pozitif bir sınır gir veya alanı boş bırak.');
    }
    return { limit, edge: Number(controls.batchEdge.value), quality: Number(controls.batchQuality.value) / 100 };
  }

  function settingsForItem(item, defaults) {
    const cap = item.limitInput;
    if (cap.validity.badInput) throw Error('Dosyaya özel KB sınırına geçerli bir sayı gir.');
    const limit = cap.value === '' ? defaults.limit : Math.floor(cap.valueAsNumber * 1000);
    if (!Number.isSafeInteger(limit) || limit < 0 || (cap.valueAsNumber > 0 && limit < 1)) {
      throw Error('Dosyaya özel sınır en az 0,001 KB olmalı. Sınırı kaldırmak için 0 gir.');
    }
    const field = item.qualityInput;
    let quality = defaults.quality;
    if (!limit && hasQuality(item.formatPicker.value)) {
      const value = field.valueAsNumber;
      if (field.validity.badInput || (field.value !== '' && (!Number.isInteger(value) || value < 1 || value > 100))) {
        throw Error('Dosyaya özel kalite 1 ile 100 arasında bir tam sayı olmalı.');
      }
      if (field.value !== '') quality = field.valueAsNumber / 100;
    }
    const edge = item.edgeSelect.value === 'inherit' ? defaults.edge : Number(item.edgeSelect.value);
    return {limit, quality, edge};
  }

  function outputName(item, format) {
    const stem = item.file.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'gorsel';
    const extension = format === 'jpeg' ? 'jpg' : format;
    const existing = new Set(items.filter(entry => entry.result).map(entry => entry.result.name.toLowerCase()));
    let count = 1;
    let name = stem + '-canconverter.' + extension;
    while (existing.has(name.toLowerCase())) {
      count++;
      name = stem + '-canconverter-' + count + '.' + extension;
    }
    return name;
  }

  async function convertItem(item, settings) {
    if (item.file.size > maxFileBytes) throw Error('Kaynak dosya 50 MB sınırını aşıyor.');
    const data = await item.file.arrayBuffer();
    if (cancelled) return;
    const sourceFormat = inspect(data);
    const type = sourceFormat === 'jpeg' ? 'image/jpeg' : 'image/' + sourceFormat;
    const sourceUrl = URL.createObjectURL(new Blob([data], {type}));
    let canvas;
    try {
      const image = new Image();
      image.src = sourceUrl;
      try { await image.decode(); } catch { throw Error('Görsel okunamadı. Dosya bozuk veya eksik olabilir.'); }
      if (cancelled) return;
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      checkDimensions(width, height);
      item.info.textContent = [names[sourceFormat], width + ' × ' + height + ' px', size(item.file.size)].join(' · ');
      const scale = settings.edge ? Math.min(1, settings.edge / Math.max(width, height)) : 1;
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const format = item.formatPicker.value;
      canvas = draw(image, w, h, format);
      const qualities = settings.limit && hasQuality(format) ? automaticQualities : [settings.quality];
      for (const quality of qualities) {
        const blob = await encode(canvas, format, quality);
        if (cancelled) return;
        if (settings.limit && blob.size > settings.limit) continue;
        const name = outputName(item, format);
        const url = URL.createObjectURL(blob);
        item.result = {name, blob, url};
        item.link.href = url;
        item.link.download = name;
        item.link.hidden = false;
        const description = ['Hazır', names[format], w + ' × ' + h + ' px', size(blob.size)];
        if (hasQuality(format)) description.push('%' + Math.round(quality * 100) + ' kalite');
        setState(item, 'ready', description.join(' · '));
        return;
      }
      throw Error(number(settings.limit / 1000) + ' KB sınırına ulaşılamadı. Daha kısa bir kenar veya daha yüksek bir sınır seç.');
    } finally {
      if (canvas) canvas.width = canvas.height = 1;
      URL.revokeObjectURL(sourceUrl);
    }
  }

  controls.batchConvert.onclick = async () => {
    if (working) return;
    let settings;
    try { settings = readSettings(); }
    catch (error) { report(error.message); controls.batchLimit.focus(); return; }
    const pending = items.filter(item => !item.result).map(item => {
      try { return {item, settings: settingsForItem(item, settings)}; }
      catch (error) { return {item, error}; }
    });
    working = converting = true;
    cancelled = false;
    updateControls();
    try {
      for (const [index, job] of pending.entries()) {
        const item = job.item;
        if (cancelled) break;
        report('Dönüştürülüyor… ' + (index + 1) + ' / ' + pending.length);
        setState(item, 'busy', 'Dönüştürülüyor…');
        try {
          if (job.error) throw job.error;
          await convertItem(item, job.settings);
        } catch (error) {
          setState(item, 'error', error.constructor === Error ? error.message : 'Dosya çözümlenemedi veya çıktı oluşturulamadı.');
        }
        if (cancelled && !item.result) setState(item, 'waiting', 'Bekliyor');
      }
      const completed = items.filter(item => item.result).length;
      const failed = items.filter(item => item.row.dataset.state === 'error').length;
      report((cancelled ? 'İşlem durduruldu. ' : 'İşlem tamamlandı. ') + completed + ' dosya hazır.' + (failed ? ' ' + failed + ' dosyada hata var.' : ''));
    } finally {
      working = converting = cancelled = false;
      updateControls();
    }
  };
  controls.batchCancel.onclick = () => {
    cancelled = true;
    controls.batchCancel.disabled = true;
    report('İşlem durduruluyor…');
  };

  async function downloadGroup(type) {
    const entries = items.filter(item => item.result).map(item => item.result);
    if (working || !entries.length) return;
    working = true;
    updateControls();
    report(type.toUpperCase() + ' hazırlanıyor…');
    try {
      const blob = type === 'zip' ? await window.createImageZip(entries) : await window.createImagePdf(entries);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'canconverter.' + type;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      report(entries.length + ' sonuç için ' + type.toUpperCase() + ' indirmesi başlatıldı.');
    } catch (error) {
      report(error.message || 'İndirme dosyası hazırlanamadı.');
    } finally {
      working = false;
      updateControls();
    }
  }

  controls.batchZip.onclick = () => downloadGroup('zip');
  controls.batchPdf.onclick = () => downloadGroup('pdf');
  updateControls();
})();

