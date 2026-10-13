/* FlyLearn — camada de dados (espelha o modelo do banco) + layout compartilhado.
   Tabelas: materia, turma, aluno, questao(+alternativa), prova, versao_prova(+prova_questao+gabarito), avaliacao(+resposta).
   Persistência local (localStorage) até ligar à API/banco real. */
const K='flylearn_db';
const seed=()=>({seq:100,
 materias:[{id:1,professor_id:1,nome:'Matemática',descricao:'Aritmética e frações',created_at:'2026-09-01T10:00:00Z',updated_at:'2026-09-01T10:00:00Z'},{id:2,professor_id:1,nome:'Geografia',descricao:'Brasil e mundo',created_at:'2026-09-01T10:00:00Z',updated_at:'2026-09-01T10:00:00Z'}],
 turmas:[{id:1,ano:3,disciplina:'Matemática'},{id:2,ano:5,disciplina:'Geografia'}],
 alunos:[{id:1,turma_id:1,nome:'Ana Beatriz Souza',ra:20240117,email:'ana@escola.com'},{id:2,turma_id:1,nome:'Lucas Henrique Prado',ra:20240122,email:'lucas@escola.com'}],
 questoes:[
  {id:1,materia_id:1,enunciado:'Quanto é 1/2 + 1/4?',ativo:true,created_at:'2026-09-01T10:00:00Z',updated_at:'2026-09-01T10:00:00Z',alts:[{id:1,texto:'3/4',correta:true},{id:2,texto:'2/6',correta:false},{id:3,texto:'1/6',correta:false},{id:4,texto:'2/4',correta:false}]},
  {id:5,materia_id:1,enunciado:'Quanto é 3/5 − 1/5?',ativo:true,created_at:'2026-09-01T10:00:00Z',updated_at:'2026-09-01T10:00:00Z',alts:[{id:6,texto:'2/5',correta:true},{id:7,texto:'4/5',correta:false},{id:8,texto:'2/10',correta:false},{id:9,texto:'3/10',correta:false}]}],
 provas:[],versoes:[],avaliacoes:[]});
let DB;try{DB=JSON.parse(localStorage.getItem(K))||seed()}catch(e){DB=seed()}
const save=()=>{try{localStorage.setItem(K,JSON.stringify(DB))}catch(e){}};
const id=()=>++DB.seq, $=(s,r=document)=>r.querySelector(s), L='ABCDE';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const by=(t,i)=>DB[t].find(x=>x.id==i);
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const fmt=d=>d?new Date(d).toLocaleDateString('pt-BR'):'—';
const opts=(t,f,sel)=>DB[t].map(x=>`<option value="${x.id}"${x.id==sel?' selected':''}>${esc(f(x))}</option>`).join('');
const NAV=[['dashboard','🏠','Painel'],['turmas','👥','Turmas e alunos'],['materias','🗂️','Matérias'],['questoes','❓','Banco de questões'],['gerador','✏️','Montar prova'],['biblioteca','📚','Minhas provas'],['correcao','🧾','Aplicações e correção']];

/* ---------- BACKEND (Django) ----------
   Telas que já foram ligadas no banco de verdade (questoes.html, gerador.html,
   biblioteca.html) usam isto em vez do DB/localStorage. API_BASE: no Netlify,
   /api/* é redirecionado pro Render (netlify.toml); local, chama o Render direto. */
const API_BASE=['localhost','127.0.0.1'].includes(location.hostname)?'https://flylearn.onrender.com':'/api';
const PROF=JSON.parse(localStorage.getItem('flylearn_user')||'null')||{id:1};
async function api(path,opts){
 const r=await fetch(API_BASE+path,Object.assign({headers:{'Content-Type':'application/json'}},opts||{}));
 const dados=await r.json().catch(()=>({}));
 if(!r.ok) throw new Error(dados.erro||'Não foi possível completar a operação.');
 return dados;
}
/* Impressão a partir dos dados do backend (/versoes/<id>/completa/), que já vem
   com o texto das questões/alternativas e a letra da alternativa correta —
   diferente de provaPg/gabPg acima, que leem do DB mock em localStorage. */
const provaPgApi=v=>`<section class="pg"><h1>${esc(v.prova_nome)}</h1><div class="mt">${esc(v.materia_nome)} · Versão <b>${v.codigo}</b></div><div class="id">Nome: ______________________________________ RA: ____________ Turma: ________ Data: ___/___/______</div>${v.prova_descricao?`<p class="ins">${esc(v.prova_descricao)}</p>`:''}${v.itens.map(it=>`<div class="q"><b>${it.ordem}.</b> ${esc(it.enunciado)}<div class="o">${it.alternativas.map((t,k)=>`<div>( &nbsp;) ${L[k]}) ${esc(t)}</div>`).join('')}</div></div>`).join('')}</section>`;
const gabPgApi=v=>`<section class="pg"><h1>Gabarito — ${esc(v.prova_nome)}</h1><div class="mt">Versão <b>${v.codigo}</b> · ${v.itens.length} questões</div><div class="grid">${v.itens.map(it=>`<div class="g"><b>Questão ${it.ordem}</b>${it.correta_letra||'—'}</div>`).join('')}</div><div class="ft">Código ${v.codigo} · ${v.uuid}</div></section>`;
async function imprimirVersoesProvaApi(ids,tituloProva){
 const vs=await Promise.all(ids.map(i=>api('/versoes/'+i+'/completa/')));
 printDoc('Prova '+tituloProva+(vs.length==1?' '+vs[0].codigo:''),vs.map(provaPgApi).join(''));
}
async function imprimirGabaritosProvaApi(ids,tituloProva){
 const vs=await Promise.all(ids.map(i=>api('/versoes/'+i+'/completa/')));
 printDoc('Gabarito '+tituloProva+(vs.length==1?' '+vs[0].codigo:''),vs.map(gabPgApi).join(''));
}
function layout(active,title,sub){
 document.body.innerHTML=`<div class="app-shell"><aside class="sidebar"><a class="nav-brand" href="dashboard.html"><span class="dot"></span>FlyLearn</a><nav aria-label="Principal">${NAV.map(n=>`<a href="${n[0]}.html"${n[0]==active?' class="active" aria-current="page"':''}><span class="ic">${n[1]}</span>${n[2]}</a>`).join('')}</nav><div class="sidebar-foot"><a href="index.html"><span class="ic">↩</span>Sair</a></div></aside><main class="main"><div class="topbar"><div><h1>${title}</h1><div class="topbar-sub">${sub}</div></div><div class="avatar">P</div></div><div class="content" id="c"></div></main></div>`;
 return $('#c');
}
function modal(html){
 const m=document.createElement('div');m.className='modal-overlay show';
 m.innerHTML=`<div style="width:100%"><div class="modal-close"><button onclick="this.closest('.modal-overlay').remove()" aria-label="Fechar">✕</button></div><div class="modal-body">${html}</div></div>`;
 document.body.appendChild(m);return m;
}
