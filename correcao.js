
(function () {
  const QUANTIDADES_LEITOR = [10, 20];           // a folha de respostas lê provas de 10 ou 20 questões
  let provas = [], turmas = [], alunos = [], avs = [];
  let filtro = new URLSearchParams(location.search).get('status') === 'aplicada' ? 'aplicada' : 'todas';
  let alvoId = null;
  const gabCache = {};                          // versao_prova_id -> letras corretas

  const el = id => document.getElementById(id);
  const aviso = (box, msg) => { box.textContent = msg || ''; box.classList.toggle('show', !!msg); };
  const nota1 = n => n == null ? '—' : Number(n).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  // mostra o erro e rola até ele (antes o aviso ficava no topo da página, fora da tela, e parecia que o botão não fazia nada)
  const erroVisivel = msg => {
    aviso(el('err'), msg);
    if (msg) el('err').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  /* ---------- carregar ---------- */
  async function carregar() {
    try {
      const [ps, ts, av] = await Promise.all([
        api('/provas/?professor_id=' + PROF.id),
        api('/turmas/?professor_id=' + PROF.id),
        api('/avaliacoes/?professor_id=' + PROF.id)
      ]);
      provas = ps; turmas = ts.turmas || []; alunos = ts.alunos || []; avs = av;
    } catch (e) {
      aviso(el('err'), 'Erro ao carregar: ' + e.message + ' (o servidor pode estar iniciando; tente de novo em instantes).');
      return;
    }
    desenharForm();
    desenharTabela();
  }

  async function recarregarAvaliacoes() {
    avs = await api('/avaliacoes/?professor_id=' + PROF.id);
    desenharTabela();
  }

  /* ---------- 1. aplicar prova ---------- */
  function desenharForm() {
    el('ap').innerHTML = provas.length
      ? provas.map(p => `<option value="${p.id}">${esc(p.nome)} · ${p.n_questoes} questões · ${(p.versoes || []).length} versão(ões)</option>`).join('')
      : '<option value="">Nenhuma prova: monte uma em "Montar prova"</option>';
    el('at').innerHTML = turmas.length
      ? turmas.map(t => `<option value="${t.id}">${t.ano}º ano · ${esc(t.disciplina)}</option>`).join('')
      : '<option value="">Nenhuma turma: cadastre em "Turmas e alunos"</option>';
    if (!el('ad').value) el('ad').value = hojeISO();
    const pre = new URLSearchParams(location.search).get('prova');
    if (pre && provas.some(p => p.id == pre)) el('ap').value = pre;
    atualizarAlunos();
    atualizarDica();
  }

  function atualizarAlunos() {
    const lista = alunos.filter(a => a.turma_id == el('at').value);
    el('aa').innerHTML = `<option value="">Todos os alunos da turma (${lista.length})</option>` +
      lista.map(a => `<option value="${a.id}">${esc(a.nome)} · RA ${esc(a.ra)}</option>`).join('');
  }

  function atualizarDica() {
    const p = provas.find(x => x.id == el('ap').value);
    let d = '';
    if (p && !(p.versoes || []).length) d = 'Esta prova ainda não tem versão: gere uma em "Minhas provas" (+ Versão).';
    else if (p && !QUANTIDADES_LEITOR.includes(p.n_questoes)) d = `Atenção: a leitura por imagem corrige folhas de ${QUANTIDADES_LEITOR.join(' ou ')} questões e esta prova tem ${p.n_questoes}. Dá para aplicar, mas não para corrigir pela folha.`;
    el('apHint').textContent = d;
    el('apHint').style.display = d ? 'block' : 'none';
  }

  async function aplicar() {
    const err = el('err'), okb = el('okb'), btn = el('apl');
    aviso(err, ''); aviso(okb, '');
    if (!el('ap').value) return aviso(err, 'Escolha uma prova.');
    if (!el('at').value) return aviso(err, 'Escolha uma turma. Cadastre em Turmas e alunos se ainda não existir.');
    btn.disabled = true; btn.textContent = 'Aplicando…';
    try {
      const corpo = { turma_id: +el('at').value, data_aplicacao: el('ad').value || null };
      if (el('aa').value) corpo.aluno_id = +el('aa').value;
      const r = await api('/provas/' + el('ap').value + '/aplicar/', { method: 'POST', body: JSON.stringify(corpo) });
      const n = r.criadas.length;
      let msg = n ? `${n} avaliação(ões) criada(s). Já aparecem na tabela abaixo.` : 'Nenhuma avaliação nova.';
      if (r.ignoradas) msg += ` ${r.ignoradas} aluno(s) já tinham esta prova aplicada e ainda não corrigida, então não foram repetidos.`;
      filtro = 'todas';
      await recarregarAvaliacoes();               // primeiro atualiza a tabela, depois avisa
      aviso(okb, msg);
    } catch (e) {
      aviso(err, e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Aplicar prova';
    }
  }

  /* ---------- 2. tabela de avaliações aplicadas ---------- */
  const corrigida = a => a.status === 'corrigida';

  function desenharTabela() {
    const pend = avs.filter(a => !corrigida(a)).length, feitas = avs.length - pend;
    const notas = avs.filter(a => corrigida(a) && a.nota != null).map(a => a.nota);
    const media = notas.length ? nota1(notas.reduce((x, y) => x + y, 0) / notas.length) : null;
    el('resumo').textContent = avs.length
      ? `${avs.length} avaliação(ões): ${pend} aguardando correção, ${feitas} corrigida(s)` + (media ? ` · média ${media}` : '') + '.'
      : 'Nenhuma prova aplicada ainda. Use o quadro acima.';

    const abas = [['todas', 'Todas', avs.length], ['aplicada', 'A corrigir', pend], ['corrigida', 'Corrigidas', feitas]];
    el('tabs').innerHTML = abas.map(([k, t, n]) => `<button type="button" class="tab${filtro === k ? ' active' : ''}" data-f="${k}">${t} (${n})</button>`).join('');

    const lista = avs.filter(a => filtro === 'todas' || (filtro === 'corrigida') === corrigida(a));
    el('tb').innerHTML = lista.length ? lista.map(a => `
      <tr class="${a.id === alvoId ? 'sel' : ''}">
        <td>${esc(a.aluno_nome)}<br><span class="code">RA ${esc(a.aluno_ra)} · ${esc(a.turma_nome)}</span></td>
        <td>${esc(a.prova_nome)}<br><span class="code">${esc(a.versao_codigo)}</span></td>
        <td>${fmt(a.data_aplicacao)}</td>
        <td><span class="tag ${corrigida(a) ? 'tag-green' : 'tag-red'}">${corrigida(a) ? 'Corrigida' : 'Aplicada'}</span></td>
        <td class="num ${a.nota == null ? 'muted' : (a.nota >= 6 ? 'nota-ok' : 'nota-baixa')}">${nota1(a.nota)}</td>
        <td class="actions">
          <button type="button" class="btn-small" data-a="corrigir" data-id="${a.id}">${corrigida(a) ? 'Corrigir de novo' : 'Corrigir'}</button>
          <button type="button" class="btn-small" data-a="folha" data-id="${a.id}" title="Imprimir a folha de respostas com o QR desta versão">🖨 Folha</button>
          <button type="button" class="btn-icon-del" data-a="del" data-id="${a.id}">Excluir</button>
        </td>
      </tr>`).join('')
      : `<tr><td colspan="6" class="empty-note">${avs.length ? 'Nenhuma avaliação neste filtro.' : 'Ainda não há avaliações aplicadas.'}</td></tr>`;
  }

  el('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-f]');
    if (b) { filtro = b.dataset.f; desenharTabela(); }
  });

  el('tb').addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const id = +b.dataset.id, a = avs.find(x => x.id === id);
    if (b.dataset.a === 'corrigir') corrigir(id);
    else if (b.dataset.a === 'folha' && a) {
      // folha de 10 ou 20 questões (conforme a prova) com o QR da versão e o cabeçalho já preenchido com o aluno
      imprimirFolhasRespostasApi([a.versao_prova_id], a.prova_nome, { nome: a.aluno_nome, ra: a.aluno_ra, turma: a.turma_nome });
    }
    else if (b.dataset.a === 'del') excluir(id);
  });

  async function excluir(id) {
    const a = avs.find(x => x.id === id);
    if (!a || !confirm(`Excluir a avaliação de ${a.aluno_nome}? A nota e as respostas dela também serão apagadas.`)) return;
    try {
      await api('/avaliacoes/' + id + '/', { method: 'DELETE' });
      if (alvoId === id) { alvoId = null; window.omrScan.setGabarito(null); }
      await recarregarAvaliacoes();
    } catch (e) { aviso(el('err'), e.message); }
  }

  /* ---------- 3. corrigir: escolhe o aluno e abre a leitura ---------- */
  async function corrigir(id) {
    const a = avs.find(x => x.id === id);
    if (!a) return;
    aviso(el('err'), '');
    alvoId = id; desenharTabela();
    try {
      let letras = gabCache[a.versao_prova_id];
      if (!letras) {
        if (!a.versao_prova_id) throw new Error('esta avaliação não tem versão de prova associada. Exclua e aplique a prova de novo.');
        const v = await api('/versoes/' + a.versao_prova_id + '/completa/');
        letras = v.itens.map(it => it.correta_letra);
        if (!letras.length) throw new Error('a versão ' + (v.codigo || a.versao_codigo) + ' não tem questões.');
        const sem = letras.map((l, i) => l ? 0 : i + 1).filter(Boolean);
        if (sem.length) {
          throw new Error('a versão ' + (v.codigo || a.versao_codigo) + ' tem questão sem alternativa correta marcada (questão ' + sem.join(', ') +
            '). Marque a correta no Banco de questões e gere a versão de novo, ou aplique outra versão.');
        }
        gabCache[a.versao_prova_id] = letras;      // só guarda no cache quando está completo
      }
      const ok = window.omrScan.setGabarito(letras, `${a.aluno_nome} · ${a.prova_nome} · versão ${a.versao_codigo}`);
      if (ok === false) alvoId = null;            // ex.: prova que não tem 10 nem 20 questões (o painel explica)
      desenharTabela();
      el('scanPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      alvoId = null; desenharTabela();
      erroVisivel('Não foi possível abrir a correção de ' + a.aluno_nome + ': ' + e.message);
    }
  }

  const semHifen = u => String(u || '').replace(/-/g, '').toLowerCase();

  /* O QR da folha identifica a versão da prova: busca a versão (e o gabarito) no banco pelo UUID
     e lista os alunos que fizeram essa versão. O aluno escolhido na tabela vem marcado, se for dessa versão. */
  window.omrScan.porQr = async function (uuid) {
    let v;
    try { v = await api('/versoes/uuid/' + semHifen(uuid) + '/'); }
    catch (e) { if (/não existe/i.test(e.message)) return null; throw e; }
    const candidatos = avs
      .filter(a => semHifen(a.versao_uuid) === semHifen(uuid) && (!corrigida(a) || a.id === alvoId))
      .map(a => ({ id: a.id, label: `${a.aluno_nome} · RA ${a.aluno_ra}${corrigida(a) ? ' (já corrigida)' : ''}` }));
    const alvo = avs.find(a => a.id === alvoId);
    return {
      letras: v.itens.map(it => it.correta_letra),
      rotulo: `${v.prova_nome} · versão ${v.codigo}`,
      candidatos,
      sugerido: alvo && semHifen(alvo.versao_uuid) === semHifen(uuid) ? alvo.id : null
    };
  };

  /* botão "Salvar resultados" do omr-scan.js chama isto (avaliacaoId vem da lista quando o QR foi lido) */
  window.omrScan.salvar = async function (r, avaliacaoId) {
    const a = avs.find(x => x.id === (avaliacaoId || alvoId));
    if (!a) throw new Error('Escolha o aluno na tabela (botão Corrigir) antes de salvar.');
    const salvo = await api('/avaliacoes/' + a.id + '/resultado/', {
      method: 'POST',
      body: JSON.stringify({ respostas: r.respostas, uuid: r.uuid })   // o servidor confere o QR com a versão do aluno
    });
    Object.assign(a, salvo);                      // a tabela já mostra nota e status novos
    desenharTabela();
    return `Salvo! ${a.aluno_nome}: nota ${nota1(salvo.nota)} (${salvo.acertos}/${salvo.total} acertos). A tabela foi atualizada.`;
  };

  /* ---------- eventos do formulário ---------- */
  el('at').addEventListener('change', atualizarAlunos);
  el('ap').addEventListener('change', atualizarDica);
  el('apl').addEventListener('click', aplicar);

  carregar();
})();
