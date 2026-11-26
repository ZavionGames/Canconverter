'use strict';

(() => {
  const vendor = new URL('assets/vendor/docs/', document.currentScript.src);
  const loading = new Map();
  function library(name) {
    if (loading.has(name)) return loading.get(name);
    const pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL(name + '.js', vendor).href;
      script.onload = resolve;
      script.onerror = () => {
        loading.delete(name);
        reject(Error('Belge bileşeni açılamadı. Proje klasörünü tüm dosyalarıyla birlikte çıkar.'));
      };
      document.head.append(script);
    });
    loading.set(name, pending);
    return pending;
  }

  const mime = {
    pdf: 'application/pdf', txt: 'text/plain', html: 'text/html', md: 'text/markdown',
    rtf: 'application/rtf', fb2: 'application/xml', epub: 'application/epub+zip',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    odt: 'application/vnd.oasis.opendocument.text'
  };
  const encoder = new TextEncoder();
  const utf8 = new TextDecoder();
  const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
  const officeNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const packageNs = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const wNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const xml = text => String(text).replace(/[<>&"'\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
    char => ({'<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;'}[char] || ''));
  const paragraphs = text => text.replace(/\r\n?/g, '\n').split('\n');
  const nodes = (root, tag) => Array.from(root.getElementsByTagNameNS('*', tag));
  const stem = name => name.replace(/\.[^.]+$/, '') || 'belge';
  const extent = name => name.split('.').pop().toLowerCase();

  function readXml(bytes, description) {
    if (!bytes) throw Error(description + ' bulunamadı.');
    const text = typeof bytes === 'string' ? bytes : utf8.decode(bytes);
    if (/<!ENTITY\s/i.test(text)) throw Error('Özel XML varlıkları içeren belgeler desteklenmiyor.');
    const document = new DOMParser().parseFromString(text, 'application/xml');
    if (nodes(document, 'parsererror').length) throw Error(description + ' okunamadı.');
    return document;
  }
  function readText(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
    if (bytes.subarray(0, 1024).includes(0)) throw Error('Dosya düz metin olarak okunamadı.');
    return utf8.decode(bytes);
  }

  function htmlText(source) {
    const template = document.createElement('template');
    template.innerHTML = source;
    const root = template.content;
    for (const hidden of root.querySelectorAll('script,style,template,noscript,head,iframe,object,svg,[hidden]')) hidden.remove();
    // Template contents are inert, including image/link resources in the input.
    const blocks = new Set('ADDRESS ARTICLE ASIDE BLOCKQUOTE CAPTION DD DIV DL DT FIGCAPTION FOOTER H1 H2 H3 H4 H5 H6 HEADER HR LI MAIN OL P PRE SECTION TABLE TR UL'.split(' '));
    const parts = [];
    function walk(element, pre) {
      if (element.nodeType === Node.TEXT_NODE) {
        parts.push(pre ? element.data : element.data.replace(/\s+/g, ' '));
        return;
      }
      if (element.nodeName === 'BR') { parts.push('\n'); return; }
      if (blocks.has(element.nodeName)) parts.push('\n');
      for (const child of element.childNodes) walk(child, pre || element.nodeName === 'PRE');
      if (element.nodeName === 'TD' || element.nodeName === 'TH') parts.push('\t');
      if (blocks.has(element.nodeName)) parts.push('\n');
    }
    walk(root, false);
    return paragraphs(parts.join('').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim());
  }

  function rtfText(source) {
    if (!/^\s*\{\s*\\rtf\d/.test(source)) throw Error('RTF başlığı okunamadı.');
    const destinations = new Set('fonttbl colortbl stylesheet info pict object header footer filetbl listtable listoverridetable fldinst datastore xmlnstbl themedata colorschememapping'.split(' '));
    const symbols = {par:'\n', line:'\n', tab:'\t', emdash:'—', endash:'–', bullet:'•', lquote:'‘', rquote:'’', ldblquote:'“', rdblquote:'”'};
    const stack = [];
    let state = {skip:false, uc:1, codepage:1252}, skipChars = 0;
    let result = '';
    function literal(text) {
      if (skipChars) { skipChars--; return; }
      if (!state.skip) result += text;
    }
    for (let i = 0; i < source.length;) {
      const char = source[i++];
      if (char === '{') {stack.push(state); state = {...state}; continue;}
      if (char === '}') {state = stack.pop() || state; continue;}
      if (char !== '\\') {if (char !== '\n' && char !== '\r') literal(char); continue;}
      const symbol = source[i++];
      if (symbol === '*') {state.skip = true; continue;}
      if (symbol === "'") {
        const bytes = [];
        for (;;) {
          bytes.push(parseInt(source.slice(i, i + 2), 16)); i += 2;
          if (source.slice(i, i + 2) !== "\\'") break;
          i += 2;
        }
        const encoding = state.codepage === 65001 ? 'utf-8' : 'windows-' + state.codepage;
        let decoded;
        try {decoded = new TextDecoder(encoding).decode(Uint8Array.from(bytes));}
        catch {decoded = new TextDecoder('windows-1252').decode(Uint8Array.from(bytes));}
        for (const c of decoded) literal(c);
        continue;
      }
      if (!/[a-z]/i.test(symbol || '')) {
        if (symbol && '{}\\'.includes(symbol)) literal(symbol);
        if (symbol === '~') literal(' ');
        continue;
      }
      const start = i - 1;
      while (i < source.length && /[a-z]/i.test(source[i])) i++;
      const word = source.slice(start, i);
      const paramStart = i;
      if (source[i] === '-') i++;
      while (i < source.length && /\d/.test(source[i])) i++;
      const param = Number(source.slice(paramStart, i));
      if (source[i] === ' ') i++;
      if (destinations.has(word)) state.skip = true;
      else if (word === 'bin') i += Math.max(0, param);
      else if (word === 'ansicpg') state.codepage = param;
      else if (word === 'uc') state.uc = Math.max(0, param);
      else if (word === 'u' && !state.skip) {
        result += String.fromCharCode((param + 65536) % 65536);
        skipChars = state.uc;
      } else if (symbols[word] && !state.skip) result += symbols[word];
    }
    return paragraphs(result.trimEnd());
  }

  function localPath(base, href) {
    if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(href)) return '';
    const parts = href.startsWith('/') ? [] : base.split('/').slice(0, -1);
    const clean = decodeURIComponent(href.split(/[?#]/)[0]);
    for (const part of clean.split('/')) {
      if (part === '..') { if (!parts.length) return ''; parts.pop(); }
      else if (part && part !== '.') parts.push(part);
    }
    return parts.join('/');
  }

  async function unpackDocument(bytes) {
    await library('fflate');
    let total = 0;
    return fflate.unzipSync(bytes, {filter(entry) {
      if (!/\.(xml|rels|xhtml|html?|opf)$/i.test(entry.name)) return false;
      if (entry.originalSize > 32_000_000 || (total += entry.originalSize) > 90_000_000) {
        throw Error('Belgenin açılmış metin içeriği tarayıcı belleği için çok büyük.');
      }
      return true;
    }});
  }
  function wordParagraphs(doc) {
    return nodes(doc, 'p').map(p => Array.from(p.getElementsByTagName('*')).map(node => {
      if (node.localName === 't') return node.textContent;
      if (node.localName === 'br') return '\n';
      if (node.localName === 'tab') return '\t';
      return '';
    }).join(''));
  }
  function odfText(root) {
    let text = '';
    for (const child of root.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) text += child.data;
      else if (child.localName === 'tab') text += '\t';
      else if (child.localName === 'line-break') text += '\n';
      else if (child.localName === 's') text += ' '.repeat(Math.max(1, Math.min(10000, Number(child.getAttribute('text:c')) || 1)));
      else if (child.nodeType === Node.ELEMENT_NODE) text += odfText(child);
    }
    return text;
  }
  async function documentText(file, ext, bytes) {
    if (['txt','md','markdown','tex'].includes(ext)) return paragraphs(readText(bytes));
    if (['html','htm','xhtml'].includes(ext)) return htmlText(readText(bytes));
    if (ext === 'rtf') return rtfText(new TextDecoder('windows-1252').decode(bytes));
    if (ext === 'fb2') {
      const doc = readXml(bytes, 'FB2 belgesi');
      if (doc.documentElement.localName !== 'FictionBook') throw Error('FictionBook başlığı okunamadı.');
      return nodes(doc, 'body').flatMap(body => nodes(body, 'p').map(p => p.textContent));
    }
    const entries = await unpackDocument(bytes);
    if (['docx','docm','dotx','dotm'].includes(ext)) return wordParagraphs(readXml(entries['word/document.xml'], 'Word belgesi'));
    if (['odt','ott','odp','otp'].includes(ext)) {
      const doc = readXml(entries['content.xml'], 'OpenDocument içeriği');
      return Array.from(doc.getElementsByTagName('*')).filter(n => ['p','h'].includes(n.localName)).map(odfText);
    }
    if (['pptx','pptm','ppsx','ppsm','potx','potm'].includes(ext)) {
      const slideList = readXml(entries['ppt/presentation.xml'], 'Sunum');
      const rels = readXml(entries['ppt/_rels/presentation.xml.rels'], 'Slayt listesi');
      const targets = new Map(nodes(rels, 'Relationship').map(r => [r.getAttribute('Id'),r.getAttribute('Target')]));
      const sections = [];
      for (const slide of nodes(slideList, 'sldId')) {
        const ref = targets.get(slide.getAttributeNS(officeNs,'id'));
        if (!ref) continue;
        sections.push(...wordParagraphs(readXml(entries[localPath('ppt/presentation.xml', ref)], 'Slayt')), '');
      }
      return sections;
    }
    const container = readXml(entries['META-INF/container.xml'], 'EPUB dizini');
    const path = nodes(container,'rootfile')[0]?.getAttribute('full-path');
    const pkg = readXml(entries[path], 'EPUB içerik listesi');
    const manifest = new Map(nodes(pkg, 'item').map(n => [n.getAttribute('id'), n.getAttribute('href')]));
    const result = [];
    for (const item of nodes(pkg, 'itemref')) {
      const href = manifest.get(item.getAttribute('idref'));
      if (!href) continue;
      const body = entries[localPath(path, href)];
      if (body) result.push(...htmlText(utf8.decode(body)), '');
    }
    return result;
  }


  function pageList(text,count) {
    if (!text?.trim()) return Array.from({length:count},(_,i)=>i+1);
    const pages=new Set();
    for (const part of text.split(',')) {
      const m=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) throw Error('Sayfa aralığını 1-3,5 biçiminde gir.');
      const first=Number(m[1]), last=Number(m[2]||first);
      if(first<1||last>count||last<first) throw Error('Geçerli sayfa aralığı 1–'+count+'.');
      for(let i=first;i<=last;i++) pages.add(i);
    }
    return [...pages];
  }
  async function wordFile(lines) {
    await library('fflate');
    const files={
      '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      '_rels/.rels':'<Relationships xmlns="'+packageNs+'"><Relationship Id="rId1" Type="'+officeNs+'/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/document.xml':'<w:document xmlns:w="'+wNs+'"><w:body>'+lines.map(s=>'<w:p><w:r><w:t xml:space="preserve">'+xml(s)+'</w:t></w:r></w:p>').join('')+'<w:sectPr/></w:body></w:document>'
    };
    return fflate.zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,encoder.encode(xmlHeader+v)])));
  }
  async function textPdf(lines) {
    await Promise.all(['pdf-lib','fontkit','pdf-data'].map(library));
    const doc=await PDFLib.PDFDocument.create();doc.registerFontkit(fontkit);
    const font=await doc.embedFont(Uint8Array.from(atob(pdfLocalResources['LiberationSans-Regular.ttf']),c=>c.charCodeAt(0)),{subset:true});
    let page,y=0;
    function put(text){if(y<48){page=doc.addPage([595,842]);y=794;}page.drawText(text,{x:42,y,font,size:11});y-=16;}
    for(const s of lines){
      let line='',width=0;
      for(const c of s.replace(/\t/g,'    ')){
        const n=font.widthOfTextAtSize(c,11);
        if(width+n>510){put(line);line='';width=0;}line+=c;width+=n;
      }put(line);
    }
    return doc.save();
  }
  window.converterEngines.push({label:'Belgeler ve e-kitap',inputs:'pdf docx docm dotx dotm odt ott pptx pptm ppsx ppsm potx potm odp otp epub txt md markdown tex html htm xhtml rtf fb2'.split(' '),
    outputs(ext){return ext==='pdf'?['txt','docx','png','jpg','pdf','html','epub']:['pdf','docx','txt','html','epub'].filter(x=>x!==ext);},
    options(ext){return ext==='pdf'?[{key:'pages',type:'text',label:'Sayfalar',placeholder:'Tümü veya 1-3,5'}]:[];},
    note(ext,out){return ext==='pdf'&&['png','jpg','pdf'].includes(out)?'Seçilen sayfaların düzeni korunur.':'Metin içeriği aktarılır. Taranmış sayfalarda OCR uygulanmaz.';},
    async convert(file,out,s,signal){
      if(file.size>128e6)throw Error('Belge sınırı 128 MB.');
      const bytes=new Uint8Array(await file.arrayBuffer()),ext=extent(file.name),base=stem(file.name);
      let lines=[],content;
      if(ext==='pdf'&&out==='pdf'){
        await library('pdf-lib');const src=await PDFLib.PDFDocument.load(bytes),doc=await PDFLib.PDFDocument.create();
        for(const page of await doc.copyPages(src,pageList(s.pages,src.getPageCount()).map(n=>n-1))) doc.addPage(page);
        content=await doc.save();
      }else if(ext==='pdf'){
        await Promise.all(['pdf','pdf.worker','pdf-data'].map(library));
        const task=pdfjsLib.getDocument({data:bytes,isEvalSupported:false,useWorkerFetch:false,useSystemFonts:true,useWasm:false});
        const passwordError=new Promise((_,reject)=>{task.onPassword=()=>{reject(Error('Önce belgenin parolasını kaldırarak tekrar seç.'));task.destroy();};});
        const doc=await Promise.race([task.promise,passwordError]),images=[];
        try{for(const n of pageList(s.pages,doc.numPages)){
          signal?.throwIfAborted();const p=await doc.getPage(n);
          if(['png','jpg'].includes(out)){
            const v=p.getViewport({scale:1.5});checkDimensions(Math.ceil(v.width),Math.ceil(v.height));
            const c=document.createElement('canvas');c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);
            await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;
            images.push({name:base+'-'+n+'.'+out,blob:await encode(c,out==='jpg'?'jpeg':out,.92)});c.width=c.height=1;
          }else{const t=await p.getTextContent();lines.push(...paragraphs(t.items.map(x=>(x.str||'')+(x.hasEOL?'\n':' ')).join('')));}
          p.cleanup();
        }}finally{await doc.destroy();}
        if(images.length)return images;
        if(!lines.join('').trim())throw Error('PDF’de okunabilir metin katmanı bulunamadı. Sayfaları PNG olarak alabilirsin.');
      }else lines=await documentText(file,ext,bytes);
      if(content===undefined){
        if(out==='pdf')content=await textPdf(lines);
        else if(out==='docx')content=await wordFile(lines);
        else if(out==='epub'){
          await library('fflate');
          const title=xml(base),id='urn:uuid:'+crypto.randomUUID();
          const files={
            mimetype:[encoder.encode('application/epub+zip'),{level:0}],
            'META-INF/container.xml':encoder.encode('<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
            'book.opf':encoder.encode('<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>'+title+'</dc:title><dc:language>und</dc:language><dc:identifier id="id">'+id+'</dc:identifier></metadata><manifest><item id="text" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="toc"><itemref idref="text"/></spine></package>'),
            'toc.ncx':encoder.encode('<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="'+id+'"/></head><docTitle><text>'+title+'</text></docTitle><navMap><navPoint id="one" playOrder="1"><navLabel><text>'+title+'</text></navLabel><content src="chapter.xhtml"/></navPoint></navMap></ncx>'),
            'chapter.xhtml':encoder.encode('<html xmlns="http://www.w3.org/1999/xhtml"><head><title>'+title+'</title></head><body>'+lines.map(s=>'<p>'+xml(s)+'</p>').join('')+'</body></html>')
          };content=fflate.zipSync(files);
        }else if(out==='html')content='<!doctype html><meta charset="utf-8">'+lines.map(s=>'<p>'+xml(s)+'</p>').join('');
        else content=lines.join('\n');
      }
      return {name:base+'-canconverter.'+out,blob:new Blob([content],{type:mime[out]})};
    }});
})();

