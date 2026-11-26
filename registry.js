'use strict';
window.converterEngines = [];
const localScripts = new Map();
window.loadLocalScript = function loadLocalScript(path) {
  if (!localScripts.has(path)) {
    const script = document.createElement('script');
    script.src = path;
    const loaded = new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = () => {
        localScripts.delete(path);
        script.remove();
        reject(Error('Gerekli dönüştürme bileşeni açılamadı. ZIP dosyasını tüm klasörleriyle çıkar.'));
      };
    });
    localScripts.set(path, loaded);
    document.head.append(script);
  }
  return localScripts.get(path);
};

