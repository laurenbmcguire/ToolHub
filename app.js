(function(){
"use strict";
/* ================= data ================= */
const U=(window.UNITS||[]).slice().sort((a,b)=>parseInt(a.id.slice(1))-parseInt(b.id.slice(1)));
const byId=Object.fromEntries(U.map(u=>[u.id,u]));
U.forEach(u=>{
  u.questions.forEach((q,i)=>{q.k=u.id+":"+i;q.u=u.id;q.d=q.d||2});
  u.flashcards.forEach((c,i)=>{c.k=u.id+":"+i;c.u=u.id});
  u.traps=u.traps||[];u.cram=u.cram||[];u.ytv=u.ytv||[];
});
const ALLQ=U.flatMap(u=>u.questions), ALLC=U.flatMap(u=>u.flashcards);

/* ================= state ================= */
const KEY="crushc207.v2";
const DEF={start:null,exam:"",lesson:{},ua:{},srs:{},star:{},missed:{},tasks:{},best:{},xp:0,days:{},theme:"system",drill:{},mocks:[],labs:{},goal:150};
let S=JSON.parse(JSON.stringify(DEF));
try{const raw=localStorage.getItem(KEY);if(raw)S=Object.assign(S,JSON.parse(raw))}catch(e){}
if(!S.start)S.start=today();
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
function today(d){d=d||new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function dayNum(){const s=new Date(S.start+"T00:00:00"),n=new Date(today()+"T00:00:00");return Math.max(1,Math.min(7,Math.round((n-s)/864e5)+1))}
function applyTheme(){const r=document.documentElement;if(S.theme==="system")r.removeAttribute("data-theme");else r.setAttribute("data-theme",S.theme)}
applyTheme();

/* ================= helpers ================= */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const pct=(a,b)=>b?Math.round(100*a/b):0;
const R=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const pick=a=>a[Math.floor(Math.random()*a.length)];
const rd=(x,d)=>{d=d==null?2:d;return +(+x).toFixed(d)};
const fmt=(x,d)=>{const v=rd(x,d==null?2:d);return v.toLocaleString("en-US",{maximumFractionDigits:d==null?2:d})};
const money=x=>"$"+Math.round(x).toLocaleString("en-US");
const yt=q=>"https://www.youtube.com/results?search_query="+encodeURIComponent(q);
const claude=q=>"https://claude.ai/new?q="+encodeURIComponent(q);
function toast(m){const t=document.createElement("div");t.className="toast";t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),2200)}
function unitOpts(sel,extra){return (extra||"")+U.map(u=>`<option value="${u.id}" ${sel===u.id?"selected":""}>Day ${u.day} · ${esc(u.title)}</option>`).join("")}
function erf(x){const s=x<0?-1:1;x=Math.abs(x);const t=1/(1+.3275911*x);const y=1-((((1.061405429*t-1.453152027)*t+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);return s*y}
const ncdf=z=>.5*(1+erf(z/Math.SQRT2));
const npdf=z=>Math.exp(-z*z/2)/Math.sqrt(2*Math.PI);
function median(a){const n=a.length;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2}
function randn(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
const col=n=>getComputedStyle(document.documentElement).getPropertyValue("--"+n).trim();

/* ================= progress model ================= */
function addXP(n){S.xp+=n;const t=today();S.days[t]=(S.days[t]||0)+n;save();hud()}
function streak(){let d=new Date(),n=0;if(!S.days[today(d)])d.setDate(d.getDate()-1);while(S.days[today(d)]){n++;d.setDate(d.getDate()-1)}return n}
function level(){return Math.floor(Math.sqrt(S.xp/60))+1}
function record(q,ok){(S.ua[q.u]=S.ua[q.u]||[]).push(ok?1:0);if(S.ua[q.u].length>40)S.ua[q.u].shift();if(ok)delete S.missed[q.k];else S.missed[q.k]=1;addXP(ok?10:2)}
function unitAcc(uid){const a=S.ua[uid];return a&&a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function cardPct(uid){const cs=byId[uid].flashcards;return cs.filter(c=>(S.srs[c.k]||{}).b>=3).length/cs.length}
function mastery(uid){return Math.round(100*(.65*(unitAcc(uid)||0)+.2*cardPct(uid)+.15*(S.lesson[uid]?1:0)))}
function readiness(){return Math.round(U.reduce((s,u)=>s+mastery(u.id),0)/U.length)}
function mClass(m,uid){if(!S.lesson[uid]&&unitAcc(uid)===null)return"m0";return m>=80?"m3":m>=55?"m2":"m1"}
const IV=[0,10*60e3,864e5,2*864e5,4*864e5,7*864e5];
function dueCards(){const now=Date.now();return ALLC.filter(c=>S.srs[c.k]&&S.srs[c.k].due<=now)}
function newCards(){return ALLC.filter(c=>!S.srs[c.k])}
function mastered(){return ALLC.filter(c=>(S.srs[c.k]||{}).b>=3).length}

/* ================= router ================= */
const TABS=[["today","Today"],["learn","Learn"],["cards","Flashcards"],["practice","Practice"],["labs","Labs"],["games","Games"],["cram","Cram & Tools"]];
let tab="today",sub=null,cleanup=null;
const app=$("#app");
function go(t,s){if(cleanup){try{cleanup()}catch(e){}cleanup=null}tab=t;sub=s==null?null:s;app.onclick=null;app.onchange=null;app.oninput=null;tabs();render();window.scrollTo(0,0);try{history.replaceState(null,"","#"+t)}catch(e){}}
function tabs(){$("#tabs").innerHTML=TABS.map(([k,l])=>`<button role="tab" aria-selected="${k===tab}" data-tab="${k}">${l}</button>`).join("");hud()}
function hud(){const s=streak(),r=readiness();$("#hud").innerHTML=`<span class="chip ${s?"hi":""}" title="Day streak">🔥 ${s}</span><span class="chip" title="Level and XP">Lv ${level()} · ${S.xp} XP</span><span class="chip ${r>=80?"good":r>=55?"warn":""}" title="Exam readiness">${r}% ready</span>`}
$("#tabs").addEventListener("click",e=>{const b=e.target.closest("[data-tab]");if(b)go(b.dataset.tab)});
function render(){({today:vToday,learn:vLearn,cards:vCards,practice:vPractice,labs:vLabs,games:vGames,cram:vCram})[tab]()}

/* ================= bell & ring ================= */
function bell(fill){
  const W=360,base=140,pts=[];
  for(let i=0;i<=120;i++){const x=i/120*W,z=(x-W/2)/(W/7.2);pts.push([x,base-112*Math.exp(-z*z/2)])}
  const path="M"+pts.map(p=>p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" L");
  const cut=W*fill/100,area=pts.filter(p=>p[0]<=cut);
  const ap=area.length?"M0 "+base+" L"+area.map(p=>p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" L")+" L"+cut.toFixed(1)+" "+base+" Z":"";
  const sd=W/7.2,ticks=[-3,-2,-1,0,1,2,3].map(k=>{const x=W/2+k*sd;return `<line x1="${x}" x2="${x}" y1="${base}" y2="${base+6}" stroke="var(--muted)"/><text x="${x}" y="${base+20}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="JetBrains Mono,monospace">${k===0?"μ":(k>0?"+":"−")+Math.abs(k)+"σ"}</text>`}).join("");
  return `<svg viewBox="-12 0 384 178" role="img" aria-label="Bell curve shaded ${fill}% to show exam readiness"><path d="${ap}" fill="var(--hi)"/><path d="${path}" fill="none" stroke="var(--ink)" stroke-width="2.4"/><line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="var(--line)" stroke-width="1.5"/>${ticks}</svg>`;
}
function ring(v,max,label){const p=Math.min(1,v/max),r=34,c=2*Math.PI*r;return `<svg class="ring" viewBox="0 0 84 84" role="img" aria-label="${label}"><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--soft)" stroke-width="9"/><circle cx="42" cy="42" r="${r}" fill="none" stroke="${p>=1?"var(--good)":"var(--accent)"}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-p)}" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ink)" font-family="JetBrains Mono,monospace">${Math.round(p*100)}%</text></svg>`}

/* ================= TODAY ================= */
const DAYS=[1,2,3,4,5,6].map(d=>({d,units:U.filter(u=>u.day===d)}));
function nextActions(){
  const dn=dayNum(),acts=[],todays=dn<7?U.filter(u=>u.day===dn):[];
  todays.forEach(u=>{if(!S.lesson[u.id])acts.push({t:"Learn: "+u.title,k:"learn",s:u.id,p:1})});
  const due=dueCards().length;if(due>=8)acts.push({t:`Review ${due} due flashcards`,k:"cards",s:"due"});
  todays.forEach(u=>{if(S.lesson[u.id]&&(unitAcc(u.id)===null||unitAcc(u.id)<.8))acts.push({t:"Quiz: "+u.title,k:"practice",s:{mode:"unit",unit:u.id}})});
  const studied=U.filter(u=>S.lesson[u.id]||unitAcc(u.id)!==null).sort((a,b)=>mastery(a.id)-mastery(b.id));
  if(studied.length&&mastery(studied[0].id)<70&&!todays.includes(studied[0]))acts.push({t:"Shore up: "+studied[0].title,k:"practice",s:{mode:"unit",unit:studied[0].id}});
  if(dn===7||readiness()>=70)acts.push({t:"Take a full mock OA",k:"practice",s:{mode:"mock"}});
  if(acts.length<3)acts.push({t:"Infinite math drill (mixed)",k:"practice",s:{mode:"drill",skill:"mixed"}});
  if(acts.length<3&&newCards().length)acts.push({t:"Learn 20 new flashcards",k:"cards",s:"study"});
  return acts.slice(0,3);
}
function examLine(){if(!S.exam)return"";const d=Math.round((new Date(S.exam+"T00:00:00")-new Date(today()+"T00:00:00"))/864e5);return d>0?`${d} day${d>1?"s":""} until your OA`:d===0?"Exam day — you've got this":"Exam date passed"}
function vToday(){
  const dn=dayNum(),r=readiness(),todays=dn<7?(DAYS[dn-1]||{units:[]}).units:[],acts=nextActions();
  const xpT=S.days[today()]||0;
  const wk=[...Array(7)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);return{k:today(d),l:"SMTWTFS"[d.getDay()],v:S.days[today(d)]||0}});
  const mx=Math.max(S.goal,...wk.map(w=>w.v));
  app.innerHTML=`<div class="stack">
  <section class="hero">
    <div class="stack">
      <span class="eyebrow">Day ${dn} of 7${S.exam?" · "+esc(examLine()):""}</span>
      <h1>${dn<7?`Today: <span class="mark">${esc(todays.map(u=>u.title).join(" + "))}</span>`:`Today: <span class="mark">mock OA</span> + weak spots`}</h1>
      <div class="stack" style="gap:8px"><span class="eyebrow">Do these next</span>${acts.map((a,i)=>`<button class="btn ${i===0?"primary":""}" style="justify-content:flex-start" data-act="${i}">${i+1}. ${esc(a.t)}</button>`).join("")}</div>
    </div>
    <div class="card stack" style="gap:10px">
      ${bell(r)}
      <div class="stat"><div><b class="num">${r}%</b><span>exam readiness</span></div><div><b class="num">${mastered()}/${ALLC.length}</b><span>cards mastered</span></div><div><b class="num">${U.filter(u=>S.lesson[u.id]).length}/12</b><span>lessons</span></div></div>
      <p class="muted small">Readiness blends recent quiz accuracy (65%), flashcard mastery (20%) and lessons read (15%). Aim for 80%+ on every unit before booking the OA.</p>
    </div>
  </section>
  <section class="card row" style="gap:18px">
    ${ring(xpT,S.goal,"Daily goal")}
    <div class="stack" style="gap:4px;flex:1;min-width:180px"><h3>Daily goal: ${xpT} / ${S.goal} XP</h3><p class="muted small">Correct answer +10 · flashcard +2 · drill +5 · lesson +25. ${streak()?`You're on a ${streak()}-day streak.`:"Earn any XP today to start a streak."}</p></div>
    <div style="flex:1;min-width:220px"><div class="week">${wk.map(w=>`<div><i style="height:${Math.max(3,Math.round(70*w.v/mx))}px;${w.v>=S.goal?"background:var(--good)":""}"></i><span>${w.l}</span></div>`).join("")}</div></div>
  </section>
  <section class="stack" style="gap:10px"><div class="row between"><h2>Mastery map</h2><span class="muted small">red &lt; 55 · amber &lt; 80 · green 80+</span></div>
   <div class="heat">${U.map(u=>{const m=mastery(u.id);return `<button class="${mClass(m,u.id)}" data-open="${u.id}"><span class="eyebrow">Unit ${u.id.slice(1)}</span><b>${esc(u.title)}</b><span class="num small">${m}%</span></button>`}).join("")}</div></section>
  <section class="card"><div class="row between" style="margin-bottom:6px"><h2>The 7-day plan</h2><button class="btn sm ghost" data-restart>Restart week from today</button></div>
   ${DAYS.map(D=>dayBlock(D,dn)).join("")}
   <div class="day ${dn===7?"today":""}"><div class="dn"><span>7</span></div><div class="stack" style="gap:6px"><h3>Mock OA &amp; final review</h3>
    ${taskRow("d7mock","Take the 60-question mock OA under exam conditions")}${taskRow("d7rev","Review every miss and its explanation")}${taskRow("d7weak","Re-drill any unit under 80%")}${taskRow("d7cram","Read the cram sheet and listen to podcast mode")}
    <div class="row"><button class="btn sm primary" data-mock>Mock OA</button><button class="btn sm" data-tabgo="cram">Cram sheet</button></div></div></div>
  </section>
  <section class="card stack" style="gap:12px"><h2>Settings</h2>
   <div class="ctl"><div class="field"><label for="exam">OA exam date</label><input type="date" id="exam" value="${esc(S.exam)}"></div>
   <div class="field"><label for="goal">Daily XP goal</label><select id="goal">${[100,150,250,400].map(g=>`<option ${S.goal===g?"selected":""}>${g}</option>`).join("")}</select></div>
   <div class="field"><label for="theme">Theme</label><select id="theme">${["system","light","dark"].map(t=>`<option ${S.theme===t?"selected":""}>${t}</option>`).join("")}</select></div></div>
   <div class="stack" style="gap:6px"><h3>Move progress between phone and computer</h3><p class="muted small">Progress saves on this device. Copy your progress code here, then paste it on your other device.</p>
    <div class="row"><button class="btn sm" data-export>Copy my progress code</button><button class="btn sm" data-import>Paste a code</button><button class="btn sm" id="installBtn" hidden>Install as an app</button></div>
    <textarea id="sync" hidden placeholder="Paste your progress code here, then press Load"></textarea><div class="row" id="syncRow" hidden><button class="btn sm primary" data-load>Load this code</button></div>
    <p class="muted small">On iPhone: tap Share, then “Add to Home Screen” to install. It works offline after the first visit.</p></div>
  </section></div>`;
  if(deferredInstall)$("#installBtn").hidden=false;
  app.onclick=e=>{const t=e.target;
    const a=t.closest("[data-act]");if(a){const x=acts[+a.dataset.act];return go(x.k,x.s)}
    const o=t.closest("[data-open]");if(o)return go("learn",o.dataset.open);
    if(t.closest("[data-mock]"))return go("practice",{mode:"mock"});
    const tg=t.closest("[data-tabgo]");if(tg)return go(tg.dataset.tabgo);
    const q=t.closest("[data-quiz]");if(q)return go("practice",{mode:"unit",unit:q.dataset.quiz});
    const c=t.closest("[data-cards]");if(c)return go("cards",c.dataset.cards);
    if(t.closest("[data-restart]")){S.start=today();save();return go("today")}
    if(t.closest("[data-export]")){const code=btoa(unescape(encodeURIComponent(JSON.stringify(S))));const ta=$("#sync");ta.hidden=false;ta.value=code;ta.select();(navigator.clipboard?navigator.clipboard.writeText(code):Promise.reject()).then(()=>toast("Progress code copied"),()=>toast("Code selected — copy it"));return}
    if(t.closest("[data-import]")){$("#sync").hidden=false;$("#syncRow").hidden=false;$("#sync").value="";$("#sync").focus();return}
    if(t.closest("[data-load]")){try{const d=JSON.parse(decodeURIComponent(escape(atob($("#sync").value.trim()))));S=Object.assign(JSON.parse(JSON.stringify(DEF)),d);save();applyTheme();toast("Progress loaded");go("today")}catch(err){toast("That code didn't load. Copy the whole code and try again.")}return}
    if(t.closest("#installBtn")&&deferredInstall){deferredInstall.prompt();deferredInstall=null}};
  app.onchange=e=>{const t=e.target;
    if(t.dataset.task){S.tasks[t.dataset.task]=t.checked;save()}
    if(t.id==="exam"){S.exam=t.value;save();go("today")}
    if(t.id==="goal"){S.goal=+t.value;save();go("today")}
    if(t.id==="theme"){S.theme=t.value;save();applyTheme()}};
}
function taskRow(k,label){return `<label class="task"><input type="checkbox" data-task="${k}" ${S.tasks[k]?"checked":""}><span>${label}</span></label>`}
function dayBlock(D,dn){
  return `<div class="day ${D.d===dn?"today":""}"><div class="dn"><span>${D.d}</span></div><div class="stack" style="gap:12px">
  ${D.units.map(u=>{const m=mastery(u.id);return `<div class="stack" style="gap:4px"><div class="row between"><h3>${esc(u.title)}</h3><span class="chip ${mClass(m,u.id)==="m3"?"good":mClass(m,u.id)==="m2"?"warn":mClass(m,u.id)==="m1"?"bad":""}">${m}% mastery</span></div>
   <p class="muted small">${esc(u.summary)}</p>
   <div class="row" style="margin-top:4px"><button class="btn sm ${S.lesson[u.id]?"":"primary"}" data-open="${u.id}">${S.lesson[u.id]?"✓ Lesson":"Lesson"}</button><button class="btn sm" data-cards="${u.id}">Flashcards</button><button class="btn sm" data-quiz="${u.id}">Quiz (${u.questions.length})</button></div></div>`}).join("")}
  </div></div>`;
}

/* ================= LEARN ================= */
function vLearn(){
  if(sub&&byId[sub])return vUnit(byId[sub]);
  app.innerHTML=`<div class="stack"><div><span class="eyebrow">12 units · 6 study days</span><h1>Learn</h1></div>
  <input type="search" id="q" placeholder="Search every lesson and flashcard (try “p-value” or “Pareto”)" aria-label="Search">
  <div id="hits"></div>
  <div class="grid" id="ugrid">${U.map(u=>{const m=mastery(u.id);return `<button class="card stack" style="gap:8px;text-align:left;cursor:pointer;font:inherit;color:inherit" data-open="${u.id}">
    <div class="row between"><span class="eyebrow">Day ${u.day} · Unit ${u.id.slice(1)}</span>${S.lesson[u.id]?`<span class="chip good">read</span>`:""}</div>
    <h3>${esc(u.title)}</h3><p class="muted small">${esc(u.summary)}</p>
    <div class="bar"><i style="width:${m}%"></i></div><span class="muted small">${m}% mastery · ${u.ytv.length} videos · ${u.questions.length} questions</span></button>`}).join("")}</div></div>`;
  app.oninput=e=>{if(e.target.id!=="q")return;const q=e.target.value.trim().toLowerCase();const hits=$("#hits");if(q.length<2){hits.innerHTML="";return}
    const res=[];U.forEach(u=>{u.lesson.forEach(s=>{const txt=s.body.replace(/<[^>]+>/g," ");if((s.h+" "+txt).toLowerCase().includes(q))res.push({u,t:"Lesson · "+s.h,x:txt})});u.flashcards.forEach(c=>{if((c.f+" "+c.b).toLowerCase().includes(q))res.push({u,t:"Card · "+c.f,x:c.b})})});
    hits.innerHTML=res.length?`<div class="card">${res.slice(0,12).map(r=>{const i=r.x.toLowerCase().indexOf(q);const sn=i>=0?r.x.slice(Math.max(0,i-60),i+100):r.x.slice(0,140);return `<div class="search-hit"><button class="btn sm ghost" data-open="${r.u.id}">${esc(r.u.title)} →</button><p><strong>${esc(r.t)}</strong></p><p class="muted small">…${esc(sn)}…</p></div>`}).join("")}</div>`:`<p class="muted">No matches. Try a shorter word.</p>`};
  app.onclick=e=>{const o=e.target.closest("[data-open]");if(o)go("learn",o.dataset.open)};
}
function ytCard(v){return `<div><button class="yt" data-yt="${esc(v.id)}" aria-label="Play ${esc(v.title)}"><img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy"><span class="play"><i>▶</i></span></button><strong class="small">${esc(v.title)}</strong><span class="muted small">${esc(v.channel||"")}${v.why?" — "+esc(v.why):""}</span></div>`}
function vUnit(u){
  const i=U.indexOf(u),prev=U[i-1],next=U[i+1];
  const ask=claude(`I'm studying for WGU C207 Data-Driven Decision Making, unit "${u.title}" (${u.summary}). I'm new to statistics. Teach me the hardest part of this unit in plain English with one business example, then quiz me with 3 multiple-choice questions one at a time and explain my answers.`);
  app.innerHTML=`<div class="stack lesson">
  <div class="row"><button class="btn sm ghost" data-back>← All units</button></div>
  <div class="stack" style="gap:8px"><span class="eyebrow">Day ${u.day} · Unit ${u.id.slice(1)} of 12 · ${mastery(u.id)}% mastery</span><h1>${esc(u.title)}</h1><p class="muted">${esc(u.summary)}</p></div>
  <div class="row"><button class="btn primary" data-play>▶ Narrated lesson</button><button class="btn" data-cards="${u.id}">Flashcards (${u.flashcards.length})</button><button class="btn" data-quiz="${u.id}">Quiz (${u.questions.length})</button><button class="btn" data-match="${u.id}">Match game</button><a class="btn" href="${ask}" target="_blank" rel="noopener">Ask Claude to tutor me ↗</a></div>
  ${u.mnemonic?`<div class="callout"><span class="eyebrow" style="color:inherit">Memory hook</span><p style="font:700 1.1rem/1.4 var(--f-display);margin-top:4px">${esc(u.mnemonic)}</p></div>`:""}
  ${u.ytv.length?`<section class="stack" style="gap:10px"><h2>Watch first</h2><div class="vids">${u.ytv.map(ytCard).join("")}</div></section>`:""}
  ${u.lesson.map(s=>`<section class="stack" style="gap:8px"><h3>${esc(s.h)}</h3><div class="body">${s.body}</div></section>`).join("<hr>")}
  <hr><section class="stack"><h2>Worked examples</h2><p class="muted">Try each on paper first, then reveal one step at a time.</p>
  ${u.examples.map((x,j)=>`<div class="example stack" style="gap:8px"><p><strong>Example ${j+1}.</strong> ${esc(x.q)}</p><ol data-steps="${j}"></ol><p data-ans="${j}" hidden><span class="chip hi">Answer</span> ${esc(x.answer)}</p><div class="row"><button class="btn sm" data-step="${j}">Show next step</button></div></div>`).join("")}</section>
  ${u.traps.length?`<section class="card stack" style="gap:8px;border-color:var(--bad)"><h3>Exam traps to avoid</h3><ul class="traps" style="margin:0;padding-left:1.2em">${u.traps.map(t=>`<li>${esc(t)}</li>`).join("")}</ul></section>`:""}
  <section class="card stack" style="gap:8px"><h3>Key points</h3><ul style="margin:0;padding-left:1.2em;display:flex;flex-direction:column;gap:6px">${u.keyPoints.map(k=>`<li>${esc(k)}</li>`).join("")}</ul></section>
  <section class="card"><h3 style="margin-bottom:6px">More videos on YouTube</h3>${u.videos.map(v=>`<div class="row between" style="padding:8px 0;border-top:1px solid var(--line)"><span style="flex:1;min-width:0">${esc(v.title)}</span><a class="btn sm" href="${yt(v.query)}" target="_blank" rel="noopener">Search YouTube ↗</a></div>`).join("")}</section>
  <div class="row between"><button class="btn ${S.lesson[u.id]?"":"primary"}" data-done>${S.lesson[u.id]?"✓ Lesson complete":"Mark lesson complete (+25 XP)"}</button>
   <div class="row">${prev?`<button class="btn sm ghost" data-open="${prev.id}">← ${esc(prev.title)}</button>`:""}${next?`<button class="btn sm ghost" data-open="${next.id}">${esc(next.title)} →</button>`:""}</div></div></div>`;
  const shown={};
  app.onclick=e=>{const t=e.target;
    if(t.closest("[data-back]"))return go("learn");
    const o=t.closest("[data-open]");if(o)return go("learn",o.dataset.open);
    if(t.closest("[data-play]"))return player(u.title,[u.title+". "+u.summary].concat(u.mnemonic?["Memory hook: "+u.mnemonic]:[],u.keyPoints,u.traps.map(x=>x.replace(/^Trap:/,"Exam trap:"))));
    const c=t.closest("[data-cards]");if(c)return go("cards",c.dataset.cards);
    const q=t.closest("[data-quiz]");if(q)return go("practice",{mode:"unit",unit:q.dataset.quiz});
    const m=t.closest("[data-match]");if(m)return go("games",{game:"match",unit:m.dataset.match});
    const y=t.closest("[data-yt]");if(y){y.innerHTML=`<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(y.dataset.yt)}?autoplay=1&rel=0" title="YouTube video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;y.removeAttribute("data-yt");return}
    const st=t.closest("[data-step]");if(st){const j=+st.dataset.step,x=u.examples[j];shown[j]=(shown[j]||0)+1;app.querySelector(`[data-steps="${j}"]`).innerHTML=x.steps.slice(0,shown[j]).map(s=>`<li>${esc(s)}</li>`).join("");if(shown[j]>=x.steps.length){app.querySelector(`[data-ans="${j}"]`).hidden=false;st.hidden=true}return}
    if(t.closest("[data-done]")){if(!S.lesson[u.id]){S.lesson[u.id]=1;addXP(25);toast("+25 XP · lesson complete")}else{S.lesson[u.id]=0;save()}vUnit(u)}};
}

/* ================= narrated player ================= */
function player(title,slides){
  const ov=document.createElement("div");ov.className="player";ov.setAttribute("role","dialog");ov.setAttribute("aria-label","Narrated lesson");
  document.body.appendChild(ov);document.body.style.overflow="hidden";
  const synth=window.speechSynthesis;let i=0,playing=false,voiceOn=!!synth,rate=1,timer=null,voices=[],vix=-1;
  function loadVoices(){if(!synth)return;voices=synth.getVoices().filter(v=>/^en/i.test(v.lang));if(vix<0){const pref=voices.findIndex(v=>/natural|neural|samantha|aria|jenny|google us/i.test(v.name));vix=pref>=0?pref:0}}
  loadVoices();if(synth&&synth.addEventListener)synth.addEventListener("voiceschanged",()=>{loadVoices();draw()});
  function draw(){ov.innerHTML=`<div class="row between" style="max-width:820px;margin:0 auto;width:100%"><span class="eyebrow">Narrated lesson · ${esc(title)}</span><button class="btn sm" data-x>Close</button></div>
   <div class="stage"><span class="chip hi" style="align-self:flex-start">${i+1} of ${slides.length}</span><p class="slide" aria-live="polite">${esc(slides[i])}</p></div>
   <div class="pc"><div class="bar"><i style="width:${pct(i+1,slides.length)}%"></i></div>
   <div class="row between"><div class="row"><button class="btn sm" data-prev ${i===0?"disabled":""}>◀</button><button class="btn sm primary" data-pp>${playing?"❚❚ Pause":"▶ Play"}</button><button class="btn sm" data-next ${i>=slides.length-1?"disabled":""}>▶</button></div>
   <div class="row"><button class="btn sm" data-voice ${synth?"":"disabled"}>${voiceOn?"🔊 Voice on":"🔇 Voice off"}</button><button class="btn sm" data-rate>${rate}×</button>${voices.length>1?`<select id="vsel" aria-label="Voice" style="max-width:170px">${voices.map((v,k)=>`<option value="${k}" ${k===vix?"selected":""}>${esc(v.name)}</option>`).join("")}</select>`:""}</div></div></div>`}
  function stop(){clearTimeout(timer);if(synth)synth.cancel()}
  function speak(){stop();if(!playing)return;const txt=slides[i];
    const adv=()=>{if(!playing)return;if(i<slides.length-1){i++;draw();speak()}else{playing=false;draw()}};
    if(voiceOn&&synth){const ut=new SpeechSynthesisUtterance(txt);ut.rate=rate;if(voices[vix])ut.voice=voices[vix];ut.onend=()=>{timer=setTimeout(adv,450)};ut.onerror=()=>{timer=setTimeout(adv,txt.split(" ").length*380/rate)};synth.speak(ut)}
    else timer=setTimeout(adv,Math.max(3500,txt.split(" ").length*380/rate))}
  ov.onclick=e=>{const t=e.target;
    if(t.closest("[data-x]")){playing=false;stop();ov.remove();document.body.style.overflow="";return}
    if(t.closest("[data-pp]")){playing=!playing;draw();speak();return}
    if(t.closest("[data-next]")){i=Math.min(slides.length-1,i+1);draw();speak();return}
    if(t.closest("[data-prev]")){i=Math.max(0,i-1);draw();speak();return}
    if(t.closest("[data-voice]")){voiceOn=!voiceOn;draw();speak();return}
    if(t.closest("[data-rate]")){rate=rate===1?1.25:rate===1.25?1.5:rate===1.5?.85:1;draw();speak()}};
  ov.onchange=e=>{if(e.target.id==="vsel"){vix=+e.target.value;speak()}};
  draw();
}

/* ================= FLASHCARDS (spaced repetition) ================= */
function vCards(){
  let deck=sub||"study",order=[],pos=0,flipped=false,done=0;
  function build(){const now=Date.now();
    if(deck==="study"){const due=dueCards().sort((a,b)=>S.srs[a.k].due-S.srs[b.k].due);order=due.concat(shuffle(newCards()).slice(0,20))}
    else if(deck==="due")order=shuffle(dueCards());
    else if(deck==="all")order=shuffle(ALLC);
    else if(deck==="star")order=shuffle(ALLC.filter(c=>S.star[c.k]));
    else if(deck==="weak")order=shuffle(ALLC.filter(c=>S.srs[c.k]&&S.srs[c.k].b<2));
    else order=shuffle(ALLC.filter(c=>c.u===deck)).sort((a,b)=>((S.srs[a.k]||{}).b||0)-((S.srs[b.k]||{}).b||0));
    pos=0;flipped=false}
  function speak(t){if(window.speechSynthesis){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(t))}}
  function draw(){const c=order[pos],st=c?(S.srs[c.k]||{b:0}):null;
    app.innerHTML=`<div class="stack"><div><span class="eyebrow">Spaced repetition · tap the card to flip</span><h1>Flashcards</h1></div>
    <div class="row"><span class="chip warn">${dueCards().length} due</span><span class="chip">${newCards().length} new</span><span class="chip good">${mastered()} mastered</span><span class="chip">${done} reviewed this session</span></div>
    <div class="row"><select id="deck" aria-label="Deck"><option value="study" ${deck==="study"?"selected":""}>Smart study: due + 20 new</option><option value="due" ${deck==="due"?"selected":""}>Due now only</option><option value="weak" ${deck==="weak"?"selected":""}>Shaky cards</option><option value="star" ${deck==="star"?"selected":""}>Starred</option><option value="all" ${deck==="all"?"selected":""}>All ${ALLC.length} cards</option>${unitOpts(deck)}</select><span class="chip">${order.length?Math.min(pos+1,order.length)+" / "+order.length:"0 left"}</span></div>
    ${c?`<div class="fc-scene"><div class="fc ${flipped?"flip":""}" id="fc" tabindex="0" role="button" aria-label="Flip card">
      <div class="face front"><span class="eyebrow">${esc(byId[c.u].title)}</span><p>${esc(c.f)}</p></div>
      <div class="face back"><span class="eyebrow">Answer</span><p>${esc(c.b)}</p></div></div></div>
    ${flipped?`<div class="row"><button class="btn danger" data-g="again">✗ Again</button><button class="btn primary" data-g="good">✓ Good</button><button class="btn" data-g="easy">★ Easy</button></div>`:`<div class="row"><button class="btn primary" data-flip>Show answer</button></div>`}
    <div class="row"><button class="btn sm" data-star>${S.star[c.k]?"★ Starred":"☆ Star"}</button><button class="btn sm" data-say>🔊 Read aloud</button><span class="muted small">Box ${st.b||0} of 5. Keys: space flips · 1 again · 2 good · 3 easy</span></div>`
    :`<div class="card stack" style="gap:10px"><h3>${deck==="study"||deck==="due"?"All caught up 🎉":"Nothing in this deck"}</h3><p class="muted">${deck==="study"||deck==="due"?"No cards are due right now. Missed cards come back in 10 minutes; others come back over the next few days.":"Pick another deck."}</p><div class="row"><button class="btn" data-deck="all">Review all cards</button><button class="btn" data-blitz>Play 60-second blitz</button></div></div>`}</div>`}
  function grade(g){const c=order[pos];if(!c)return;const st=S.srs[c.k]||{b:0};let b=st.b||0;b=g==="again"?0:g==="good"?Math.min(5,b+1):Math.min(5,b+2);S.srs[c.k]={b,due:Date.now()+IV[b]};done++;addXP(2);
    if(g==="again")order.splice(Math.min(order.length,pos+5),0,c);pos++;flipped=false;if(pos>=order.length){order=[];pos=0}draw()}
  build();draw();
  app.onchange=e=>{if(e.target.id==="deck"){deck=e.target.value;build();draw()}};
  app.onclick=e=>{const t=e.target;
    if(t.closest("#fc")||t.closest("[data-flip]")){flipped=!flipped;draw();return}
    const g=t.closest("[data-g]");if(g)return grade(g.dataset.g);
    if(t.closest("[data-star]")){const c=order[pos];S.star[c.k]=!S.star[c.k];save();draw();return}
    if(t.closest("[data-say]")){const c=order[pos];speak(flipped?c.b:c.f);return}
    const d=t.closest("[data-deck]");if(d){deck=d.dataset.deck;build();draw();return}
    if(t.closest("[data-blitz]"))go("games",{game:"blitz",unit:"all"})};
  const kh=e=>{if(tab!=="cards"||/SELECT|INPUT|TEXTAREA/.test((document.activeElement||{}).tagName||""))return;
    if(e.key===" "){e.preventDefault();flipped=!flipped;draw()}else if(flipped&&e.key==="1")grade("again");else if(flipped&&e.key==="2")grade("good");else if(flipped&&e.key==="3")grade("easy")};
  document.addEventListener("keydown",kh);cleanup=()=>document.removeEventListener("keydown",kh);
}

/* ================= MATH DRILL GENERATORS ================= */
function mc(q,ans,wrongs,steps,f){f=f||(v=>String(v));const A=f(ans),set=[A];
  for(const w of wrongs){const s=f(w);if(s&&!set.includes(s))set.push(s);if(set.length===4)break}
  let k=1;while(set.length<4&&k<40){if(typeof ans==="number"){const s=f(ans*(1+(k%2?1:-1)*.12*Math.ceil(k/2))+(k%2?1:-1)*Math.ceil(k/2));if(!set.includes(s))set.push(s)}k++}
  while(set.length<4)set.push("None of these");
  const o=shuffle(set);return{q,o,a:o.indexOf(A),steps}}
const ctx=pick;
const GEN={
 center:{label:"Mean, median & mode",u:"u3",f(){const n=pick([7,8,9]),vals=new Set();while(vals.size<n-1)vals.add(R(10,48));const arr=[...vals];const md=pick(arr);arr.push(md);const data=shuffle(arr),s=data.slice().sort((a,b)=>a-b);const mean=data.reduce((a,b)=>a+b,0)/n,med=median(s);
   const ask=pick(["mean","median","mode"]);const what=ctx(["daily orders at a bakery","minutes to resolve support tickets","defects per shift","units sold per store"]);
   const q=`Data on ${what}: ${data.join(", ")}. What is the ${ask}?`;
   if(ask==="mean")return mc(q,rd(mean),[med,md,rd(mean*n/(n-1))],[`Add all ${n} values: ${data.reduce((a,b)=>a+b,0)}.`,`Divide by n = ${n}: ${fmt(mean)}.`]);
   if(ask==="median")return mc(q,med,[data[Math.floor(n/2)],rd(mean),s[Math.floor(n/2)-1]],[`Sort: ${s.join(", ")}.`,n%2?`n = ${n} is odd, so the median is the middle (position ${(n+1)/2}) value: ${med}.`:`n = ${n} is even, so average the two middle values ${s[n/2-1]} and ${s[n/2]}: ${med}.`,"Common mistake: taking the middle of the unsorted list."]);
   return mc(q,md,[med,rd(mean),s[n-1]],[`Count how often each value appears.`,`${md} appears twice; every other value appears once, so the mode is ${md}.`])}},
 sd:{label:"Standard deviation",u:"u3",f(){const d=[...Array(5)].map(()=>R(2,20)),m=d.reduce((a,b)=>a+b,0)/5,ss=d.reduce((a,x)=>a+(x-m)**2,0),s=Math.sqrt(ss/4);
   return mc(`A sample of 5 machine cycle times (sec): ${d.join(", ")}. What is the sample standard deviation?`,rd(s),[rd(Math.sqrt(ss/5)),rd(ss/4),rd(ss/5)],[`Mean = ${d.reduce((a,b)=>a+b,0)} ÷ 5 = ${fmt(m)}.`,`Squared deviations sum to ${fmt(ss)}.`,`Sample variance = ${fmt(ss)} ÷ (n − 1 = 4) = ${fmt(ss/4)}.`,`SD = √${fmt(ss/4)} = ${fmt(s)}. (Dividing by 5 gives the population SD ${fmt(Math.sqrt(ss/5))} — wrong for a sample.)`])}},
 z:{label:"Z-scores",u:"u6",f(){const mu=R(40,120),sg=R(4,15),k=pick([-2.5,-2,-1.5,-1,-.5,.5,1,1.25,1.5,2,2.5,3]),x=mu+Math.round(sg*k),z=(x-mu)/sg;
   return mc(`Bolt lengths have mean ${mu} mm and SD ${sg} mm. What is the z-score of a ${x} mm bolt?`,rd(z),[rd(-z),rd((x-mu)/(sg*sg)),rd((x-mu)/Math.sqrt(sg))],[`z = (x − μ) ÷ σ = (${x} − ${mu}) ÷ ${sg}.`,`= ${x-mu} ÷ ${sg} = ${fmt(z)}.`,`It is ${fmt(Math.abs(z))} SDs ${z>=0?"above":"below"} the mean${Math.abs(z)>=2?" — unusual (beyond 2σ)":""}.`])}},
 emp:{label:"Empirical rule",u:"u6",f(){const band=[2.35,13.5,34,34,13.5,2.35];const mu=R(50,90),sg=R(3,12);const a=R(-3,2),b=R(a+1,3);let p=0;for(let k=a;k<b;k++)p+=band[k+3];p=rd(p,2);
   const lo=mu+a*sg,hi=mu+b*sg;const w=[rd(p+13.5,2),rd(Math.abs(p-13.5)||47.5,2),rd((b-a)*34,2),68,95].filter(v=>v!==p&&v<=100);
   return mc(`Call-handling times are normal with mean ${mu} and SD ${sg} seconds. About what percent of calls last between ${lo} and ${hi} seconds?`,p,w,[`${lo} is z = ${a}; ${hi} is z = ${b}.`,`Use the 68-95-99.7 slices: 34% (0 to 1σ), 13.5% (1σ to 2σ), 2.35% (2σ to 3σ) on each side.`,`Add the slices from z = ${a} to z = ${b}: ${p}%.`],v=>fmt(v)+"%")}},
 table:{label:"Two-way table probability",u:"u5",f(){const a=R(10,60),b=R(30,120),c=R(10,60),d=R(30,120),T=a+b+c+d;const kind=pick(["marg","and","cond","or"]);
   const tbl=`Shift × outcome: Day-defective ${a}, Day-good ${b}, Night-defective ${c}, Night-good ${d} (total ${T}).`;
   const f3=v=>fmt(v,3);
   if(kind==="marg")return mc(`${tbl} What is P(defective)?`,(a+c)/T,[c/T,(a+c)/(b+d),a/(a+b)],[`Defective total = ${a} + ${c} = ${a+c}.`,`P = ${a+c} ÷ ${T} = ${f3((a+c)/T)}.`],f3);
   if(kind==="and")return mc(`${tbl} What is P(night AND defective)?`,c/T,[c/(c+d),c/(a+c),((c+d)/T)*((a+c)/T)+.011],[`"And" = the single cell: Night-defective = ${c}.`,`P = ${c} ÷ ${T} = ${f3(c/T)}.`],f3);
   if(kind==="cond")return mc(`${tbl} A part came from the night shift. What is P(defective | night)?`,c/(c+d),[c/T,c/(a+c),(a+c)/T],[`Given night: shrink the table to the night row, total ${c+d}.`,`P = ${c} ÷ ${c+d} = ${f3(c/(c+d))}.`,`Common mistake: dividing by the grand total (${f3(c/T)}).`],f3);
   return mc(`${tbl} What is P(night OR defective)?`,(c+d+a)/T,[(c+d+a+c)/T,(c+d)/T+(a+c)/T-.0001+0.05,(a+c)/T],[`P(night) = ${c+d}/${T}; P(defective) = ${a+c}/${T}; P(both) = ${c}/${T}.`,`Addition rule: (${c+d} + ${a+c} − ${c}) ÷ ${T} = ${c+d+a}/${T} = ${f3((c+d+a)/T)}.`],f3)}},
 ev:{label:"Expected value",u:"u5",f(){const ps=pick([[.5,.3,.2],[.6,.3,.1],[.4,.4,.2],[.2,.5,.3],[.7,.2,.1]]);const pay=[R(5,40)*1000,R(1,15)*1000,-R(2,20)*1000];const ev=ps.reduce((s,p,i)=>s+p*pay[i],0);
   return mc(`A new product: ${ps[0]*100}% chance of ${money(pay[0])} profit, ${ps[1]*100}% chance of ${money(pay[1])}, ${ps[2]*100}% chance of losing ${money(-pay[2])}. What is the expected value?`,ev,[(pay[0]+pay[1]+pay[2])/3,ps[0]*pay[0]+ps[1]*pay[1]-ps[2]*pay[2],pay[0]*ps[0]],[`EV = Σ (payoff × probability).`,`= ${ps[0]}(${pay[0]}) + ${ps[1]}(${pay[1]}) + ${ps[2]}(${pay[2]}).`,`= ${money(ev)}.`],v=>(v<0?"−":"")+money(Math.abs(v)))}},
 ci:{label:"Confidence intervals",u:"u7",f(){const m=R(40,120),s=R(5,20),n=pick([25,36,49,64,81,100]),L=pick([[90,1.645],[95,1.96],[99,2.576]]);const se=s/Math.sqrt(n),me=L[1]*se;const f=v=>`${fmt(v[0])} to ${fmt(v[1])}`;
   return mc(`A sample of ${n} orders has mean ${m} minutes; σ = ${s}. Build a ${L[0]}% confidence interval for the mean.`,[m-me,m+me],[[m-L[1]*s,m+L[1]*s],[m-se,m+se],[m-(L[0]===95?1.645:1.96)*se,m+(L[0]===95?1.645:1.96)*se]],[`Standard error = σ ÷ √n = ${s} ÷ ${Math.sqrt(n)} = ${fmt(se,3)}.`,`Critical z for ${L[0]}% = ${L[1]}.`,`Margin = ${L[1]} × ${fmt(se,3)} = ${fmt(me,3)}.`,`Interval = ${m} ± ${fmt(me,3)} → ${f([m-me,m+me])}.`],f)}},
 htest:{label:"Hypothesis test decisions",u:"u8",f(){if(Math.random()<.5){const p=pick([.002,.008,.013,.031,.046,.049,.051,.067,.12,.31]),al=pick([.01,.05,.1]),rej=p<=al;
   const R1="Reject H₀ — the result is statistically significant",F1="Fail to reject H₀ — not enough evidence",A1="Accept H₀ — it is proven true",B1="Reject Hₐ — the claim is false";
   return mc(`A test of a new checkout design gives p = ${p}. Significance level α = ${al}. What is the decision?`,rej?R1:F1,[rej?F1:R1,A1,B1],[`Rule: if p ≤ α, reject H₀.`,`${p} ${rej?"≤":">"} ${al}, so ${rej?"reject H₀":"fail to reject H₀"}.`,`Never say "accept H₀" — we only fail to find evidence against it.`])}
   const z=rd((Math.random()*3.2+.3)*(Math.random()<.5?-1:1)),rej=Math.abs(z)>1.96;const R1="Reject H₀ (|z| > 1.96)",F1="Fail to reject H₀ (|z| ≤ 1.96)";
   return mc(`Two-tailed z-test at α = 0.05: the test statistic is z = ${z}. Decision?`,rej?R1:F1,[rej?F1:R1,"Reject H₀ only if z is positive","Cannot decide without the sample mean"],[`Two-tailed critical values at α = .05 are ±1.96.`,`|${z}| = ${Math.abs(z)} ${rej?">":"≤"} 1.96 → ${rej?"in the rejection region":"not in the rejection region"}.`])}},
 reg:{label:"Regression predictions",u:"u9",f(){const b0=R(5,40)+pick([0,.5]),b1=rd(R(12,60)/10,1),x=R(5,30),y=b0+b1*x;
   if(Math.random()<.35){const A=`Each extra $1K of ad spend is associated with about $${b1}K more sales`;return mc(`Regression output: Sales($K) = ${b0} + ${b1} × AdSpend($K). How do you interpret the slope?`,A,[`Sales are $${b1}K when ad spend is zero`,`Ad spend causes exactly $${b1}K more sales`,`${b1}% of the variation in sales is explained by ad spend`],[`The slope is the change in y for a one-unit increase in x.`,`Regression shows association, not proof of causation; the intercept (${b0}) is the value at x = 0; R² is the variation explained.`])}
   return mc(`Sales($K) = ${b0} + ${b1} × AdSpend($K). Predict sales when ad spend is $${x}K.`,rd(y,2),[rd(b0*x+b1),rd(b1*x),rd(b0+b1)],[`Plug x = ${x} into ŷ = b₀ + b₁x.`,`ŷ = ${b0} + ${b1}(${x}) = ${b0} + ${fmt(b1*x)} = ${fmt(y)} ($K).`],v=>"$"+fmt(v)+"K")}},
 ma:{label:"Moving average forecast",u:"u10",f(){const d=[...Array(5)].map(()=>R(80,160)),f=(d[2]+d[3]+d[4])/3;
   return mc(`Monthly demand for months 1–5: ${d.join(", ")}. Using a 3-month moving average, what is the forecast for month 6?`,rd(f),[rd(d.reduce((a,b)=>a+b,0)/5),rd((d[0]+d[1]+d[2])/3),d[4]],[`Use only the 3 most recent months: ${d[2]}, ${d[3]}, ${d[4]}.`,`(${d[2]} + ${d[3]} + ${d[4]}) ÷ 3 = ${fmt(f)}.`])}},
 mad:{label:"Forecast error (MAD)",u:"u10",f(){const A=[...Array(4)].map(()=>R(90,140)),F=A.map(a=>a+R(-12,12)),e=A.map((a,i)=>a-F[i]),mad=e.reduce((s,x)=>s+Math.abs(x),0)/4,bias=e.reduce((s,x)=>s+x,0)/4,mse=e.reduce((s,x)=>s+x*x,0)/4;
   return mc(`Actual: ${A.join(", ")}. Forecast: ${F.join(", ")}. What is the MAD (mean absolute deviation)?`,rd(mad),[rd(bias),rd(mad*4),rd(mse)],[`Errors (actual − forecast): ${e.join(", ")}.`,`Absolute errors: ${e.map(Math.abs).join(", ")}; sum = ${e.reduce((s,x)=>s+Math.abs(x),0)}.`,`MAD = sum ÷ 4 = ${fmt(mad)}.`])}},
 be:{label:"Break-even",u:"u12",f(){const F=R(5,60)*1000,p=R(25,95),v=R(5,p-8),u=F/(p-v);
   return mc(`Fixed costs are ${money(F)}, price is $${p} per unit, variable cost is $${v} per unit. How many units to break even? (round up)`,Math.ceil(u),[Math.ceil(F/p),Math.ceil(F/(p+v)),Math.ceil(F/v)],[`Contribution margin = price − variable cost = ${p} − ${v} = $${p-v}.`,`Break-even = fixed ÷ margin = ${F} ÷ ${p-v} = ${fmt(u)}.`,`Round up: ${Math.ceil(u)} units.`],v2=>Math.round(v2).toLocaleString()+" units")}},
 emv:{label:"Expected monetary value",u:"u12",f(){const p=pick([.3,.4,.5,.6,.7]),A=[R(60,200)*1000,-R(10,80)*1000],B=[R(30,90)*1000,R(5,40)*1000];const ea=p*A[0]+(1-p)*A[1],eb=p*B[0]+(1-p)*B[1];const best=ea>=eb?"A":"B";
   const s=(o,v)=>`Option ${o} (EMV ${(v<0?"−":"")+money(Math.abs(v))})`;
   return mc(`Strong market (p = ${p}) or weak market (p = ${rd(1-p,1)}). Option A pays ${money(A[0])} strong / −${money(-A[1])} weak. Option B pays ${money(B[0])} strong / ${money(B[1])} weak. Using EMV, which option?`,best==="A"?s("A",ea):s("B",eb),[best==="A"?s("B",eb):s("A",ea),s("A",A[0]),s("B",B[0]),s("B",(B[0]+B[1])/2),s("A",(A[0]+A[1])/2),s("B",B[1]),s("A",A[1])],[`EMV(A) = ${p}(${A[0]}) + ${rd(1-p,1)}(${A[1]}) = ${money(ea)}.`,`EMV(B) = ${p}(${B[0]}) + ${rd(1-p,1)}(${B[1]}) = ${money(eb)}.`,`Pick the larger EMV: option ${best}.`])}},
 ctrl:{label:"Control limits",u:"u11",f(){const cl=R(20,80),s=rd(R(5,30)/10,1);const f=v=>`LCL ${fmt(v[0])}, UCL ${fmt(v[1])}`;
   return mc(`An X-bar chart has center line ${cl} and the standard error of subgroup means is ${s}. What are the 3-sigma control limits?`,[cl-3*s,cl+3*s],[[cl-2*s,cl+2*s],[cl-s,cl+s],[cl-6*s,cl+6*s]],[`Control limits = center ± 3σ.`,`${cl} ± 3(${s}) = ${cl} ± ${fmt(3*s)}.`,`Points outside these limits signal special-cause variation.`],f)}},
 iqr:{label:"IQR & outliers",u:"u3",f(){const n=pick([9,11]),d=[...Array(n-1)].map(()=>R(20,40));d.push(R(70,95));const s=d.slice().sort((a,b)=>a-b),lo=s.slice(0,Math.floor(n/2)),hi=s.slice(Math.ceil(n/2)),q1=median(lo),q3=median(hi),iqr=q3-q1,uf=q3+1.5*iqr;
   return mc(`Delivery times (min): ${shuffle(d).join(", ")}. Using the 1.5 × IQR rule, what is the upper fence?`,uf,[q3+iqr,q3+3*iqr,s[n-1]],[`Sort: ${s.join(", ")}.`,`Q1 = median of lower half = ${q1}; Q3 = median of upper half = ${q3}.`,`IQR = ${q3} − ${q1} = ${iqr}.`,`Upper fence = Q3 + 1.5 × IQR = ${q3} + ${fmt(1.5*iqr)} = ${fmt(uf)}. ${s[n-1]>uf?`${s[n-1]} is above it, so it is an outlier.`:""}`])}},
 cv:{label:"Coefficient of variation",u:"u3",f(){const m1=R(40,200),s1=R(3,30),m2=R(40,200),s2=R(3,30),c1=s1/m1*100,c2=s2/m2*100;if(Math.abs(c1-c2)<1)return GEN.cv.f();const w=c1>c2?1:2;
   const o=(k,c)=>`Line ${k} (CV ${fmt(c,1)}%)`;
   return mc(`Line 1: mean ${m1} g, SD ${s1} g. Line 2: mean ${m2} g, SD ${s2} g. Which line has more RELATIVE variability?`,w===1?o(1,c1):o(2,c2),[w===1?o(2,c2):o(1,c1),`Line ${s1>s2?1:2} because its SD is larger`,"They are equal"],[`CV = SD ÷ mean × 100.`,`Line 1: ${s1}/${m1} = ${fmt(c1,1)}%. Line 2: ${s2}/${m2} = ${fmt(c2,1)}%.`,`Higher CV = more relative variability: line ${w}.`])}},
 roi:{label:"ROI",u:"u12",f(){const c=R(10,90)*1000,g=c+R(-5,60)*1000,r=(g-c)/c*100;
   return mc(`A training program cost ${money(c)} and produced ${money(g)} in measurable benefit. What is the ROI?`,rd(r,1),[rd(g/c*100,1),rd((g-c)/g*100,1),rd((g-c)/1000,1)],[`ROI = (gain − cost) ÷ cost × 100.`,`(${g} − ${c}) ÷ ${c} × 100 = ${fmt(r,1)}%.`],v=>fmt(v,1)+"%")}},
 prob:{label:"Probability rules",u:"u5",f(){const a=rd(R(1,8)/10,1),b=rd(R(1,8)/10,1),k=pick(["and","or","not"]);
   if(k==="and")return mc(`P(late shipment) = ${a}, P(damaged) = ${b}, and the two are independent. What is P(late AND damaged)?`,rd(a*b,3),[rd(a+b,3),rd(a+b-a*b,3),rd((a+b)/2,3)],[`Independent events: multiply.`,`${a} × ${b} = ${rd(a*b,3)}.`],v=>fmt(v,3));
   if(k==="or")return mc(`P(late) = ${a}, P(damaged) = ${b}, independent. What is P(late OR damaged)?`,rd(a+b-a*b,3),[rd(a+b,3),rd(a*b,3),rd(1-a*b,3)],[`Addition rule: P(A) + P(B) − P(A and B).`,`${a} + ${b} − ${rd(a*b,3)} = ${rd(a+b-a*b,3)}.`],v=>fmt(v,3));
   return mc(`P(a customer upgrades) = ${a}. What is P(the customer does NOT upgrade)?`,rd(1-a,2),[a,rd(1/a,2),rd(a/2,2)],[`Complement rule: P(not A) = 1 − P(A).`,`1 − ${a} = ${rd(1-a,2)}.`],v=>fmt(v,2))}}
};
const GKEYS=Object.keys(GEN);

/* ================= PRACTICE ================= */
function vPractice(){
  if(sub&&sub.mode==="drill")return drill(sub.skill||"mixed");
  if(sub&&sub.mode)return quiz(sub);
  const mocks=S.mocks.slice(-8);
  app.innerHTML=`<div class="stack"><div><span class="eyebrow">${ALLQ.length} exam-style questions + unlimited math drills</span><h1>Practice</h1></div>
  <div class="grid">
   <div class="card stack" style="gap:10px"><h3>Unit quiz</h3><select id="qu" aria-label="Unit">${unitOpts(null)}</select><div class="row"><select id="qd" aria-label="Difficulty"><option value="0">All levels</option><option value="1">Easy</option><option value="2">Medium</option><option value="3">Hard</option></select><select id="qn" aria-label="Count"><option value="10">10 Qs</option><option value="20" selected>20 Qs</option><option value="999">All</option></select></div><button class="btn primary" data-m="unit">Start unit quiz</button></div>
   <div class="card stack" style="gap:10px"><h3>Infinite math drill</h3><p class="muted small">Fresh numbers every time, with step-by-step solutions. ${GKEYS.length} skills.</p><select id="dk" aria-label="Skill"><option value="mixed">Mixed — all skills</option>${GKEYS.map(k=>`<option value="${k}">${GEN[k].label}${S.drill[k]?` (${pct(S.drill[k].c,S.drill[k].t)}%)`:""}</option>`).join("")}</select><button class="btn primary" data-m="drill">Start drilling</button></div>
   <div class="card stack" style="gap:10px"><h3>Quick 15</h3><p class="muted small">15 random questions across every unit — a daily warm-up.</p><button class="btn" data-m="quick">Start quick 15</button></div>
   <div class="card stack" style="gap:10px"><h3>Weak spots</h3><p class="muted small">Your saved misses (${Object.keys(S.missed).length}) plus questions from your weakest units.</p><button class="btn" data-m="weak">Drill weak spots</button></div>
   <div class="card stack" style="gap:10px;border-color:var(--accent)"><h3>Full mock OA</h3><p class="muted small">60 questions balanced across all 12 units, 90-minute timer, flag-for-review, no feedback until you submit.</p><button class="btn primary" data-m="mock">Start mock OA</button>${mocks.length?`<p class="muted small">Recent: ${mocks.map(m=>`<span class="chip ${m.s>=80?"good":m.s>=65?"warn":"bad"}">${m.s}%</span>`).join(" ")}</p>`:""}</div>
  </div>
  <section class="card"><h3 style="margin-bottom:8px">Mastery by unit</h3>${U.map(u=>{const m=mastery(u.id),a=unitAcc(u.id);return `<div class="row between" style="padding:8px 0;border-top:1px solid var(--line)"><span style="flex:1;min-width:150px">${esc(u.title)}</span><span class="muted small num">${a===null?"no quiz yet":"recent accuracy "+Math.round(a*100)+"%"}</span><div class="bar" style="width:90px"><i style="width:${m}%"></i></div><button class="btn sm ghost" data-uq="${u.id}">Quiz</button></div>`}).join("")}
  <div class="row" style="margin-top:12px"><button class="btn sm ghost" data-reset>Reset all progress</button><span id="rc"></span></div></section></div>`;
  app.onclick=e=>{const t=e.target,b=t.closest("[data-m]");
    if(b){const m=b.dataset.m;if(m==="drill")return go("practice",{mode:"drill",skill:$("#dk").value});return go("practice",{mode:m,unit:m==="unit"?$("#qu").value:null,diff:m==="unit"?+$("#qd").value:0,count:m==="unit"?+$("#qn").value:0})}
    const uq=t.closest("[data-uq]");if(uq)return go("practice",{mode:"unit",unit:uq.dataset.uq,count:20});
    if(t.closest("[data-reset]")){$("#rc").innerHTML=`<button class="btn sm danger" data-confirm>Yes, erase everything</button>`;return}
    if(t.closest("[data-confirm]")){const st=S.start,th=S.theme;S=JSON.parse(JSON.stringify(DEF));S.start=st;S.theme=th;save();toast("Progress erased");go("practice")}};
}
function askClaudeQ(q,mine){return claude(`I'm studying for WGU C207 (Data-Driven Decision Making) and got this practice question wrong.\n\nQuestion: ${q.q}\nOptions:\n${q.o.map((o,j)=>"ABCD"[j]+") "+o).join("\n")}\n${mine!=null?`My answer: ${"ABCD"[mine]}\n`:""}Correct answer: ${"ABCD"[q.a]}\n\nExplain step by step why the correct answer is right and why mine is wrong, in plain English for a beginner. Then give me one similar practice question.`)}
function quiz(cfg){
  let qs=[],title="",exam=cfg.mode==="mock";
  if(cfg.mode==="unit"){let p=byId[cfg.unit].questions;if(cfg.diff)p=p.filter(q=>q.d===cfg.diff);qs=shuffle(p).slice(0,cfg.count||20);title="Unit quiz · "+byId[cfg.unit].title}
  else if(cfg.mode==="quick"){qs=shuffle(ALLQ).slice(0,15);title="Quick 15"}
  else if(cfg.mode==="weak"){const wk=U.slice().sort((a,b)=>mastery(a.id)-mastery(b.id)).slice(0,3).map(u=>u.id);const pool=ALLQ.filter(q=>S.missed[q.k]);qs=shuffle(pool.concat(shuffle(ALLQ.filter(q=>!S.missed[q.k]&&wk.includes(q.u))).slice(0,Math.max(0,20-pool.length)))).slice(0,25);title="Weak spots"}
  else{qs=shuffle(U.flatMap(u=>{const h=shuffle(u.questions.filter(q=>q.d>=2)),e=shuffle(u.questions.filter(q=>q.d<2));return h.slice(0,4).concat(e.slice(0,1)).concat(h.slice(4)).slice(0,5)}));title="Mock OA"}
  if(!qs.length){app.innerHTML=`<div class="card stack"><p>No questions match that filter.</p><button class="btn" data-back>Back</button></div>`;app.onclick=e=>{if(e.target.closest("[data-back]"))go("practice")};return}
  qs=qs.map(q=>{const idx=shuffle([0,1,2,3].slice(0,q.o.length));return Object.assign({},q,{o:idx.map(i=>q.o[i]),a:idx.indexOf(q.a)})});
  let i=0,ans=new Array(qs.length).fill(null),flag=new Array(qs.length).fill(false),end=exam?Date.now()+90*60e3:0,tick=null,graded=new Array(qs.length).fill(false);
  if(exam){tick=setInterval(()=>{const el=$("#tmr");const left=Math.max(0,end-Date.now());if(el)el.textContent=Math.floor(left/60e3)+":"+String(Math.floor(left%60e3/1e3)).padStart(2,"0");if(!left){clearInterval(tick);finish()}},1000);cleanup=()=>clearInterval(tick)}
  function draw(){const q=qs[i],a=ans[i],shown=!exam&&a!==null;
    app.innerHTML=`<div class="stack"><div class="row between"><button class="btn sm ghost" data-quit>← Exit</button>${exam?`<span class="chip hi num" id="tmr">90:00</span>`:""}</div>
    <div class="stack" style="gap:6px"><span class="eyebrow">${esc(title)} · ${i+1} of ${qs.length} · ${esc(byId[q.u].title)} · ${["","easy","medium","hard"][q.d]}</span><div class="bar"><i style="width:${pct(i+1,qs.length)}%"></i></div></div>
    <h2 style="font-family:var(--f-body);font-weight:700;font-size:1.18rem;line-height:1.45">${esc(q.q)}</h2>
    <div class="stack" style="gap:8px">${q.o.map((o,j)=>{let c="";if(shown){if(j===q.a)c="right";else if(j===a)c="wrong"}else if(a===j)c="sel";return `<button class="opt ${c}" data-o="${j}" ${shown?"disabled":""}><b>${"ABCD"[j]}</b>${esc(o)}</button>`}).join("")}</div>
    ${shown?`<div class="explain"><strong>${a===q.a?"✓ Correct. +10 XP":"✗ Not quite — the answer is "+"ABCD"[q.a]+"."}</strong><p>${esc(q.e)}</p>${a!==q.a?`<a class="btn sm" style="align-self:flex-start" href="${askClaudeQ(q,a)}" target="_blank" rel="noopener">Ask Claude to explain ↗</a>`:""}</div>`:""}
    <div class="row between"><div class="row"><button class="btn" data-prev ${i===0?"disabled":""}>← Prev</button>${exam?`<button class="btn" data-flag>${flag[i]?"⚑ Flagged":"⚐ Flag for review"}</button>`:""}</div>
    ${i<qs.length-1?`<button class="btn primary" data-nx ${!exam&&a===null?"disabled":""}>Next →</button>`:`<button class="btn primary" data-fin>${exam?"Submit exam":"See results"}</button>`}</div>
    ${exam?`<div class="card stack" style="gap:8px"><span class="muted small">${ans.filter(x=>x!==null).length} of ${qs.length} answered · ${flag.filter(Boolean).length} flagged. Tap a number to jump.</span><div class="qnav">${qs.map((_,j)=>`<button data-j="${j}" class="${ans[j]!==null?"ans":""} ${flag[j]?"flag":""} ${j===i?"cur":""}">${j+1}</button>`).join("")}</div></div>`:""}</div>`}
  function finish(){if(tick)clearInterval(tick);
    const per={};qs.forEach((q,j)=>{per[q.u]=per[q.u]||[0,0];per[q.u][1]++;const ok=ans[j]===q.a;if(ok)per[q.u][0]++;if(exam||!graded[j])record(q,ok)});
    const right=qs.filter((q,j)=>ans[j]===q.a).length,score=pct(right,qs.length);
    if(exam){S.mocks.push({d:today(),s:score});save()}hud();
    app.innerHTML=`<div class="stack"><span class="eyebrow">${esc(title)} · results</span><h1><span class="mark num">${score}%</span> · ${right} of ${qs.length}</h1>
    <p class="muted">${score>=80?"Passing range. Keep it there on the next attempt to make it stick.":score>=65?"Close. Review the misses below, then re-drill the red units.":"Not yet. Re-read the weakest lessons, then retry."}</p>
    <section class="card"><h3 style="margin-bottom:8px">By unit</h3>${Object.entries(per).map(([u,[c,t]])=>{const p=pct(c,t);return `<div class="row between" style="padding:7px 0;border-top:1px solid var(--line)"><span style="flex:1;min-width:140px">${esc(byId[u].title)}</span><span class="num muted">${c}/${t}</span><span class="chip ${p>=80?"good":p>=60?"warn":"bad"}">${p}%</span><button class="btn sm ghost" data-open="${u}">Lesson</button></div>`}).join("")}</section>
    <div class="row"><button class="btn primary" data-again>Try again</button><button class="btn" data-back>Practice menu</button></div>
    <section class="stack"><h2>Review</h2>${qs.map((q,j)=>{const ok=ans[j]===q.a;return `<div class="card stack" style="gap:8px;border-color:${ok?"var(--line)":"var(--bad)"}"><div class="row"><span class="chip ${ok?"good":"bad"}">${ok?"Correct":ans[j]===null?"Skipped":"Missed"}</span><span class="muted small">${esc(byId[q.u].title)}</span></div><p><strong>${esc(q.q)}</strong></p>
     ${ok?"":`<p>${ans[j]!==null?`Your answer: <span style="color:var(--bad)">${esc(q.o[ans[j]])}</span><br>`:""}Correct: <span style="color:var(--good);font-weight:700">${esc(q.o[q.a])}</span></p>`}<p class="muted">${esc(q.e)}</p>${ok?"":`<a class="btn sm" style="align-self:flex-start" href="${askClaudeQ(q,ans[j])}" target="_blank" rel="noopener">Ask Claude ↗</a>`}</div>`}).join("")}</section></div>`;
    app.onclick=e=>{if(e.target.closest("[data-again]"))return go("practice",cfg);if(e.target.closest("[data-back]"))return go("practice");const o=e.target.closest("[data-open]");if(o)go("learn",o.dataset.open)};
    window.scrollTo(0,0)}
  app.onclick=e=>{const t=e.target;
    if(t.closest("[data-quit]"))return go("practice");
    const o=t.closest("[data-o]");if(o&&!o.disabled){ans[i]=+o.dataset.o;if(!exam&&!graded[i]){graded[i]=true;record(qs[i],ans[i]===qs[i].a)}draw();return}
    if(t.closest("[data-nx]")){i++;draw();window.scrollTo(0,0);return}
    if(t.closest("[data-prev]")){i--;draw();return}
    if(t.closest("[data-flag]")){flag[i]=!flag[i];draw();return}
    const j=t.closest("[data-j]");if(j){i=+j.dataset.j;draw();return}
    if(t.closest("[data-fin]")){if(exam&&ans.some(x=>x===null)&&!t.closest("[data-fin]").dataset.sure){const b=t.closest("[data-fin]");b.dataset.sure=1;b.textContent=`${ans.filter(x=>x===null).length} unanswered — submit anyway?`;return}finish()}};
  draw();
}
function drill(skill){
  let cur=null,ans=null,sc=0,n=0,k=null;
  function next(){k=skill==="mixed"?pick(GKEYS):skill;cur=GEN[k].f();ans=null}
  function draw(){app.innerHTML=`<div class="stack"><div class="row between"><button class="btn sm ghost" data-quit>← Practice</button><span class="chip num">${sc} / ${n} this session</span></div>
   <div class="row"><select id="dk2" aria-label="Skill"><option value="mixed" ${skill==="mixed"?"selected":""}>Mixed — all skills</option>${GKEYS.map(x=>`<option value="${x}" ${x===skill?"selected":""}>${GEN[x].label}</option>`).join("")}</select><span class="chip hi">${esc(GEN[k].label)}</span></div>
   <h2 style="font-family:var(--f-body);font-weight:700;font-size:1.18rem;line-height:1.45">${esc(cur.q)}</h2>
   <div class="stack" style="gap:8px">${cur.o.map((o,j)=>{let c="";if(ans!==null){if(j===cur.a)c="right";else if(j===ans)c="wrong"}return `<button class="opt ${c}" data-o="${j}" ${ans!==null?"disabled":""}><b>${"ABCD"[j]}</b>${esc(o)}</button>`}).join("")}</div>
   ${ans!==null?`<div class="explain"><strong>${ans===cur.a?"✓ Correct. +5 XP":"✗ Answer: "+esc(cur.o[cur.a])}</strong><ol class="steps">${cur.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol></div><div class="row"><button class="btn primary" data-next>Next problem →</button><button class="btn sm ghost" data-learn="${GEN[k].u}">Review the lesson</button></div>`:`<p class="muted small">Work it on paper, then pick an answer. Use the calculators in Cram &amp; Tools if you need them.</p>`}</div>`}
  next();draw();
  app.onchange=e=>{if(e.target.id==="dk2"){skill=e.target.value;next();draw()}};
  app.onclick=e=>{const t=e.target;
    if(t.closest("[data-quit]"))return go("practice");
    const o=t.closest("[data-o]");if(o&&ans===null){ans=+o.dataset.o;n++;const ok=ans===cur.a;if(ok)sc++;S.drill[k]=S.drill[k]||{c:0,t:0};S.drill[k].t++;if(ok)S.drill[k].c++;addXP(ok?5:1);draw();return}
    if(t.closest("[data-next]")){next();draw();window.scrollTo(0,0);return}
    const l=t.closest("[data-learn]");if(l)go("learn",l.dataset.learn)};
}

/* ================= LABS ================= */
const LABS=[["normal","Normal curve explorer","Shade any area under the bell curve and read off z-scores and percentages."],["pvalue","P-value & rejection regions","Move a test statistic and watch the p-value and the reject / fail-to-reject decision change."],["clt","Central Limit Theorem","Draw thousands of samples from a skewed population and watch the sample means turn into a bell curve."],["ci","Confidence interval capture","Generate 100 intervals and see that about 95% of 95% intervals catch the true mean."],["reg","Regression playground","Tap to add points. See the line, r and R² update live."],["ctrl","Control chart simulator","Inject a shift, trend or outlier and see which control-chart rule catches it."]];
function canvasFor(id,h){const cv=document.getElementById(id);if(!cv)return null;const dpr=window.devicePixelRatio||1,w=cv.parentElement.clientWidth;cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);cv.style.height=h+"px";const c=cv.getContext&&cv.getContext("2d");if(!c)return null;c.setTransform(dpr,0,0,dpr,0,0);c.font="12px JetBrains Mono, monospace";return{c,w,h,cv}}
function vLabs(){
  if(sub&&LABS.find(l=>l[0]===sub))return lab(sub);
  app.innerHTML=`<div class="stack"><div><span class="eyebrow">See the statistics move</span><h1>Labs</h1><p class="muted" style="margin-top:6px">Six interactive simulators for the ideas that are hardest to picture. Play with each one for five minutes and the formulas start to make sense.</p></div>
  <div class="grid">${LABS.map(l=>`<button class="card stack" style="gap:8px;text-align:left;cursor:pointer;font:inherit;color:inherit" data-lab="${l[0]}"><div class="row between"><h3>${l[1]}</h3>${S.labs[l[0]]?`<span class="chip good">tried</span>`:""}</div><p class="muted small">${l[2]}</p></button>`).join("")}</div></div>`;
  app.onclick=e=>{const b=e.target.closest("[data-lab]");if(b)go("labs",b.dataset.lab)};
}
function lab(id){
  const ls=[];const on=(t,f)=>{app.addEventListener(t,f);ls.push([t,f])};const L=LABS.find(l=>l[0]===id);if(!S.labs[id]){S.labs[id]=1;addXP(10)}
  const shell=(ctl,out,note)=>`<div class="stack lab"><div class="row"><button class="btn sm ghost" data-back>← Labs</button></div><div><span class="eyebrow">Lab</span><h1>${L[1]}</h1><p class="muted" style="margin-top:6px">${L[2]}</p></div><canvas id="cv" role="img" aria-label="${L[1]} chart"></canvas><div class="ctl">${ctl}</div><dl class="out" id="out">${out||""}</dl>${note?`<div class="card small">${note}</div>`:""}</div>`;
  const outp=rows=>{const o=$("#out");if(o)o.innerHTML=rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")};
  let redraw=()=>{};
  const curve=(g,x0,x1,mu,sg,shade,pad)=>{const{c,w,h}=g;pad=pad||28;const X=x=>pad+(x-x0)/(x1-x0)*(w-2*pad),top=16,base=h-30,ymax=npdf(0)/sg,Y=y=>base-(y/ymax)*(base-top);
    c.clearRect(0,0,w,h);
    shade.forEach(([a,b,fill])=>{c.beginPath();c.moveTo(X(Math.max(a,x0)),base);for(let x=Math.max(a,x0);x<=Math.min(b,x1);x+=(x1-x0)/400)c.lineTo(X(x),Y(npdf((x-mu)/sg)/sg));c.lineTo(X(Math.min(b,x1)),base);c.closePath();c.fillStyle=fill;c.fill()});
    c.beginPath();for(let x=x0;x<=x1;x+=(x1-x0)/400){const y=Y(npdf((x-mu)/sg)/sg);x===x0?c.moveTo(X(x),y):c.lineTo(X(x),y)}c.strokeStyle=col("ink");c.lineWidth=2.4;c.stroke();
    c.strokeStyle=col("line");c.lineWidth=1.5;c.beginPath();c.moveTo(pad,base);c.lineTo(w-pad,base);c.stroke();
    c.fillStyle=col("muted");c.textAlign="center";for(let k=-3;k<=3;k++){const x=mu+k*sg;if(x<x0||x>x1)continue;c.fillText(k===0?String(rd(mu)):String(rd(x)),X(x),base+16)}
    return{X,Y,base}};
  if(id==="normal"){
    app.innerHTML=shell(`<div class="field"><label for="mu">Mean μ</label><input id="mu" type="number" value="100"></div><div class="field"><label for="sg">SD σ</label><input id="sg" type="number" value="15" min="0.1"></div><div class="field"><label for="md">Area</label><select id="md"><option value="lt">Below a</option><option value="gt">Above a</option><option value="bt" selected>Between a and b</option><option value="out">Outside a and b</option></select></div><div class="field"><label for="a">a</label><input id="a" type="number" value="85"></div><div class="field"><label for="b">b</label><input id="b" type="number" value="115"></div>`,"","Try a = μ − σ and b = μ + σ: you get about 68%. Then try ±2σ (95%) and ±3σ (99.7%). That is the empirical rule.");
    redraw=()=>{const mu=+$("#mu").value,sg=Math.max(.01,+$("#sg").value),md=$("#md").value,a=+$("#a").value,b=+$("#b").value;$("#b").disabled=md==="lt"||md==="gt";
      const za=(a-mu)/sg,zb=(b-mu)/sg,hiC=col("hi"),lo=mu-4*sg,hi=mu+4*sg;let p,sh;
      if(md==="lt"){p=ncdf(za);sh=[[lo,a,hiC]]}else if(md==="gt"){p=1-ncdf(za);sh=[[a,hi,hiC]]}else if(md==="bt"){p=Math.max(0,ncdf(zb)-ncdf(za));sh=[[Math.min(a,b),Math.max(a,b),hiC]];p=Math.abs(ncdf(zb)-ncdf(za))}else{p=ncdf(Math.min(za,zb))+1-ncdf(Math.max(za,zb));sh=[[lo,Math.min(a,b),hiC],[Math.max(a,b),hi,hiC]]}
      const g=canvasFor("cv",260);if(g){const k=curve(g,lo,hi,mu,sg,sh);g.c.fillStyle=col("ink");g.c.font="700 15px JetBrains Mono, monospace";g.c.textAlign="right";g.c.fillText(fmt(p*100,2)+"%",g.w-30,28)}
      outp([["z for a",fmt(za,3)],["z for b",md==="lt"||md==="gt"?"—":fmt(zb,3)],["shaded area",fmt(p,4)+"  ("+fmt(p*100,2)+"%)"],["percentile of a",fmt(ncdf(za)*100,1)+"th"]])};
  }
  if(id==="pvalue"){
    app.innerHTML=shell(`<div class="field"><label for="z">Test statistic z: <span id="zv" class="num">2.10</span></label><input id="z" type="range" min="-4" max="4" step="0.01" value="2.1"></div><div class="field"><label for="tl">Alternative hypothesis</label><select id="tl"><option value="two">Two-tailed (≠)</option><option value="right">Right-tailed (&gt;)</option><option value="left">Left-tailed (&lt;)</option></select></div><div class="field"><label for="al">α</label><select id="al"><option>0.10</option><option selected>0.05</option><option>0.01</option></select></div>`,"","Red = rejection region (size α). Yellow = the p-value: the probability of a result at least this extreme if H₀ is true. If the yellow fits inside the red, reject H₀.");
    redraw=()=>{const z=+$("#z").value,tl=$("#tl").value,al=+$("#al").value;$("#zv").textContent=z.toFixed(2);
      const crit=tl==="two"?-qnorm(al/2):-qnorm(al);let p,sh=[],bad=col("bad-soft"),hiC=col("hi");
      if(tl==="two"){p=2*(1-ncdf(Math.abs(z)));sh=[[-4,-crit,bad],[crit,4,bad],[-4,-Math.abs(z),hiC],[Math.abs(z),4,hiC]]}
      else if(tl==="right"){p=1-ncdf(z);sh=[[crit,4,bad],[z,4,hiC]]}else{p=ncdf(z);sh=[[-4,-crit,bad],[-4,z,hiC]]}
      const g=canvasFor("cv",260);if(g){const k=curve(g,-4,4,0,1,sh);g.c.strokeStyle=col("accent");g.c.lineWidth=3;g.c.beginPath();g.c.moveTo(k.X(z),k.base);g.c.lineTo(k.X(z),18);g.c.stroke();g.c.fillStyle=col("accent");g.c.textAlign="center";g.c.fillText("z = "+z.toFixed(2),k.X(z),14)}
      const rej=p<=al;outp([["p-value",fmt(p,4)],["critical value",(tl==="two"?"±":tl==="left"?"−":"+")+fmt(crit,3)],["decision",rej?`p ≤ α → reject H₀ (significant)`:`p > α → fail to reject H₀`]])};
  }
  if(id==="clt"){
    let means=[];
    app.innerHTML=shell(`<div class="field"><label for="pop">Population shape</label><select id="pop"><option value="skew">Right-skewed (wait times)</option><option value="unif">Uniform (0–10)</option><option value="bi">Bimodal</option></select></div><div class="field"><label for="n">Sample size n: <span id="nv" class="num">5</span></label><input id="n" type="range" min="1" max="50" value="5"></div><div class="row"><button class="btn sm" data-draw="1">Draw 1</button><button class="btn sm primary" data-draw="200">Draw 200</button><button class="btn sm" data-draw="2000">Draw 2000</button><button class="btn sm ghost" data-clear>Clear</button></div>`,"","Top: the population. Bottom: the means of your samples. Raise n and the bottom histogram gets narrower (σ ÷ √n) and more bell-shaped, even when the population is skewed. With n ≥ 30 it is close to normal.");
    const draw1=pop=>pop==="skew"?-Math.log(1-Math.random())*3:pop==="unif"?Math.random()*10:(Math.random()<.5?2+randn()*.8:8+randn()*.8);
    const popSD={skew:3,unif:10/Math.sqrt(12),bi:Math.sqrt(.64+9)},popMu={skew:3,unif:5,bi:5};
    const hist=(c,x0,y0,w,h,vals,lo,hi,bins,fill,label)=>{const cnt=new Array(bins).fill(0);vals.forEach(v=>{const k=Math.floor((v-lo)/(hi-lo)*bins);if(k>=0&&k<bins)cnt[k]++});const mx=Math.max(1,...cnt);const bw=w/bins;c.fillStyle=fill;cnt.forEach((v,k)=>{const bh=v/mx*(h-18);c.fillRect(x0+k*bw+1,y0+h-bh,bw-2,bh)});c.strokeStyle=col("line");c.beginPath();c.moveTo(x0,y0+h);c.lineTo(x0+w,y0+h);c.stroke();c.fillStyle=col("muted");c.textAlign="left";c.fillText(label,x0,y0+10);c.textAlign="center";[lo,(lo+hi)/2,hi].forEach(t=>c.fillText(String(rd(t,1)),x0+(t-lo)/(hi-lo)*w,y0+h+14))};
    redraw=()=>{const pop=$("#pop").value,n=+$("#n").value;$("#nv").textContent=n;const g=canvasFor("cv",340);
      const ps=[...Array(4000)].map(()=>draw1(pop));const hi=pop==="skew"?15:10;
      if(g){g.c.clearRect(0,0,g.w,g.h);hist(g.c,24,6,g.w-48,120,ps,0,hi,40,col("muted"),"Population");hist(g.c,24,170,g.w-48,140,means,0,hi,60,col("accent"),`Sample means (n = ${n}) · ${means.length} samples`)}
      const m=means.length?means.reduce((a,b)=>a+b,0)/means.length:NaN,s=means.length>1?Math.sqrt(means.reduce((a,x)=>a+(x-m)**2,0)/(means.length-1)):NaN;
      outp([["population mean μ",fmt(popMu[pop])],["mean of sample means",isNaN(m)?"—":fmt(m,3)],["SD of sample means",isNaN(s)?"—":fmt(s,3)],["theory: σ ÷ √n",fmt(popSD[pop]/Math.sqrt(n),3)]])};
    on("click",e=>{const b=e.target.closest("[data-draw]");if(b){const pop=$("#pop").value,n=+$("#n").value;for(let k=0;k<+b.dataset.draw;k++){let s=0;for(let j=0;j<n;j++)s+=draw1(pop);means.push(s/n)}redraw()}if(e.target.closest("[data-clear]")){means=[];redraw()}});
    on("change",e=>{if(e.target.id==="pop"||e.target.id==="n"){means=[];redraw()}});
  }
  if(id==="ci"){
    let iv=[];
    app.innerHTML=shell(`<div class="field"><label for="cn">Sample size n</label><select id="cn"><option>10</option><option selected>30</option><option>100</option></select></div><div class="field"><label for="cl">Confidence level</label><select id="cl"><option value="1.645">90%</option><option value="1.96" selected>95%</option><option value="2.576">99%</option></select></div><div class="row"><button class="btn sm primary" data-gen>Generate 20 intervals</button><button class="btn sm ghost" data-clr>Clear</button></div>`,"","Each line is one sample's confidence interval. Blue lines catch the true mean (μ = 50); red lines miss. “95% confident” means about 95% of intervals built this way catch μ. It does not mean one interval has a 95% chance.");
    redraw=()=>{const g=canvasFor("cv",320);if(g){const{c,w,h}=g,X=x=>24+(x-40)/20*(w-48);c.clearRect(0,0,w,h);c.strokeStyle=col("ink");c.lineWidth=2;c.beginPath();c.moveTo(X(50),4);c.lineTo(X(50),h-20);c.stroke();c.fillStyle=col("muted");c.textAlign="center";[40,45,50,55,60].forEach(t=>c.fillText(t,X(t),h-6));
      const show=iv.slice(-100),gap=(h-30)/Math.max(20,show.length);show.forEach((v,k)=>{c.strokeStyle=v.hit?col("accent"):col("bad");c.lineWidth=Math.max(1.5,Math.min(3,gap-1));c.beginPath();c.moveTo(X(v.lo),8+k*gap);c.lineTo(X(v.hi),8+k*gap);c.stroke()})}
      const hits=iv.filter(v=>v.hit).length;outp([["intervals",iv.length],["caught μ",iv.length?`${hits} (${fmt(hits/iv.length*100,1)}%)`:"—"],["target capture rate",$("#cl").selectedOptions[0].text],["margin of error",fmt(+$("#cl").value*10/Math.sqrt(+$("#cn").value),2)]])};
    on("click",e=>{if(e.target.closest("[data-gen]")){const n=+$("#cn").value,z=+$("#cl").value;for(let k=0;k<20;k++){let s=0;for(let j=0;j<n;j++)s+=50+10*randn();const m=s/n,me=z*10/Math.sqrt(n);iv.push({lo:m-me,hi:m+me,hit:m-me<=50&&m+me>=50})}redraw()}if(e.target.closest("[data-clr]")){iv=[];redraw()}});
    on("change",e=>{if(e.target.id==="cn"||e.target.id==="cl"){iv=[];redraw()}});
  }
  if(id==="reg"){
    let pts=[[1,2],[2,2.8],[3,4.1],[4,4.4],[5,5.9],[6,6.1],[7,7.4],[8,7.9]],resid=false;
    const presets={strong:[[1,2],[2,2.8],[3,4.1],[4,4.4],[5,5.9],[6,6.1],[7,7.4],[8,7.9]],neg:[[1,8.5],[2,7.9],[3,6.6],[4,6.2],[5,4.8],[6,4.1],[7,3.3],[8,2.1]],none:[[1,5],[2,2],[3,8],[4,4],[5,6.5],[6,3],[7,7],[8,4.5]],out:[[1,2],[2,2.8],[3,4.1],[4,4.4],[5,5.9],[6,6.1],[7,7.4],[9,1]]};
    app.innerHTML=shell(`<div class="field"><label for="pre">Load a dataset</label><select id="pre"><option value="strong">Strong positive</option><option value="neg">Strong negative</option><option value="none">No relationship</option><option value="out">One influential outlier</option></select></div><div class="row"><button class="btn sm" data-res>Show residuals</button><button class="btn sm ghost" data-clr>Clear points</button></div>`,"","Tap empty space to add a point; tap a point to remove it. Watch how one far-off point drags the line and drops r. Correlation measures linear strength only, and it never proves causation.");
    redraw=()=>{const g=canvasFor("cv",320);const n=pts.length;let b0=NaN,b1=NaN,r=NaN;
      if(n>=2){const mx=pts.reduce((s,p)=>s+p[0],0)/n,my=pts.reduce((s,p)=>s+p[1],0)/n;let sxy=0,sxx=0,syy=0;pts.forEach(([x,y])=>{sxy+=(x-mx)*(y-my);sxx+=(x-mx)**2;syy+=(y-my)**2});if(sxx>0){b1=sxy/sxx;b0=my-b1*mx;r=syy>0?sxy/Math.sqrt(sxx*syy):NaN}}
      if(g){const{c,w,h}=g,X=x=>30+x/10*(w-50),Y=y=>h-26-y/10*(h-40);c.clearRect(0,0,w,h);c.strokeStyle=col("line");c.lineWidth=1;for(let k=0;k<=10;k+=2){c.beginPath();c.moveTo(X(k),Y(0));c.lineTo(X(k),Y(10));c.stroke();c.beginPath();c.moveTo(X(0),Y(k));c.lineTo(X(10),Y(k));c.stroke();c.fillStyle=col("muted");c.textAlign="center";c.fillText(k,X(k),h-10);c.textAlign="right";c.fillText(k,X(0)-6,Y(k)+4)}
        if(!isNaN(b1)){if(resid){c.strokeStyle=col("bad");c.lineWidth=1.5;pts.forEach(([x,y])=>{c.beginPath();c.moveTo(X(x),Y(y));c.lineTo(X(x),Y(b0+b1*x));c.stroke()})}c.strokeStyle=col("accent");c.lineWidth=3;c.beginPath();c.moveTo(X(0),Y(b0));c.lineTo(X(10),Y(b0+b1*10));c.stroke()}
        pts.forEach(([x,y])=>{c.beginPath();c.arc(X(x),Y(y),6,0,7);c.fillStyle=col("hi");c.fill();c.strokeStyle=col("ink");c.lineWidth=1.5;c.stroke()});g.cv._map={X,Y,w,h}}
      outp([["points",n],["line",isNaN(b1)?"—":`ŷ = ${fmt(b0,2)} ${b1<0?"−":"+"} ${fmt(Math.abs(b1),2)}x`],["r",isNaN(r)?"—":fmt(r,3)+(Math.abs(r)>=.8?" (strong)":Math.abs(r)>=.5?" (moderate)":" (weak)")],["R²",isNaN(r)?"—":fmt(r*r,3)+` → ${fmt(r*r*100,1)}% of variation in y explained`]])};
    on("click",e=>{const cv=e.target.closest("#cv");if(cv&&cv._map){const rc=cv.getBoundingClientRect(),px=e.clientX-rc.left,py=e.clientY-rc.top,m=cv._map;const hit=pts.findIndex(([x,y])=>Math.hypot(m.X(x)-px,m.Y(y)-py)<14);if(hit>=0)pts.splice(hit,1);else{const x=(px-30)/(m.w-50)*10,y=(m.h-26-py)/(m.h-40)*10;if(x>=0&&x<=10&&y>=0&&y<=10)pts.push([rd(x,2),rd(y,2)])}redraw()}
      if(e.target.closest("[data-res]")){resid=!resid;e.target.closest("[data-res]").textContent=resid?"Hide residuals":"Show residuals";redraw()}if(e.target.closest("[data-clr]")){pts=[];redraw()}});
    on("change",e=>{if(e.target.id==="pre"){pts=presets[e.target.value].map(p=>p.slice());redraw()}});
  }
  if(id==="ctrl"){
    let d=[],kind="In control";const gen=()=>{d=[...Array(25)].map(()=>50+2*randn());kind="In control"};gen();
    app.innerHTML=shell(`<div class="row" style="grid-column:1/-1"><button class="btn sm" data-k="new">New in-control process</button><button class="btn sm" data-k="shift">Inject a shift</button><button class="btn sm" data-k="trend">Inject a trend</button><button class="btn sm" data-k="spike">Inject an outlier</button></div>`,"","Center line 50, σ = 2, so UCL = 56 and LCL = 44. Random wiggle inside the limits is common-cause variation: leave the process alone. A rule violation signals a special cause: investigate it. Adjusting a stable process because of common-cause noise (tampering) makes it worse.");
    redraw=()=>{const sig=new Set(),msgs=[];d.forEach((v,k)=>{if(v>56||v<44){sig.add(k);msgs.push(`Point ${k+1} is beyond a 3σ limit`)}});
      for(let k=0;k+8<=d.length;k++){const s=d.slice(k,k+8);if(s.every(v=>v>50)||s.every(v=>v<50)){for(let j=k;j<k+8;j++)sig.add(j);msgs.push(`8 in a row on one side of center (points ${k+1}–${k+8})`);break}}
      for(let k=0;k+6<=d.length;k++){const s=d.slice(k,k+6);let up=true,dn=true;for(let j=1;j<6;j++){if(!(s[j]>s[j-1]))up=false;if(!(s[j]<s[j-1]))dn=false}if(up||dn){for(let j=k;j<k+6;j++)sig.add(j);msgs.push(`6 points steadily ${up?"increasing":"decreasing"} (trend, points ${k+1}–${k+6})`);break}}
      const g=canvasFor("cv",300);if(g){const{c,w,h}=g,X=k=>34+k/(d.length-1)*(w-56),Y=v=>h-24-(v-38)/24*(h-40);c.clearRect(0,0,w,h);
        [[56,"UCL 56",col("bad")],[50,"CL 50",col("ink")],[44,"LCL 44",col("bad")]].forEach(([v,l,s])=>{c.strokeStyle=s;c.setLineDash(v===50?[]:[6,5]);c.lineWidth=1.5;c.beginPath();c.moveTo(34,Y(v));c.lineTo(w-22,Y(v));c.stroke();c.setLineDash([]);c.fillStyle=s;c.textAlign="left";c.fillText(l,36,Y(v)-5)});
        c.strokeStyle=col("muted");c.lineWidth=1.5;c.beginPath();d.forEach((v,k)=>k?c.lineTo(X(k),Y(v)):c.moveTo(X(k),Y(v)));c.stroke();
        d.forEach((v,k)=>{c.beginPath();c.arc(X(k),Y(v),sig.has(k)?6:4,0,7);c.fillStyle=sig.has(k)?col("bad"):col("accent");c.fill()})}
      outp([["scenario",kind],["verdict",msgs.length?"OUT of control — special cause":"In control — common-cause variation only"],["signals",msgs.length?msgs.join("; "):"none"]])};
    on("click",e=>{const b=e.target.closest("[data-k]");if(!b)return;const k=b.dataset.k;gen();
      if(k==="shift"){kind="Mean shifted up after point 12";for(let j=12;j<25;j++)d[j]+=3.2}
      if(k==="trend"){kind="Tool wear: steady upward drift";for(let j=14;j<25;j++)d[j]=49+(j-14)*.9+.2*randn();for(let j=15;j<21;j++)d[j]=Math.max(d[j],d[j-1]+.15)}
      if(k==="spike"){kind="One bad batch at point 18";d[17]=59+Math.random()*2}
      redraw()});
  }
  const back=e=>{if(e.target.closest("[data-back]"))go("labs")};
  on("click",back);
  const onIn=e=>{if(e.target.matches("input,select"))redraw()};on("input",onIn);on("change",onIn);
  const onR=()=>redraw();window.addEventListener("resize",onR);
  redraw();
  cleanup=()=>{window.removeEventListener("resize",onR);ls.forEach(([t,f])=>app.removeEventListener(t,f))};
}
function qnorm(p){/* Acklam inverse normal */const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.357751867269,-30.66479806614716,2.506628277459239],b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572],c=[-.007784894002430293,-.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783],d=[.007784695709041462,.3224671290700398,2.445134137142996,3.754408661907416];const pl=.02425;let q,r;if(p<pl){q=Math.sqrt(-2*Math.log(p));return(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}if(p<=1-pl){q=p-.5;r=q*q;return(((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)}q=Math.sqrt(-2*Math.log(1-p));return-(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}

/* ================= GAMES ================= */
const SORTS={
 noir:{t:"Levels of measurement",b:["Nominal","Ordinal","Interval","Ratio"],i:[["Eye color",0],["ZIP code",0],["Jersey number",0],["Department name",0],["Satisfaction rating 1–5",1],["Class rank",1],["Shirt size S/M/L",1],["Temperature in °F",2],["Calendar year",2],["Temperature in °C",2],["Annual salary",3],["Part weight in kg",3],["Number of defects",3],["Minutes to finish a task",3]]},
 samp:{t:"Sampling methods",b:["Simple random","Systematic","Stratified","Cluster","Convenience"],i:[["Random number generator picks 50 employee IDs",0],["Draw names from a hat",0],["Every 10th customer through the door",1],["Every 25th unit off the line",1],["Split staff by department, randomly sample within each",2],["Sample proportionally from each age group",2],["Randomly pick 5 stores and survey every employee there",3],["Randomly pick 3 cities, survey all households in them",3],["Survey whoever is in the break room",4],["Ask shoppers at the mall entrance",4]]},
 anal:{t:"Types of analytics",b:["Descriptive","Diagnostic","Predictive","Prescriptive"],i:[["Last quarter's sales dashboard",0],["Monthly report of average wait times",0],["Drilling into why returns spiked in March",1],["Root-cause analysis of customer churn",1],["Forecasting next month's demand",2],["Model scoring which customers will likely churn",2],["Optimization model recommending staffing levels",3],["Recommending the price that maximizes profit",3]]},
 dmaic:{t:"DMAIC phase",b:["Define","Measure","Analyze","Improve","Control"],i:[["Project charter",0],["SIPOC diagram",0],["Voice of the customer / CTQs",0],["Collect baseline defect data",1],["Measurement system analysis",1],["Fishbone diagram",2],["5 Whys",2],["Hypothesis test of suspected root causes",2],["Pilot the solution",3],["Design of experiments to pick the fix",3],["Control chart monitoring",4],["Control plan and updated SOPs",4]]},
 test:{t:"Which test?",b:["z-test","One-sample t","Two-sample t","Paired t","Chi-square","ANOVA"],i:[["Mean vs target, population SD known from years of data",0],["Mean fill weight vs 500 g target, σ unknown, n = 15",1],["Average sales of two different regions",2],["Same employees' scores before and after training",3],["Same stores' sales before and after a remodel",3],["Is gender independent of product preference?",4],["Are defects spread evenly across 5 categories?",4],["Mean wait times at 3 clinics",5],["Mean output of 4 shift crews",5]]},
 chart:{t:"Best chart",b:["Bar","Line","Histogram","Scatter","Pie","Box plot","Pareto"],i:[["Compare revenue across 5 regions",0],["Sales trend over 24 months",1],["Website visits per day over a quarter",1],["Distribution of delivery times",2],["Ages of 500 customers",2],["Ad spend vs sales relationship",3],["Share of budget by department",4],["Spread and outliers of salaries across 3 departments",5],["Defect causes ranked largest first with cumulative %",6]]},
 bias:{t:"Type of bias",b:["Selection","Nonresponse","Response / leading","Voluntary response","Survivorship","Confirmation"],i:[["Phone survey reaches only landline owners",0],["Only 12% of surveyed customers reply",1],["“Don't you agree our new service is excellent?”",2],["Review site where only upset customers post",3],["Call-in radio poll",3],["Study only companies still in business to find success traits",4],["Armor planes where returning planes had holes",4],["Manager only looks at data that supports her plan",5]]}
};
function vGames(){
  if(sub&&sub.game==="match")return match(sub.unit||"mix");
  if(sub&&sub.game==="blitz")return blitz(sub.unit||"all");
  if(sub&&sub.game==="sort")return sortGame(sub.set||"noir");
  app.innerHTML=`<div class="stack"><div><span class="eyebrow">Memory games</span><h1>Games</h1></div>
  <div class="grid">
   <div class="card stack" style="gap:10px"><h3>Sort It</h3><p class="muted small">Classify scenarios fast: NOIR, sampling methods, analytics types, DMAIC, which test, chart choice, bias. These are classic OA question types.</p><select id="gs" aria-label="Set">${Object.entries(SORTS).map(([k,v])=>`<option value="${k}">${v.t}${S.best["sort_"+k]?` (best ${S.best["sort_"+k]}%)`:""}</option>`).join("")}</select><button class="btn primary" data-g="sort">Play Sort It</button></div>
   <div class="card stack" style="gap:10px"><h3>Match Up</h3><p class="muted small">Flip tiles to pair each term with its definition.</p><select id="gu1" aria-label="Unit"><option value="mix">Mixed — all units</option>${unitOpts(null)}</select><button class="btn primary" data-g="match">Play Match Up</button><span class="muted small">Best: ${S.best.match?S.best.match+" moves":"—"}</span></div>
   <div class="card stack" style="gap:10px"><h3>60-Second Blitz</h3><p class="muted small">A term appears; pick its meaning. How many in a minute?</p><select id="gu2" aria-label="Unit"><option value="all">All units</option>${unitOpts(null)}</select><button class="btn primary" data-g="blitz">Play Blitz</button><span class="muted small">Best: ${S.best.blitz||"—"}</span></div>
  </div></div>`;
  app.onclick=e=>{const b=e.target.closest("[data-g]");if(!b)return;const g=b.dataset.g;if(g==="sort")return go("games",{game:"sort",set:$("#gs").value});go("games",{game:g,unit:$(g==="match"?"#gu1":"#gu2").value})};
}
function sortGame(set){const D=SORTS[set];let items=shuffle(D.i),k=0,right=0,last=null;
  function draw(){if(k>=items.length){const p=pct(right,items.length);if(!S.best["sort_"+set]||p>S.best["sort_"+set]){S.best["sort_"+set]=p;save()}
      app.innerHTML=`<div class="stack"><button class="btn sm ghost" data-back style="align-self:flex-start">← Games</button><h1><span class="mark num">${right}/${items.length}</span> sorted correctly</h1><p class="muted">${p>=90?"Excellent — this question type is locked in.":"Play again until you hit 90%+."}</p><div class="row"><button class="btn primary" data-re>Play again</button><button class="btn" data-back>Other games</button></div></div>`;return}
    const it=items[k];app.innerHTML=`<div class="stack"><div class="row between"><button class="btn sm ghost" data-back>← Games</button><span class="chip num">${k+1}/${items.length} · ${right} right</span></div><span class="eyebrow">${esc(D.t)}</span>
     ${last?`<div class="explain" style="background:${last.ok?"var(--good-soft)":"var(--bad-soft)"}"><span>${last.ok?"✓ Right":"✗ It was <strong>"+esc(D.b[last.a])+"</strong>"}: ${esc(last.t)}</span></div>`:""}
     <div class="card"><h2>${esc(it[0])}</h2></div><div class="bucket">${D.b.map((b,j)=>`<button class="btn" data-b="${j}">${esc(b)}</button>`).join("")}</div></div>`}
  draw();
  app.onclick=e=>{const t=e.target;if(t.closest("[data-back]"))return go("games");if(t.closest("[data-re]"))return go("games",{game:"sort",set});const b=t.closest("[data-b]");if(!b)return;const it=items[k],ok=+b.dataset.b===it[1];if(ok){right++;addXP(3)}last={ok,a:it[1],t:it[0]};k++;draw()};
}
function match(unit){
  const src=unit==="mix"?shuffle(U.flatMap(u=>u.pairs)).slice(0,8):shuffle(byId[unit].pairs).slice(0,8);
  let tiles=shuffle(src.flatMap((p,k)=>[{k,t:p[0],term:1},{k,t:p[1],term:0}])),open=[],done=new Set(),moves=0,busy=false;
  function draw(){app.innerHTML=`<div class="stack"><div class="row between"><button class="btn sm ghost" data-back>← Games</button><span class="chip num">${moves} moves · ${done.size}/8 pairs</span></div><h2>Match Up${unit==="mix"?"":" · "+esc(byId[unit].title)}</h2>
   <div class="mm">${tiles.map((x,j)=>{const up=open.includes(j)||done.has(x.k);return `<button class="tile ${x.term?"term":""} ${up?"up":""} ${done.has(x.k)?"done":""}" data-t="${j}" aria-label="${up?esc(x.t):"Hidden tile"}">${up?esc(x.t):"?"}</button>`}).join("")}</div>
   ${done.size===8?`<div class="card row between"><strong>Cleared in ${moves} moves!</strong><button class="btn primary" data-re>Play again</button></div>`:`<p class="muted small">Terms are in bold display type; definitions in plain text.</p>`}</div>`}
  app.onclick=e=>{const t=e.target;if(t.closest("[data-back]"))return go("games");if(t.closest("[data-re]"))return go("games",{game:"match",unit});
    const b=t.closest("[data-t]");if(!b||busy)return;const j=+b.dataset.t;if(open.includes(j)||done.has(tiles[j].k))return;open.push(j);
    if(open.length===2){moves++;const[a,c]=open;if(tiles[a].k===tiles[c].k&&tiles[a].term!==tiles[c].term){done.add(tiles[a].k);open=[];addXP(2);if(done.size===8&&(!S.best.match||moves<S.best.match)){S.best.match=moves;save()}}else{busy=true;draw();setTimeout(()=>{open=[];busy=false;draw()},900);return}}
    draw()};
  draw();
}
function blitz(unit){
  const pool=unit==="all"?ALLC:ALLC.filter(c=>c.u===unit);let score=0,streakN=0,end=Date.now()+60e3,cur=null,opts=[],tick=null,over=false,fb="";
  function nextQ(){cur=pick(pool);const others=shuffle(ALLC.filter(c=>c.b!==cur.b&&(c.u===cur.u||Math.random()<.25))).slice(0,3);opts=shuffle([cur].concat(others))}
  function draw(){const left=Math.max(0,Math.ceil((end-Date.now())/1e3));
    app.innerHTML=over?`<div class="stack"><button class="btn sm ghost" data-back style="align-self:flex-start">← Games</button><h1>Time! <span class="mark num">${score}</span> correct</h1><p class="muted">Best: ${S.best.blitz||score}. Misses were sent back to your flashcard queue.</p><div class="row"><button class="btn primary" data-re>Play again</button></div></div>`
    :`<div class="stack"><div class="row between"><button class="btn sm ghost" data-back>← Games</button><span class="chip hi num" id="bt">${left}s</span></div><div class="row"><span class="chip good num">${score} correct</span><span class="chip num">streak ${streakN}</span>${fb}</div>
    <div class="card"><span class="eyebrow">${esc(byId[cur.u].title)}</span><h2 style="margin-top:6px">${esc(cur.f)}</h2></div><div class="stack" style="gap:8px">${opts.map((o,j)=>`<button class="opt" data-o="${j}"><b>${"ABCD"[j]}</b>${esc(o.b)}</button>`).join("")}</div></div>`}
  nextQ();draw();
  tick=setInterval(()=>{const el=$("#bt");const left=Math.max(0,Math.ceil((end-Date.now())/1e3));if(el)el.textContent=left+"s";if(!left){clearInterval(tick);over=true;if(!S.best.blitz||score>S.best.blitz){S.best.blitz=score;save()}draw()}},250);
  cleanup=()=>clearInterval(tick);
  app.onclick=e=>{const t=e.target;if(t.closest("[data-back]"))return go("games");if(t.closest("[data-re]"))return go("games",{game:"blitz",unit});
    const b=t.closest("[data-o]");if(!b||over)return;if(opts[+b.dataset.o]===cur){score++;streakN++;addXP(2);fb=`<span class="chip good">✓</span>`}else{streakN=0;fb=`<span class="chip bad">✗ ${esc(cur.b.length>60?cur.b.slice(0,60)+"…":cur.b)}</span>`;S.srs[cur.k]={b:0,due:Date.now()};save()}nextQ();draw()};
}

/* ================= CRAM & TOOLS ================= */
const FORMULAS=[["Mean","x̄ = Σx ÷ n"],["Median","middle of sorted data (average two middles if n even)"],["Range","max − min"],["Sample variance","s² = Σ(x − x̄)² ÷ (n − 1)"],["Sample SD","s = √s²"],["Population SD","σ = √[Σ(x − μ)² ÷ N]"],["IQR","Q3 − Q1"],["Outlier fences","Q1 − 1.5·IQR and Q3 + 1.5·IQR"],["Coefficient of variation","CV = s ÷ x̄ × 100%"],["Weighted mean","Σ(w·x) ÷ Σw"],["Complement","P(not A) = 1 − P(A)"],["Addition rule","P(A or B) = P(A) + P(B) − P(A and B)"],["Multiplication (independent)","P(A and B) = P(A)·P(B)"],["Conditional","P(A | B) = P(A and B) ÷ P(B)"],["Expected value","E(X) = Σ x·P(x)"],["Z-score","z = (x − μ) ÷ σ"],["Empirical rule","68% / 95% / 99.7% within 1 / 2 / 3 σ"],["Standard error","SE = σ ÷ √n"],["Confidence interval","x̄ ± z*·σ/√n  (z* = 1.645 / 1.96 / 2.576)"],["Proportion CI","p̂ ± z*·√[p̂(1 − p̂)/n]"],["Decision rule","p ≤ α → reject H₀"],["Type I / II","I = reject a true H₀ (α) · II = miss a false H₀ (β)"],["Regression","ŷ = b₀ + b₁x"],["Residual","e = y − ŷ"],["R²","% of variation in y explained (= r² in simple regression)"],["Moving average","sum of last k periods ÷ k"],["MAD","Σ|actual − forecast| ÷ n"],["MAPE","Σ(|error| ÷ actual) ÷ n × 100%"],["EMV","Σ(payoff × probability); pick the best"],["Break-even units","fixed cost ÷ (price − variable cost)"],["ROI","(gain − cost) ÷ cost × 100%"],["Control limits","center ± 3σ"],["Six Sigma","3.4 defects per million opportunities"]];
function vCram(){
  app.innerHTML=`<div class="stack"><div class="row between"><div><span class="eyebrow">The night before</span><h1>Cram sheet &amp; tools</h1></div><div class="row noprint"><button class="btn primary" data-pod>▶ Podcast mode (all units)</button><button class="btn" data-print>Print / save PDF</button></div></div>
  <p class="muted noprint">Podcast mode reads every unit's memory hook, key points and exam traps aloud in order — good for the car or the gym.</p>
  <h2>Formula sheet</h2><div class="formula">${FORMULAS.map(([n,f])=>`<div><b>${esc(n)}</b><div class="f">${esc(f)}</div></div>`).join("")}</div>
  <h2>Must-know by unit</h2><div class="grid">${U.map(u=>`<div class="card stack" style="gap:8px"><span class="eyebrow">Unit ${u.id.slice(1)}</span><h3>${esc(u.title)}</h3>${u.mnemonic?`<p><span class="mark"><strong>${esc(u.mnemonic)}</strong></span></p>`:""}<ul style="margin:0;padding-left:1.1em" class="small">${(u.cram.length?u.cram:u.keyPoints.slice(0,6)).map(c=>`<li>${esc(c)}</li>`).join("")}</ul>${u.traps.length?`<p class="small" style="color:var(--bad)"><strong>Traps:</strong> ${esc(u.traps.slice(0,3).map(t=>t.replace(/^Trap:\s*/,"")).join(" · "))}</p>`:""}</div>`).join("")}</div>
  <div class="noprint stack"><h2>Calculators</h2>
  <section class="card stack" style="gap:10px"><h3>Descriptive statistics</h3><label for="ds">Numbers separated by commas or spaces</label><textarea id="ds">12, 15, 11, 18, 14, 22, 13, 16, 45, 15</textarea><button class="btn primary" data-c="ds" style="align-self:flex-start">Calculate</button><dl class="out" id="dso"></dl></section>
  <section class="card stack" style="gap:10px"><h3>Z-score &amp; percentile</h3><div class="ctl"><div class="field"><label for="zx">x</label><input id="zx" type="number" value="85"></div><div class="field"><label for="zm">mean</label><input id="zm" type="number" value="70"></div><div class="field"><label for="zs">SD</label><input id="zs" type="number" value="10"></div><button class="btn primary" data-c="z">Calculate</button></div><dl class="out" id="zo"></dl></section>
  <section class="card stack" style="gap:10px"><h3>Confidence interval for a mean</h3><div class="ctl"><div class="field"><label for="cm">mean</label><input id="cm" type="number" value="52"></div><div class="field"><label for="cs">SD</label><input id="cs" type="number" value="8"></div><div class="field"><label for="cn2">n</label><input id="cn2" type="number" value="64"></div><div class="field"><label for="cl2">level</label><select id="cl2"><option value="1.645">90%</option><option value="1.96" selected>95%</option><option value="2.576">99%</option></select></div><button class="btn primary" data-c="ci">Calculate</button></div><dl class="out" id="cio"></dl></section>
  <section class="card stack" style="gap:10px"><h3>Correlation &amp; regression</h3><label for="rx">x values</label><textarea id="rx" style="min-height:50px">2, 4, 5, 7, 9</textarea><label for="ry">y values</label><textarea id="ry" style="min-height:50px">10, 15, 17, 24, 29</textarea><button class="btn primary" data-c="rg" style="align-self:flex-start">Calculate</button><dl class="out" id="rgo"></dl></section>
  <section class="card stack" style="gap:10px"><h3>Break-even</h3><div class="ctl"><div class="field"><label for="bf">fixed cost</label><input id="bf" type="number" value="20000"></div><div class="field"><label for="bp">price</label><input id="bp" type="number" value="50"></div><div class="field"><label for="bv">variable cost</label><input id="bv" type="number" value="30"></div><button class="btn primary" data-c="be">Calculate</button></div><dl class="out" id="beo"></dl></section></div></div>`;
  const out=(id,rows)=>{$(id).innerHTML=rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")};
  const nums=s=>s.split(/[\s,;]+/).map(Number).filter(x=>x===x&&isFinite(x)&&String(x)!=="");
  function calc(c){
    if(c==="ds"){const a=nums($("#ds").value).sort((x,y)=>x-y),n=a.length;if(n<2)return out("#dso",[["Error","Enter at least two numbers."]]);
      const m=a.reduce((s,x)=>s+x,0)/n,ss=a.reduce((s,x)=>s+(x-m)**2,0),lo=a.slice(0,Math.floor(n/2)),hi=a.slice(Math.ceil(n/2)),q1=median(lo),q3=median(hi),iqr=q3-q1;
      const cnt={};a.forEach(x=>cnt[x]=(cnt[x]||0)+1);const mx=Math.max(...Object.values(cnt)),modes=mx>1?Object.keys(cnt).filter(k=>cnt[k]===mx).join(", "):"none";const L=q1-1.5*iqr,H=q3+1.5*iqr,ol=a.filter(x=>x<L||x>H);
      out("#dso",[["n",n],["sorted",a.join(", ")],["mean",fmt(m,4)],["median",fmt(median(a),4)],["mode",modes],["range",fmt(a[n-1]-a[0],4)],["sample variance s²",fmt(ss/(n-1),4)],["sample SD s",fmt(Math.sqrt(ss/(n-1)),4)],["population SD σ",fmt(Math.sqrt(ss/n),4)],["Q1 · Q3",fmt(q1,4)+" · "+fmt(q3,4)],["IQR",fmt(iqr,4)],["fences",fmt(L,4)+" to "+fmt(H,4)],["outliers",ol.length?ol.join(", "):"none"],["CV",fmt(Math.sqrt(ss/(n-1))/m*100,2)+"%"],["shape hint",m>median(a)+1e-9?"mean > median → likely right-skewed":m<median(a)-1e-9?"mean < median → likely left-skewed":"roughly symmetric"]])}
    if(c==="z"){const x=+$("#zx").value,m=+$("#zm").value,s=+$("#zs").value;if(!(s>0))return out("#zo",[["Error","SD must be greater than 0."]]);const z=(x-m)/s,p=ncdf(z);out("#zo",[["z",fmt(z,4)],["% below x",fmt(p*100,2)+"%"],["% above x",fmt((1-p)*100,2)+"%"],["reading",Math.abs(z)>=3?"very unusual (beyond 3σ)":Math.abs(z)>=2?"unusual (beyond 2σ)":"typical"]])}
    if(c==="ci"){const m=+$("#cm").value,s=+$("#cs").value,n=+$("#cn2").value,z=+$("#cl2").value;if(!(s>0&&n>0))return out("#cio",[["Error","SD and n must be greater than 0."]]);const se=s/Math.sqrt(n),me=z*se;out("#cio",[["standard error",fmt(se,4)],["margin of error",fmt(me,4)],["interval",fmt(m-me,4)+" to "+fmt(m+me,4)]])}
    if(c==="rg"){const x=nums($("#rx").value),y=nums($("#ry").value);if(x.length<2||x.length!==y.length)return out("#rgo",[["Error","Enter the same number of x and y values (at least 2)."]]);const n=x.length,mx=x.reduce((a,b)=>a+b,0)/n,my=y.reduce((a,b)=>a+b,0)/n;let sxy=0,sxx=0,syy=0;x.forEach((v,i)=>{sxy+=(v-mx)*(y[i]-my);sxx+=(v-mx)**2;syy+=(y[i]-my)**2});if(!sxx||!syy)return out("#rgo",[["Error","x and y each need some variation."]]);const b1=sxy/sxx,b0=my-b1*mx,r=sxy/Math.sqrt(sxx*syy);
      out("#rgo",[["equation",`ŷ = ${fmt(b0,4)} ${b1<0?"−":"+"} ${fmt(Math.abs(b1),4)}x`],["slope meaning",`each +1 in x → ${fmt(b1,3)} change in y`],["r",fmt(r,4)],["R²",fmt(r*r,4)+` (${fmt(r*r*100,1)}% explained)`]])}
    if(c==="be"){const f=+$("#bf").value,p=+$("#bp").value,v=+$("#bv").value;if(!(p>v))return out("#beo",[["Error","Price must be higher than variable cost."]]);const u=f/(p-v);out("#beo",[["margin per unit",fmt(p-v)],["break-even units",fmt(u)+" → "+Math.ceil(u)],["break-even revenue",money(Math.ceil(u)*p)]])}}
  ["ds","z","ci","rg","be"].forEach(calc);
  app.onclick=e=>{const t=e.target,b=t.closest("[data-c]");if(b)return calc(b.dataset.c);
    if(t.closest("[data-print]"))return window.print();
    if(t.closest("[data-pod]"))player("Podcast mode — all 12 units",U.flatMap(u=>[`Unit ${u.id.slice(1)}: ${u.title}.`].concat(u.mnemonic?["Memory hook: "+u.mnemonic]:[],u.keyPoints,u.traps.map(x=>x.replace(/^Trap:/,"Exam trap:")))))};
}

/* ================= boot ================= */
let deferredInstall=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;const b=$("#installBtn");if(b)b.hidden=false});
if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("/sw.js").catch(()=>{});
const h=(location.hash||"").slice(1);if(TABS.some(t=>t[0]===h))tab=h;
tabs();render();
window.__crush={GEN,go,U};
})();
