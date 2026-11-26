'use strict';
(() => {
  const engines=window.converterEngines;
  const rows=[];
  let controller=null,preferred=null;
  const option=(value,label)=>new Option(label??(value==='sfnt'?'TTF / OTF (kaynağa göre)':value.toUpperCase()),value);
  function fill(select,values){select.replaceChildren(...values.map(v=>option(v)));}
  function status(text){ui.hubStatus.textContent=text;}
  const engine=()=>engines[Number(ui.routeGroup.value)];
  for(const [i,e] of engines.entries())ui.routeGroup.add(option(i,e.label));
  ui.routeGroup.value=String(Math.max(0,engines.findIndex(e=>e.inputs.includes('pdf'))));
  function routeTarget(){ui.routeNote.textContent=engine().note?.(ui.routeSource.value,ui.routeTarget.value)||'Kaynak ve çıktı dosyaları bilgisayarında işlenir.';}
  function routeSource(){fill(ui.routeTarget,engine().outputs(ui.routeSource.value));routeTarget();}
  function routeGroup(){fill(ui.routeSource,engine().inputs);routeSource();}
  ui.routeGroup.onchange=routeGroup;ui.routeSource.onchange=routeSource;ui.routeTarget.onchange=routeTarget;routeGroup();
  function choose(route){preferred=route;ui.hubFiles.accept=route?'.'+route.ext:'';ui.hubFiles.click();}
  ui.hubChoose.onclick=()=>choose(null);
  ui.routeChoose.onclick=()=>choose({engine:engine(),ext:ui.routeSource.value,out:ui.routeTarget.value});
  function refresh(){
    const supported=rows.filter(r=>r.engine);
    const common=supported.length?supported[0].engine.outputs(supported[0].ext).filter(f=>supported.every(r=>r.engine.outputs(r.ext).includes(f))):[];
    const prior=ui.hubCommon.value;fill(ui.hubCommon,common);if(common.includes(prior))ui.hubCommon.value=prior;
    ui.hubApply.disabled=!!controller||!common.length;ui.hubCommon.disabled=ui.hubApply.disabled;
    ui.hubToolbar.hidden=ui.hubActions.hidden=!rows.length;ui.hubStop.hidden=!controller;
    ui.hubConvert.disabled=!!controller||!supported.some(r=>!r.output);
    ui.hubZip.hidden=!rows.some(r=>r.output);ui.hubZip.disabled=!!controller;
    for(const b of [ui.hubChoose,ui.routeChoose,ui.hubClear])b.disabled=!!controller;
    for(const r of rows)r.box.disabled=!!controller;
  }
  function reset(r){
    if(r.url)URL.revokeObjectURL(r.url);r.output=r.url=null;r.link.removeAttribute('href');r.link.hidden=true;r.msg.textContent='Bekliyor';
  }
  function fields(r){
    r.fields.replaceChildren();r.inputs={};
    for(const f of r.engine.options(r.ext,r.select.value)){
      const label=document.createElement('label');label.textContent=f.label;
      const input=document.createElement(f.type==='select'?'select':'input');
      if(f.type==='select')for(const [v,t] of f.values)input.add(option(v,t));else input.type=f.type||'text';
      for(const k of ['placeholder','min','max','step'])if(f[k]!=null)input[k]=f[k];
      if(f.type==='checkbox')input.checked=!!f.value;else if(f.value!=null)input.value=f.value;
      label.append(input);r.fields.append(label);r.inputs[f.key]=input;
    }
    r.note.textContent=r.engine.note?.(r.ext,r.select.value)||'';
    r.settings.hidden=!Object.keys(r.inputs).length&&!r.note.textContent;
  }
  function append(files,route=null){
    if(controller){status('Yeni dosya eklemek için işlemin bitmesini bekle veya durdur.');return;}
    for(const file of files){
      const ext=file.name.toLowerCase().split('.').pop();
      const e=route?.ext===ext?route.engine:engines.find(x=>x.inputs.includes(ext));
      const row=document.createElement('li');
      row.innerHTML='<fieldset><strong></strong><small></small><label>Çıktı biçimi<select></select></label><details><summary>Ayarlar</summary><p></p><div class="hub-fields"></div></details><div class="row-tools"><button>Kaldır</button><a hidden class="primary">İndir</a></div></fieldset><p role="status"></p>';
      const q=s=>row.querySelector(s);
      const r={engine:e,file,ext,box:q('fieldset'),select:q('select'),fields:q(".hub-fields"),settings:q('details'),note:q('details p'),link:q('a'),msg:q('[role=status]')};
      q('strong').textContent=file.name;q('small').textContent=(e?.label||'Desteklenmeyen biçim')+' · '+file.size.toLocaleString('tr-TR')+' bayt';
      q('button').onclick=()=>{reset(r);rows.splice(rows.indexOf(r),1);row.remove();refresh();};
      if(e){
        fill(r.select,e.outputs(ext));if(route?.ext===ext)r.select.value=route.out;
        fields(r);reset(r);
        r.select.onchange=()=>{fields(r);reset(r);refresh();};
        r.fields.oninput=()=>{reset(r);refresh();};
      }else{q('label').hidden=r.settings.hidden=true;r.msg.textContent='Bu dosya türü için kullanılabilir bir dönüştürücü bulunamadı.';}
      rows.push(r);ui.hubQueue.append(row);
    }
    status('');refresh();
  }
  ui.hubFiles.onchange=()=>{append([...ui.hubFiles.files],preferred);ui.hubFiles.value='';preferred=null;};
  for(const name of ['drop','dragover','paste'])window.addEventListener(name,event=>{
    if(ui.hubPanel.hidden)return;
    const files=(event.dataTransfer||event.clipboardData)?.files;
    if(name!=='dragover'&&!files?.length)return;
    event.stopImmediatePropagation();event.preventDefault();if(name!=='dragover')append([...files]);
  },true);
  ui.hubClear.onclick=()=>{rows.forEach(reset);rows.length=0;ui.hubQueue.replaceChildren();status('');refresh();};
  ui.hubApply.onclick=()=>{const target=ui.hubCommon.value;for(const r of rows)if(r.engine&&r.select.value!==target){r.select.value=target;r.select.onchange();}};
  ui.hubStop.onclick=()=>{controller?.abort();status('Durduruluyor…');};
  ui.hubConvert.onclick=async()=>{
    controller=new AbortController();const signal=controller.signal;refresh();status('Dönüştürülüyor…');
    try{for(const r of rows.filter(r=>r.engine&&!r.output)){
      if(signal.aborted)break;
      r.msg.textContent='Dönüştürülüyor…';
      try{
        const settings={};
        for(const [key,el] of Object.entries(r.inputs)){
          if(el.validity.badInput||el.validity.rangeOverflow||el.validity.rangeUnderflow||el.validity.stepMismatch)throw Error('Ayar değerlerini kontrol et.');
          settings[key]=el.type==='checkbox'?el.checked:el.value;
        }
        let result=await r.engine.convert(r.file,r.select.value,settings,signal);
        if(Array.isArray(result))result=result.length===1?result[0]:{name:r.file.name+'-sayfalar.zip',blob:await createImageZip(result)};
        signal.throwIfAborted();
        if(!result?.blob?.size)throw Error('Boş çıktı üretildi.');
        r.output=result;r.url=URL.createObjectURL(result.blob);r.link.href=r.url;r.link.download=result.name;r.link.hidden=false;r.msg.textContent='Hazır · '+result.blob.size.toLocaleString('tr-TR')+' bayt';
      }catch(err){r.msg.textContent=signal.aborted?'Durduruldu.':'Dönüştürülemedi. '+err.message;}
    }}finally{status((signal.aborted?'Durduruldu. ':'')+rows.filter(r=>r.output).length+' dosya indirilmeye hazır.');controller=null;refresh();}
  };
  ui.hubZip.onclick=async()=>{try{const blob=await createImageZip(rows.filter(r=>r.output).map(r=>r.output));const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='canconverter-sonuclar.zip';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),60000);}catch(err){status(err.message);}};
  refresh();
})();

