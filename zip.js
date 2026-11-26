'use strict';

// ZIP uses the stored method because most image formats are already compressed.
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return value >>> 0;
});

async function crc32(blob) {
  let checksum = 0xffffffff;
  for (let start = 0; start < blob.size; start += 1048576) {
    const block = new Uint8Array(await blob.slice(start, start + 1048576).arrayBuffer());
    for (const byte of block) checksum = crcTable[(checksum ^ byte) & 255] ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function uniqueArchiveName(name, used) {
  const leaf = name.split(/[\\/]/).pop().replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/^[. ]+|[. ]+$/g, '') || 'gorsel';
  const dot = leaf.lastIndexOf('.');
  const stem = dot > 0 ? leaf.slice(0, dot) : leaf;
  const ext = dot > 0 ? leaf.slice(dot) : '';
  let candidate = leaf;
  for (let suffix = 2; used.has(candidate.toLowerCase()); suffix++) {
    candidate = stem + ' (' + suffix + ')' + ext;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

async function createImageZip(entries) {
  const local = [], directory = [], used = new Set();
  const encoder = new TextEncoder();
  const now = new Date();
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  let offset = 0, directorySize = 0;
  if (entries.length > 65535) throw Error('Bir ZIP içinde en fazla 65.535 dosya olabilir.');
  for (const {name, blob} of entries) {
    const filename = encoder.encode(uniqueArchiveName(name, used));
    const header = new DataView(new ArrayBuffer(30));
    const central = new DataView(new ArrayBuffer(46));
    if (filename.length > 65535 || offset + blob.size + directorySize + 76 + filename.length * 2 + 22 >= 0xffffffff) {
      throw Error('ZIP boyut sınırına ulaşıldı. Dosyaları daha küçük gruplar hâlinde indir.');
    }
    const checksum = await crc32(blob);
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x0800, true); // UTF-8 names
    header.setUint16(10, time, true);
    header.setUint16(12, date, true);
    header.setUint32(14, checksum, true);
    header.setUint32(18, blob.size, true);
    header.setUint32(22, blob.size, true);
    header.setUint16(26, filename.length, true);
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    new Uint8Array(central.buffer, 6, 26).set(new Uint8Array(header.buffer, 4, 26));
    central.setUint32(42, offset, true);
    local.push(header.buffer, filename, blob);
    directory.push(central.buffer, filename);
    offset += 30 + filename.length + blob.size;
    directorySize += 46 + filename.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...local, ...directory, end.buffer], { type: 'application/zip' });
}

