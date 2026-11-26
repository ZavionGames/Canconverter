'use strict';

const ui = Object.fromEntries(
  [...document.querySelectorAll('[id]')].map(element => [element.id, element])
);
const names = { jpeg: 'JPG', png: 'PNG', webp: 'WebP', gif: 'GIF', bmp: 'BMP' };
const number = value => value.toLocaleString('tr-TR');
const size = bytes => number(bytes) + ' bayt';
const maxEdge = 12000;
const maxPixels = 24000000;
const maxFileBytes = 50000000;
const automaticQualities = [1, .95, .9, .85, .8, .7, .6, .5, .4, .3, .2, .1, .01];

let source = null;
let sourceVersion = 0;
let revision = 0;
let resultUrl = '';
let quarterTurns = 0;

function indicate(message = '', kind = '', nearSource = false) {
  const container = document.querySelector(nearSource ? '.source-body' : '.convert-foot');
  if (ui.status.parentElement !== container) container.append(ui.status);
  ui.status.textContent = message;
  ui.status.dataset.state = kind;
}

function invalidate() {
  revision++;
  ui.result.hidden = true;
  ui.output.removeAttribute('src');
  ui.download.removeAttribute('href');
  ui.download.removeAttribute('download');
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = '';
  indicate();
  ui.convert.disabled = !source;
}

function hasQuality(format) {
  return format === 'jpeg' || format === 'webp';
}

function refreshControls() {
  const limited = ui.limit.value !== '0';
  const format = ui.format.value;
  ui.customRow.hidden = ui.limit.value !== 'custom';
  ui.auto.hidden = !limited;
  ui.auto.textContent = hasQuality(format)
    ? 'Kalite otomatik ayarlanır.'
    : names[format] + ' çıktısının boyutu kodlama sonrasında kontrol edilir.';
  ui.shrinkRow.hidden = !limited;
  ui.qualityRow.hidden = limited || !hasQuality(format);
  ui.white.hidden = format !== 'jpeg' && format !== 'bmp';
  ui.fitRow.hidden = !source || ui.lock.checked;
  ui.percent.textContent = ui.quality.value;
  if (ui.rotation) ui.rotation.textContent = (quarterTurns * 90) + '°';
  [ui.rotateRight, ui.rotateLeft, ui.flip, ui.sizePreset, ui.reset, ui.width, ui.height, ui.lock]
    .forEach(control => { control.disabled = !source; });
}

function clearSource() {
  sourceVersion++;
  if (source) URL.revokeObjectURL(source.url);
  source = null;
  quarterTurns = 0;
  invalidate();
  ui.sourcePanel.hidden = true;
  ui.preview.removeAttribute('src');
  ui.sourceInfo.textContent = '';
  ui.width.value = ui.height.value = ui.file.value = '';
  ui.flip.checked = false;
  ui.sizePreset.value = 'original';
  refreshControls();
}

function checkDimensions(width, height) {
  const validEdge = value => Number.isInteger(value) && value > 0 && value <= maxEdge;
  if (!validEdge(width) || !validEdge(height) || width * height > maxPixels) {
    throw Error('Pozitif tam ölçüler gir. En uzun kenar 12.000 px, toplam alan 24 megapiksel olabilir.');
  }
}

function inspectGif(bytes, view) {
  const invalid = () => Error('GIF dosyası eksik veya bozuk.');
  if (bytes.length < 13) throw invalid();
  checkDimensions(view.getUint16(6, true), view.getUint16(8, true));
  // Global and local color tables have three bytes per palette entry.
  const paletteSize = flags => (flags & 0x80) ? 3 * (2 << (flags & 7)) : 0;
  let cursor = 13 + paletteSize(bytes[10]);
  let frames = 0;
  function skipSubBlocks() {
    while (cursor < bytes.length) {
      const count = bytes[cursor++];
      if (count === 0) return;
      cursor += count;
    }
    throw invalid();
  }
  while (cursor < bytes.length) {
    const marker = bytes[cursor++];
    if (marker === 0x3b && frames === 1) return 'gif';
    if (marker === 0x21) {
      cursor++; // Extension label, followed by length-prefixed blocks.
      skipSubBlocks();
    } else if (marker === 0x2c) {
      if (++frames > 1) throw Error('Animasyonlu GIF desteklenmiyor. Tek kareli bir görsel seç.');
      if (cursor + 9 > bytes.length) throw invalid();
      checkDimensions(view.getUint16(cursor + 4, true), view.getUint16(cursor + 6, true));
      cursor += 9 + paletteSize(bytes[cursor + 8]);
      cursor++; // Minimum LZW code size.
      skipSubBlocks();
    } else {
      throw invalid();
    }
  }
  throw invalid();
}

