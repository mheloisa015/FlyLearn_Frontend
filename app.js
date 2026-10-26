const K = 'flylearn_db';

const seed = () => ({
  seq: 100,
  materias: [
    { id: 1, professor_id: 1, nome: 'Matemática', descricao: 'Aritmética e frações', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' },
    { id: 2, professor_id: 1, nome: 'Geografia', descricao: 'Brasil e mundo', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' }
  ],
  turmas: [
    { id: 1, ano: 3, disciplina: 'Matemática' },
    { id: 2, ano: 5, disciplina: 'Geografia' }
  ],
  alunos: [
    { id: 1, turma_id: 1, nome: 'Ana Beatriz Souza', ra: 20240117, email: 'ana@escola.com' },
    { id: 2, turma_id: 1, nome: 'Lucas Henrique Prado', ra: 20240122, email: 'lucas@escola.com' }
  ],
  questoes: [
    {
      id: 1,
      materia_id: 1,
      enunciado: 'Quanto é 1/2 + 1/4?',
      ativo: true,
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-01T10:00:00Z',
      alts: [
        { id: 1, texto: '3/4', correta: true },
        { id: 2, texto: '2/6', correta: false },
        { id: 3, texto: '1/6', correta: false },
        { id: 4, texto: '2/4', correta: false }
      ]
    },
    {
      id: 5,
      materia_id: 1,
      enunciado: 'Quanto é 3/5 − 1/5?',
      ativo: true,
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-01T10:00:00Z',
      alts: [
        { id: 6, texto: '2/5', correta: true },
        { id: 7, texto: '4/5', correta: false },
        { id: 8, texto: '2/10', correta: false },
        { id: 9, texto: '3/10', correta: false }
      ]
    }
  ],
  provas: [],
  versoes: [],
  avaliacoes: []
});

let DB;
try {
  DB = JSON.parse(localStorage.getItem(K)) || seed();
} catch (e) {
  DB = seed();
}

const save = () => {
  try {
    localStorage.setItem(K, JSON.stringify(DB));
  } catch (e) {}
};

const id = () => ++DB.seq;
const $ = (s, r = document) => r.querySelector(s);
const L = 'ABCDE';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;'
}[c]));

/* Popup de erro/sucesso/aviso no canto da tela, no lugar do alert() nativo do
   navegador. Some sozinho depois de alguns segundos ou ao clicar no ✕.
   Uso: toast('Mensagem de erro')  |  toast('Salvo!', 'sucesso')  |  toast('Atenção...', 'aviso') */
function toast(msg, tipo = 'erro') {
  let wrap = $('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = 'toast toast-' + tipo;
  t.innerHTML = `<span>${esc(msg)}</span><button type="button" aria-label="Fechar">✕</button>`;
  const fechar = () => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 220);
  };
  t.querySelector('button').onclick = fechar;
  wrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(fechar, 6000);
}

const by = (t, i) => DB[t].find(x => x.id == i);

const shuffle = a => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const fmt = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const opts = (t, f, sel) => DB[t].map(x => `<option value="${x.id}"${x.id == sel ? ' selected' : ''}>${esc(f(x))}</option>`).join('');

const NAV = [
  ['dashboard', '🏠', 'Painel'],
  ['turmas', '👥', 'Turmas e alunos'],
  ['materias', '🗂️', 'Matérias'],
  ['questoes', '❓', 'Banco de questões'],
  ['gerador', '✏️', 'Montar prova'],
  ['biblioteca', '📚', 'Minhas provas'],
  ['correcao', '🧾', 'Aplicações e correção']
];

/* ---------- BACKEND (Django) ----------
   Telas que já foram ligadas no banco de verdade (questoes.html, gerador.html,
   biblioteca.html) usam isto em vez do DB/localStorage. API_BASE: no Netlify,
   /api/* é redirecionado pro Render (netlify.toml); local, chama o Render direto. */
const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'https://flylearn.onrender.com' : '/api';
const PROF=JSON.parse(localStorage.getItem('flylearn_user')||'null')||{id:null};

async function api(path, opts) {
  const r = await fetch(API_BASE + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || dados.error || ('Erro ' + r.status + ' ao falar com o servidor.'));
  return dados;
}

/* Abre uma aba nova só com o conteúdo a imprimir (cada .pg = uma folha) e manda
   imprimir. w.onload espera a página (e as imagens, como o QR) carregarem antes
   de chamar print() — sem isso o QR podia não aparecer a tempo. */
