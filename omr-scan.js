/* Painel "Corrigir por imagem" (câmera ou upload) para correcao.html.
   Uso: <script src="omr-scan.js"></script> logo depois de app.js.
   Backend (Render): POST {API_BASE}/corrigir, multipart:
     foto     -> imagem (obrigatório)
     gabarito -> JSON com 10 letras, ex. ["A","C","B",...] (opcional)
   Resposta: { ok, linhas, resumo } ou { ok:false, mensagem }.

   Para corrigir contra o gabarito da avaliação escolhida, chame de fora (ex.: correcao.js):
     window.omrScan.setGabarito(['A','C','B','D','A','B','C','E','A','D'], 'Ana — Prova X');
   Sem isso, o servidor usa o gabarito de teste embutido nele. */
(function () {
  // Chamada direta ao Render (CORS liberado no backend). Não usamos o proxy /api do Netlify
  // porque ele corta a requisição em ~26 s e o Render (plano grátis) leva mais que isso para "acordar".
  const API_BASE = (window.FLYLEARN_API || 'https://flylearn.onrender.com').replace(/\/$/, '');
  const TIMEOUT_MS = 90000;
  const MAX_LADO = 1600;      // mesmo limite que o backend aplica
  const N_QUESTOES = 10;      // o leitor (campos.pkl) só conhece 10 questões
  let gabarito = null, rotulo = '';

  // acorda o servidor assim que a página abre (o plano grátis do Render hiberna)
  fetch(API_BASE + '/health').catch(() => {});

  const css = `
  .scan-tabs{display:flex;gap:6px;margin-bottom:14px}
  .scan-tabs button{padding:8px 16px;border:1px solid #d5d9e0;background:#fff;border-radius:8px;cursor:pointer;font:inherit}
  .scan-tabs button[aria-selected="true"]{background:#1f4fd8;border-color:#1f4fd8;color:#fff}
  .scan-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:20px}
  @media(max-width:860px){.scan-grid{grid-template-columns:1fr}}
  .scan-stage{position:relative;aspect-ratio:4/3;background:#10141c;border-radius:12px;overflow:hidden;display:grid;place-items:center;color:#cfd6e4}
  .scan-stage video,.scan-stage img{width:100%;height:100%;object-fit:contain}
  .scan-stage .guide{position:absolute;inset:8%;border:2px dashed rgba(255,255,255,.55);border-radius:6px;pointer-events:none}
  .scan-drop{cursor:pointer;text-align:center;padding:24px;line-height:1.5}
  .scan-drop.over{outline:3px solid #1f4fd8;outline-offset:-6px}
  .scan-drop small{display:block;opacity:.7}
  .scan-actions{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
  .scan-actions button{padding:10px 18px;border-radius:8px;border:1px solid #d5d9e0;background:#fff;cursor:pointer;font:inherit}
  .scan-actions .primary{background:#1f4fd8;border-color:#1f4fd8;color:#fff}
  .scan-actions button:disabled{opacity:.5;cursor:not-allowed}
  .scan-tip{font-size:.9rem;opacity:.75;margin-top:10px}
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
    <p class="sub">Fotografe a folha de respostas com a câmera ou envie uma imagem. Os quatro marcadores dos cantos precisam estar visíveis.</p>
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

  function setMode(m) {
    mode = m; blob = null; showErr('');
    $q('#t-cam').setAttribute('aria-selected', m === 'cam');
    $q('#t-up').setAttribute('aria-selected', m === 'up');
    acts.innerHTML = ''; stage.innerHTML = '';
    if (m === 'cam') startCam(); else { stopCam(); uploadUI(); }
  }

  async function startCam() {
    tip.textContent = 'Enquadre a folha dentro da moldura, com boa luz e sem sombras.';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showErr('Este navegador não permite acessar a câmera (use HTTPS ou localhost). Envie uma imagem.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
    } catch (e) {
      showErr('Não foi possível abrir a câmera. Libere a permissão no navegador ou feche outros apps que a usam.');
      return;
    }
    const v = Object.assign(document.createElement('video'), { autoplay: true, playsInline: true, muted: true });
    v.srcObject = stream;
    stage.append(v, Object.assign(document.createElement('div'), { className: 'guide' }));
    btn('Capturar e corrigir', 'primary', () => capture(v));
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
      const bmp = await createImageBitmap(file);
      const esc = Math.min(1, MAX_LADO / bmp.width);
      if (esc === 1 && file.size < 2 * 1024 * 1024) { bmp.close && bmp.close(); return file; }
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close && bmp.close();
      return await new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', 0.9));
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
      ? 'Corrigindo contra o gabarito de: ' + (rotulo || 'avaliação selecionada') + ' (' + gabarito.join(' ') + ')'
      : 'Nenhuma avaliação selecionada — será usado o gabarito de teste do servidor.';
  }

  window.omrScan = {
    setGabarito(letras, r) {
      if (letras == null) { gabarito = null; rotulo = ''; showErr(''); return atualizarAlvo(); }
      const l = Array.from(letras, x => String(x).trim().toUpperCase());
      if (l.length !== N_QUESTOES) {
        showErr('O leitor atual corrige provas de ' + N_QUESTOES + ' questões (esta tem ' + l.length + ').');
        return false;
      }
      gabarito = l; rotulo = r || ''; showErr(''); atualizarAlvo(); return true;
    }
  };

  function render({ linhas, resumo }) {
    if (!linhas || !resumo) { res.innerHTML = '<div class="scan-empty">Folha não encontrada. Confira os 4 marcadores dos cantos.</div>'; return; }
    document.dispatchEvent(new CustomEvent('omr:resultado', { detail: resumo }));
    const nota = String(resumo.nota).replace('.', ',');
    res.innerHTML = `
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

  $q('#t-cam').onclick = () => setMode('cam');
  $q('#t-up').onclick = () => setMode('up');
  window.addEventListener('pagehide', stopCam);
  atualizarAlvo();
  setMode('cam');
})();
