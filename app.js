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
const KEY="crushc211.v1";
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
  const W=360,base=140,top=22,pts=[];for(let i=0;i<=120;i++){const t=i/120*30;pts.push([i/120*W,base-(base-top)*(Math.pow(1.09,t)-1)/(Math.pow(1.09,30)-1)])}
  const path="M"+pts.map(p=>p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" L"),cut=W*fill/100,area=pts.filter(p=>p[0]<=cut);
  const ap=area.length?"M0 "+base+" L"+area.map(p=>p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" L")+" L"+cut.toFixed(1)+" "+base+" Z":"";
  const tk=[0,10,20,30].map(y=>{const x=y/30*W;return `<line x1="${x}" x2="${x}" y1="${base}" y2="${base+6}" stroke="var(--muted)"/><text x="${x}" y="${base+20}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="JetBrains Mono,monospace">yr ${y}</text>`}).join("");
  return `<svg viewBox="-14 0 388 178" role="img" aria-label="Growth curve shaded ${fill}% to show exam readiness"><path d="${ap}" fill="var(--hi)"/><path d="${path}" fill="none" stroke="var(--ink)" stroke-width="2.4"/><line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="var(--line)" stroke-width="1.5"/>${tk}<text x="4" y="16" font-size="11" fill="var(--muted)" font-family="JetBrains Mono,monospace">Real GDP growth</text></svg>`;
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
  <input type="search" id="q" placeholder="Search every lesson and flashcard (try “elasticity” or “tariff”)" aria-label="Search">
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
  const ask=claude(`I'm studying for WGU C211 Global Economics for Managers, unit "${u.title}" (${u.summary}). I'm new to statistics. Teach me the hardest part of this unit in plain English with one business example, then quiz me with 3 multiple-choice questions one at a time and explain my answers.`);
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
  let k=1;while(set.length<4&&k<60){if(typeof ans==="number"){const s=f(ans*(1+(k%2?1:-1)*.11*Math.ceil(k/2)));if(!set.includes(s))set.push(s)}k++}
  while(set.length<4)set.push("None of these");
  const o=shuffle(set);return{q,o,a:o.indexOf(A),steps}}
