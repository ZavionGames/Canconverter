'use strict';

// Each page has the proportions of its converted image. JPEG data is embedded
// directly where possible. All PDF syntax here is ASCII, so lengths are bytes.
async function createImagePdf(entries) {
  if (!entries.length) throw Error('PDF için önce en az bir görsel dönüştür.');
  const chunks = [];
  const offsets = [0];
  let length = 0;
  function append(part) {
    chunks.push(part);
    length += typeof part === 'string' ? part.length : part.size;
  }
  function startObject(id) {
    offsets[id] = length;
    append(id + ' 0 obj\n');
  }
  function object(id, value) {
    startObject(id);
    append(value + '\nendobj\n');
  }
  append('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const pages = entries.map((_, i) => (3 + 3 * i) + ' 0 R');
  object(2, '<< /Type /Pages /Count ' + entries.length + ' /Kids [' + pages.join(' ') + '] >>');
  for (const [i, entry] of entries.entries()) {
    const url = URL.createObjectURL(entry.blob);
    const image = new Image();
    let canvas;
    try {
      image.src = url;
      await image.decode();
      const width = image.naturalWidth, height = image.naturalHeight;
      let jpeg = entry.blob;
      if (jpeg.type !== 'image/jpeg') {
        canvas = draw(image, width, height, 'jpeg');
        jpeg = await encode(canvas, 'jpeg', .95);
      }
      const pageWidth = width * .75, pageHeight = height * .75;
      const id = 3 + 3 * i;
      object(id, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageWidth + ' ' + pageHeight +
        '] /Resources << /XObject << /Img ' + (id + 1) + ' 0 R >> >> /Contents ' + (id + 2) + ' 0 R >>');
      startObject(id + 1);
      append('<< /Type /XObject /Subtype /Image /Width ' + width + ' /Height ' + height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.size + ' >>\nstream\n');
      append(jpeg);
      append('\nendstream\nendobj\n');
      const paint = 'q\n' + pageWidth + ' 0 0 ' + pageHeight + ' 0 0 cm\n/Img Do\nQ\n';
      object(id + 2, '<< /Length ' + paint.length + ' >>\nstream\n' + paint + 'endstream');
    } finally {
      if (canvas) canvas.width = canvas.height = 1;
      URL.revokeObjectURL(url);
    }
  }
  const xref = length;
  append('xref\n0 ' + offsets.length + '\n0000000000 65535 f \n');
  for (const offset of offsets.slice(1)) append(String(offset).padStart(10, '0') + ' 00000 n \n');
  append('trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(chunks, { type: 'application/pdf' });
}

