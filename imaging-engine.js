'use strict';
(() => {
  // Worker and binary are packaged locally so that double-click/file:// works.
  function imageWorker() {
    self.onmessage = async ({data}) => {
      try {
        const api = self['magick-wasm'];
        await api.initializeImageMagick(data.wasm);
        if (data.catalog) {
          postMessage(api.Magick.supportedFormats.map(f => [f.format, f.supportsReading, f.supportsWriting]));
          return;
        }
        const limits = api.ResourceLimits;
        limits.width = limits.height = 16000n;
        limits.memory = 384n * 1024n * 1024n;
        limits.listLength = 256n;
        const params = data.settings;
        const source = new Uint8Array(await data.file.arrayBuffer());
        const settings = new api.MagickReadSettings();
        settings.format = data.input;
        settings.frameIndex = Number(params.frame || 1) - 1;
        settings.frameCount = 1;
        const result = api.ImageMagick.read(source, settings, image => {
          image.autoOrient();
          if (image.width * image.height > 40000000) throw Error('Görsel 40 megapiksel sınırını aşıyor.');
          const edge = Number(params.edge || 0);
          if (edge && Math.max(image.width, image.height) > edge) image.resize(edge, edge);
          if (params.gray) image.colorSpace = api.ColorSpace.Gray;
          if (params.rotate && params.rotate !== '0') image.rotate(Number(params.rotate));
          if (params.flip) image.flop();
          if (Number(params.dpi)) image.density = new api.Density(Number(params.dpi));
          image.quality = Number(params.quality || 85);
          if (data.out === 'JPEG' || data.out === 'BMP3') {
            image.backgroundColor = new api.MagickColor('#ffffff');
            image.alpha(api.AlphaAction.Remove);
          }
          return image.write(data.out, bytes => bytes.slice());
        });
        postMessage({bytes:result}, [result.buffer]);
      } catch (error) {
        postMessage({error: String(error.message || error)});
      }
    };
  }
  let ready;
  async function inflatePack(encoded) {
    const data = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  async function runtime() {
    if (!ready) ready = (async () => {
      await loadLocalScript('assets/vendor/imaging/runtime.js');
      const [script, wasm] = await Promise.all([inflatePack(imageRuntime.script), inflatePack(imageRuntime.wasm)]);
      const workerUrl = URL.createObjectURL(new Blob([script, '\n(', imageWorker.toString(), ')();'], {type:'text/javascript'}));
      return {workerUrl, wasm};
    })().catch(error => { ready = null; throw error; });
    return ready;
  }
  async function run(data, signal) {
    const {workerUrl, wasm} = await runtime();
    signal?.throwIfAborted();
    return new Promise((resolve,reject) => {
      const worker = new Worker(workerUrl);
      const finish = (callback, value) => {
        worker.terminate();
        signal?.removeEventListener('abort', abort);
        callback(value);
      };
      const abort = () => finish(reject, new DOMException('Durduruldu.', 'AbortError'));
      signal?.addEventListener('abort', abort, {once:true});
      worker.onerror = event => finish(reject, Error(event.message || 'Görsel motoru çalıştırılamadı.'));
      worker.onmessage = event => event.data.error ? finish(reject, Error(event.data.error)) : finish(resolve, event.data);
      worker.postMessage({...data, wasm});
    });
  }
  const formats = {
    jpg:'JPEG', jpeg:'JPEG', jpe:'JPEG', jfif:'JPEG', png:'PNG', webp:'WEBP', bmp:'BMP', gif:'GIF',
    tif:'TIFF', tiff:'TIFF', ico:'ICO', cur:'CUR', tga:'TGA', pcx:'PCX', psd:'PSD', psb:'PSB',
    dds:'DDS', hdr:'HDR', pbm:'PBM', pgm:'PGM', ppm:'PPM', pnm:'PNM', pam:'PAM', pfm:'PFM',
    sgi:'SGI', sun:'SUN', ras:'RAS', xbm:'XBM', xpm:'XPM', wbmp:'WBMP',
    jp2:'JP2', j2k:'J2K', jpc:'JPC', fits:'FITS', fit:'FITS', dcm:'DCM', dpx:'DPX', cin:'CIN', 
    svg:'SVG', heic:'HEIC', heif:'HEIC', avif:'AVIF', dng:'DNG', arw:'ARW', cr2:'CR2', cr3:'CR3',
    nef:'NEF', nrw:'NRW', orf:'ORF', raf:'RAF', rw2:'RW2', pef:'PEF', srw:'SRW', crw:'CRW',
    erf:'ERF', mos:'MOS', mrw:'MRW', mef:'MEF', x3f:'X3F', dcr:'DCR', kdc:'KDC', '3fr':'3FR'
  };
  const outputs = ['png','jpg','webp','tiff','bmp','gif','ico','tga','pcx','ppm','pgm','pbm','pam','psd','dds','hdr','jp2','avif'];
  const select = (key,label,values,value) => ({key,label,type:'select',values,value});
  window.converterEngines.push({
    label:'Görsel ve RAW', inputs:Object.keys(formats), outputs:() => outputs,
    note:() => 'Her işlem bir kare veya katman oluşturur. Çok kareli kaynaklarda sıra numarasını seçebilirsin.',
    options(ext,out) {
      const fields = [select('edge', out === 'ico' ? 'Simge için en uzun kenar' : 'En uzun kenar', (out === 'ico' ? [16,24,32,48,64,128,256] : [0,800,1280,1920,2560,3840]).map(n=>[String(n),n ? n+' px':'Orijinal']),out === 'ico' ? '256':'0')];
      if (['jpg','webp','avif','jp2'].includes(out)) fields.push({key:'quality',label:'Kalite (%)',type:'number',value:'85',min:1,max:100,step:1});
      if (['gif','tif','tiff','ico','psd','psb'].includes(ext)) fields.push({key:'frame',label:'Kare / sayfa / katman',type:'number',min:1,max:256,value:'1',step:1});
      fields.push(select('rotate','Döndürme',['0','90','180','270'].map(v=>[v,v+'°']),'0'),
        {key:'gray',label:'Gri tonlama',type:'checkbox'}, {key:'flip',label:'Yatay aynala',type:'checkbox'});
      if (['tiff','jpg','png'].includes(out)) fields.push({key:'dpi',label:'Çözünürlük (DPI)',type:'number',placeholder:'Kaynağı koru',min:1,max:2400});
      return fields;
    },
    async convert(file,out,settings,signal) {
      const ext = file.name.split('.').pop().toLowerCase();
      const result = await run({file,input:formats[ext],out:out === 'bmp' ? 'BMP3' : formats[out],settings},signal);
      const mime = {jpg:'image/jpeg',tiff:'image/tiff',ico:'image/x-icon'}[out] || 'image/'+out;
      return {name:file.name.replace(/\.[^.]+$/,'')+'-canconverter.'+out,blob:new Blob([result.bytes],{type:mime})};
    }
  });
  window.getImagingCapabilities = () => run({catalog:true});
})();