const m2=x=>(x<0?"−$":"$")+Math.abs(x).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const m0=x=>(x<0?"−$":"$")+Math.round(Math.abs(x)).toLocaleString("en-US");
const pc=(x,d)=>fmt(x*100,d==null?2:d)+"%";
const GEN={
 oc:{label:"Opportunity cost",u:"u1",f(){const sal=R(40,90)*1000,tu=R(10,40)*1000,yrs=pick([1,2]),books=R(1,4)*1000;const c=yrs*(sal+tu+books);
   return mc(`A manager earning ${m0(sal)} a year quits to do a ${yrs}-year full-time MBA. Tuition is ${m0(tu)} a year and books ${m0(books)} a year. Rent stays the same either way. What is the full economic cost of the MBA?`,c,[yrs*(tu+books),yrs*sal,yrs*(sal+tu+books)+R(8,15)*1000*yrs],[`Opportunity cost = everything given up: explicit costs plus the salary you forgo.`,`Per year: ${m0(sal)} salary + ${m0(tu)} tuition + ${m0(books)} books = ${m0(sal+tu+books)}.`,`× ${yrs} year${yrs>1?"s":""} = ${m0(c)}. Rent is not counted because you pay it either way.`],m0)}},
 ped:{label:"Price elasticity (midpoint)",u:"u3",f(){const p1=R(5,40),p2=p1+R(1,Math.min(8,p1-2))*(Math.random()<.5?1:-1),q1=R(100,900),q2=Math.max(10,Math.round(q1*(1-(p2-p1)/p1*pick([.3,.6,1.4,2,2.5]))));
   const e=Math.abs(((q2-q1)/((q1+q2)/2))/((p2-p1)/((p1+p2)/2)));const cls=v=>v>1.0001?"elastic":v<.9999?"inelastic":"unit elastic";const F=v=>`${fmt(v,2)} — ${cls(v)}`;
   return mc(`When a café changes the price of a latte from $${p1} to $${p2}, daily sales go from ${q1} to ${q2}. Using the midpoint method, what is the price elasticity of demand?`,e,[Math.abs(((q2-q1)/q1)/((p2-p1)/p1)),1/e,e*1.5+.07],[`%ΔQ = (${q2} − ${q1}) ÷ average ${fmt((q1+q2)/2,1)} = ${pc((q2-q1)/((q1+q2)/2),2)}.`,`%ΔP = (${p2} − ${p1}) ÷ average ${fmt((p1+p2)/2,1)} = ${pc((p2-p1)/((p1+p2)/2),2)}.`,`|E| = ${fmt(e,2)} → ${cls(e)} (|E| > 1 elastic, < 1 inelastic).`],F)}},
 tr:{label:"Total revenue test",u:"u3",f(){const e=pick([.3,.4,.6,.8,1.4,1.8,2.5,3]),up=Math.random()<.5;const fall="Total revenue falls",rise="Total revenue rises";const ans=(e>1)===up?fall:rise;
   return mc(`Demand for a product has a price elasticity of ${e}. If the firm ${up?"raises":"cuts"} its price, what happens to total revenue?`,ans,[ans===fall?rise:fall,"Total revenue stays the same","Quantity demanded rises when price rises"],[`|E| = ${e} is ${e>1?"elastic: quantity responds more than price":"inelastic: quantity responds less than price"}.`,`${e>1?"Elastic":"Inelastic"} + price ${up?"up":"down"} → TR ${ans===rise?"rises":"falls"}. Rule: with inelastic demand, price and TR move together; with elastic demand they move opposite.`])}},
 xed:{label:"Cross & income elasticity",u:"u3",f(){if(Math.random()<.5){const dp=R(5,25),dq=R(2,30)*(Math.random()<.5?1:-1),e=dq/dp;const ans=e>0?"Substitutes":"Complements";
     return mc(`The price of coffee rises ${dp}% and sales of ${e>0?"tea":"coffee creamer"} change by ${dq>0?"+":""}${dq}%. What is the cross-price elasticity and relationship?`,`${fmt(e,2)} — ${ans}`,[`${fmt(-e,2)} — ${ans==="Substitutes"?"Complements":"Substitutes"}`,`${fmt(e,2)} — ${ans==="Substitutes"?"Complements":"Substitutes"}`,`${fmt(dp/dq,2)} — Unrelated goods`],[`Cross elasticity = %ΔQ of one good ÷ %ΔP of the other = ${dq} ÷ ${dp} = ${fmt(e,2)}.`,`Positive → substitutes; negative → complements.`])}
   const di=R(4,20),dq=pick([-1,1,1])*R(1,40),e=dq/di;if(Math.abs(Math.abs(e)-1)<.06||e===0)return GEN.xed.f();const cls=e<0?"Inferior good":e>1?"Normal good — luxury":"Normal good — necessity";
   return mc(`Household incomes rise ${di}% and demand for a product changes by ${dq>0?"+":""}${dq}%. How would you classify it?`,`${fmt(e,2)} — ${cls}`,[cls!=="Inferior good"?`${fmt(e,2)} — Inferior good`:`${fmt(e,2)} — Normal good — necessity`,cls!=="Normal good — luxury"?`${fmt(e,2)} — Normal good — luxury`:`${fmt(e,2)} — Normal good — necessity`,`${fmt(di/dq,2)} — Normal good — luxury`],[`Income elasticity = %ΔQ ÷ %Δincome = ${dq} ÷ ${di} = ${fmt(e,2)}.`,`< 0 inferior · 0 to 1 necessity · > 1 luxury.`])}},
 eq:{label:"Market equilibrium",u:"u2",f(){const b=R(2,6),d=R(2,6),P=R(5,40),Q=R(40,200),a=Q+b*P,c=Q-d*P;const F=v=>`P = $${v[0]}, Q = ${v[1]}`;
   return mc(`Demand: Qd = ${a} − ${b}P. Supply: Qs = ${c<0?"−"+(-c):c} + ${d}P. What are the equilibrium price and quantity?`,[P,Q],[[rd((a+c)/(b+d),2),rd(a-b*(a+c)/(b+d),1)],[P,a],[rd((a-c)/(b+d)+2,2),Q-2*b],[P+1,Q+b],[P-1,Q-b],[Q,P]],[`Set Qd = Qs: ${a} − ${b}P = ${c} + ${d}P.`,`${a-c} = ${b+d}P → P = $${P}.`,`Q = ${a} − ${b}(${P}) = ${Q}.`],F)}},
 ceil:{label:"Price ceilings & floors",u:"u2",f(){const b=R(2,6),d=R(2,6),P=R(10,40),Q=R(60,200),a=Q+b*P,c=Q-d*P;const ceil=Math.random()<.5,pc2=ceil?P-R(2,6):P+R(2,6),qd=a-b*pc2,qs=c+d*pc2;
   return mc(`Qd = ${a} − ${b}P and Qs = ${c} + ${d}P (equilibrium price $${P}). The government sets a price ${ceil?"ceiling":"floor"} of $${pc2}. What happens?`,ceil?`Shortage of ${qd-qs} units`:`Surplus of ${qs-qd} units`,[ceil?`Surplus of ${qd-qs} units`:`Shortage of ${qs-qd} units`,"No effect — the market clears",ceil?`Shortage of ${Math.abs(Q-qs)} units`:`Surplus of ${Math.abs(qs-Q)} units`],[`At $${pc2}: Qd = ${qd}, Qs = ${qs}.`,ceil?`A binding ceiling (below equilibrium) → Qd > Qs → shortage of ${qd-qs}.`:`A binding floor (above equilibrium) → Qs > Qd → surplus of ${qs-qd}.`])}},
 cs:{label:"Consumer & producer surplus",u:"u2",f(){const A=R(60,120),P=R(15,A-20),Q=R(50,400),cs=.5*(A-P)*Q,s0=Math.max(0,P-R(5,P-2));const ps=.5*(P-s0)*Q;
   if(Math.random()<.5)return mc(`Demand hits the price axis at $${A}. The market price is $${P} and ${Q} units sell. With linear demand, what is consumer surplus?`,cs,[(A-P)*Q,.5*P*Q,.5*A*Q],[`CS = triangle under demand, above price = ½ × base × height.`,`½ × ${Q} × (${A} − ${P}) = ${m0(cs)}.`],m0);
   return mc(`Supply starts at $${s0} on the price axis. The market price is $${P} and ${Q} units sell. With linear supply, what is producer surplus?`,ps,[(P-s0)*Q,.5*P*Q,.5*s0*Q],[`PS = triangle above supply, below price.`,`½ × ${Q} × (${P} − ${s0}) = ${m0(ps)}.`],m0)}},
 mcst:{label:"Marginal & average cost",u:"u4",f(){const F=R(50,300),vc=[0];let m=R(18,30);for(let q=1;q<=6;q++){m=q<3?m-R(2,5):m+R(3,9);vc.push(vc[q-1]+Math.max(4,m))}const tc=vc.map(v=>v+F),q=R(2,6);
   const tbl=tc.map((t,i)=>`Q${i}: $${t}`).join(", ");const k=pick(["mc","atc","avc"]);
   if(k==="mc")return mc(`Total cost: ${tbl}. What is the marginal cost of unit ${q}?`,tc[q]-tc[q-1],[tc[q]/q,tc[q],(tc[q]-F)/q],[`MC = change in total cost from one more unit.`,`TC(${q}) − TC(${q-1}) = ${tc[q]} − ${tc[q-1]} = $${tc[q]-tc[q-1]}.`],v=>m2(v));
   if(k==="atc")return mc(`Total cost: ${tbl}. What is average total cost at Q = ${q}?`,tc[q]/q,[tc[q]-tc[q-1],(tc[q]-F)/q,F/q],[`ATC = TC ÷ Q = ${tc[q]} ÷ ${q} = ${m2(tc[q]/q)}.`,`Fixed cost = TC at Q0 = $${F}.`],m2);
   return mc(`Total cost: ${tbl}. What is average variable cost at Q = ${q}?`,(tc[q]-F)/q,[tc[q]/q,tc[q]-tc[q-1],F/q],[`Fixed cost = TC when Q = 0 = $${F}.`,`VC = ${tc[q]} − ${F} = ${tc[q]-F}; AVC = VC ÷ Q = ${m2((tc[q]-F)/q)}.`],m2)}},
 pmax:{label:"Profit maximization (MR = MC)",u:"u4",f(){const P=R(20,45),mcs=[];let m=R(8,14);for(let q=1;q<=8;q++){m+=R(2,7);mcs.push(m)}let Q=0;mcs.forEach((x,i)=>{if(x<=P)Q=i+1});if(Q===0||Q===8)return GEN.pmax.f();
   return mc(`A firm in a competitive market sells at $${P}. Marginal cost of units 1–8: ${mcs.map(x=>"$"+x).join(", ")}. How many units maximize profit?`,Q,[Q+1,Q-1,8],[`In perfect competition MR = price = $${P}.`,`Produce every unit where MR ≥ MC. Unit ${Q} costs $${mcs[Q-1]} (≤ $${P}); unit ${Q+1} costs $${mcs[Q]} (> $${P}).`,`Profit-maximizing output = ${Q} units.`],v=>v+" units")}},
 eprof:{label:"Economic vs accounting profit",u:"u4",f(){const rev=R(200,900)*1000,exp=Math.round(rev*R(40,80)/100/1000)*1000,imp=R(40,150)*1000,acc=rev-exp,eco=acc-imp;
   return mc(`A shop owner's revenue is ${m0(rev)} and explicit costs are ${m0(exp)}. She gave up a ${m0(imp)} salary elsewhere. What is her economic profit?`,eco,[acc,rev-imp,acc+imp,eco-imp,-eco],[`Accounting profit = revenue − explicit costs = ${m0(acc)}.`,`Economic profit = accounting profit − implicit costs = ${m0(acc)} − ${m0(imp)} = ${m0(eco)}.`,eco<0?"Negative economic profit means she could earn more elsewhere.":"Positive economic profit means staying beats her next best option."],v=>(v<0?"−":"")+m0(Math.abs(v)))}},
 shut:{label:"Shutdown decision",u:"u4",f(){const avc=R(10,30),atc=avc+R(3,12),k=pick([0,1,2]),P=k===0?avc-R(1,5):k===1?R(avc+1,atc-1):atc+R(1,6);
   const A=["Shut down now — price is below AVC","Keep producing in the short run, but losses continue","Produce — the firm earns an economic profit"][k];
   return mc(`Market price is $${P}. At its best output the firm's AVC is $${avc} and ATC is $${atc}. What should it do in the short run?`,A,["Shut down now — price is below AVC","Keep producing in the short run, but losses continue","Produce — the firm earns an economic profit","Raise its price above the market price"].filter(x=>x!==A),[`Compare price with AVC and ATC.`,`P < AVC → shut down (can't cover variable costs). AVC ≤ P < ATC → operate at a loss (covers some fixed cost). P ≥ ATC → profit.`])}},
 gdp:{label:"GDP (C + I + G + NX)",u:"u7",f(){const C=R(800,1500),I=R(150,400),G=R(200,500),X=R(100,300),M=R(120,350),T=R(50,200),g=C+I+G+X-M;
   return mc(`Consumption $${C}B, investment $${I}B, government purchases $${G}B, exports $${X}B, imports $${M}B, and transfer payments $${T}B. What is GDP?`,g,[C+I+G+X+M,C+I+G,g+T],[`GDP = C + I + G + (X − M).`,`${C} + ${I} + ${G} + (${X} − ${M}) = $${g}B.`,`Transfer payments are not purchases of new output, so they are excluded.`],v=>"$"+v.toLocaleString()+"B")}},
 real:{label:"Real GDP & the deflator",u:"u7",f(){const n=R(10,30)*1000,d=R(105,140),r=n/(d/100);
   return mc(`Nominal GDP is $${n.toLocaleString()}B and the GDP deflator is ${d} (base year = 100). What is real GDP?`,r,[n*d/100,n-d,n/d],[`Real GDP = nominal GDP ÷ (deflator ÷ 100).`,`${n.toLocaleString()} ÷ ${fmt(d/100,2)} = $${fmt(r,1)}B.`],v=>"$"+fmt(v,1)+"B")}},
 infl:{label:"Inflation from the CPI",u:"u7",f(){const c1=R(2000,3200)/10,c2=rd(c1*(1+R(1,9)/100),1),i=(c2-c1)/c1;
   return mc(`The CPI rose from ${c1} last year to ${c2} this year. What was the inflation rate?`,i,[(c2-c1)/c2,(c2-c1)/100,c2/c1],[`Inflation = (CPI₂ − CPI₁) ÷ CPI₁ × 100.`,`(${c2} − ${c1}) ÷ ${c1} = ${pc(i,2)}.`],v=>pc(v,2))}},
 unemp:{label:"Unemployment & participation",u:"u7",f(){const E=R(120,170),Un=R(4,14),N=R(70,110),lf=E+Un;
   if(Math.random()<.5)return mc(`An economy has ${E}M employed, ${Un}M unemployed (looking for work) and ${N}M adults not in the labor force. What is the unemployment rate?`,Un/lf,[Un/(E+Un+N),Un/E,N/(E+Un+N)],[`Labor force = employed + unemployed = ${lf}M.`,`Unemployment rate = ${Un} ÷ ${lf} = ${pc(Un/lf,2)}.`,`People not looking for work are not in the labor force at all.`],v=>pc(v,2));
   return mc(`${E}M employed, ${Un}M unemployed, ${N}M adults not in the labor force. What is the labor force participation rate?`,lf/(lf+N),[E/(lf+N),lf/E,N/(lf+N)],[`Adult population = ${lf} + ${N} = ${lf+N}M.`,`LFPR = labor force ÷ adult population = ${lf} ÷ ${lf+N} = ${pc(lf/(lf+N),2)}.`],v=>pc(v,2))}},
 mult:{label:"Spending & tax multipliers",u:"u10",f(){const mpc=pick([.6,.75,.8,.9]),dg=R(10,100),sm=1/(1-mpc),tm=mpc/(1-mpc);
   if(Math.random()<.5)return mc(`The MPC is ${mpc}. The government increases spending by $${dg}B. What is the maximum change in GDP?`,dg*sm,[dg*tm,dg/mpc,dg*mpc],[`Spending multiplier = 1 ÷ (1 − MPC) = 1 ÷ ${fmt(1-mpc,2)} = ${fmt(sm,2)}.`,`ΔGDP = ${dg} × ${fmt(sm,2)} = $${fmt(dg*sm,1)}B.`],v=>"$"+fmt(v,1)+"B");
   return mc(`The MPC is ${mpc}. The government cuts taxes by $${dg}B. What is the maximum change in GDP?`,dg*tm,[dg*sm,dg*mpc,dg],[`Tax multiplier = MPC ÷ (1 − MPC) = ${fmt(tm,2)} (smaller than the spending multiplier because people save part of a tax cut).`,`ΔGDP = ${dg} × ${fmt(tm,2)} = $${fmt(dg*tm,1)}B.`],v=>"$"+fmt(v,1)+"B")}},
 money:{label:"Money multiplier",u:"u9",f(){const rr=pick([.05,.1,.125,.2,.25]),D=R(1,20)*1000,mm=1/rr;
   return mc(`The reserve requirement is ${pc(rr,1)}. A customer deposits $${D.toLocaleString()} of new cash. What is the maximum increase in total deposits in the banking system?`,D*mm,[D*rr,D*(1-rr),D*(1-rr)*mm],[`Money multiplier = 1 ÷ rr = 1 ÷ ${rr} = ${fmt(mm,2)}.`,`Max deposits = $${D.toLocaleString()} × ${fmt(mm,2)} = ${m0(D*mm)}.`,`New loans created = excess reserves × multiplier = ${m0(D*(1-rr)*mm)}.`],m0)}},
 qtm:{label:"Quantity theory (MV = PY)",u:"u9",f(){const dm=R(3,12),dv=R(-2,2),dy=R(1,4),inf=dm+dv-dy;
   return mc(`The money supply grows ${dm}%, velocity changes ${dv>=0?"+":""}${dv}%, and real GDP grows ${dy}%. Using %ΔM + %ΔV = %ΔP + %ΔY, what is inflation?`,inf,[dm,dm+dv+dy,dm-dy,dm+dy,inf+1,inf-2,inf+3],[`%ΔP = %ΔM + %ΔV − %ΔY.`,`${dm} + ${dv} − ${dy} = ${inf}%.`],v=>v+"%")}},
 fisher:{label:"Real interest rate",u:"u9",f(){const n=R(3,12),i=R(1,8),r=n-i;
   return mc(`A bank loan charges ${n}% and expected inflation is ${i}%. What is the approximate real interest rate?`,r,[n+i,i,n,r+1,r-1,n*i/10+.5],[`Fisher: real ≈ nominal − expected inflation = ${n} − ${i} = ${r}%.`],v=>v+"%")}},
 rule70:{label:"Growth & the rule of 70",u:"u8",f(){const g=pick([1,1.4,2,2.5,3.5,5,7]),y=70/g;
   return mc(`Real GDP per person grows ${g}% a year. About how many years until living standards double?`,rd(y,1),[rd(g*70/100,1),rd(100/g,1),rd(72/g+5,1)],[`Rule of 70: doubling time ≈ 70 ÷ growth rate.`,`70 ÷ ${g} ≈ ${fmt(y,1)} years.`],v=>fmt(v,1)+" years")}},
 compadv:{label:"Comparative advantage",u:"u11",f(){let a1,a2,b1,b2;do{a1=R(2,12);a2=R(2,12);b1=R(2,12);b2=R(2,12)}while(Math.abs(a2/a1-b2/b1)<.15);const ocA=a2/a1,ocB=b2/b1,aComp=ocA<ocB;
   const S=aComp?"Mexico should specialize in shirts; Canada in wheat":"Canada should specialize in shirts; Mexico in wheat";
   return mc(`In one day a Mexican worker makes ${a1} shirts or ${a2} bushels of wheat. A Canadian worker makes ${b1} shirts or ${b2} bushels. Based on comparative advantage, how should they specialize?`,S,[aComp?"Canada should specialize in shirts; Mexico in wheat":"Mexico should specialize in shirts; Canada in wheat",`${a1>b1?"Mexico":"Canada"} should make both goods — it has the absolute advantage`,"Neither should trade — each should make both goods"],[`Opportunity cost of 1 shirt: Mexico ${fmt(ocA,2)} wheat; Canada ${fmt(ocB,2)} wheat.`,`Lower opportunity cost = comparative advantage. ${aComp?"Mexico":"Canada"} gives up less wheat per shirt, so it makes shirts; the other country makes wheat.`,`Absolute advantage (who makes more) does not decide specialization.`])}},
 fx:{label:"Exchange rates",u:"u12",f(){const r1=R(95,130)/100,r2=rd(r1*(1+R(-12,12)/100),2);if(r1===r2)return GEN.fx.f();
   if(Math.random()<.5){const eur=R(20,90)*1000;return mc(`€1 = $${r1}. A U.S. retailer imports German machinery priced at €${eur.toLocaleString()}. What does it cost in dollars?`,eur*r1,[eur/r1,eur,eur*r1*1.1],[`Dollars = euros × (dollars per euro) = ${eur.toLocaleString()} × ${r1} = ${m0(eur*r1)}.`],m0)}
   const ch=(r2-r1)/r1,euUp=r2>r1;return mc(`The exchange rate moves from €1 = $${r1} to €1 = $${r2}. What happened, and who benefits?`,euUp?"The euro appreciated — U.S. exporters to Europe benefit":"The dollar appreciated — U.S. importers and tourists benefit",[euUp?"The dollar appreciated — U.S. importers and tourists benefit":"The euro appreciated — U.S. exporters to Europe benefit",euUp?"The euro depreciated — European exporters benefit":"The dollar depreciated — U.S. exporters benefit","Nothing changed in real terms"],[`It takes ${euUp?"more":"fewer"} dollars to buy one euro (${pc(ch,1)} change).`,euUp?"A stronger euro / weaker dollar makes U.S. goods cheaper for Europeans, helping U.S. exporters and hurting U.S. importers.":"A stronger dollar makes imports and foreign travel cheaper for Americans but hurts U.S. exporters."])}},
 ppp:{label:"Purchasing power parity",u:"u12",f(){const us=R(450,650)/100,jp=R(350,750),act=R(110,160),ppp=jp/us;const under=ppp<act;
   return mc(`A Big Mac costs $${fmt(us,2)} in the U.S. and ¥${jp} in Japan. The actual rate is ¥${act} per $1. What PPP rate is implied, and what does it suggest about the yen?`,`¥${fmt(ppp,1)} per $1 — the yen is ${under?"undervalued":"overvalued"}`,[`¥${fmt(ppp,1)} per $1 — the yen is ${under?"overvalued":"undervalued"}`,`¥${fmt(us*jp/100,1)} per $1 — the yen is ${under?"undervalued":"overvalued"}`,`¥${fmt(act,1)} per $1 — the yen is fairly valued`],[`PPP rate = foreign price ÷ U.S. price = ${jp} ÷ ${fmt(us,2)} = ¥${fmt(ppp,1)} per $1.`,`Actual ¥${act} ${under?">":"<"} PPP ¥${fmt(ppp,1)}: a dollar buys ${under?"more":"fewer"} yen than PPP says, so the yen is ${under?"undervalued":"overvalued"}.`])}},
 tariff:{label:"Tariffs",u:"u11",f(){const w=R(10,40),t=R(2,8),q1=R(200,600),dq=R(40,150),qi=q1-dq,rev=t*qi;
   return mc(`The world price of steel is $${w}/ton. The U.S. adds a $${t}/ton tariff, which raises the domestic price to $${w+t} and cuts imports from ${q1} to ${qi} tons. How much tariff revenue does the government collect?`,rev,[t*q1,(w+t)*qi,t*dq],[`Revenue = tariff × imports after the tariff = $${t} × ${qi} = ${m0(rev)}.`,`Domestic producers gain, consumers lose more, and there is a deadweight loss from less trade.`],m0)}},
 nash:{label:"Nash equilibrium",u:"u6",f(){let p,ne;do{p=[[R(1,9),R(1,9)],[R(1,9),R(1,9)],[R(1,9),R(1,9)],[R(1,9),R(1,9)]];ne=[];for(let i=0;i<2;i++)for(let j=0;j<2;j++){const me=p[i*2+j][0],them=p[i*2+j][1];if(me>=p[(1-i)*2+j][0]&&them>=p[i*2+1-j][1])ne.push(i*2+j)}}while(ne.length!==1);
   const L=["Both keep prices high","Firm A high, Firm B cuts","Firm A cuts, Firm B high","Both cut prices"],cell=k=>`${L[k]}: A earns $${p[k][0]}M, B earns $${p[k][1]}M`;
   return mc(`Two airlines each choose High price or Cut price. Payoffs — ${[0,1,2,3].map(cell).join("; ")}. What is the Nash equilibrium?`,L[ne[0]],L.filter((_,k)=>k!==ne[0]),[`Check each cell: is either firm better off switching alone?`,`At “${L[ne[0]]}”, neither firm can do better by changing only its own choice, so it is the Nash equilibrium.`,`A Nash equilibrium need not be the outcome with the highest joint payoff (that is the prisoner's dilemma).`])}}
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
function askClaudeQ(q,mine){return claude(`I'm studying for WGU C211 (Global Economics for Managers) and got this practice question wrong.\n\nQuestion: ${q.q}\nOptions:\n${q.o.map((o,j)=>"ABCD"[j]+") "+o).join("\n")}\n${mine!=null?`My answer: ${"ABCD"[mine]}\n`:""}Correct answer: ${"ABCD"[q.a]}\n\nExplain step by step why the correct answer is right and why mine is wrong, in plain English for a beginner. Then give me one similar practice question.`)}
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
const LABS=[["sd","Supply, demand & policy","Shift the curves, add a price ceiling, floor or tax, and watch surplus and deadweight loss change."],["elas","Elasticity & revenue","Slide the price along a demand curve and see where revenue peaks and why."],["cost","Costs & profit maximization","See MC, ATC and AVC, the profit-maximizing output, and when a firm should shut down."],["adas","AD / AS & macro policy","Shift aggregate demand and supply to create recessions, booms and stagflation."],["trade","Comparative advantage & trade","Two countries, two goods: find who specializes and how trade puts both outside their PPF."],["fx","Exchange rates & trade","Move the euro–dollar rate and see who wins and who loses."]];
function axes(c,w,h,o){const L=o.l||56,Rr=o.r||16,T=o.t||14,B=o.b||28,X=x=>L+(x-o.x0)/(o.x1-o.x0)*(w-L-Rr),Y=y=>h-B-(y-o.y0)/(o.y1-o.y0)*(h-B-T);
  c.strokeStyle=col("line");c.lineWidth=1;c.fillStyle=col("muted");c.font="11px JetBrains Mono, monospace";
  (o.yt||[]).forEach(v=>{c.beginPath();c.moveTo(L,Y(v));c.lineTo(w-Rr,Y(v));c.stroke();c.textAlign="right";c.fillText(o.fy?o.fy(v):v,L-6,Y(v)+4)});
  (o.xt||[]).forEach(v=>{c.textAlign="center";c.fillText(o.fx?o.fx(v):v,X(v),h-B+16)});
  c.strokeStyle=col("muted");c.beginPath();c.moveTo(L,T);c.lineTo(L,h-B);c.lineTo(w-Rr,h-B);c.stroke();
  if(o.xl){c.textAlign="right";c.fillText(o.xl,w-Rr,h-B-6)}if(o.yl){c.textAlign="left";c.fillText(o.yl,L+6,T+10)}return{X,Y,L,Rr,T,B}}
const ticks=(a,b,n)=>{const s=(b-a)/n,out=[];for(let k=0;k<=n;k++)out.push(a+s*k);return out};
function poly(c,pts,fill){c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.fillStyle=fill;c.fill()}
function line(c,a,b,stroke,w,dash){c.strokeStyle=stroke;c.lineWidth=w||2.5;c.setLineDash(dash||[]);c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke();c.setLineDash([])}
function canvasFor(id,h){const cv=document.getElementById(id);if(!cv)return null;const dpr=window.devicePixelRatio||1,w=cv.parentElement.clientWidth;cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);cv.style.height=h+"px";const c=cv.getContext&&cv.getContext("2d");if(!c)return null;c.setTransform(dpr,0,0,dpr,0,0);c.font="12px JetBrains Mono, monospace";return{c,w,h,cv}}
function vLabs(){
  if(sub&&LABS.find(l=>l[0]===sub))return lab(sub);
  app.innerHTML=`<div class="stack"><div><span class="eyebrow">See the economy move</span><h1>Labs</h1><p class="muted" style="margin-top:6px">Six interactive economics simulators. Play with each one for five minutes and the formulas start to make sense.</p></div>
  <div class="grid">${LABS.map(l=>`<button class="card stack" style="gap:8px;text-align:left;cursor:pointer;font:inherit;color:inherit" data-lab="${l[0]}"><div class="row between"><h3>${l[1]}</h3>${S.labs[l[0]]?`<span class="chip good">tried</span>`:""}</div><p class="muted small">${l[2]}</p></button>`).join("")}</div></div>`;
  app.onclick=e=>{const b=e.target.closest("[data-lab]");if(b)go("labs",b.dataset.lab)};
}
function lab(id){
  const ls=[];const on=(t,f)=>{app.addEventListener(t,f);ls.push([t,f])};const L=LABS.find(l=>l[0]===id);if(!S.labs[id]){S.labs[id]=1;addXP(10)}
  const shell=(ctl,note,extra)=>`<div class="stack lab"><div class="row"><button class="btn sm ghost" data-back>← Labs</button></div><div><span class="eyebrow">Lab</span><h1>${L[1]}</h1><p class="muted" style="margin-top:6px">${L[2]}</p></div><canvas id="cv" role="img" aria-label="${L[1]} chart"></canvas>${extra||""}<div class="ctl">${ctl}</div><dl class="out" id="out"></dl>${note?`<div class="card small">${note}</div>`:""}</div>`;
  const outp=rows=>{const o=$("#out");if(o)o.innerHTML=rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")};
  const rng=(id,label,min,max,step,val,unit)=>`<div class="field"><label for="${id}">${label}: <span class="num" id="${id}v">${val}${unit||""}</span></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-unit="${unit||""}"></div>`;
  const num=(id,label,val)=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="number" value="${val}"></div>`;
  const g$=id=>+$("#"+id).value;
  let redraw=()=>{};
  if(id==="sd"){
    app.innerHTML=shell(rng("ad","Demand level (shift)",60,140,1,100)+rng("as","Supply level (shift)",0,60,1,20)+`<div class="field"><label for="pol">Policy</label><select id="pol"><option value="none">None (free market)</option><option value="ceil">Price ceiling</option><option value="floor">Price floor</option><option value="tax">Per-unit tax</option></select></div>`+rng("pv","Ceiling / floor price or tax",1,120,1,45),"Shaded light area = consumer surplus, gold = producer surplus, pink-red = deadweight loss. Demand is the dark line and supply is orange (trades that would help both sides but no longer happen). A ceiling below equilibrium causes a shortage, and a floor above it causes a surplus. With a tax, buyers pay more, sellers keep less, and the less elastic side bears more of the burden.");
    redraw=()=>{const Ad=g$("ad"),As=g$("as"),sd=1,ss=1,pol=$("#pol").value,v=g$("pv");if(Ad<=As+2)return outp([["note","Demand must start above supply — raise demand or lower supply."]]);
      const Qe=(Ad-As)/(sd+ss),Pe=Ad-sd*Qe,Pd=q=>Ad-sd*q,Ps=q=>As+ss*q;let Qt=Qe,pb=Pe,ps=Pe,msg="Market clears: no shortage or surplus.",rev=0,binding=true;
      if(pol==="ceil"){if(v<Pe){Qt=Math.max(0,(v-As)/ss);pb=ps=v;msg=`Shortage of ${fmt((Ad-v)/sd-Qt,1)} units (buyers want ${fmt((Ad-v)/sd,1)}, sellers offer ${fmt(Qt,1)}).`}else{binding=false;msg="Ceiling is above equilibrium — not binding, no effect."}}
      if(pol==="floor"){if(v>Pe){Qt=Math.max(0,(Ad-v)/sd);pb=ps=v;msg=`Surplus of ${fmt((v-As)/ss-Qt,1)} units (sellers offer ${fmt((v-As)/ss,1)}, buyers want ${fmt(Qt,1)}).`}else{binding=false;msg="Floor is below equilibrium — not binding, no effect."}}
      if(pol==="tax"){const t=Math.min(v,Ad-As-1);Qt=(Ad-As-t)/(sd+ss);pb=Ad-sd*Qt;ps=pb-t;rev=t*Qt;msg=`Buyers pay $${fmt(pb,2)} (+${fmt(pb-Pe,2)}), sellers keep $${fmt(ps,2)} (−${fmt(Pe-ps,2)}).`}
      const CS=Qt*(Ad-pb)-sd*Qt*Qt/2,PS=Qt*(ps-As)-ss*Qt*Qt/2,TS0=(Ad-As)*Qe/2,DWL=Math.max(0,TS0-CS-PS-rev);
      const g=canvasFor("cv",320);if(g){const{c,w,h}=g,qmax=Math.max(80,Ad/sd)*1.02,pmax=Math.max(Ad,As+ss*qmax*.75)*1.05,A=(c.clearRect(0,0,w,h),axes(c,w,h,{x0:0,x1:qmax,y0:0,y1:pmax,yt:ticks(0,pmax,4),fy:v=>"$"+fmt(v,0),xt:ticks(0,qmax,4),fx:v=>fmt(v,0),xl:"Quantity",yl:"Price"})),P=(q,p)=>[A.X(q),A.Y(p)];
        poly(c,[P(0,Ad),P(Qt,Pd(Qt)),P(Qt,pb),P(0,pb)],col("soft"));poly(c,[P(0,ps),P(Qt,ps),P(Qt,Ps(Qt)),P(0,As)],col("hi"));if(DWL>.01)poly(c,[P(Qt,Pd(Qt)),P(Qe,Pe),P(Qt,Ps(Qt))],col("bad-soft"));
        if(pol==="tax")poly(c,[P(0,pb),P(Qt,pb),P(Qt,ps),P(0,ps)],col("warn-soft"));
        line(c,P(0,Ad),P(Ad/sd,0),col("accent"),3);line(c,P(0,As),P(qmax,Ps(qmax)),col("warn"),3);
        if(pol==="tax")line(c,P(0,As+Math.min(v,Ad-As-1)),P(qmax,Ps(qmax)+Math.min(v,Ad-As-1)),col("warn"),2,[6,4]);
        if((pol==="ceil"||pol==="floor")&&binding)line(c,P(0,v),P(qmax,v),col("ink"),2,[4,3]);
        c.beginPath();c.arc(A.X(Qe),A.Y(Pe),5,0,7);c.fillStyle=col("ink");c.fill();c.fillStyle=col("muted");c.textAlign="left";c.fillText("D",A.X(Ad/sd*.92),A.Y(Pd(Ad/sd*.92))-8);c.fillText("S",A.X(qmax*.92),A.Y(Ps(qmax*.92))-8)}
      outp([["free-market equilibrium",`P = $${fmt(Pe,2)}, Q = ${fmt(Qe,1)}`],["result",msg],["consumer surplus",m0(CS)],["producer surplus",m0(PS)]].concat(pol==="tax"?[["tax revenue",m0(rev)]]:[]).concat([["deadweight loss",m0(DWL)]]))};
  }
  if(id==="elas"){
    app.innerHTML=shell(rng("p","Price",1,99,1,70,""),"On a straight-line demand curve, elasticity changes along the line: elastic at high prices and inelastic at low prices. Revenue peaks where |E| = 1 (the midpoint). If demand is elastic, cut price to raise revenue; if it is inelastic, raise price.",`<canvas id="cv2" role="img" aria-label="Total revenue curve"></canvas>`);
    redraw=()=>{const a=100,p=g$("p"),q=a-p,e=p/q,tr=p*q;$("#pv").textContent="$"+p;
      const g=canvasFor("cv",240);if(g){const{c,w,h}=g,A=(c.clearRect(0,0,w,h),axes(c,w,h,{x0:0,x1:100,y0:0,y1:100,yt:[0,25,50,75,100],fy:v=>"$"+v,xt:[0,25,50,75,100],xl:"Quantity",yl:"Price"}));
        poly(c,[[A.X(0),A.Y(0)],[A.X(q),A.Y(0)],[A.X(q),A.Y(p)],[A.X(0),A.Y(p)]],col("hi"));line(c,[A.X(0),A.Y(100)],[A.X(100),A.Y(0)],col("accent"),3);
        c.fillStyle=col("muted");c.textAlign="left";c.fillText("elastic",A.X(12),A.Y(80));c.fillText("unit (|E| = 1)",A.X(52),A.Y(52));c.fillText("inelastic",A.X(78),A.Y(16));c.beginPath();c.arc(A.X(q),A.Y(p),7,0,7);c.fillStyle=col("ink");c.fill()}
      const g2=canvasFor("cv2",180);if(g2){const{c,w,h}=g2,A=(c.clearRect(0,0,w,h),axes(c,w,h,{x0:0,x1:100,y0:0,y1:2600,yt:[0,1250,2500],fy:v=>"$"+fmt(v,0),xt:[0,25,50,75,100],fx:v=>"$"+v,xl:"Price",yl:"Total revenue"}));
        c.strokeStyle=col("accent");c.lineWidth=3;c.beginPath();for(let x=0;x<=100;x++){const y=A.Y(x*(a-x));x?c.lineTo(A.X(x),y):c.moveTo(A.X(x),y)}c.stroke();c.beginPath();c.arc(A.X(p),A.Y(tr),7,0,7);c.fillStyle=col("hi");c.fill();c.strokeStyle=col("ink");c.lineWidth=1.5;c.stroke()}
      outp([["quantity demanded",q],["price elasticity |E|",fmt(e,2)+(e>1.001?" → elastic":e<.999?" → inelastic":" → unit elastic")],["total revenue",m0(tr)],["to raise revenue",e>1.001?"cut the price":e<.999?"raise the price":"you're at the maximum"]])};
  }
  if(id==="cost"){
    app.innerHTML=shell(rng("pr","Market price",5,80,1,35,"")+rng("fc","Fixed cost",0,800,10,300,""),"Firms produce where price (MR) = MC on the rising part of MC. Profit = (P − ATC) × Q: the green box is profit and the red box is a loss. MC crosses AVC and ATC at their minimums. If price drops below minimum AVC ($17.50 here), the firm should shut down in the short run.");
    const MC=q=>40-6*q+.3*q*q,AVC=q=>40-3*q+.1*q*q;
    redraw=()=>{const P=g$("pr"),F=g$("fc"),ATC=q=>AVC(q)+F/q;$("#prv").textContent="$"+P;$("#fcv").textContent="$"+F;let Q=0;const disc=36-1.2*(40-P);if(disc>=0){Q=(6+Math.sqrt(disc))/.6}const shut=P<17.5;if(shut)Q=0;
      const profit=Q?P*Q-(F+Q*AVC(Q)):-F;
      const g=canvasFor("cv",320);if(g){const{c,w,h}=g,A=(c.clearRect(0,0,w,h),axes(c,w,h,{x0:0,x1:40,y0:0,y1:90,yt:[0,20,40,60,80],fy:v=>"$"+v,xt:[0,10,20,30,40],xl:"Output",yl:"$ per unit"}));
        if(Q>0)poly(c,[[A.X(0),A.Y(P)],[A.X(Q),A.Y(P)],[A.X(Q),A.Y(ATC(Q))],[A.X(0),A.Y(ATC(Q))]],profit>=0?col("good-soft"):col("bad-soft"));
        const curve=(f,s,dash)=>{c.strokeStyle=s;c.lineWidth=2.5;c.setLineDash(dash||[]);c.beginPath();let st=false;for(let q=1;q<=40;q+=.25){const y=f(q);if(y>90||y<0){st=false;continue}st?c.lineTo(A.X(q),A.Y(y)):c.moveTo(A.X(q),A.Y(y));st=true}c.stroke();c.setLineDash([])};
        curve(MC,col("warn"));curve(ATC,col("accent"));curve(AVC,col("muted"),[6,4]);line(c,[A.X(0),A.Y(P)],[A.X(40),A.Y(P)],col("ink"),2,[3,3]);
        c.fillStyle=col("muted");c.textAlign="left";c.fillText("MC",A.X(37),A.Y(Math.min(88,MC(37)))+14);c.fillText("ATC",A.X(36),A.Y(ATC(36))-6);c.fillText("AVC",A.X(36),A.Y(AVC(36))+14);c.fillText("P = MR",A.X(1),A.Y(P)-6)}
      outp([["profit-maximizing output",shut?"0 — shut down (P < min AVC $17.50)":fmt(Q,1)+" units (where P = MC)"],["ATC at that output",Q?m2(ATC(Q)):"—"],["profit / loss",(profit<0?"−":"")+m0(Math.abs(profit))],["decision",shut?"Shut down: loss is limited to fixed cost":profit>=0?"Produce: economic profit":"Produce in the short run: P > AVC covers part of fixed cost"]])};
  }
  if(id==="adas"){
    app.innerHTML=shell(`<div class="field"><label for="pre">Scenario</label><select id="pre"><option value="0,0">Long-run equilibrium</option><option value="-20,0">Recession: consumer confidence collapses</option><option value="20,0">Boom: big stimulus</option><option value="0,20">Oil price shock (stagflation)</option><option value="0,-15">Productivity boom</option></select></div>`+rng("da","AD shift",-30,30,1,0,"")+rng("ds","SRAS shift (up = higher costs)",-30,30,1,0,""),"Dark line = AD, orange = SRAS, black dashed = LRAS (full-employment output). Output left of LRAS is a recessionary gap: use expansionary monetary or fiscal policy. Output right of it is an inflationary gap: use contractionary policy. An SRAS shock raises prices and cuts output at the same time (stagflation), which is a policy dilemma.");
    redraw=()=>{const da=g$("da"),ds=g$("ds"),adI=150+da,asI=50+ds,Y=adI-asI,P=adI-.5*Y,Yf=100;const g=canvasFor("cv",320);
      if(g){const{c,w,h}=g,A=(c.clearRect(0,0,w,h),axes(c,w,h,{x0:40,x1:160,y0:40,y1:160,yt:[60,100,140],xt:[60,100,140],xl:"Real GDP",yl:"Price level"})),Q=(y,p)=>[A.X(y),A.Y(p)];
        line(c,Q(40,150+da-20),Q(160,150+da-80),col("accent"),3);line(c,Q(40,50+ds+20),Q(160,50+ds+80),col("warn"),3);line(c,Q(Yf,40),Q(Yf,160),col("ink"),2,[6,4]);
        line(c,Q(40,150-20),Q(160,150-80),col("muted"),1.5,[3,4]);line(c,Q(40,50+20),Q(160,50+80),col("muted"),1.5,[3,4]);
        c.beginPath();c.arc(A.X(Y),A.Y(P),7,0,7);c.fillStyle=col("hi");c.fill();c.strokeStyle=col("ink");c.lineWidth=1.5;c.stroke();
        c.fillStyle=col("muted");c.textAlign="left";c.fillText("AD",A.X(148),A.Y(150+da-74)-6);c.fillText("SRAS",A.X(146),A.Y(50+ds+73)-6);c.fillText("LRAS",A.X(Yf)+6,A.Y(155))}
      const gap=Y<Yf-.5?"Recessionary gap (unemployment above natural rate)":Y>Yf+.5?"Inflationary gap (output above potential)":"At full employment";const stag=P>100.5&&Y<99.5;
      outp([["real GDP",fmt(Y,1)+" (potential 100)"],["price level",fmt(P,1)+" (was 100)"],["situation",stag?"Stagflation — higher prices and lower output":gap],["policy response",Y<Yf-.5?(stag?"Dilemma: stimulus fixes output but worsens inflation":"Expansionary: cut rates / buy bonds, or raise G / cut taxes"):Y>Yf+.5?"Contractionary: raise rates / sell bonds, or cut G / raise taxes":"No action needed"]])};
    on("change",e=>{if(e.target.id==="pre"){const[a,b]=e.target.value.split(",");$("#da").value=a;$("#ds").value=b;$("#dav").textContent=a;$("#dsv").textContent=b;redraw()}});
  }
  if(id==="trade"){
    app.innerHTML=shell(num("a1","Country A: max shirts",100)+num("a2","Country A: max wheat",50)+num("b1","Country B: max shirts",40)+num("b2","Country B: max wheat",80)+rng("tot","Terms of trade (wheat per shirt)",.05,3,.05,1,"")+rng("tq","Shirts traded",0,100,1,40,""),"Each line is a country's production possibilities frontier (PPF). Each country specializes in the good with the lower opportunity cost. If the trade price falls between the two opportunity costs, both countries consume at points beyond their own PPF. Those dots are the gains from trade.");
    redraw=()=>{const a1=g$("a1"),a2=g$("a2"),b1=g$("b1"),b2=g$("b2"),t=g$("tot"),T=g$("tq");$("#totv").textContent=fmt(t,2);if(!(a1>0&&a2>0&&b1>0&&b2>0))return;
      const ocA=a2/a1,ocB=b2/b1,aShirts=ocA<ocB;const lo=Math.min(ocA,ocB),hi=Math.max(ocA,ocB);
      let cA,cB;if(aShirts){cA=[a1-T,t*T];cB=[T,b2-t*T]}else{cB=[b1-T,t*T];cA=[T,a2-t*T]}
      const inA=(x,y)=>x/a1+y/a2,inB=(x,y)=>x/b1+y/b2;
      const g=canvasFor("cv",320);if(g){const{c,w,h}=g,mx=Math.max(a1,b1)*1.1,my=Math.max(a2,b2,cA[1],cB[1])*1.1,A=(c.clearRect(0,0,w,h),axes(c,w,h,{x0:0,x1:mx,y0:0,y1:my,yt:ticks(0,my,4),fy:v=>fmt(v,0),xt:ticks(0,mx,4),fx:v=>fmt(v,0),xl:"Shirts",yl:"Wheat"}));
        line(c,[A.X(0),A.Y(a2)],[A.X(a1),A.Y(0)],col("accent"),3);line(c,[A.X(0),A.Y(b2)],[A.X(b1),A.Y(0)],col("warn"),3);
        [[cA,col("accent"),"A trades"],[cB,col("warn"),"B trades"]].forEach(([p,s,l])=>{if(p[0]<0||p[1]<0)return;c.beginPath();c.arc(A.X(p[0]),A.Y(p[1]),7,0,7);c.fillStyle=s;c.fill();c.strokeStyle=col("ink");c.lineWidth=1.5;c.stroke();c.fillStyle=col("ink");c.textAlign="left";c.fillText(l,A.X(p[0])+9,A.Y(p[1])-6)})}
      const ok=t>lo&&t<hi&&Math.abs(ocA-ocB)>1e-9;
      outp([["opportunity cost of 1 shirt",`A: ${fmt(ocA,2)} wheat · B: ${fmt(ocB,2)} wheat`],["specialize",Math.abs(ocA-ocB)<1e-9?"No gains — same opportunity costs":`${aShirts?"A":"B"} makes shirts, ${aShirts?"B":"A"} makes wheat`],["mutually beneficial terms",`between ${fmt(lo,2)} and ${fmt(hi,2)} wheat per shirt`],["A consumes",`${fmt(cA[0],1)} shirts, ${fmt(cA[1],1)} wheat ${inA(cA[0],cA[1])>1.0001?"(beyond its PPF ✓)":"(not beyond its PPF)"}`],["B consumes",`${fmt(cB[0],1)} shirts, ${fmt(cB[1],1)} wheat ${inB(cB[0],cB[1])>1.0001?"(beyond its PPF ✓)":"(not beyond its PPF)"}`],["verdict",ok?"Both countries gain from trade":"These terms don't help both — move the terms of trade into the range"]])};
  }
  if(id==="fx"){
    app.innerHTML=shell(rng("r","Exchange rate: $ per €1",.7,1.6,.01,1.1,"")+num("us","U.S. product price ($)",40000)+num("eu","European product price (€)",35000),"Gray bars show prices at the starting rate of $1.10. When the dollar weakens (more $ per €), U.S. goods get cheaper in Europe, which helps U.S. exporters. European goods get pricier in the U.S., which hurts U.S. importers and travelers. A stronger dollar does the opposite.");
    redraw=()=>{const r=g$("r"),us=g$("us"),eu=g$("eu"),b=1.1;$("#rv").textContent="$"+r.toFixed(2);const usInEur=us/r,euInUsd=eu*r,usB=us/b,euB=eu*b;
      const g=canvasFor("cv",280);if(g){const{c,w,h}=g,mx=Math.max(usInEur,usB,euInUsd,euB)*1.15,A=(c.clearRect(0,0,w,h),axes(c,w,h,{x0:0,x1:4,y0:0,y1:mx,yt:ticks(0,mx,4),fy:v=>fmt(v/1000,0)+"K",xt:[],b:36}));
        const bars=[["US car €, before",usB,col("muted")],["US car €, now",usInEur,col("accent")],["EU car $, before",euB,col("muted")],["EU car $, now",euInUsd,col("warn")]];const bw=(A.X(1)-A.X(0))*.6;
        bars.forEach(([l,v,s],k)=>{const x=A.X(k+.5)-bw/2;c.fillStyle=s;c.fillRect(x,A.Y(v),bw,A.Y(0)-A.Y(v));c.fillStyle=col("ink");c.textAlign="center";c.font=(w<500?"9px":"11px")+" JetBrains Mono, monospace";const pr=l.split(", ");c.fillText(pr[0],A.X(k+.5),h-16);c.fillText(pr[1],A.X(k+.5),h-4)})}
      const weak=r>b+.001,strong=r<b-.001;
      outp([["U.S. product in Europe",`€${fmt(usInEur,0)} (${fmt((usInEur/usB-1)*100,1)}%)`],["European product in the U.S.",`$${fmt(euInUsd,0)} (${fmt((euInUsd/euB-1)*100,1)}%)`],["dollar is",weak?"weaker (depreciated)":strong?"stronger (appreciated)":"unchanged"],["winners",weak?"U.S. exporters, European tourists in the U.S., U.S. firms with euro earnings":strong?"U.S. importers, U.S. tourists in Europe, U.S. consumers":"—"],["losers",weak?"U.S. importers, U.S. tourists in Europe":strong?"U.S. exporters, U.S. firms converting euro revenue":"—"]])};
  }
  on("click",e=>{if(e.target.closest("[data-back]"))go("labs")});
  const onIn=e=>{if(e.target.matches("input,select")&&e.target.id!=="pre"){if(e.target.type==="range"){const s=$("#"+e.target.id+"v");if(s)s.textContent=e.target.value+(e.target.dataset.unit||"")}redraw()}};on("input",onIn);on("change",onIn);
  const onR=()=>redraw();window.addEventListener("resize",onR);
  redraw();
  cleanup=()=>{window.removeEventListener("resize",onR);ls.forEach(([t,f])=>app.removeEventListener(t,f))};
}
function qnorm(p){/* Acklam inverse normal */const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.357751867269,-30.66479806614716,2.506628277459239],b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572],c=[-.007784894002430293,-.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783],d=[.007784695709041462,.3224671290700398,2.445134137142996,3.754408661907416];const pl=.02425;let q,r;if(p<pl){q=Math.sqrt(-2*Math.log(p));return(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}if(p<=1-pl){q=p-.5;r=q*q;return(((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)}q=Math.sqrt(-2*Math.log(1-p));return-(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}

/* ================= GAMES ================= */
const SORTS={
 shift:{t:"Shift in demand or movement along it?",b:["Demand curve shifts","Movement along the curve"],i:[["Consumers' incomes rise",0],["A substitute's price rises",0],["A celebrity makes the product trendy",0],["Buyers expect prices to rise next month",0],["More consumers move into the market",0],["The product's own price falls",1],["The firm raises its own price 10%",1],["A sale lowers this item's price",1]]},
 mkt:{t:"Market structure",b:["Perfect competition","Monopolistic competition","Oligopoly","Monopoly"],i:[["Wheat farmers selling an identical crop",0],["Many sellers, price takers, free entry",0],["Local restaurants with different menus",1],["Hair salons competing on style and brand",1],["Three big wireless carriers watching each other's prices",2],["Commercial aircraft makers (Boeing and Airbus)",2],["The only water utility in a city",3],["A drug protected by a patent with no substitute",3]]},
 unemp:{t:"Type of unemployment",b:["Frictional","Structural","Cyclical","Seasonal"],i:[["A new graduate searching for her first job",0],["A worker who quit to look for a better position",0],["Coal miners whose skills no longer match open jobs",1],["Typists replaced by software",1],["Factory layoffs during a recession",2],["Construction jobs lost when the economy contracts",2],["Ski instructors out of work in summer",3],["Lifeguards in winter",3]]},
 pol:{t:"Which policy?",b:["Expansionary monetary","Contractionary monetary","Expansionary fiscal","Contractionary fiscal"],i:[["The Fed buys government bonds",0],["The Fed lowers the federal funds rate target",0],["The Fed cuts the discount rate",0],["The Fed sells government bonds",1],["The Fed raises interest on reserves",1],["Congress cuts income taxes",2],["Government builds new highways",2],["Congress raises taxes",3],["Government cuts spending to shrink the deficit",3]]},
 gdp:{t:"Where does it go in GDP?",b:["Consumption (C)","Investment (I)","Government (G)","Net exports (NX)","Not counted"],i:[["A family buys groceries",0],["You pay for a haircut",0],["A firm buys new factory equipment",1],["A newly built house is purchased",1],["Business inventory increases",1],["The state pays teachers' salaries",2],["The Army buys new trucks",2],["Boeing sells jets to a foreign airline",3],["Social Security payments",4],["Buying a used car from a neighbor",4],["Buying shares of stock",4]]},
 ext:{t:"Market failure type",b:["Negative externality","Positive externality","Public good","Asymmetric information"],i:[["A factory pollutes a river downstream",0],["Secondhand smoke",0],["Your neighbor's flu vaccine lowers your risk",1],["Education benefits society beyond the student",1],["National defense",2],["A lighthouse",2],["A used-car seller knows the car is a lemon",3],["People with insurance take more risks (moral hazard)",3]]},
 fx:{t:"A stronger U.S. dollar helps or hurts?",b:["Helped","Hurt"],i:[["U.S. tourists traveling in Europe",0],["U.S. retailers importing goods from China",0],["U.S. consumers buying imported cars",0],["U.S. firms that export to Europe",1],["European tourists visiting the U.S.",1],["A U.S. company converting euro sales back to dollars",1],["U.S. farmers selling crops abroad",1]]},
 elas:{t:"Demand elastic or inelastic?",b:["Elastic","Inelastic"],i:[["One brand of cereal among many",0],["Luxury vacations",0],["Restaurant meals",0],["A specific brand of gasoline at one station",0],["Insulin",1],["Gasoline overall in the short run",1],["Salt",1],["Cigarettes for addicted smokers",1]]}
};
function vGames(){
  if(sub&&sub.game==="match")return match(sub.unit||"mix");
  if(sub&&sub.game==="blitz")return blitz(sub.unit||"all");
  if(sub&&sub.game==="sort")return sortGame(sub.set||"shift");
  app.innerHTML=`<div class="stack"><div><span class="eyebrow">Memory games</span><h1>Games</h1></div>
  <div class="grid">
   <div class="card stack" style="gap:10px"><h3>Sort It</h3><p class="muted small">Classify scenarios fast: demand shifts, market structures, unemployment types, monetary vs fiscal policy, GDP components, market failures, the strong dollar, elasticity.</p><select id="gs" aria-label="Set">${Object.entries(SORTS).map(([k,v])=>`<option value="${k}">${v.t}${S.best["sort_"+k]?` (best ${S.best["sort_"+k]}%)`:""}</option>`).join("")}</select><button class="btn primary" data-g="sort">Play Sort It</button></div>
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
const FORMULAS=[["Opportunity cost","value of the next-best alternative given up"],["Profit","Total revenue − total cost"],["Economic profit","Accounting profit − implicit costs"],["Price elasticity (midpoint)","[ΔQ ÷ avg Q] ÷ [ΔP ÷ avg P]"],["Elasticity rule","|E| > 1 elastic · < 1 inelastic · = 1 unit"],["Total revenue","TR = P × Q"],["Cross elasticity","%ΔQx ÷ %ΔPy: + substitutes, − complements"],["Income elasticity","%ΔQ ÷ %ΔIncome: < 0 inferior, 0–1 necessity, > 1 luxury"],["Equilibrium","Qd = Qs"],["Consumer surplus","½ × Q × (max price − P)"],["Deadweight loss","½ × ΔQ × wedge"],["Marginal cost","ΔTC ÷ ΔQ"],["ATC · AVC · AFC","TC ÷ Q · VC ÷ Q · FC ÷ Q"],["Profit max","produce where MR = MC"],["Shutdown rule","shut down if P < min AVC"],["Perfect competition","P = MR = MC; long-run P = min ATC"],["GDP","C + I + G + (X − M)"],["Real GDP","Nominal GDP ÷ (deflator ÷ 100)"],["Inflation rate","(CPI₂ − CPI₁) ÷ CPI₁ × 100"],["Unemployment rate","Unemployed ÷ labor force × 100"],["Labor force","Employed + unemployed (looking)"],["Participation rate","Labor force ÷ adult population"],["Rule of 70","doubling time ≈ 70 ÷ growth %"],["Spending multiplier","1 ÷ (1 − MPC) = 1 ÷ MPS"],["Tax multiplier","−MPC ÷ (1 − MPC)"],["Money multiplier","1 ÷ reserve requirement"],["Quantity theory","MV = PY → %ΔM + %ΔV = %ΔP + %ΔY"],["Fisher","real rate ≈ nominal − inflation"],["Comparative advantage","lowest opportunity cost producer"],["Terms of trade","between the two countries' opportunity costs"],["Tariff revenue","tariff per unit × imports"],["Exchange rate","$ cost = foreign price × ($ per unit of foreign)"],["PPP rate","foreign price ÷ domestic price of same basket"],["Balance of payments","current account + financial/capital account = 0"]];
function vCram(){
  app.innerHTML=`<div class="stack"><div class="row between"><div><span class="eyebrow">The night before</span><h1>Cram sheet &amp; tools</h1></div><div class="row noprint"><button class="btn primary" data-pod>▶ Podcast mode (all units)</button><button class="btn" data-print>Print / save PDF</button></div></div>
  <p class="muted noprint">Podcast mode reads every unit's memory hook, key points and exam traps aloud in order. Good for the car or the gym.</p>
  <h2>Formula sheet</h2><div class="formula">${FORMULAS.map(([n,f])=>`<div><b>${esc(n)}</b><div class="f">${esc(f)}</div></div>`).join("")}</div>
  <h2>Must-know by unit</h2><div class="grid">${U.map(u=>`<div class="card stack" style="gap:8px"><span class="eyebrow">Unit ${u.id.slice(1)}</span><h3>${esc(u.title)}</h3>${u.mnemonic?`<p><span class="mark"><strong>${esc(u.mnemonic)}</strong></span></p>`:""}<ul style="margin:0;padding-left:1.1em" class="small">${(u.cram.length?u.cram:u.keyPoints.slice(0,6)).map(c=>`<li>${esc(c)}</li>`).join("")}</ul>${u.traps.length?`<p class="small" style="color:var(--bad)"><strong>Traps:</strong> ${esc(u.traps.slice(0,3).map(t=>t.replace(/^Trap:\s*/,"")).join(" · "))}</p>`:""}</div>`).join("")}</div>
  <div class="noprint stack"><h2>Calculators</h2>
  <section class="card stack" style="gap:10px"><h3>Elasticity (midpoint)</h3><div class="ctl"><div class="field"><label for="ep1">Price 1</label><input id="ep1" type="number" value="10"></div><div class="field"><label for="ep2">Price 2</label><input id="ep2" type="number" value="12"></div><div class="field"><label for="eq1">Quantity 1</label><input id="eq1" type="number" value="500"></div><div class="field"><label for="eq2">Quantity 2</label><input id="eq2" type="number" value="400"></div><button class="btn primary" data-c="el">Calculate</button></div><dl class="out" id="elo"></dl></section>
  <section class="card stack" style="gap:10px"><h3>Equilibrium solver</h3><p class="muted small">Qd = a − bP and Qs = c + dP. Add a ceiling, floor or per-unit tax if you like.</p><div class="ctl"><div class="field"><label for="qa">a</label><input id="qa" type="number" value="200"></div><div class="field"><label for="qb">b</label><input id="qb" type="number" value="4"></div><div class="field"><label for="qc">c</label><input id="qc" type="number" value="20"></div><div class="field"><label for="qd2">d</label><input id="qd2" type="number" value="2"></div><div class="field"><label for="qp">Policy</label><select id="qp"><option value="none">None</option><option value="ceil">Price ceiling</option><option value="floor">Price floor</option><option value="tax">Per-unit tax</option></select></div><div class="field"><label for="qv">Policy value</label><input id="qv" type="number" value="25"></div><button class="btn primary" data-c="eq">Solve</button></div><dl class="out" id="eqo"></dl></section>
  <section class="card stack" style="gap:10px"><h3>Macro: GDP, inflation, unemployment</h3><div class="ctl"><div class="field"><label for="gC">C</label><input id="gC" type="number" value="14000"></div><div class="field"><label for="gI">I</label><input id="gI" type="number" value="3500"></div><div class="field"><label for="gG">G</label><input id="gG" type="number" value="4000"></div><div class="field"><label for="gX">Exports</label><input id="gX" type="number" value="2500"></div><div class="field"><label for="gM">Imports</label><input id="gM" type="number" value="3100"></div><div class="field"><label for="gD">GDP deflator</label><input id="gD" type="number" value="118"></div><div class="field"><label for="c1">CPI last year</label><input id="c1" type="number" value="296.8"></div><div class="field"><label for="c2">CPI this year</label><input id="c2" type="number" value="306.1"></div><div class="field"><label for="uE">Employed (M)</label><input id="uE" type="number" value="160"></div><div class="field"><label for="uU">Unemployed (M)</label><input id="uU" type="number" value="7"></div><div class="field"><label for="uN">Not in labor force (M)</label><input id="uN" type="number" value="100"></div><button class="btn primary" data-c="mac">Calculate</button></div><dl class="out" id="maco"></dl></section>
  <section class="card stack" style="gap:10px"><h3>Multipliers</h3><div class="ctl"><div class="field"><label for="mpc">MPC</label><input id="mpc" type="number" value="0.8" step="0.05"></div><div class="field"><label for="dG">Change in spending ($B)</label><input id="dG" type="number" value="100"></div><div class="field"><label for="dT">Change in taxes ($B)</label><input id="dT" type="number" value="0"></div><div class="field"><label for="rr">Reserve requirement %</label><input id="rr" type="number" value="10"></div><div class="field"><label for="dep">New deposit ($)</label><input id="dep" type="number" value="10000"></div><button class="btn primary" data-c="mu">Calculate</button></div><dl class="out" id="muo"></dl></section>
  <section class="card stack" style="gap:10px"><h3>Exchange rates &amp; PPP</h3><div class="ctl"><div class="field"><label for="xr">$ per 1 unit of foreign currency</label><input id="xr" type="number" value="1.08" step="0.01"></div><div class="field"><label for="xa">Amount in foreign currency</label><input id="xa" type="number" value="500"></div><div class="field"><label for="xr2">New $ per foreign unit</label><input id="xr2" type="number" value="1.15" step="0.01"></div><div class="field"><label for="pu">Same item: U.S. price ($)</label><input id="pu" type="number" value="5.69"></div><div class="field"><label for="pf">Same item: foreign price</label><input id="pf" type="number" value="4.95"></div><button class="btn primary" data-c="fx">Calculate</button></div><dl class="out" id="fxo"></dl></section></div></div>`;
  const out=(id,rows)=>{$(id).innerHTML=rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")};
  const v=id=>+$("#"+id).value;
  function calc(c){
    if(c==="el"){const p1=v("ep1"),p2=v("ep2"),q1=v("eq1"),q2=v("eq2");if(p1===p2)return out("#elo",[["Error","Prices must differ."]]);const e=Math.abs(((q2-q1)/((q1+q2)/2))/((p2-p1)/((p1+p2)/2)));
      out("#elo",[["|E|",fmt(e,3)],["type",e>1.0001?"elastic":e<.9999?"inelastic":"unit elastic"],["revenue",`${m2(p1*q1)} → ${m2(p2*q2)}`],["advice",e>1?"Price and revenue move opposite: cutting price raises revenue":"Price and revenue move together: raising price raises revenue"]])}
    if(c==="eq"){const a=v("qa"),b=v("qb"),cc=v("qc"),d=v("qd2"),pol=$("#qp").value,pv=v("qv");if(b+d<=0)return out("#eqo",[["Error","b + d must be positive."]]);const P=(a-cc)/(b+d),Q=a-b*P,rows=[["equilibrium",`P = $${fmt(P,2)}, Q = ${fmt(Q,2)}`]];
      if(pol==="ceil"||pol==="floor"){const qd=a-b*pv,qs=cc+d*pv;const bind=pol==="ceil"?pv<P:pv>P;rows.push(["at $"+pv,`Qd = ${fmt(qd,2)}, Qs = ${fmt(qs,2)}`],["result",!bind?"Not binding":pol==="ceil"?`Shortage of ${fmt(qd-qs,2)}`:`Surplus of ${fmt(qs-qd,2)}`])}
      if(pol==="tax"){const pb=(a-cc+d*pv)/(b+d),ps=pb-pv,qt=a-b*pb;rows.push(["buyers pay",`$${fmt(pb,2)} (+${fmt(pb-P,2)})`],["sellers keep",`$${fmt(ps,2)} (−${fmt(P-ps,2)})`],["quantity",fmt(qt,2)],["tax revenue",m2(pv*qt)],["deadweight loss",m2(.5*pv*(Q-qt))])}
      out("#eqo",rows)}
    if(c==="mac"){const gdp=v("gC")+v("gI")+v("gG")+v("gX")-v("gM"),lf=v("uE")+v("uU");out("#maco",[["nominal GDP",fmt(gdp,0)],["real GDP",fmt(gdp/(v("gD")/100),1)],["inflation (CPI)",pc((v("c2")-v("c1"))/v("c1"),2)],["unemployment rate",pc(v("uU")/lf,2)],["participation rate",pc(lf/(lf+v("uN")),2)]])}
    if(c==="mu"){const m=v("mpc");if(!(m>0&&m<1))return out("#muo",[["Error","MPC must be between 0 and 1."]]);const sm=1/(1-m),tm=m/(1-m),r=v("rr")/100;out("#muo",[["spending multiplier",fmt(sm,2)],["tax multiplier",`−${fmt(tm,2)}`],["ΔGDP",`$${fmt(v("dG")*sm-v("dT")*tm,1)}B`],["money multiplier",r>0?fmt(1/r,2):"—"],["max new deposits",r>0?m0(v("dep")/r):"—"],["max new loans",r>0?m0(v("dep")*(1-r)/r):"—"]])}
    if(c==="fx"){const r=v("xr"),r2=v("xr2"),a=v("xa"),pu=v("pu"),pf=v("pf"),ppp=pf/pu;out("#fxo",[["cost in dollars",m2(a*r)],["after the rate change",m2(a*r2)+` (${fmt((r2/r-1)*100,2)}%)`],["foreign currency",r2>r?"appreciated (dollar weaker)":r2<r?"depreciated (dollar stronger)":"unchanged"],["PPP rate",`${fmt(ppp,3)} foreign units per $1 (actual ${fmt(1/r,3)})`],["verdict",1/r>ppp?"foreign currency undervalued vs PPP":"foreign currency overvalued vs PPP"]])}}
  ["el","eq","mac","mu","fx"].forEach(calc);
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
