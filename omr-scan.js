/* Painel "Corrigir por imagem" (câmera ou upload) para correcao.html.
   Uso: <script src="omr-scan.js"></script> logo depois de app.js.

   Backend (Render): POST {API_BASE}/corrigir, multipart:
     foto     -> imagem da folha de respostas (obrigatório)
     gabarito -> JSON com 10 letras (opcional; só vale se a folha não tiver QR legível)
   Resposta: { ok, linhas, resumo, qr:{lido,texto,uuid} } ou { ok:false, mensagem }.

   Como o gabarito é escolhido (nesta ordem):
     1) QR da folha  -> acha a versão da prova em DB.versoes (pelo uuid) e usa o gabarito dela;
     2) window.omrScan.setGabarito(letras, rotulo), se alguém chamou (ex.: correcao.js);
     3) gabarito de teste do servidor.
   Evento 'omr:resultado' (document): detail = resumo + { versao_id, uuid, origem, respostas }.
   Imprimir a folha com QR de uma versão: window.omrScan.imprimirFolha(versao.uuid). */
(function () {
  const API_BASE = (window.FLYLEARN_API || 'https://flylearn.onrender.com').replace(/\/$/, '');
  const TIMEOUT_MS = 90000;
  const MAX_LADO = 2200;      // maior lado (px) da imagem enviada; o backend usa o mesmo limite
  const N_QUESTOES = 10;      // a folha tem 10 questões
  let gabarito = null, rotulo = '';

  // acorda o servidor assim que a página abre (o plano grátis do Render hiberna)
  fetch(API_BASE + '/health').catch(() => {});

  const css = `
  .scan-tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
  .scan-tabs button{padding:10px 16px;border:1px solid #d5d9e0;background:#fff;border-radius:8px;cursor:pointer;font:inherit}
  .scan-tabs button[aria-selected="true"]{background:#1f4fd8;border-color:#1f4fd8;color:#fff}
  .scan-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:start}
  @media(max-width:860px){.scan-grid{grid-template-columns:1fr}}
  .scan-stage{position:relative;margin:0 auto;width:100%;aspect-ratio:3/4;max-height:78vh;background:#10141c;border-radius:12px;overflow:hidden;display:grid;place-items:center;color:#cfd6e4}
  .scan-stage video{width:100%;height:100%;object-fit:contain}
  .scan-stage.up{aspect-ratio:auto;min-height:220px}
  .scan-stage.up img{width:100%;height:auto;max-height:70vh;object-fit:contain}
  /* moldura A4 em pé: a folha inteira deve caber nela, com os 4 quadrados nos cantos */
  .scan-stage .guide{position:absolute;top:50%;left:50%;height:94%;aspect-ratio:210/297;max-width:96%;transform:translate(-50%,-50%);border:2px dashed rgba(255,255,255,.65);border-radius:4px;pointer-events:none}
  .scan-stage .guide i{position:absolute;width:12px;height:12px;background:rgba(255,255,255,.9)}
  .scan-stage .guide i:nth-child(1){top:-2px;left:-2px}.scan-stage .guide i:nth-child(2){top:-2px;right:-2px}
  .scan-stage .guide i:nth-child(3){bottom:-2px;right:-2px}.scan-stage .guide i:nth-child(4){bottom:-2px;left:-2px}
  .scan-drop{cursor:pointer;text-align:center;padding:24px;line-height:1.5}
  .scan-drop.over{outline:3px solid #1f4fd8;outline-offset:-6px}
  .scan-drop small{display:block;opacity:.7}
  .scan-actions{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
  .scan-actions button{padding:12px 18px;border-radius:8px;border:1px solid #d5d9e0;background:#fff;cursor:pointer;font:inherit}
  .scan-actions .primary{background:#1f4fd8;border-color:#1f4fd8;color:#fff;flex:1 1 180px}
  .scan-actions button:disabled{opacity:.5;cursor:not-allowed}
  .scan-tip{font-size:.9rem;opacity:.75;margin-top:10px}
  .scan-info{font-size:.9rem;padding:8px 12px;border-radius:8px;background:#eef3ff;margin:0 0 12px}
  .scan-info.warn{background:#fff6dd}
  .scan-result .nota{font-size:2.4rem;font-weight:700;line-height:1}
  .scan-result .stats{display:flex;gap:14px;flex-wrap:wrap;margin:8px 0 14px;font-size:.92rem}
  .scan-result table{width:100%;border-collapse:collapse;font-size:.92rem}
  .scan-result th,.scan-result td{padding:6px 8px;border-bottom:1px solid #e6e9ef;text-align:center}
  .scan-result .CORRETA{color:#14803c;font-weight:600}
  .scan-result .INCORRETA{color:#c0392b;font-weight:600}
  .scan-result .BRANCO,.scan-result .ANULADA{color:#8a6d00;font-weight:600}
  .scan-empty{opacity:.65;padding:30px 0;text-align:center}
  `;
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <h2>3. Corrigir gabarito por imagem</h2>
    <p class="sub">Fotografe a <b>folha de respostas</b> (a que tem o QR) com a folha inteira no quadro, de preferência na vertical. Os quatro quadrados pretos dos cantos precisam aparecer.</p>
    <div class="scan-tip" id="scAlvo" style="margin:0 0 12px"></div>
    <div class="scan-tabs" role="tablist">
      <button type="button" role="tab" id="t-cam" aria-selected="true">Usar câmera</button>
      <button type="button" role="tab" id="t-up" aria-selected="false">Enviar imagem</button>
    </div>
    <div class="scan-grid">
      <div>
        <div class="scan-stage" id="stage"></div>
        <div class="scan-actions" id="acts"></div>
        <div class="scan-tip" id="tip"></div>
        <div class="error-box" id="scErr"></div>
      </div>
      <div class="scan-result" id="scRes"><div class="scan-empty">O resultado da correção aparece aqui.</div></div>
    </div>
    <canvas id="scCanvas" hidden></canvas>`;
  (document.querySelector('#scanMount') || document.querySelector('.content') || document.body).appendChild(panel);

  const $q = s => panel.querySelector(s);
  const stage = $q('#stage'), acts = $q('#acts'), tip = $q('#tip'), err = $q('#scErr'), res = $q('#scRes');
  let stream = null, blob = null, mode = 'cam';

  const showErr = m => { err.textContent = m || ''; err.style.display = m ? 'block' : 'none'; };
  const stopCam = () => { stream && stream.getTracks().forEach(t => t.stop()); stream = null; };
  const btn = (txt, cls, fn) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: txt, className: cls || '' });
    b.onclick = fn; acts.appendChild(b); return b;
  };

  /* Abre o app de câmera do celular (foco automático, alta resolução) e já corrige a foto. */
  function cameraNativa() {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
    inp.setAttribute('capture', 'environment');
    inp.onchange = () => { if (inp.files[0]) { blob = inp.files[0]; send(); } };
    inp.click();
  }

  function setMode(m) {
    mode = m; blob = null; showErr('');
    $q('#t-cam').setAttribute('aria-selected', m === 'cam');
    $q('#t-up').setAttribute('aria-selected', m === 'up');
    acts.innerHTML = ''; stage.innerHTML = '';
    stage.className = 'scan-stage' + (m === 'up' ? ' up' : ''); stage.style.width = '';
    stage.style.aspectRatio = '';
    if (m === 'cam') startCam(); else { stopCam(); uploadUI(); }
  }

  async function startCam() {
    tip.textContent = 'Segure o celular na vertical e encaixe a folha inteira na moldura, com boa luz e sem sombra.';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showErr('Este navegador não permite acessar a câmera (use HTTPS ou localhost). Envie uma imagem.');
      btn('Tirar foto com o celular', 'primary', cameraNativa);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 2560 } }
      });
    } catch (e) {
      showErr('Não foi possível abrir a câmera. Libere a permissão no navegador ou feche outros apps que a usam.');
      btn('Tirar foto com o celular', 'primary', cameraNativa);
      return;
    }
    try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (_) {}
    const v = Object.assign(document.createElement('video'), { autoplay: true, playsInline: true, muted: true });
    v.setAttribute('playsinline', '');
    v.srcObject = stream;
    // o palco assume a proporção real do vídeo (retrato ou paisagem): nada de faixas pretas nem moldura torta
    v.onloadedmetadata = () => {
      const r = v.videoWidth / v.videoHeight;
      stage.style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight;
      stage.style.width = 'min(100%, ' + (78 * r).toFixed(2) + 'vh)';
      if (r > 1.1) tip.textContent = 'A câmera está na horizontal: gire o celular para a vertical para a folha ocupar mais o quadro.';
    };
    const guide = Object.assign(document.createElement('div'), { className: 'guide', innerHTML: '<i></i><i></i><i></i><i></i>' });
    stage.append(v, guide);
    btn('Capturar e corrigir', 'primary', () => capture(v));
    btn('Câmera do celular', '', cameraNativa);
  }

  function capture(v) {
    if (!v.videoWidth) return showErr('A câmera ainda está iniciando. Tente de novo.');
    const c = $q('#scCanvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(b => { blob = b; send(); }, 'image/jpeg', 0.92);
  }

  function uploadUI() {
    tip.textContent = 'Formatos aceitos: JPG, PNG ou WEBP.';
    const drop = Object.assign(document.createElement('label'), { className: 'scan-drop' });
    drop.innerHTML = 'Arraste a imagem aqui ou clique para escolher<small>Foto ou digitalização da folha de respostas</small>';
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
    drop.appendChild(inp); stage.appendChild(drop);
    btn('Tirar foto com o celular', '', cameraNativa);
    const pick = f => {
      if (!f || !f.type.startsWith('image/')) return showErr('Escolha um arquivo de imagem.');
      showErr(''); blob = f;
      stage.innerHTML = ''; stage.appendChild(Object.assign(document.createElement('img'), { src: URL.createObjectURL(f), alt: 'Prévia do gabarito' }));
      acts.innerHTML = '';
      btn('Corrigir imagem', 'primary', send);
      btn('Trocar imagem', '', () => setMode('up'));
    };
    inp.onchange = () => pick(inp.files[0]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files[0]); };
  }

  /* Reduz fotos grandes (celular) antes de enviar: o backend recusa > 8 MB. */
  async function reduzir(file) {
    try {
      const bmp = await createImageBitmap(file);   // já aplica a rotação EXIF da foto
      const esc = Math.min(1, MAX_LADO / Math.max(bmp.width, bmp.height));
      if (esc === 1 && file.size < 3 * 1024 * 1024) { bmp.close && bmp.close(); return file; }
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close && bmp.close();
      return await new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', 0.92));
    } catch (_) { return file; }
  }

  async function send() {
    if (!blob) return;
    showErr('');
    const b = acts.querySelector('.primary'); if (b) { b.disabled = true; b.textContent = 'Corrigindo…'; }
    res.innerHTML = '<div class="scan-empty">Lendo marcações…</div>';
    const aviso = setTimeout(() => {
      res.innerHTML = '<div class="scan-empty">Servidor iniciando… a primeira correção pode levar até 1 minuto.</div>';
    }, 5000);
    const ctrl = new AbortController();
    const limite = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const fd = new FormData();
      fd.append('foto', await reduzir(blob), 'gabarito.jpg');           // nome do campo que o Flask lê
      if (gabarito) fd.append('gabarito', JSON.stringify(gabarito));
      const r = await fetch(API_BASE + '/corrigir', { method: 'POST', body: fd, signal: ctrl.signal });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.ok === false) throw new Error(data.mensagem || data.erro || 'Falha na correção (' + r.status + ').');
      render(data);
    } catch (e) {
      res.innerHTML = '<div class="scan-empty">Sem resultado.</div>';
      showErr(
        e.name === 'AbortError' ? 'O servidor demorou demais para responder. Tente novamente.' :
        e instanceof TypeError ? 'Não foi possível falar com o servidor de correção. Verifique a conexão (e o CORS_ORIGINS no Render).' :
        e.message
      );
    } finally {
      clearTimeout(aviso); clearTimeout(limite);
      if (b) { b.disabled = false; b.textContent = mode === 'cam' ? 'Capturar e corrigir' : 'Corrigir imagem'; }
    }
  }

  function atualizarAlvo() {
    $q('#scAlvo').textContent = gabarito
      ? 'Avaliação selecionada: ' + (rotulo || '—') + ' (' + gabarito.join(' ') + '). Se a folha tiver QR legível, vale o QR.'
      : 'O gabarito será identificado pelo QR da folha.';
  }

  /* ---- gabarito pelo QR (dados vêm do app.js: DB, by, gab) ---- */
  const semHifen = u => String(u || '').replace(/-/g, '').toLowerCase();
  function versaoPorUuid(uuid) {
    if (typeof DB === 'undefined' || !DB.versoes) return null;
    return DB.versoes.find(v => semHifen(v.uuid) === semHifen(uuid)) || null;
  }
  function corrigirLocal(linhas, g) {
    let ac = 0, er = 0, br = 0, an = 0;
    const novas = linhas.map((l, i) => {
      let situacao = l.situacao;
      if (l.situacao !== 'BRANCO' && l.situacao !== 'ANULADA') {
        if (l.resposta_detectada === g[i]) { ac++; situacao = 'CORRETA'; } else { er++; situacao = 'INCORRETA'; }
      } else if (l.situacao === 'BRANCO') br++; else an++;
      return Object.assign({}, l, { resposta_correta: g[i], situacao });
    });
    const total = g.length;
    return { linhas: novas, resumo: { acertos: ac, erros: er, brancos: br, anuladas: an, total, nota: Math.round(ac * 1000 / total) / 100 } };
  }

  function render(data) {
    let { linhas, resumo } = data;
    if (!linhas || !resumo) { res.innerHTML = '<div class="scan-empty">Folha não encontrada. Confira os 4 marcadores dos cantos.</div>'; return; }

    let info = '', aviso = false, origem = 'teste', versaoId = null;
    const uuid = data.qr && data.qr.uuid;
    const v = uuid ? versaoPorUuid(uuid) : null;
    if (v) {
      const g = gab(v);
      if (g.length === N_QUESTOES) {
        ({ linhas, resumo } = corrigirLocal(linhas, g));
        const p = by('provas', v.prova_id);
        info = 'Folha identificada pelo QR: ' + (p ? p.nome : 'prova') + ' · versão ' + v.codigo + '.';
        origem = 'qr'; versaoId = v.id;
        if (gabarito && gabarito.join('') !== g.join('')) { aviso = true; info += ' Atenção: a avaliação selecionada usa outra versão da prova.'; }
      } else { aviso = true; info = 'A versão do QR tem ' + g.length + ' questões, mas a folha lê ' + N_QUESTOES + '.'; }
    } else if (uuid) {
      aviso = true;
      info = 'QR lido, mas essa versão da prova não existe neste navegador (outro computador ou dados limpos). ';
      info += gabarito ? 'Usei o gabarito da avaliação selecionada.' : 'Usei o gabarito de TESTE do servidor.';
      origem = gabarito ? 'manual' : 'teste';
    } else if (gabarito) {
      aviso = true; info = 'QR não lido. Usei o gabarito da avaliação selecionada (' + (rotulo || '—') + ').'; origem = 'manual';
    } else {
      aviso = true; info = 'QR não lido e nenhuma avaliação selecionada: usei o gabarito de TESTE do servidor. Tente uma foto mais nítida.';
    }

    const detalhe = Object.assign({}, resumo, { versao_id: versaoId, uuid: uuid || null, origem, respostas: linhas.map(l => l.resposta_detectada) });
    window.omrScan.ultimo = detalhe;
    document.dispatchEvent(new CustomEvent('omr:resultado', { detail: detalhe }));

    const nota = String(resumo.nota).replace('.', ',');
    res.innerHTML = `
      <div class="scan-info${aviso ? ' warn' : ''}">${info}</div>
      <div class="nota">${nota}</div>
      <div class="stats">
        <span>${resumo.acertos}/${resumo.total} acertos</span>
        <span>${resumo.erros} erros</span>
        <span>${resumo.brancos} em branco</span>
        <span>${resumo.anuladas} anuladas</span>
      </div>
      <table>
        <thead><tr><th>Questão</th><th>Marcada</th><th>Correta</th><th>Situação</th></tr></thead>
        <tbody>${linhas.map(l => `<tr><td>${l.questao}</td><td>${l.resposta_detectada}</td><td>${l.resposta_correta}</td><td class="${l.situacao}">${l.situacao.charAt(0) + l.situacao.slice(1).toLowerCase()}</td></tr>`).join('')}</tbody>
      </table>`;
  }

  window.omrScan = {
    ultimo: null,
    setGabarito(letras, r) {
      if (letras == null) { gabarito = null; rotulo = ''; showErr(''); return atualizarAlvo(); }
      const l = Array.from(letras, x => String(x).trim().toUpperCase());
      if (l.length !== N_QUESTOES) {
        showErr('O leitor atual corrige provas de ' + N_QUESTOES + ' questões (esta tem ' + l.length + ').');
        return false;
      }
      gabarito = l; rotulo = r || ''; showErr(''); atualizarAlvo(); return true;
    },
    /* abre o PDF A4 da folha de respostas, com o QR da versão (uuid da versão da prova) */
    imprimirFolha(uuid) { window.open(API_BASE + '/folha/' + semHifen(uuid) + '.pdf', '_blank'); },
    apiBase: API_BASE
  };

  $q('#t-cam').onclick = () => setMode('cam');
  $q('#t-up').onclick = () => setMode('up');
  window.addEventListener('pagehide', stopCam);
  atualizarAlvo();
  setMode('cam');
})();
