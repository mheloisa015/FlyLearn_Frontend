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
function layout(active,title,sub){
 document.body.innerHTML=`<div class="app-shell"><aside class="sidebar"><a class="nav-brand" href="dashboard.html"><span class="dot"></span>FlyLearn</a><nav aria-label="Principal">${NAV.map(n=>`<a href="${n[0]}.html"${n[0]==active?' class="active" aria-current="page"':''}><span class="ic">${n[1]}</span>${n[2]}</a>`).join('')}</nav><div class="sidebar-foot"><a href="index.html"><span class="ic">↩</span>Sair</a></div></aside><main class="main"><div class="topbar"><div><h1>${title}</h1><div class="topbar-sub">${sub}</div></div><div class="avatar">P</div></div><div class="content" id="c"></div></main></div>`;
 return $('#c');
}
function modal(html){
 const m=document.createElement('div');m.className='modal-overlay show';
 m.innerHTML=`<div style="width:100%"><div class="modal-close"><button onclick="this.closest('.modal-overlay').remove()" aria-label="Fechar">✕</button></div><div class="modal-body">${html}</div></div>`;
 document.body.appendChild(m);return m;
}
/* versao_prova + prova_questao: ordem das questões e das alternativas embaralhadas */
function novaVersao(pid,qids,emQ=true,emA=true){
 const itens=(emQ?shuffle(qids):[...qids]).map((q,i)=>({pq:id(),questao_id:q,ordem:i+1,alts:(emA?shuffle:(x=>x))(by('questoes',q).alts.map(a=>a.id))}));
 const v={id:id(),prova_id:pid,uuid:crypto.randomUUID(),codigo:'V-'+Math.random().toString(16).slice(2,6).toUpperCase(),created_at:new Date().toISOString(),itens};
 DB.versoes.push(v);return v;
}
/* gabarito: alternativa correta de cada prova_questao */
const gabId=it=>by('questoes',it.questao_id).alts.find(a=>a.correta).id;
const gab=v=>v.itens.map(it=>L[it.alts.indexOf(gabId(it))]);

/* ---------- IMPRESSÃO / PDF ----------
   Abre a janela de impressão do navegador com a prova ou o gabarito já formatados (A4).
   Em "Destino", escolha "Salvar como PDF" para gerar o arquivo. */
function printDoc(title,body){
 const f=document.createElement('iframe');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.appendChild(f);
 const css='@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:12pt;line-height:1.35;margin:0}.pg{page-break-after:always}.pg:last-child{page-break-after:auto}h1{font-size:17pt;margin:0 0 2px}.mt{font-size:10.5pt;color:#333;margin-bottom:10px}.id{border:1px solid #000;padding:8px 10px;font-size:10.5pt;margin-bottom:12px}.ins{font-size:10.5pt;margin:0 0 12px}.q{margin:0 0 12px;page-break-inside:avoid}.o{margin:4px 0 0 18px}.o div{margin:2px 0}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:14px}.g{border:1px solid #000;padding:8px;text-align:center;font-size:13pt}.g b{display:block;font-size:9pt;font-weight:400;color:#444}.ft{margin-top:16px;font-size:9pt;color:#444}';
 const d=f.contentWindow.document;d.open();d.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>'+esc(title)+'</title><style>'+css+'</style></head><body>'+body+'</body></html>');d.close();
 const old=document.title;document.title=title;
 setTimeout(()=>{f.contentWindow.focus();f.contentWindow.print();document.title=old;setTimeout(()=>f.remove(),3000)},300);
}
const provaPg=v=>{const p=by('provas',v.prova_id),m=by('materias',p.materia_id);
 return `<section class="pg"><h1>${esc(p.nome)}</h1><div class="mt">${esc(m?m.nome:'')} · Versão <b>${v.codigo}</b></div><div class="id">Nome: ______________________________________ RA: ____________ Turma: ________ Data: ___/___/______</div>${p.descricao?`<p class="ins">${esc(p.descricao)}</p>`:''}${v.itens.map(it=>{const q=by('questoes',it.questao_id);return `<div class="q"><b>${it.ordem}.</b> ${esc(q.enunciado)}<div class="o">${it.alts.map((a,k)=>`<div>( &nbsp;) ${L[k]}) ${esc(q.alts.find(x=>x.id==a).texto)}</div>`).join('')}</div></div>`}).join('')}</section>`};
const gabPg=v=>{const p=by('provas',v.prova_id);
 return `<section class="pg"><h1>Gabarito — ${esc(p.nome)}</h1><div class="mt">Versão <b>${v.codigo}</b> · ${v.itens.length} questões</div><div class="grid">${gab(v).map((l,k)=>`<div class="g"><b>Questão ${k+1}</b>${l}</div>`).join('')}</div><div class="ft">Código ${v.codigo} · ${v.uuid}</div></section>`};
const imprimirProvas=ids=>{const vs=ids.map(i=>by('versoes',i));printDoc('Prova '+by('provas',vs[0].prova_id).nome+(vs.length==1?' '+vs[0].codigo:''),vs.map(provaPg).join(''))};
const imprimirGabaritos=ids=>{const vs=ids.map(i=>by('versoes',i));printDoc('Gabarito '+by('provas',vs[0].prova_id).nome+(vs.length==1?' '+vs[0].codigo:''),vs.map(gabPg).join(''))};

/* ---------- EXEMPLO PRONTO ----------
   Cria 20 questões de Matemática + 1 prova com 2 versões (para testar o fluxo). */
function criarExemplo(){
 const now=new Date().toISOString();
 let m=DB.materias.find(x=>x.nome=='Matemática');
 if(!m){m={id:id(),professor_id:1,nome:'Matemática',descricao:'Aritmética e frações',created_at:now,updated_at:now};DB.materias.push(m)}
 const qids=[];
 for(let i=0;i<20;i++){
  const b=[5,6,8,10,12][i%5],x=1+(i%4),y=1+(Math.floor(i/4)%4),s=x+y,qid=id();
  const txt=[s+'/'+b,s+'/'+(2*b),(s+1)+'/'+b,(s+2)+'/'+b];
  DB.questoes.push({id:qid,materia_id:m.id,enunciado:`Quanto é ${x}/${b} + ${y}/${b}?`,ativo:true,created_at:now,updated_at:now,
   alts:txt.map((t,k)=>({id:id(),questao_id:qid,texto:t,ordem_original:k+1,correta:k==0,created_at:now}))});
  qids.push(qid);
 }
 const p={id:id(),professor_id:1,materia_id:m.id,nome:'Frações — soma (exemplo)',descricao:'Prova de exemplo com 20 questões.',qids,created_at:now,updated_at:now};
 DB.provas.push(p);novaVersao(p.id,qids);novaVersao(p.id,qids);save();return p;
}
