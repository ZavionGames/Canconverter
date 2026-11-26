'use strict';

(() => {
  const engines = window.converterEngines;
  const vendor = name => window.loadLocalScript('assets/vendor/data/' + name);
  const archiveLimit = 128 * 1024 * 1024;
  const fileLimit = 64 * 1024 * 1024;
  const entryLimit = 5000;
  const ext = file => file.name.split('.').pop().toLowerCase();
  const filename = (file, out) => (file.name.replace(/\.(?:tar\.(?:gz|bz2|xz)|[^.]+)$/i, '') || 'dosya') + '.' + out;
  const result = (file, out, bytes, mime) => ({name: filename(file, out), blob: new Blob([bytes], {type: mime})});
  const utf8 = new TextEncoder();
  const decoder = new TextDecoder('utf-8', {fatal:true});
  const viewOf = data => new DataView(data.buffer, data.byteOffset, data.byteLength);
  const fail = message => {throw new Error(message);};
  const safeText = data => {
    try {return decoder.decode(data);}
    catch {fail('Metin UTF-8 kodlamasında olmalı.');}
  };
  async function inputBytes(file,limit) {
    if (file.size > limit) fail('Bu işlem için dosya sınırı ' + (limit/1048576) + ' MiB.');
    if (!file.size) fail('Dosya boş.');
    return new Uint8Array(await file.arrayBuffer());
  }

  // Check both the recorded size and the bytes actually produced by the decompressor.
  async function unpackStream(data, format, maximum) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(format));
    const reader = stream.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maximum) {await reader.cancel(); fail('Açılan veri güvenli işlem boyutunu aşıyor.');}
        chunks.push(value);
      }
    } finally {reader.releaseLock();}
    return new Uint8Array(await new Blob(chunks).arrayBuffer());
  }
  const crcTable = Uint32Array.from({length:256}, (_, value) => {
    for (let i=0; i<8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  function checksum(data) {
    let crc = -1;
    for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ -1) >>> 0;
  }
  function archivePath(name) {
    name = name.replace(/\\/g, '/').replace(/^(?:\.\/)+/,'');
    if (/^\/|^[a-z]:|[\0-\x1f]/i.test(name) || name.split('/').includes('..')) fail('Arşivde güvenli olmayan bir dosya yolu var.');
    return name.split('/').filter(part => part && part !== '.').join('/');
  }
  function addEntry(entries, names, name, data, directory=false) {
    const path = archivePath(name);
    if (!path && directory) return;
    if (!path || names.has(path)) fail('Arşivde geçersiz veya yinelenen bir yol var.');
    if (entries.length >= entryLimit) fail('Arşiv en fazla 5.000 kayıt içerebilir.');
    names.add(path);
    entries.push({path, data, directory});
  }
  async function readZip(data, maximum=archiveLimit) {
    const view=viewOf(data);
    let end=data.length-22;
    while (end>=Math.max(0,data.length-65557) && (view.getUint32(end,true)!==0x06054b50 || end+22+view.getUint16(end+20,true)!==data.length)) end--;
    if (end<Math.max(0,data.length-65557)) fail('ZIP dizini bulunamadı.');
    const count=view.getUint16(end+10,true);
    if (view.getUint32(end+4,true)!==0 || count>entryLimit) fail('Çok parçalı veya 5.000 kayıttan büyük ZIP desteklenmiyor.');
    const entries=[], names=new Set();
    let cursor=view.getUint32(end+16,true), sum=0;
    for (let i=0;i<count;i++) {
      if (cursor+46>end || view.getUint32(cursor,true)!==0x02014b50) fail('ZIP dizini bozuk.');
      const flags=view.getUint16(cursor+8,true), method=view.getUint16(cursor+10,true);
      const packed=view.getUint32(cursor+20,true), size=view.getUint32(cursor+24,true);
      const local=view.getUint32(cursor+42,true), nameLength=view.getUint16(cursor+28,true);
      const mode=view.getUint32(cursor+38,true)>>>16;
      if ((flags&1) || ![0,8].includes(method)) fail('Şifreli ZIP ya da kullanılan sıkıştırma yöntemi desteklenmiyor.');
      if ((mode & 0xf000) === 0xa000) fail('Sembolik bağlantı içeren arşivler desteklenmiyor.');
      if ((sum+=size)>maximum || local+30>end || view.getUint32(local,true)!==0x04034b50) fail('ZIP boyutu sınırı aşıyor veya başlık bozuk.');
      const nameBytes=data.subarray(cursor+46,cursor+46+nameLength);
      const path=safeText(nameBytes);
      const offset=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
      if (offset+packed>end) fail('ZIP içeriği eksik.');
      const raw=data.subarray(offset,offset+packed);
      const output=method===0 ? raw : await unpackStream(raw,'deflate-raw',size);
      if (output.length!==size || checksum(output)!==view.getUint32(cursor+16,true)) fail('ZIP dosyasının bütünlük denetimi başarısız.');
      addEntry(entries,names,path,output,path.endsWith('/') || (mode & 0xf000)===0x4000);
      cursor+=46+nameLength+view.getUint16(cursor+30,true)+view.getUint16(cursor+32,true);
    }
    return entries;
  }

  const sheetInputs=['xls','xlsx','xlsm','xlsb','xltx','xltm','ods','csv','tsv','json','dif','slk','dbf','fods'];
  const sheetOutputs=['xlsx','xls','xlsb','ods','csv','tsv','json','html','dif','slk','fods'];
  const sheetTypes={xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xls:'application/vnd.ms-excel',ods:'application/vnd.oasis.opendocument.spreadsheet',csv:'text/csv;charset=utf-8',tsv:'text/tab-separated-values;charset=utf-8',json:'application/json',html:'text/html;charset=utf-8'};
  const singleSheet=new Set(['csv','tsv','json','html','slk','dif']);
  const separator = {comma:',',semicolon:';',tab:'\t'};
  function jsonRows(data) {
    const rows=JSON.parse(safeText(data));
    if (!Array.isArray(rows)) fail('JSON bir satır dizisi olmalı.');
    if (rows.every(Array.isArray)) return rows;
    if (!rows.every(row => row && typeof row==='object' && !Array.isArray(row))) fail('JSON satırları tutarlı dizi veya nesneler olmalı.');
    const keys=[...new Set(rows.flatMap(Object.keys))];
    return [keys,...rows.map(row => keys.map(key => Object.hasOwn(row,key) ? row[key] : null))];
  }
  function checkCells(rows) {
    let count=0;
    for (const row of rows) {
      count+=row.length;
      if (count>1500000 || row.some(value=>value!==null && typeof value==='object')) fail('Tablo en fazla 1.500.000 basit hücre içerebilir.');
    }
  }
  engines.push({
    label:'Elektronik tablolar', inputs:sheetInputs,
    outputs:input=>sheetOutputs.filter(out=>out!==input),
    options(input,out) {
      const options=[];
      if (singleSheet.has(out) && !['csv','tsv','json','dif','slk','dbf'].includes(input))
        options.push({key:'sheet',label:'Çalışma sayfası numarası',type:'number',min:1,step:1,value:'1'});
      if (input==='csv') options.push({key:'fromSep',label:'Kaynak CSV ayracı',type:'select',values:[['auto','Otomatik'],['comma','Virgül'],['semicolon','Noktalı virgül'],['tab','Sekme']],value:'auto'});
      if (out==='csv') options.push({key:'toSep',label:'Çıktı CSV ayracı',type:'select',values:[['comma','Virgül'],['semicolon','Noktalı virgül']],value:'comma'});
      return options;
    },
    async convert(file,out,settings) {
      await vendor('xlsx.min.js');
      const input=ext(file), bytes=await inputBytes(file,32*1048576);
      let book;
      if (input==='json') {
        const rows=jsonRows(bytes);
        checkCells(rows);
        book=XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Tablo');
      } else if (input==='csv' || input==='tsv') {
        const text=safeText(bytes);
        if (text.includes('\0')) fail('Tablo metni geçersiz.');
        book=XLSX.read(text,{type:'string',raw:true,FS:input==='tsv'?'\t':separator[settings.fromSep]});
      } else {
        if (['xlsx','xlsm','xlsb','xltx','xltm','ods'].includes(input)) {
          const contents=await readZip(bytes,64*1048576);
          const required=input==='ods'?'content.xml':input==='xlsb'?'xl/workbook.bin':'xl/workbook.xml';
          if (!contents.some(item=>item.path===required)) fail('Dosya seçilen elektronik tablo biçiminde değil.');
        } else if (input==='xls' && bytes[0]!==0xd0 && bytes[0]!==9) fail('XLS dosyasının başlığı geçersiz.');
        book=XLSX.read(bytes,{type:'array',cellFormula:true,cellStyles:false,bookVBA:false});
      }
      if (!book.SheetNames.length) fail('Çalışma sayfası bulunamadı.');
      for (const name of book.SheetNames) {
        const sheet=book.Sheets[name];
        if (!sheet['!ref']) continue;
        const range=XLSX.utils.decode_range(sheet['!ref']);
        if ((1+range.e.r-range.s.r)*(1+range.e.c-range.s.c)>1500000) fail('Sayfa 1.500.000 hücrelik işlem sınırını aşıyor.');
      }
      const index=singleSheet.has(out)?Number(settings.sheet || 1)-1:0;
      if (!Number.isInteger(index)||index<0||index>=book.SheetNames.length) fail('Geçerli sayfa numarası 1–'+book.SheetNames.length+' arasında olmalı.');
      const name=book.SheetNames[index], sheet=book.Sheets[name];
      let content;
      if (out==='json') content=JSON.stringify(XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null}),null,2);
      else if (out==='csv' || out==='tsv') content='\ufeff'+XLSX.utils.sheet_to_csv(sheet,{FS:out==='tsv'?'\t':separator[settings.toSep] || ',',RS:'\r\n'});
      else if (out==='html') {
        const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:''});
        content='<!doctype html><meta charset="utf-8"><title>'+escape(name)+'</title><table>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+escape(cell)+'</td>').join('')+'</tr>').join('')+'</table>';
      } else {
        if (out==='xls' || out==='slk' || out==='dif') {
          for (const sheetName of (singleSheet.has(out)?[name]:book.SheetNames)) {
            const ref=book.Sheets[sheetName]['!ref'];
            if (ref && (XLSX.utils.decode_range(ref).e.r>=65536 || XLSX.utils.decode_range(ref).e.c>=256)) fail('Bu eski biçimin satır veya sütun sınırı aşılıyor. XLSX seçebilirsin.');
          }
        }
        content=XLSX.write(book,{type:'array',bookType:out==='xls'?'biff8':out,compression:true,sheet:name});
      }
      return result(file,out,content,sheetTypes[out] || 'application/octet-stream');
    }
  });


  engines.push({label:'Arşiv',inputs:['zip','tar','tgz','gz'],outputs(ext){return ext==='zip'?['tar','tgz']:['zip'];}, options(){return [];},
    async convert(file,out){
      const data=await inputBytes(file,fileLimit);
      if(out==='zip' && (ext(file)==='tar'||ext(file)==='tgz'||file.name.toLowerCase().endsWith('.tar.gz'))){
        const tar=ext(file)==='tar'?data:await unpackStream(data,'gzip',archiveLimit);
        const entries=[],names=new Set();
        for(let i=0;;){
          if(i+512>tar.length)fail('TAR son kaydı bulunamadı.');
          const h=tar.subarray(i,i+512);
          if(h.every(b=>b===0))break;
          const str=(a,b)=>safeText(h.slice(a,b)).split(String.fromCharCode(0))[0];
          const oct=(a,b)=>parseInt(str(a,b).trim(),8);
          const sum=h.reduce((s,b,j)=>s+(j>=148&&j<156?32:b),0);
          if(sum!==oct(148,156))fail('TAR başlık denetimi başarısız.');
          const n=oct(124,136),kind=h[156],prefix=str(345,500);
          if(![0,48,53].includes(kind))fail('Bu TAR kaydı desteklenmiyor.');
          if(!Number.isSafeInteger(n)||i+512+n>tar.length)fail('Eksik TAR içeriği.');
          addEntry(entries,names,(prefix?prefix+'/':'')+str(0,100),tar.subarray(i+512,i+512+n),kind===53);
          i+=512+Math.ceil(n/512)*512;
        }
        await vendor('fflate.min.js');
        const records=Object.create(null);
        for(const item of entries) records[item.path+(item.directory?'/':'')]=item.data;
        return result(file,'zip',fflate.zipSync(records,{level:1}),'application/zip');
      }
      if(out==='zip'){
        const bytes=await unpackStream(data,'gzip',archiveLimit);
        return {name:filename(file,'zip'),blob:await createImageZip([{name:file.name.replace(/\.gz$/i,'')||'dosya',blob:new Blob([bytes])}])};
      }
      const chunks=[];
      for(const entry of await readZip(data)){
        const name=utf8.encode(entry.path);if(name.length>100)fail('TAR için dosya yolu 100 baytı aşıyor.');
        const head=new Uint8Array(512);head.set(name);const oct=(i,n,v)=>head.set(utf8.encode(v.toString(8).padStart(n-1,'0')+'\0'),i);
        oct(100,8,entry.directory?493:420);oct(108,8,0);oct(116,8,0);oct(124,12,entry.data.length);oct(136,12,0);
        head.fill(32,148,156);head[156]=entry.directory?53:48;head.set(utf8.encode('ustar\0'+'00'),257);
        oct(148,7,head.reduce((a,b)=>a+b,0));chunks.push(head,entry.data,new Uint8Array((512-entry.data.length%512)%512));
      }
      const tar=new Blob([...chunks,new Uint8Array(1024)],{type:'application/x-tar'});
      if(out==='tgz')return {name:filename(file,'tgz'),blob:await new Response(tar.stream().pipeThrough(new CompressionStream('gzip'))).blob()};
      return {name:filename(file,'tar'),blob:tar};
    }});
})();


