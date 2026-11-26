'use strict';

(() => {
  const audioInputs = 'mp3 wav wave flac aac ogg oga opus wma m4a m4b m4r aiff aif aifc alac amr awb ac3 eac3 dts caf au snd ra voc w64 wv ape tta mpc mp2 mpa spx gsm tak dsf dff mlp thd adx oma shn'.split(' ');
  const videoInputs = 'mp4 avi mov mkv webm flv wmv 3gp 3g2 m4v mpg mpeg mpe mpv m2v vob ts m2ts mts ogv rm rmvb asf divx xvid f4v swf mxf dv dif mod tod nut nsv roq wtv y4m hevc h264 h265 obu ivf'.split(' ');
  const audioEncoders = {
    mp3: 'libmp3lame', wav: 'pcm_s16le', flac: 'flac', m4a: 'aac', aac: 'aac', opus: 'libopus',
    ogg: 'libvorbis', aiff: 'pcm_s16be', wma: 'wmav2', ac3: 'ac3', au: 'pcm_s16be', caf: 'pcm_s16le', mp2: 'mp2'
  };
  const videoEncoders = {
    mp4: ['libx264', 'libx265', 'mpeg4'], mov: ['libx264', 'mpeg4', 'prores'],
    webm: ['libvpx', 'libvpx-vp9'], mkv: ['libx264', 'libx265', 'libvpx-vp9', 'mpeg4'],
    avi: ['mpeg4', 'mjpeg'], wmv: ['wmv2'], ogv: ['libtheora'], ts: ['libx264', 'mpeg2video']
  };
  const videoAudio = { mp4: 'aac', mov: 'aac', mkv: 'aac', webm: 'libopus', avi: 'libmp3lame', wmv: 'wmav2', ogv: 'libvorbis', ts: 'aac' };
  const audioRates = { mp3: [22050, 32000, 44100, 48000], opus: [8000, 12000, 16000, 24000, 48000], ac3: [32000, 44100, 48000], mp2: [32000, 44100, 48000], wma: [22050, 32000, 44100, 48000] };
  const compressedAudio = new Set(['mp3', 'm4a', 'aac', 'opus', 'ogg', 'wma', 'ac3', 'mp2']);
  const codecNames = { libx264: 'H.264', libx265: 'H.265 / HEVC', libvpx: 'VP8', 'libvpx-vp9': 'VP9', libtheora: 'Theora', mpeg4: 'MPEG-4 Part 2', mjpeg: 'Motion JPEG', prores: 'ProRes', wmv2: 'Windows Media Video 8', mpeg2video: 'MPEG-2' };
  const mime = {
    wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', flac: 'audio/flac', opus: 'audio/ogg',
    ogg: 'audio/ogg', aac: 'audio/aac', ac3: 'audio/ac3', aiff: 'audio/aiff', wma: 'audio/x-ms-wma', mp2: 'audio/mpeg',
    au: 'audio/basic', caf: 'audio/x-caf', mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
    webm: 'video/webm', avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', ogv: 'video/ogg', ts: 'video/mp2t',
    gif: 'image/gif', jpg: 'image/jpeg', png: 'image/png'
  };
  const select = (key, label, pairs, value) => ({
    key, label, type: 'select', value: String(value),
    values: pairs.map(pair => Array.isArray(pair) ? pair.map(String) : [String(pair), String(pair)])
  });
  const numeric = (key, label, value, min, max, step = 1) => ({ key, label, type: 'number', value, min, max, step });
  const firstFrame = output => output === 'png' || output === 'jpg';
  const audioFormats = Object.keys(audioEncoders);
  const videoFormats = Object.keys(videoEncoders);

  function options(ext, output) {
    const fields = [
      numeric('start', firstFrame(output) ? 'Kare zamanı (saniye)' : 'Başlangıç (saniye)', 0, 0, 604800, .01)
    ];
    if (!firstFrame(output)) fields.push(numeric('end', 'Bitiş (saniye, boşsa sonuna kadar)', '', 0, 604800, .01));
    if (audioFormats.includes(output)) {
      fields.push(select('rate', 'Örnekleme hızı', [['auto', 'Otomatik'], ...(audioRates[output] || [8000, 16000, 22050, 32000, 44100, 48000, 96000]).map(n => [n, n + ' Hz'])], 'auto'));
      fields.push(select('channels', 'Ses kanalları', [['auto', 'Otomatik'], ['1', 'Mono'], ['2', 'Stereo']], 'auto'));
      if (compressedAudio.has(output)) {
        const rates = output === 'wma' ? [64, 96, 128, 160, 192] : [64, 96, 128, 160, 192, 256, 320];
        fields.push(select('bitrate', 'Ses bit hızı', rates.map(n => [n, n + ' kbps']), 128));
      }
      if (output === 'wav' || output === 'aiff') fields.push(select('depth', 'PCM bit derinliği', [16, 24, 32], 16));
      fields.push(numeric('volume', 'Ses seviyesi (%)', 100, 0, 500),
        numeric('fadeIn', 'Girişte sesi aç (saniye)', 0, 0, 600, .1),
        numeric('fadeOut', 'Çıkışta sesi kıs (saniye)', 0, 0, 600, .1));
      return fields;
    }
    const encoders = videoEncoders[output];
    if (encoders) fields.push(select('codec', 'Video kodeği', encoders.map(k => [k, codecNames[k]]), encoders[0]));
    fields.push(select('height', 'Çıktı yüksekliği', [['original', 'Orijinal ölçü'], ...[240,360,480,720,1080,2160].map(h => [h, 'En fazla ' + h + ' px'])], 'original'));
    if (!firstFrame(output)) {
      fields.push(select('fps', 'Kare hızı', [['auto','Kaynağı koru'], ...[10, 15, 24, 25, 30, 50, 60].map(n => [n, n + ' fps'])], output === 'gif' ? '10' : 'auto'));
    }
    fields.push(select('rotate','Döndürme', [[0, 'Döndürme yok'],[90, '90° sağa'],[180, '180°'],[270, '90° sola']], 0),
      select('mirror','Aynalama', [['none','Kapalı'],['hflip','Yatay'],['vflip','Dikey']], 'none'));
    if (encoders) {
      fields.push(select('videoBitrate', 'Video bit hızı', [400, 800, 1500, 2500, 4000, 8000, 12000].map(n => [n,n + ' kbps']), 2500),
        select('audioTrack','Ses izi', [['keep','Varsa ses izini ekle'],['none','Sesi kaldır']], 'keep'));
    }
    return fields;
  }

  function readSettings(ext, output, settings) {
    const values = {};
    for (const field of options(ext, output)) {
      let raw = settings[field.key];
      if (raw == null || raw === '') raw = field.value;
      if (field.type === 'select') {
        if (!field.values.some(pair => pair[0] === String(raw))) throw Error(field.label + ' için geçerli bir seçenek seç.');
        values[field.key] = String(raw);
      } else if (raw === '') {
        values[field.key] = null;
      } else {
        const value = Number(raw);
        if (!Number.isFinite(value) || value < field.min || value > field.max || (field.step === 1 && !Number.isInteger(value))) {
          throw Error(field.label + ' için ' + field.min + ' ile ' + field.max + ' arasında bir sayı gir.');
        }
        values[field.key] = value;
      }
    }
    if (values.end != null && values.end <= values.start) throw Error('Bitiş zamanı başlangıçtan sonra olmalı.');
    return values;
  }

  function command(output, values, duration, hasAudio, sourceHeight) {
    if (Number.isFinite(duration) && values.start >= duration) throw Error('Başlangıç zamanı dosyanın süresini aşıyor.');
    const end = Math.min(values.end ?? Infinity, duration);
    const length = end - values.start;
    const args = ['-hide_banner', '-loglevel', 'error', '-threads', '1'];
    if (values.start) args.push('-ss', String(values.start));
    args.push('-protocol_whitelist', 'file', '-i', 'source');
    if (!firstFrame(output) && values.end != null) args.push('-t', String(length));
    args.push('-map_metadata', '-1', '-sn', '-dn', '-threads', '1');
    if (audioFormats.includes(output)) {
      if (!hasAudio) throw Error('Kaynak dosyada dönüştürülebilir bir ses izi bulunamadı.');
      let encoder = audioEncoders[output];
      if (values.depth) encoder = 'pcm_s' + values.depth + (output === 'aiff' ? 'be' : 'le');
      args.push('-map', '0:a:0', '-vn', '-c:a', encoder);
      if (values.bitrate) args.push('-b:a', values.bitrate + 'k');
      if (values.rate !== 'auto') args.push('-ar', values.rate);
      if (values.channels !== 'auto') args.push('-ac', values.channels);
      const filters = [];
      if (values.volume !== 100) filters.push('volume=' + values.volume / 100);
      if (values.fadeIn) filters.push('afade=t=in:d=' + Math.min(values.fadeIn, length));
      if (values.fadeOut) {
        if (!Number.isFinite(length)) throw Error('Sonda sesi kısmak için bir bitiş zamanı belirt.');
        const fade = Math.min(values.fadeOut, length);
        filters.push('afade=t=out:st=' + (length - fade) + ':d=' + fade);
      }
      if (filters.length) args.push('-af', filters.join(','));
    } else {
      args.push('-map', '0:V:0');
      const filters = [];
      if (values.rotate === '90') filters.push('transpose=clock');
      if (values.rotate === '180') filters.push('hflip','vflip');
      if (values.rotate === '270') filters.push('transpose=cclock');
      if (values.mirror !== 'none') filters.push(values.mirror);
      if (values.fps && values.fps !== 'auto') filters.push('fps=' + values.fps);
      if (values.height !== 'original') filters.push('scale=-2:min(ih\\,' + values.height + ')');
      if (videoEncoders[output]) {
        if (output === 'ogv') {
          // Theora's minimum picture region is 18 pixels on each axis.
          filters.push('pad=max(18\\,ceil(iw/2)*2):max(18\\,ceil(ih/2)*2)');
        } else filters.push('pad=ceil(iw/2)*2:ceil(ih/2)*2');
        args.push('-c:v', values.codec, '-b:v', values.videoBitrate + 'k', '-pix_fmt', values.codec === 'prores' ? 'yuv422p10le' : 'yuv420p');
        if (['libx264','libx265'].includes(values.codec)) args.push('-preset','ultrafast');
        if (values.codec === 'libx265') args.push('-x265-params','pools=none:frame-threads=1:wpp=0:log-level=error');
        if (values.codec.startsWith('libvpx')) args.push('-deadline','realtime','-cpu-used','5');
        if (values.audioTrack === 'keep' && hasAudio) args.push('-map','0:a:0','-c:a',videoAudio[output],'-b:a','128k');
        else args.push('-an');
        if (output === 'mp4' || output === 'mov') args.push('-movflags','+faststart');
      } else {
        args.push('-an');
        if (firstFrame(output)) args.push('-frames:v', '1', '-c:v', output === 'png' ? 'png' : 'mjpeg', '-update', '1');
        if (output === 'gif') args.push('-loop', '0');
      }
      if (filters.length) args.push('-vf', filters.join(','));
    }
    args.push('output.' + output);
    return args;
  }

  // The worker gets only this job's bytes. Terminating it cancels FFmpeg and
  // releases its linear memory, temporary files and partially written output.
  async function runWorker(event) {
    try {
      const { wasm, source, output, values, audioFormats, videoEncoders, audioEncoders, videoAudio } = event.data;
      const core = await createFFmpegCore({ wasmBinary: wasm });
      core.FS.writeFile('source', new Uint8Array(source));
      const log = [];
      core.setLogger(({message}) => {
        if (message && !message.startsWith('Aborted')) {
          log.push(message);
          if (log.length > 8) log.shift();
        }
      });
      core.ffprobe('-v', 'error', '-protocol_whitelist', 'file', '-show_entries',
        'format=duration:stream=codec_type,width,height,duration:stream_disposition=attached_pic', '-of', 'json', '-o', 'streams.json', 'source');
      if (!core.FS.analyzePath('streams.json').exists) throw Error('Medya dosyası açılamadı. Dosya bozuk, şifreli veya desteklenmeyen bir biçimde olabilir. ' + log.join(' '));
      const info = JSON.parse(core.FS.readFile('streams.json', { encoding: 'utf8' }));
      const streams = info.streams || [];
      const video = streams.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
      if (!audioFormats.includes(output) && !video) throw Error('Kaynak dosyada bir video izi bulunamadı.');
      const duration = Number(info.format?.duration) || Math.max(0, ...streams.map(stream => Number(stream.duration) || 0)) || Infinity;
      const args = makeCommand(output, values, duration, streams.some(stream => stream.codec_type === 'audio'), video?.height);
      core.reset();
      log.length = 0;
      const result = core.exec(...args);
      if (result !== 0) {
        const details = log.join(' ').slice(-300);
        throw Error('Dönüşüm tamamlanamadı. Dosyanın kodeğini ve seçtiğin ayarları kontrol et.' + (details ? ' (' + details + ')' : ''));
      }
      const data = core.FS.readFile('output.' + output);
      if (!data.length) throw Error('Seçilen zaman aralığından çıktı üretilemedi.');
      self.postMessage({data: data.buffer}, [data.buffer]);
    } catch (error) {
      self.postMessage({error: error.message || 'Medya motoru dosyayı işleyemedi.'});
    }
  }

  let corePromise;
  function loadCore() {
    if (corePromise) return corePromise;
    corePromise = (async () => {
      if (!window.canconverterMediaCore) await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.onload = resolve;
        script.onerror = () => { script.remove(); reject(Error('Yerel medya motoru yüklenemedi. assets klasörünü kontrol et.')); };
        script.src = 'assets/vendor/media/ffmpeg-payload.js';
        document.head.append(script);
      });
      const data = window.canconverterMediaCore;
      const compressed = Uint8Array.from(atob(data.gzipWasm), ch => ch.charCodeAt(0));
      const bytes = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const bindings = 'const audioFormats=' + JSON.stringify(audioFormats) + ',videoEncoders=' + JSON.stringify(videoEncoders) +
        ',audioEncoders=' + JSON.stringify(audioEncoders) + ',videoAudio=' + JSON.stringify(videoAudio) + ';';
      const code = [data.loader, '\n', bindings, 'const firstFrame=', firstFrame.toString(),
        '; const makeCommand=', command.toString(), '; self.onmessage=', runWorker.toString(), ';'];
      const workerUrl = URL.createObjectURL(new Blob(code, {type:'text/javascript'}));
      delete window.canconverterMediaCore;
      return {bytes, workerUrl};
    })().catch(error => { corePromise = null; throw error; });
    return corePromise;
  }

  async function convert(file, output, settings = {}, signal) {
    if (file.size > 256_000_000) throw Error('Ses ve video dosyaları en fazla 256 MB olabilir.');
    if (!file.size) throw Error('Kaynak dosya boş.');
    const ext = file.name.split('.').pop().toLowerCase();
    if (!outputs(ext).includes(output)) throw Error('Bu medya dönüşümü desteklenmiyor.');
    const values = readSettings(ext, output, settings);
    signal?.throwIfAborted();
    const [core, source] = await Promise.all([loadCore(), file.arrayBuffer()]);
    signal?.throwIfAborted();
    const bytes = await new Promise((resolve, reject) => {
      const worker = new Worker(core.workerUrl);
      const cleanup = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
      const abort = () => { cleanup(); reject(new DOMException('Dönüşüm iptal edildi.', 'AbortError')); };
      signal?.addEventListener('abort', abort, {once:true});
      worker.onmessage = ({data}) => {
        cleanup();
        if (data.error) reject(Error(data.error));
        else resolve(data.data);
      };
      worker.onerror = () => { cleanup(); reject(Error('Yerel medya motoru çalıştırılamadı. Daha küçük bir dosya veya farklı ayarlar dene.')); };
      worker.postMessage({wasm:core.bytes, source, output, values, audioFormats, videoEncoders, audioEncoders, videoAudio}, [source]);
    });
    return {blob:new Blob([bytes], {type:mime[output]}), name:(file.name.replace(/\.[^.]+$/, '') || 'medya') + '-canconverter.' + output};
  }

  function outputs(ext) {
    return videoInputs.includes(ext) ? [...videoFormats, ...audioFormats, 'gif', 'jpg', 'png'] : [...audioFormats];
  }
  window.converterEngines.push({label:'Ses ve video', inputs:[...audioInputs, ...videoInputs], outputs, options, convert});
})();