function inspect(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const tag = index => String.fromCharCode(...bytes.subarray(index, index + 4));
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  if (signature === 'GIF87a' || signature === 'GIF89a') return inspectGif(bytes, view);
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    if (bytes.length < 26) throw Error('BMP dosyası eksik.');
    const headerSize = view.getUint32(14, true);
    if (headerSize === 12) {
      checkDimensions(view.getUint16(18, true), view.getUint16(20, true));
    } else if (headerSize >= 16 && headerSize <= bytes.length - 14) {
      checkDimensions(view.getInt32(18, true), Math.abs(view.getInt32(22, true)));
    } else {
      throw Error('BMP başlığı okunamadı.');
    }
    return 'bmp';
  }
  const png = bytes.subarray(0, 8).join() === '137,80,78,71,13,10,26,10';
  if (!png && !(tag(0) === 'RIFF' && tag(8) === 'WEBP')) {
    throw Error('JPG, PNG, WebP, BMP veya tek kareli GIF biçiminde bir görsel seç.');
  }
  for (let index = png ? 8 : 12; index < bytes.length;) {
    const length = view.getUint32(index + (png ? 0 : 4), !png);
    const type = tag(index + (png ? 4 : 0));
    if (['acTL', 'ANIM', 'ANMF'].includes(type) || (type === 'VP8X' && (bytes[index + 8] & 2))) {
      throw Error('Animasyonlu PNG ve WebP desteklenmiyor.');
    }
    if (png && type === 'IHDR') {
      checkDimensions(view.getUint32(index + 8), view.getUint32(index + 12));
    }
    index += length + (png ? 12 : 8 + (length % 2));
    if (index > bytes.length) throw Error('Görsel verisi eksik.');
  }
  return png ? 'png' : 'webp';
}

