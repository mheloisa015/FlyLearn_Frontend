
(function () {
  const QUANTIDADES_LEITOR = [10, 20];           // a folha de respostas lê provas de 10 ou 20 questões   // <-- ALTERADO
  let provas = [], turmas = [], alunos = [], avs = [];
  let filtro = new URLSearchParams(location.search).get('status') === 'aplicada' ? 'aplicada' : 'todas';
  let alvoId = null;
  const gabCache = {};                          // versao_prova_id -> letras corretas

  const el = id => document.getElementById(id);
  const aviso = (box, msg) => { box.textContent = msg || ''; box.classList.toggle('show', !!msg); };
  const nota1 = n => n == null ? '—' : Number(n).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
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
    else if (p && !QUANTIDADES_LEITOR.includes(p.n_questoes)) d = `Atenção: a leitura por imagem corrige folhas de ${QUANTIDADES_LEITOR.join(' ou ')} questões e esta prova tem ${p.n_questoes}. Dá para aplicar, mas não para corrigir pela folha.`;   // <-- ALTERADO
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
      const n =