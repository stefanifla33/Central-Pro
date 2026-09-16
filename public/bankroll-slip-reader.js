(function () {
  'use strict';

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Não foi possível abrir o print.'));
      reader.readAsDataURL(file);
    });
  }

  async function analyze(file, onProgress) {
    if (!file) throw new Error('Escolha um print da aposta.');
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error('Use uma imagem PNG, JPG ou WEBP.');
    if (file.size > 10 * 1024 * 1024) throw new Error('O print é muito grande. Use uma imagem de até 10 MB.');

    onProgress?.(10);
    const image = await fileToDataUrl(file);
    onProgress?.(25);
    const response = await fetch('/api/bankroll/read-slip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image })
    });
    onProgress?.(80);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || 'Não foi possível analisar o print.');
    onProgress?.(100);
    return payload;
  }

  window.BankrollSlipReader = { analyze };
}());