(() => {
  const align=n=>(n+3)&~3;
  async function transcode(bytes,compress){
    const stream=new Blob([bytes]).stream().pipeThrough(compress?new CompressionStream('deflate'):new DecompressionStream('deflate'));
    const chunks=[];let total=0;
    for await(const part of stream){if((total+=part.length)>32e6)throw Error('Yazı tipi tablosu çok büyük.');chunks.push(part);}
    return new Uint8Array(await new Blob(chunks).arrayBuffer());
  }
  window.converterEngines.push({label:'Yazı tipleri',inputs:['ttf','otf','woff'],outputs:e=>e==='woff'?['sfnt']:['woff'],options:()=>[],
    note:ext=>ext==='woff'?'SFNT seçimi kaynağa göre TTF veya OTF dosyası üretir.':'Yazı tipi tabloları WOFF içinde sıkıştırılır.',
    async convert(file,out){
      if(file.size>32e6)throw Error('Yazı tipi dosya sınırı 32 MB.');
      const bytes=new Uint8Array(await file.arrayBuffer()),d=new DataView(bytes.buffer),toWoff=out==='woff';
      const flavor=d.getUint32(toWoff?0:4),count=d.getUint16(toWoff?4:12);
      if(![0x10000,0x4f54544f].includes(flavor)||(!toWoff&&d.getUint32(0)!==0x774f4646)||!count||count>4096)throw Error('Geçersiz yazı tipi başlığı.');
      const header=toWoff?44:12,entry=toWoff?20:16;
      let offset=header+entry*count,sfntSize=12+16*count;
      const directory=new Uint8Array(offset),v=new DataView(directory.buffer),parts=[directory];
      if(toWoff){v.setUint32(0,0x774f4646);v.setUint32(4,flavor);v.setUint16(12,count);v.setUint16(20,1);}
      else{const power=Math.floor(Math.log2(count));v.setUint32(0,flavor);v.setUint16(4,count);v.setUint16(6,16*2**power);v.setUint16(8,power);v.setUint16(10,count*16-16*2**power);}
      for(let i=0;i<count;i++){
        const a=(toWoff?12:44)+i*(toWoff?16:20),b=header+i*entry;
        const tag=d.getUint32(a),sum=d.getUint32(a+(toWoff?4:16)),pos=d.getUint32(a+(toWoff?8:4)),len=d.getUint32(a+12),packed=toWoff?len:d.getUint32(a+8);
        if(pos+packed>bytes.length||packed>len||(sfntSize+=align(len))>32e6)throw Error('Geçersiz yazı tipi tablosu.');
        let data=bytes.subarray(pos,pos+packed);if(toWoff){const z=await transcode(data,true);if(z.length<len)data=z;}else if(packed<len)data=await transcode(data,false);
        if(!toWoff&&data.length!==len)throw Error('Tablo uzunluğu uyuşmuyor.');
        v.setUint32(b,tag);v.setUint32(b+4,toWoff?offset:sum);v.setUint32(b+8,toWoff?data.length:offset);v.setUint32(b+12,len);if(toWoff)v.setUint32(b+16,sum);
        parts.push(data,new Uint8Array(align(data.length)-data.length));offset+=align(data.length);
      }
      if(toWoff){v.setUint32(8,offset);v.setUint32(16,sfntSize);}
      const ext=toWoff?'woff':flavor===0x10000?'ttf':'otf';
      const blob=new Blob(parts,{type:'font/'+ext});
      if(!toWoff){
        const rebuilt=new Uint8Array(await blob.arrayBuffer()),view=new DataView(rebuilt.buffer);
        for(let i=0;i<count;i++)if(view.getUint32(12+16*i)===0x68656164){
          const adjustment=view.getUint32(20+16*i)+8;view.setUint32(adjustment,0);let sum=0;
          for(let j=0;j<rebuilt.length;j+=4)sum=(sum+view.getUint32(j))>>>0;
          view.setUint32(adjustment,(0xb1b0afba-sum)>>>0);break;
        }
        return {name:file.name.replace(/\.[^.]+$/,'')+'.'+ext,blob:new Blob([rebuilt],{type:'font/'+ext})};
      }
      return {name:file.name.replace(/\.[^.]+$/,'')+'.'+ext,blob};
    }});
})();

