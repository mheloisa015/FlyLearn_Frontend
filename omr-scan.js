/* Painel "Corrigir por imagem" (câmera ou upload) para correcao.html.
   Uso: <script src="omr-scan.js"></script> depois de app.js e ANTES de correcao.js.

   Backend de leitura (Render): POST {API_BASE}/corrigir, multipart:
     foto     -> imagem da folha de respostas (obrigatório)
     gabarito -> JSON com 10 letras (a correcao.js manda o gabarito da versão do aluno escolhido)
   Resposta: { ok, linhas, resumo, qr:{lido,texto,uuid} } ou { ok:false, mensagem }.

   O QR da folha (FL1:<uuid da versão>) é quem identifica a VERSÃO da prova e, portanto, o GABARITO:
     1) o professor toca em "Corrigir" numa linha -> correcao.js chama omrScan.setGabarito(...) e o painel abre
        (esse gabarito só vale se a folha vier sem QR legível);
     2) o painel pede pra ler com o CELULAR (no computador abre em "Enviar imagem");
     3) lida a folha, omrScan.porQr(uuid) (correcao.js) busca a versão no banco pelo UUID do QR; a nota
        é recalculada com o gabarito dessa versão;
     4) embaixo, "Salvar resultados" + lista dos alunos que fizeram ESSA versão (o aluno escolhido já vem marcado);
        o botão chama omrScan.salvar(resultado, avaliacaoId), que grava no banco.
   Folha com QR de versão desconhecida não pode ser salva.
   Evento 'omr:resultado' (document): detail = resumo + { uuid, origem, respostas }.
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
  .scan-phone{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:10px;background:#eef3ff;border:1px solid #c5d3fb;margin:0 0 16px;line-height:1.45}
  .scan-phone .ic{font-size:1.7rem;line-height:1}
  .scan-phone b{display:block;margin-bottom:2px}
  .scan-phone small{display:block;opacity:.8;margin-top:4px}
  .scan-save{margin-top:18px;padding-top:16px;border-top:1px solid #e6e9ef;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
  .scan-save[hidden],#scAlunoBox[hidden],#scBody[hidden],#scVazio[hidden],#scTopErr[hidden]{display:none}
  .scan-save button{padding:13px 24px;border-radius:8px;border:1px solid #1f4fd8;background:#1f4fd8;color:#fff;cursor:pointer;font:inherit;font-weight:600}
  .scan-save button:disabled{opacity:.55;cursor:not-allowed}
  .scan-save select{padding:12px;border-radius:8px;border:1px solid #d5d9e0;font:inherit;max-width:100%}
  .scan-save .msg{flex:1 1 240px;font-size:.92rem}
  .scan-save .msg.ok{color:#14803c;font-weight:600}
  .scan-save .msg.bad{color:#c0392b}
  `;
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.id = 'scanPanel';
  panel.innerHTML = `
    <h2>3. Corrigir gabarito por imagem</h2>
    <p class="sub">Fotografe a <b>folha de respostas</b> (a que tem o QR) com a folha inteira no quadro, de preferência na vertical. Os quatro quadrados pretos dos cantos precisam aparecer.</p>
    <div class="scan-tip" id="scAlvo" style="margin:0 0 12px"></div>
    <div class="error-box" id="scTopErr" hidden></div>
    <div class="scan-empty" id="scVazio" hidden>Escolha um aluno na tabela acima e toque em <b>Corrigir</b> para começar a leitura.</div>
    <div id="scBody">
      <div class="scan-phone" id="scFone"></div>
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
      <div class="scan-save" id="scSave" hidden>
        <label id="scAlunoBox" hidden style="flex:1 1 100%">Salvar para o aluno: <select id="scAluno"></select></label>
        <button type="button" id="scSaveBtn">Salvar resultados</button>
        <div class="msg" id="scSaveMsg"></div>
      </div>
    </div>
    <canvas id="scCanvas" hidden></canvas>`;
  (document.querySelector('#scanMount') || document.querySelector('.content') || document.body).appendChild(panel);

  const $q = s => panel.querySelector(s);
  const stage = $q('#stage'), acts = $q('#acts'), tip = $q('#tip'), err = $q('#scErr'), res = $q('#scRes');
  const body = $q('#scBody'), vazio = $q('#scVazio'), topErr = $q('#scTopErr'), fone = $q('#scFone');
  const alunoBox = $q('#scAlunoBox'), alunoSel = $q('#scAluno'), saveBar = $q('#scSave'), saveBtn = $q('#scSaveBtn'), saveMsg = $q('#scSaveMsg');
  let stream = null, blob = null, mode = 'cam';
  // na correcao.html o painel só abre depois de escolher o aluno (<div id="scanMount" data-exige-alvo>)
  const mount = document.querySelector('#scanMount');
  const exigeAlvo = !!(mount && mount.hasAttribute('data-exige-alvo'));
  // celular/tablet (tela de toque) x computador
  const ehCelular = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

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
    stopCam(); acts.innerHTML = ''; stage.innerHTML = '';
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
    if (exigeAlvo && !gabarito) return showErr('Escolha primeiro o aluno na tabela (botão Corrigir).');
    resetSalvar();
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
      await render(data);
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
      ? 'Aluno selecionado: ' + (rotulo || '—') + ' (gabarito ' + gabarito.join(' ') + ').'
      : (exigeAlvo ? '' : 'O gabarito será identificado pelo QR da folha.');
  }

  const showTopErr = m => { topErr.textContent = m || ''; topErr.hidden = !m; topErr.classList.toggle('show', !!m); };

  /* Abre a leitura: pede o celular e escolhe a aba certa (celular = câmera; computador = enviar imagem). */
  function abrir() {
    body.hidden = false; vazio.hidden = true; showTopErr('');
    resetSalvar(); window.omrScan.ultimo = null;
    res.innerHTML = '<div class="scan-empty">O resultado da correção aparece aqui.</div>';
    fone.innerHTML = ehCelular
      ? '<span class="ic">📱</span><div><b>Leia a folha com o celular</b>Toque no botão azul abaixo e fotografe a folha inteira, na vertical, com os 4 quadrados pretos dos cantos aparecendo.</div>'
      : '<span class="ic">📱</span><div><b>Faça a leitura com o celular</b>Abra o FlyLearn no celular, entre em <i>Aplicações e correção</i>, toque em <b style="display:inline">Corrigir</b> neste aluno e fotografe a folha de respostas. Você também pode enviar aqui uma foto ou digitalização que já tenha.<small>A leitura pela webcam do computador costuma sair com menos nitidez.</small></div>';
    atualizarAlvo();
    setMode(ehCelular ? 'cam' : 'up');
  }

  function fechar() {
    stopCam(); body.hidden = true; vazio.hidden = false; resetSalvar(); window.omrScan.ultimo = null; atualizarAlvo();
  }

  const semHifen = u => String(u || '').replace(/-/g, '').toLowerCase();

  function resetSalvar() {
    saveBar.hidden = true; saveBtn.disabled = false; saveBtn.textContent = 'Salvar resultados';
    saveMsg.textContent = ''; saveMsg.className = 'msg'; alunoBox.hidden = true; alunoSel.innerHTML = ''; alunoSel.disabled = false;
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

  async function render(data) {
    let { linhas, resumo } = data;
    if (!linhas || !resumo) { res.innerHTML = '<div class="scan-empty">Folha não encontrada. Confira os 4 marcadores dos cantos.</div>'; return; }

    let info = '', aviso = false, origem = 'teste', podeSalvar = false, cand = [], sugerido = null;
    const uuid = data.qr && data.qr.uuid;

    if (uuid && typeof window.omrScan.porQr === 'function') {
      // o QR manda: versão da prova e gabarito vêm do banco, pelo UUID da folha
      let q = null, falhou = false;
      try { q = await window.omrScan.porQr(uuid); } catch (e) { falhou = true; }
      if (q && q.letras && q.letras.length === N_QUESTOES) {
        ({ linhas, resumo } = corrigirLocal(linhas, q.letras));
        cand = q.candidatos || []; sugerido = q.sugerido || null; origem = 'qr';
        podeSalvar = cand.length > 0;
        info = 'Folha identificada pelo QR: ' + (q.rotulo || 'versão da prova') + '.';
        if (!cand.length) { aviso = true; info += ' Nenhum aluno com essa versão aguardando correção.'; }
        else if (!sugerido && gabarito) { aviso = true; info += ' O aluno que você escolheu (' + (rotulo || '—') + ') fez outra versão: marque abaixo o aluno desta folha.'; }
      } else if (q) {
        aviso = true; info = 'A versão do QR tem ' + (q.letras ? q.letras.length : '?') + ' questões, mas a folha lê ' + N_QUESTOES + '.';
      } else {
        aviso = true;
        info = falhou ? 'Não consegui consultar a versão do QR (servidor indisponível). Tente de novo.'
                      : 'QR lido, mas essa versão de prova não existe neste sistema. Confira se a folha é do FlyLearn.';
      }
    } else if (gabarito) {
      aviso = true; origem = 'manual'; podeSalvar = true;
      info = 'QR não lido. Usei o gabarito de ' + (rotulo || '—') + ' — confira se a folha é desse aluno antes de salvar.';
    } else {
      aviso = true; info = 'QR não lido e nenhum aluno escolhido: a nota abaixo usa o gabarito de TESTE do servidor e não pode ser salva.';
    }

    const detalhe = Object.assign({}, resumo, { uuid: uuid || null, origem, respostas: linhas.map(l => l.resposta_detectada) });
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

    alunoSel.innerHTML = '';
    if (origem === 'qr' && cand.length) {
      if (!sugerido) alunoSel.add(new Option('— escolha o aluno —', ''));
      cand.forEach(c => alunoSel.add(new Option(c.label, c.id)));
      if (sugerido) alunoSel.value = sugerido;
      alunoBox.hidden = false;
    } else alunoBox.hidden = true;
    saveBar.hidden = !podeSalvar;
    if (podeSalvar) saveMsg.textContent = 'Conferiu o resultado? Salve para registrar a nota.';
  }

  saveBtn.onclick = async () => {
    const r = window.omrScan.ultimo;
    if (!r || typeof window.omrScan.salvar !== 'function') return;
    if (!alunoBox.hidden && !alunoSel.value) { saveMsg.textContent = 'Escolha o aluno desta folha.'; saveMsg.className = 'msg bad'; return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; saveMsg.className = 'msg'; saveMsg.textContent = '';
    try {
      saveMsg.textContent = await window.omrScan.salvar(r, alunoBox.hidden ? null : +alunoSel.value);
      saveMsg.className = 'msg ok';
      saveBtn.textContent = 'Resultado salvo ✓';      // continua travado: evita salvar duas vezes sem querer
      alunoSel.disabled = true;
    } catch (e) {
      saveMsg.textContent = e.message || 'Não foi possível salvar. Tente de novo.';
      saveMsg.className = 'msg bad';
      saveBtn.disabled = false; saveBtn.textContent = 'Salvar resultados';
    }
  };

  window.omrScan = {
    ultimo: null,
    salvar: null,   // a correcao.js define: async (resultado, avaliacaoId|null) => mensagem (ou lança erro)
    porQr: null,    // a correcao.js define: async (uuid) => { letras, rotulo, candidatos, sugerido } | null
    /* escolhe o aluno/versão a corrigir (vale só se a folha vier sem QR legível) e abre o painel */
    setGabarito(letras, r) {
      if (letras == null) {
        gabarito = null; rotulo = ''; showErr('');
        if (exigeAlvo) fechar(); else atualizarAlvo();
        return;
      }
      const l = Array.from(letras, x => String(x).trim().toUpperCase());
      if (l.length !== N_QUESTOES) {
        gabarito = null; rotulo = '';
        if (exigeAlvo) fechar();
        showTopErr('O leitor atual corrige provas de ' + N_QUESTOES + ' questões (esta tem ' + l.length + ').');
        return false;
      }
      gabarito = l; rotulo = r || ''; showErr('');
      abrir();
      return true;
    },
    /* abre o PDF A4 da folha de respostas, com o QR da versão (uuid da versão da prova) */
    imprimirFolha(uuid) { window.open(API_BASE + '/folha/' + semHifen(uuid) + '.pdf', '_blank'); },
    apiBase: API_BASE
  };

  $q('#t-cam').onclick = () => setMode('cam');
  $q('#t-up').onclick = () => setMode('up');
  window.addEventListener('pagehide', stopCam);
  atualizarAlvo();
  if (exigeAlvo) fechar(); else abrir();
})();