async function loadFile(file, readyMessage = 'Görsel hazır.') {
  clearSource();
  const version = sourceVersion;
  let url = '';
  try {
    if (!file) throw Error('Bir defada tek görsel seç.');
    if (file.size > maxFileBytes) throw Error('En fazla 50 MB olan bir görsel seç.');
    indicate('Görsel açılıyor…', 'busy', true);
    const data = await file.arrayBuffer();
    if (version !== sourceVersion) return;
    const format = inspect(data);
    url = URL.createObjectURL(new Blob([data], {type: 'image/' + format}));
    const image = new Image();
    image.src = url;
    await image.decode();
    if (version !== sourceVersion) return;
    checkDimensions(image.naturalWidth, image.naturalHeight);
    source = { file, image, url, format };
    url = '';
    ui.preview.src = source.url;
    originalSize();
    ui.sourceInfo.textContent = [
      file.name, names[format], image.naturalWidth + ' × ' + image.naturalHeight + ' px', size(file.size)
    ].join(' · ');
    ui.sourcePanel.hidden = false;
    refreshControls();
    document.dispatchEvent(new Event('source-ready'));
    indicate(readyMessage, 'ready', true);
  } catch (error) {
    if (version === sourceVersion) {
      indicate(error.constructor === Error ? error.message : 'Görsel okunamadı. Dosya bozuk veya eksik olabilir.', 'error', true);
    }
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

function orientedSize() {
  const { naturalWidth, naturalHeight } = source.image;
  return quarterTurns % 2 ? [naturalHeight, naturalWidth] : [naturalWidth, naturalHeight];
}

function applySizePreset(preset) {
  if (!source || preset === 'custom') return;
  const [width, height] = orientedSize();
  const scale = preset === 'original' ? 1 : Math.min(1, Number(preset) / Math.max(width, height));
  ui.width.value = Math.max(1, Math.round(width * scale));
  ui.height.value = Math.max(1, Math.round(height * scale));
  ui.sizePreset.value = preset;
}

function originalSize() {
  applySizePreset('original');
  invalidate();
}

function rotate(direction) {
  if (!source) return;
  quarterTurns = (quarterTurns + direction + 4) % 4;
  const width = ui.width.value;
  ui.width.value = ui.height.value;
  ui.height.value = width;
  invalidate();
  refreshControls();
  indicate('Dönüş açısı ' + (quarterTurns * 90) + '°.');
}

function adjustDimensions(target) {
  if (!source) return;
  if (target === ui.sizePreset) {
    applySizePreset(ui.sizePreset.value);
    return;
  }
  if (![ui.width, ui.height, ui.lock].includes(target)) return;
  if (target !== ui.lock) ui.sizePreset.value = 'custom';
  if (!ui.lock.checked) return;
  const [width, height] = orientedSize();
  if (target === ui.height) {
    if (ui.height.valueAsNumber > 0) ui.width.value = Math.max(1, Math.round(ui.height.valueAsNumber * width / height));
  } else if (ui.width.valueAsNumber > 0) {
    ui.height.value = Math.max(1, Math.round(ui.width.valueAsNumber * height / width));
  }
}

ui.choose.onclick = () => ui.file.click();
ui.replace.onclick = () => ui.file.click();
ui.clear.onclick = clearSource;
document.addEventListener('paste', event => {
  const items = Array.from(event.clipboardData?.items || []);
  const item = items.find(entry => entry.kind === 'file' && entry.type.startsWith('image/'));
  const file = item?.getAsFile();
  if (!file) return;
  event.preventDefault();
  loadFile(file, 'Panodaki görsel hazır.');
});
ui.reset.onclick = originalSize;
ui.rotateLeft.onclick = () => rotate(-1);
ui.rotateRight.onclick = () => rotate(1);
ui.file.onchange = () => {
  if (ui.file.files.length) loadFile(ui.file.files[0]);
};
document.ondragover = event => event.preventDefault();
document.ondrop = event => {
  event.preventDefault();
  ui.drop.classList.remove('over');
  if (event.dataTransfer.files.length) {
    loadFile(event.dataTransfer.files.length === 1 ? event.dataTransfer.files[0] : null);
  }
};
ui.drop.ondragover = () => ui.drop.classList.add('over');
ui.drop.ondragleave = event => {
  if (!ui.drop.contains(event.relatedTarget)) ui.drop.classList.remove('over');
};
ui.settings.oninput = event => {
  invalidate();
  adjustDimensions(event.target);
  refreshControls();
};

function draw(image, width, height, format, turns = 0, flip = false, background = '#ffffff', fit = 'stretch') {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw Error('Çizim için yeterli bellek yok.');
  if (format === 'jpeg' || format === 'bmp') {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
  }
  // Flip in output coordinates, after the user's rotation.
  context.translate(width / 2, height / 2);
  if (flip) context.scale(-1, 1);
  context.rotate(turns * Math.PI / 2);
  let drawWidth = turns % 2 ? height : width;
  let drawHeight = turns % 2 ? width : height;
  if (fit === 'contain' || fit === 'cover') {
    const scaleX = drawWidth / image.naturalWidth;
    const scaleY = drawHeight / image.naturalHeight;
    const scale = fit === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
    drawWidth = image.naturalWidth * scale;
    drawHeight = image.naturalHeight * scale;
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  return canvas;
}

function encodeBmp(canvas) {
  const { width, height } = canvas;
  const stride = Math.ceil(width * 3 / 4) * 4;
  const pixelBytes = stride * height;
  const header = new DataView(new ArrayBuffer(54));
  header.setUint16(0, 0x4d42, true);
  header.setUint32(2, 54 + pixelBytes, true);
  header.setUint32(10, 54, true);
  header.setUint32(14, 40, true); // BITMAPINFOHEADER
  header.setInt32(18, width, true);
  header.setInt32(22, height, true);
  header.setUint16(26, 1, true);
  header.setUint16(28, 24, true);
  header.setUint32(34, pixelBytes, true);

  const pixels = new Uint8Array(pixelBytes);
  const context = canvas.getContext('2d');
  // Read in strips to limit temporary RGBA memory. BMP scanlines run bottom-up.
  for (let top = 0; top < height; top += 128) {
    const rows = Math.min(128, height - top);
    const { data } = context.getImageData(0, top, width, rows);
    let input = 0;
    for (let row = 0; row < rows; row++) {
      let output = (height - 1 - top - row) * stride;
      for (let x = 0; x < width; x++) {
        pixels[output++] = data[input + 2];
        pixels[output++] = data[input + 1];
        pixels[output++] = data[input];
        input += 4;
      }
    }
  }
  return new Blob([header, pixels], {type: 'image/bmp'});
}

async function encode(canvas, format, quality) {
  if (format === 'bmp') return encodeBmp(canvas);
  const mime = 'image/' + format;
  const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, quality));
  if (!blob?.size || blob.type !== mime) throw Error('Tarayıcı seçilen formatta çıktı üretemedi.');
  return blob;
}

function showResult(blob, width, height, format, quality, target) {
  resultUrl = URL.createObjectURL(blob);
  ui.output.src = ui.download.href = resultUrl;
  const stem = source.file.name.replace(/\.[^.]+$/, '') || 'gorsel';
  ui.download.download = stem + '-canconverter.' + (format === 'jpeg' ? 'jpg' : format);
  const delta = blob.size - source.file.size;
  const difference = delta === 0 ? 'Boyut aynı' : size(Math.abs(delta)) + (delta > 0 ? ' artış' : ' azalma');
  const details = [names[format], width + ' × ' + height + ' px', size(blob.size), difference];
  if (hasQuality(format)) details.push('%' + Math.round(quality * 100) + ' kalite');
  ui.details.textContent = details.join(' · ');
  ui.result.hidden = false;
  indicate(target ? number(target / 1000) + ' KB sınırına ulaşıldı. Dosyan hazır.' : 'Dönüşüm tamamlandı.', 'ready');
}

function byteTarget() {
  if (ui.limit.value === '0') return 0;
  const target = ui.limit.value === 'custom'
    ? Math.floor(ui.amount.valueAsNumber * Number(ui.unit.value))
    : Number(ui.limit.value);
  if (!Number.isSafeInteger(target) || target < 1) throw Error('En az 1 bayta karşılık gelen pozitif bir sınır gir.');
  return target;
}

ui.convert.onclick = async () => {
  if (!source || ui.convert.disabled) return;
  invalidate();
  const token = revision;
  ui.convert.disabled = true;
  try {
    const width = ui.width.valueAsNumber;
    const height = ui.height.valueAsNumber;
    const format = ui.format.value;
    checkDimensions(width, height);
    const target = byteTarget();
    const allowShrink = target > 0 && ui.shrink.checked;
    const qualities = target && hasQuality(format) ? automaticQualities : [Number(ui.quality.value) / 100];
    const fit = ui.lock.checked ? 'stretch' : ui.fitMode.value;
    const attempts = allowShrink ? 12 : 1;
    indicate('Dönüştürülüyor…', 'busy');
    for (let step = 0; step < attempts; step++) {
      const scale = .75 ** step;
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const canvas = draw(source.image, w, h, format, quarterTurns, ui.flip.checked, ui.background.value, fit);
      try {
        for (const quality of qualities) {
          const blob = await encode(canvas, format, quality);
          if (token !== revision) return;
          if (!target || blob.size <= target) {
            showResult(blob, w, h, format, quality, target);
            return;
          }
        }
      } finally {
        canvas.width = canvas.height = 1;
      }
      if (w === 1 && h === 1) break;
    }
    const suggestion = allowShrink ? 'Daha yüksek bir sınır seç.' : 'Ölçüleri küçültmeye izin ver veya sınırı yükselt.';
    throw Error(number(target / 1000) + ' KB sınırına ulaşılamadı. ' + suggestion);
  } catch (error) {
    if (token === revision) indicate(error.message, 'error');
  } finally {
    if (token === revision) ui.convert.disabled = !source;
  }
};

refreshControls();