function printDoc(title, html, extraCss) {
  const w = window.open('', '_blank');
  if (!w) { toast('O navegador bloqueou a aba de impressão. Permita pop-ups para este site e tente de novo.'); return; }
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${esc(title)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;margin:0}
    .pg{padding:22px 26px;page-break-after:always;box-sizing:border-box}
    .pg:last-child{page-break-after:auto}
    h1{font-size:1.2rem;margin:0 0 4px}
    .mt{font-size:.88rem;color:#555;margin-bottom:10px}
    .id{font-size:.88rem;margin:10px 0 14px;border-bottom:1px solid #ccc;padding-bottom:10px}
    .ins{font-size:.88rem;margin:0 0 14px;font-style:italic}
    .q{margin-bottom:14px;font-size:.92rem}
    .o{margin:6px 0 0 18px}
    .o div{margin-bottom:4px}
    .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:14px 0}
    .g{border:1px solid #ccc;border-radius:6px;padding:8px;text-align:center;font-size:.88rem}
    .g b{display:block;font-size:.76rem;color:#555;margin-bottom:4px}
    .ft{margin-top:18px;font-size:.76rem;color:#888}
    @media print{ @page{ margin:14mm } }
    ${extraCss || ''}
  </style></head><body>${html}</body></html>`);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

/* Impressão a partir dos dados do backend (/versoes/<id>/completa/), que já vem
   com o texto das questões/alternativas e a letra da alternativa correta —
   diferente de provaPg/gabPg acima, que leem do DB mock em localStorage. */
const provaPgApi = v => `
  <section class="pg">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div style="flex:1">
        <h1>${esc(v.prova_nome)}</h1>
        <div class="mt">${esc(v.materia_nome)} · Versão <b>${v.codigo}</b></div>
      </div>
      <img src="${API_BASE}/versoes/${v.id}/qr.png" alt="QR da versão ${esc(v.codigo)}" style="width:72px;height:72px;flex:none">
    </div>
    <div class="id">Nome: ______________________________________ RA: ____________ Turma: ________ Data: ___/___/______</div>
    ${v.prova_descricao ? `<p class="ins">${esc(v.prova_descricao)}</p>` : ''}
    ${v.itens.map(it => `
      <div class="q">
        <b>${it.ordem}.</b>${esc(it.enunciado)}
        <div class="o">
          ${it.alternativas.map((t, k) => `<div>( &nbsp;) ${L[k]}) ${esc(t)}</div>`).join('')}
        </div>
      </div>
    `).join('')}
  </section>
`;

const gabPgApi = v => `
  <section class="pg">
    <h1>Gabarito — ${esc(v.prova_nome)}</h1>
    <div class="mt">Versão <b>${v.codigo}</b> · ${v.itens.length} questões</div>
    <div class="grid">
      ${v.itens.map(it => `<div class="g"><b>Questão ${it.ordem}</b>${it.correta_letra || '—'}</div>`).join('')}
    </div>
    <div style="text-align:center;margin-top:20px">
      <img src="${API_BASE}/versoes/${v.id}/qr.png" alt="QR da versão ${esc(v.codigo)}" style="width:90px;height:90px">
    </div>
    <div class="ft" style="text-align:center">Código ${v.codigo} · ${v.uuid}</div>
  </section>
`;

async function imprimirVersoesProvaApi(ids, tituloProva) {
  const vs = await Promise.all(ids.map(i => api('/versoes/' + i + '/completa/')));
  printDoc('Prova ' + tituloProva + (vs.length == 1 ? ' ' + vs[0].codigo : ''), vs.map(provaPgApi).join(''));
}

async function imprimirGabaritosProvaApi(ids, tituloProva) {
  const vs = await Promise.all(ids.map(i => api('/versoes/' + i + '/completa/')));
  printDoc('Gabarito ' + tituloProva + (vs.length == 1 ? ' ' + vs[0].codigo : ''), vs.map(gabPgApi).join(''));
}

/* ---------- FOLHA DE RESPOSTAS (10 ou 20 questões) com QR da versão ----------
   Gerada aqui no front (A4, medidas em mm) no layout dos modelos "GABARITO - 10/20 QUESTÕES":
   4 quadrados pretos nos cantos, bolhas A–E em duas colunas e o QR da versão no quadro tracejado.
   O QR vem de /versoes/<id>/qr.png (o mesmo da prova e do gabarito).
   aluno (opcional): { nome, ra, turma } já preenche o cabeçalho da folha. */
const FOLHA_CSS = `
  @page{size:A4;margin:0}
  @media print{ @page{size:A4;margin:0} }
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{margin:0;background:#fff}
  .fl{position:relative;width:210mm;height:296.6mm;overflow:hidden;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;page-break-after:always;break-after:page}
  .fl:last-child{page-break-after:auto;break-after:auto}
  .fl .a{position:absolute;box-sizing:border-box}
  .fl .mk{width:7mm;height:7mm;background:#000}
  .fl .ttl{left:0;right:0;top:12mm;text-align:center;font-weight:700;font-size:25pt;letter-spacing:.2mm}
  .fl .sub{left:0;right:0;top:24mm;text-align:center;font-size:10pt}
  .fl .rule{left:14mm;width:182mm;border-top:.55mm solid #111}
  .fl .box{left:14mm;top:35mm;width:182mm;height:37mm;border:.5mm solid #111;border-radius:3mm}
  .fl .f{height:9.5mm;border-bottom:.3mm solid #111;font-size:7.5pt;text-transform:uppercase}
  .fl .f i{font-style:normal;position:absolute;left:0;top:0}
  .fl .f b{position:absolute;left:1mm;bottom:.8mm;font-size:10pt;font-weight:400;text-transform:none;white-space:nowrap;overflow:hidden;max-width:98%}
  .fl .ins{left:14mm;top:76mm;width:182mm;height:34mm;background:#eee;border:.3mm solid #bbb;border-radius:2.5mm;padding:2.6mm 5mm}
  .fl .ins h3{margin:0 0 1.6mm;font-size:10.5pt}
  .fl .ins ul{margin:0;padding-left:5mm;font-size:8pt;line-height:3.95mm}
  .fl .ins .bl{display:inline-block;width:3.6mm;height:3.6mm;border-radius:50%;border:.3mm solid #111;text-align:center;font-size:5pt;line-height:3.4mm;font-weight:700;vertical-align:middle;margin:0 .6mm 0 2.5mm}
  .fl .ins .bl.on{background:#111;color:#fff}
  .fl .sec{left:0;right:0;top:114mm;text-align:center;font-weight:700;font-size:13pt;line-height:8mm}
  .fl .nq{border:.5mm solid #111;border-radius:50%;font-weight:700;text-align:center;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%)}
  .fl .bb{border:.3mm solid #111;border-radius:50%;text-align:center;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%)}
  .fl .sep{border-top:.2mm dashed #999}
  .fl .qr{left:93mm;top:246mm;width:24mm;height:24mm;border:.3mm dashed #666;display:flex;align-items:center;justify-content:center}
  .fl .qr img{width:21mm;height:21mm;display:block}
  .fl .cod{left:80mm;width:50mm;top:271mm;text-align:center;font-size:6.5pt;color:#444}
  .fl .sg{top:274mm;width:58mm;border-top:.3mm solid #111;text-align:center;font-size:8.5pt;padding-top:1.2mm}
`;

function folhaRespostasPgApi(v, aluno) {
  const n = v.itens.length, dez = n === 10;
  const al = aluno || {};
  const pitch = dez ? 18 : 11.5, top0 = 126, perCol = n / 2;
  const dn = dez ? 10 : 8, dq = dez ? 11 : 8.6, fs = dez ? 11 : 9, fq = dez ? 11 : 9;
  const campo = (rot, x, y, w, val) =>
    `<div class="a f" style="left:${x}mm;top:${y}mm;width:${w}mm"><i>${rot}</i>${val ? `<b>${esc(val)}</b>` : ''}</div>`;
  let g = '';
  for (let c = 0; c < 2; c++) {
    const x0 = c ? 108 : 14;
    for (let r = 0; r < perCol; r++) {
      const q = c * perCol + r + 1, cy = top0 + r * pitch + pitch / 2 - 1;
      g += `<div class="a nq" style="left:${x0 + dq / 2 + .5}mm;top:${cy}mm;width:${dq}mm;height:${dq}mm;font-size:${fq}pt">${String(q).padStart(2, '0')}</div>`;
      for (let k = 0; k < 5; k++)
        g += `<div class="a bb" style="left:${x0 + 21 + 14 * k}mm;top:${cy}mm;width:${dn}mm;height:${dn}mm;font-size:${fs}pt">${L[k]}</div>`;
      g += `<div class="a sep" style="left:${x0 + 1}mm;top:${top0 + (r + 1) * pitch - 1}mm;width:88mm"></div>`;
    }
  }
  return `
  <section class="fl">
    <div class="a mk" style="left:8mm;top:8mm"></div><div class="a mk" style="left:195mm;top:8mm"></div>
    <div class="a mk" style="left:8mm;top:282mm"></div><div class="a mk" style="left:195mm;top:282mm"></div>
    <div class="a ttl">FOLHA DE RESPOSTAS</div>
    <div class="a sub">Sistema de Correção Automatizada</div>
    <div class="a rule" style="top:31mm"></div>
    <div class="a box"></div>
    ${campo('Nome do aluno', 19, 38.5, 126, al.nome)}${campo('Nº / Matrícula', 151, 38.5, 40, al.ra)}
    ${campo('Professor(a)', 19, 50, 85, '')}${campo('Turma', 110, 50, 41, al.turma)}${campo('Data', 157, 50, 34, '')}
    ${campo('Disciplina', 19, 61.5, 172, '')}
    <div class="a ins"><h3>INSTRUÇÕES DE PREENCHIMENTO</h3><ul>
      <li>Use caneta esferográfica de tinta <b>azul ou preta.</b> Não utilize lápis ou caneta de gel.</li>
      <li>Preencha completamente a bolha correspondente à alternativa escolhida. <span class="bl on">B</span>Correto <span class="bl" style="margin-left:6mm">B</span>Errado</li>
      <li>Marque <b>apenas uma</b> alternativa por questão. Marcações duplas anulam a questão.</li>
      <li>Não rasure, amasse ou dobre esta folha — isso pode impedir a leitura automática.</li>
      <li>Em caso de erro, solicite uma nova folha ao aplicador; não é permitido usar corretivo.</li>
      <li>Confira se o número de questões respondidas corresponde ao total da prova (${n} questões).</li>
    </ul></div>
    <div class="a rule" style="top:113mm"></div>
    <div class="a sec">FOLHA DE RESPOSTAS — ${n} QUESTÕES</div>
    <div class="a rule" style="top:122.5mm"></div>
    ${g}
    <div class="a qr"><img src="${API_BASE}/versoes/${v.id}/qr.png" alt="QR da versão ${esc(v.codigo)}"></div>
    <div class="a cod">Versão ${esc(v.codigo)}</div>
    <div class="a sg" style="left:14mm">Assinatura do Aluno</div>
    <div class="a sg" style="left:138mm">Assinatura do Professor</div>
  </section>`;
}

/* ids = ids das versões (versao_prova.id); uma folha por versão (ou uma só, preenchida, se vier aluno) */
async function imprimirFolhasRespostasApi(ids, tituloProva, aluno) {
  let vs;
  try { vs = await Promise.all(ids.map(i => api('/versoes/' + i + '/completa/'))); }
  catch (e) { return toast('Não foi possível montar a folha de respostas: ' + e.message); }
  const ruim = vs.find(v => ![10, 20].includes(v.itens.length));
  if (ruim) return toast('A folha de respostas existe para provas de 10 ou 20 questões (a versão ' + ruim.codigo + ' tem ' + ruim.itens.length + ').');
  printDoc('Folha de respostas ' + (tituloProva || '') + (vs.length == 1 ? ' ' + vs[0].codigo : ''), vs.map(v => folhaRespostasPgApi(v, aluno)).join(''), FOLHA_CSS);
}

function layout(active, title, sub) {
  document.body.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="nav-brand" href="dashboard.html"><span class="dot"></span>FlyLearn</a>
        <nav aria-label="Principal">
          ${NAV.map(n => `<a href="${n[0]}.html"${n[0] == active ? ' class="active" aria-current="page"' : ''}><span class="ic">${n[1]}</span>${n[2]}</a>`).join('')}
        </nav>
        <div class="sidebar-foot">
          <a href="index.html"><span class="ic">↩</span>Sair</a>
        </div>
      </aside>
      <main class="main">
        <div class="topbar">
          <div>
            <h1>${title}</h1>
            <div class="topbar-sub">${sub}</div>
          </div>
          <div class="avatar">P</div>
        </div>
        <div class="content" id="c"></div>
      </main>
    </div>
  `;
  return $('#c');
}

function modal(html) {
  const m = document.createElement('div');
  m.className = 'modal-overlay show';
  m.innerHTML = `
    <div style="width:100%">
      <div class="modal-close">
        <button onclick="this.closest('.modal-overlay').remove()" aria-label="Fechar">✕</button>
      </div>
      <div class="modal-body">${html}</div>
    </div>
  `;
  document.body.appendChild(m);
  return m;
}