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
const KEY="crushc214.v1";
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
  return `<svg viewBox="-14 0 388 178" role="img" aria-label="Compound growth curve shaded ${fill}% to show exam readiness"><path d="${ap}" fill="var(--hi)"/><path d="${path}" fill="none" stroke="var(--ink)" stroke-width="2.4"/><line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="var(--line)" stroke-width="1.5"/>${tk}<text x="4" y="16" font-size="11" fill="var(--muted)" font-family="JetBrains Mono,monospace">FV = PV(1 + r)ⁿ</text></svg>`;
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
  <input type="search" id="q" placeholder="Search every lesson and flashcard (try “WACC” or “annuity”)" aria-label="Search">
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
  const ask=claude(`I'm studying for WGU C214 Financial Management, unit "${u.title}" (${u.summary}). I'm new to statistics. Teach me the hardest part of this unit in plain English with one business example, then quiz me with 3 multiple-choice questions one at a time and explain my answers.`);
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
const npvF=(r,c)=>c.reduce((s,v,t)=>s+v/Math.pow(1+r,t),0);
function irrF(c){let lo=-.99,hi=5,flo=npvF(lo,c);if(flo*npvF(hi,c)>0)return NaN;for(let k=0;k<200;k++){const m=(lo+hi)/2,fm=npvF(m,c);if(flo*fm<=0)hi=m;else{lo=m;flo=fm}}return(lo+hi)/2}
const pvA=(p,r,n)=>r?p*(1-Math.pow(1+r,-n))/r:p*n, fvA=(p,r,n)=>r?p*(Math.pow(1+r,n)-1)/r:p*n;
const bondP=(F,cr,y,n,m)=>{m=m||1;const C=F*cr/m;return pvA(C,y/m,n*m)+F/Math.pow(1+y/m,n*m)};
const GEN={
 fv:{label:"Future value (lump sum)",u:"u5",f(){const pv=R(2,50)*500,r=R(3,12)/100,n=R(3,25),fv=pv*Math.pow(1+r,n);
   return mc(`You invest ${m0(pv)} today at ${pc(r,0)} compounded annually. What is it worth in ${n} years?`,fv,[pv*(1+r*n),pv*Math.pow(1+r,n-1),pv/Math.pow(1+r,n)],[`FV = PV × (1 + r)^n.`,`= ${m0(pv)} × (${fmt(1+r,2)})^${n} = ${m0(pv)} × ${fmt(Math.pow(1+r,n),4)}.`,`= ${m2(fv)}.`,`Calculator: N = ${n}, I/Y = ${r*100}, PV = −${pv}, PMT = 0, CPT FV. Excel: =FV(${r},${n},0,-${pv}).`,`Simple interest (${m2(pv*(1+r*n))}) is the trap — it ignores interest on interest.`],m2)}},
 pv:{label:"Present value (lump sum)",u:"u5",f(){const fv=R(5,100)*1000,r=R(3,12)/100,n=R(2,20),pv=fv/Math.pow(1+r,n);
   return mc(`You need ${m0(fv)} in ${n} years. If you can earn ${pc(r,0)} a year, how much must you invest today?`,pv,[fv/(1+r*n),fv*Math.pow(1-r,n),fv/Math.pow(1+r,n-1)],[`PV = FV ÷ (1 + r)^n.`,`= ${m0(fv)} ÷ ${fmt(Math.pow(1+r,n),4)} = ${m2(pv)}.`,`Excel: =PV(${r},${n},0,-${fv}).`],m2)}},
 ear:{label:"APR vs EAR",u:"u5",f(){const apr=R(4,24)/100,mm=pick([[2,"semiannually"],[4,"quarterly"],[12,"monthly"],[365,"daily"]]),ear=Math.pow(1+apr/mm[0],mm[0])-1;
   return mc(`A credit card charges an APR of ${pc(apr,0)} compounded ${mm[1]}. What is the effective annual rate (EAR)?`,ear,[apr,apr/mm[0],apr*(1+apr/mm[0])],[`EAR = (1 + APR ÷ m)^m − 1, with m = ${mm[0]}.`,`= (1 + ${fmt(apr/mm[0],5)})^${mm[0]} − 1 = ${pc(ear,2)}.`,`EAR is always ≥ APR when compounding happens more than once a year.`],v=>pc(v,2))}},
 annpv:{label:"PV of an annuity",u:"u6",f(){const p=R(5,60)*100,r=R(4,10)/100,n=R(5,20),due=Math.random()<.3,v=pvA(p,r,n)*(due?1+r:1);
   return mc(`A contract pays ${m0(p)} at the ${due?"beginning":"end"} of each year for ${n} years. At a ${pc(r,0)} discount rate, what is it worth today?`,v,[p*n,due?pvA(p,r,n):pvA(p,r,n)*(1+r),fvA(p,r,n)],[`PV of ordinary annuity = PMT × [1 − (1 + r)^−n] ÷ r = ${m0(p)} × ${fmt((1-Math.pow(1+r,-n))/r,4)} = ${m2(pvA(p,r,n))}.`].concat(due?[`Payments at the beginning = annuity due: multiply by (1 + r): ${m2(v)}.`]:[]).concat([`Calculator: N=${n}, I/Y=${r*100}, PMT=${p}, FV=0${due?", BGN mode":""}, CPT PV.`]),m2)}},
 annfv:{label:"FV of an annuity",u:"u6",f(){const p=R(10,100)*50,r=R(4,10)/100,n=R(5,35),due=Math.random()<.3,v=fvA(p,r,n)*(due?1+r:1);
   return mc(`You save ${m0(p)} at the ${due?"start":"end"} of every year for ${n} years at ${pc(r,0)}. How much will you have?`,v,[p*n,due?fvA(p,r,n):fvA(p,r,n)*(1+r),pvA(p,r,n)],[`FV of ordinary annuity = PMT × [(1 + r)^n − 1] ÷ r = ${m0(p)} × ${fmt((Math.pow(1+r,n)-1)/r,4)} = ${m2(fvA(p,r,n))}.`].concat(due?[`Deposits at the start = annuity due: × (1 + r) → ${m2(v)}.`]:[]).concat([`Excel: =FV(${r},${n},-${p},0${due?",1":""}).`]),m2)}},
 pmt:{label:"Loan payments",u:"u6",f(){const P=R(10,40)*1000,apr=R(3,9)/100,y=pick([3,4,5,6]),i=apr/12,n=y*12,pm=P*i/(1-Math.pow(1+i,-n));
   return mc(`A ${m0(P)} equipment loan at ${pc(apr,0)} APR is repaid monthly over ${y} years. What is the monthly payment?`,pm,[P/n,P*(1+apr*y)/n,(P*apr/(1-Math.pow(1+apr,-y)))/12],[`Monthly rate i = ${pc(apr,0)} ÷ 12 = ${fmt(i,5)}; n = ${y} × 12 = ${n}.`,`PMT = PV × i ÷ [1 − (1 + i)^−n] = ${m2(pm)}.`,`Excel: =PMT(${fmt(apr,4)}/12,${n},-${P}). Calculator: N=${n}, I/Y=${fmt(apr*100/12,4)}, PV=${P}, FV=0, CPT PMT.`],m2)}},
 perp:{label:"Perpetuities",u:"u6",f(){if(Math.random()<.5){const D=R(2,12),r=R(5,12)/100;return mc(`A preferred stock pays a fixed $${D} dividend every year forever. Investors require ${pc(r,0)}. What is it worth?`,D/r,[D*r*100,D/(1+r),D/r/(1+r)],[`Perpetuity: PV = C ÷ r.`,`$${D} ÷ ${r} = ${m2(D/r)}.`],m2)}
   const C=R(10,80)*1000,r=R(8,14)/100,g=R(1,5)/100;return mc(`A building's net rent next year is ${m0(C)} and grows ${pc(g,0)} a year forever. At ${pc(r,0)}, what is it worth today?`,C/(r-g),[C/r,C/(r+g),C*(1+g)/(r-g)],[`Growing perpetuity: PV = C₁ ÷ (r − g).`,`${m0(C)} ÷ (${r} − ${g}) = ${m0(C)} ÷ ${fmt(r-g,2)} = ${m2(C/(r-g))}.`,`The cash flow given is already next year's (C₁), so do not grow it again.`],m2)}},
 bond:{label:"Bond valuation",u:"u7",f(){const cr=R(3,9)/100;let y=R(2,11)/100;if(y===cr)y+=.01;const n=R(3,20),m=Math.random()<.4?2:1,P=bondP(1000,cr,y,n,m);
   if(Math.random()<.3){const L=y<cr?"Premium — the coupon rate is above the YTM":"Discount — the coupon rate is below the YTM";return mc(`A $1,000 bond has a ${pc(cr,0)} coupon and the market yield (YTM) is ${pc(y,0)}. How will it trade?`,L,[y<cr?"Discount — the coupon rate is above the YTM":"Premium — the coupon rate is below the YTM","At par, because the face value is $1,000","You cannot tell without the maturity"],[`Price and yield move opposite.`,`Coupon ${pc(cr,0)} vs YTM ${pc(y,0)}: ${y<cr?"investors get more than the market demands, so they pay above par":"investors get less than the market demands, so the price drops below par"}.`])}
   return mc(`A $1,000 face bond pays a ${pc(cr,0)} coupon ${m===2?"semiannually":"annually"} and matures in ${n} years. The YTM is ${pc(y,0)}. What is its price?`,P,[1000,1000/Math.pow(1+y,n),bondP(1000,cr,y,n,m===2?1:2),1000*cr*n+1000],[`Coupon = ${pc(cr,0)} × 1,000${m===2?" ÷ 2":""} = $${fmt(1000*cr/m)} per period, ${n*m} periods, rate ${pc(y/m,2)} per period.`,`Price = PV of coupons + PV of face = ${m2(pvA(1000*cr/m,y/m,n*m))} + ${m2(1000/Math.pow(1+y/m,n*m))} = ${m2(P)}.`,`Calculator: N=${n*m}, I/Y=${fmt(y*100/m,3)}, PMT=${fmt(1000*cr/m)}, FV=1000, CPT PV. ${P>1000?"Premium":"Discount"} bond because coupon ${P>1000?">":"<"} YTM.`],m2)}},
 gordon:{label:"Stock value (Gordon growth)",u:"u8",f(){const D0=R(100,400)/100,g=R(2,6)/100,r=g+R(4,9)/100,D1=D0*(1+g);
   return mc(`A company just paid a dividend of $${fmt(D0)}. Dividends grow ${pc(g,0)} a year forever and investors require ${pc(r,0)}. What is the stock worth?`,D1/(r-g),[D0/(r-g),D1/(r+g),D0/r],[`Next dividend D₁ = D₀ × (1 + g) = ${fmt(D0)} × ${fmt(1+g,2)} = $${fmt(D1,4)}.`,`P₀ = D₁ ÷ (r − g) = ${fmt(D1,4)} ÷ ${fmt(r-g,2)} = ${m2(D1/(r-g))}.`,`Trap: "just paid" is D₀ — you must grow it to D₁ first (${m2(D0/(r-g))} is the D₀ mistake).`],m2)}},
 reqret:{label:"Required return from DDM",u:"u8",f(){const P=R(20,90),D1=R(80,400)/100,g=R(2,7)/100,r=D1/P+g;
   return mc(`A stock sells for $${P}, is expected to pay $${fmt(D1)} next year, and dividends grow ${pc(g,0)} a year. What return do investors expect?`,r,[D1/P,g,D1/(P*(1+g))+g],[`r = D₁ ÷ P₀ + g (dividend yield + capital gains yield).`,`= ${fmt(D1)} ÷ ${P} + ${g} = ${pc(D1/P,2)} + ${pc(g,0)} = ${pc(r,2)}.`],v=>pc(v,2))}},
 capm:{label:"CAPM required return",u:"u9",f(){const rf=R(2,5)/100,rm=rf+R(4,8)/100,b=R(5,20)/10,r=rf+b*(rm-rf);
   if(Math.random()<.3){const exp=r+(Math.random()<.5?1:-1)*R(1,3)/100,uv=exp>r;const L=uv?"Undervalued — buy (expected return is above the SML)":"Overvalued — sell (expected return is below the SML)";
     return mc(`Risk-free rate ${pc(rf,0)}, market return ${pc(rm,0)}, beta ${b}. Analysts expect the stock to return ${pc(exp,1)}. What is the stock?`,L,[uv?"Overvalued — sell (expected return is below the SML)":"Undervalued — buy (expected return is above the SML)","Fairly priced, because beta is above 1","You cannot tell without the standard deviation"],[`Required return (CAPM) = ${pc(rf,0)} + ${b}(${pc(rm,0)} − ${pc(rf,0)}) = ${pc(r,2)}.`,`Expected ${pc(exp,1)} ${uv?">":"<"} required ${pc(r,2)}, so the stock plots ${uv?"above":"below"} the security market line.`])}
   return mc(`The risk-free rate is ${pc(rf,0)}, the market return is ${pc(rm,0)}, and a stock's beta is ${b}. What is its required return?`,r,[rf+b*rm,b*(rm-rf),rm+b*(rm-rf)],[`CAPM: r = rf + β(rm − rf).`,`Market risk premium = ${pc(rm,0)} − ${pc(rf,0)} = ${pc(rm-rf,0)}.`,`r = ${pc(rf,0)} + ${b} × ${pc(rm-rf,0)} = ${pc(r,2)}.`],v=>pc(v,2))}},
 port:{label:"Portfolio return & beta",u:"u9",f(){const w1=R(2,8)/10,w2=rd(1-w1,1),b1=R(5,18)/10,b2=R(5,18)/10,r1=R(6,16)/100,r2=R(6,16)/100;
   if(Math.random()<.5)return mc(`You put ${w1*100}% of your money in a stock with beta ${b1} and ${rd(w2*100,0)}% in one with beta ${b2}. What is the portfolio beta?`,rd(w1*b1+w2*b2,3),[rd((b1+b2)/2,3),rd(b1*b2,3),rd(w2*b1+w1*b2,3)],[`Portfolio beta is a weighted average.`,`${w1}(${b1}) + ${w2}(${b2}) = ${fmt(w1*b1+w2*b2,3)}.`],v=>fmt(v,3));
   return mc(`A portfolio is ${w1*100}% stock A (expected return ${pc(r1,0)}) and ${rd(w2*100,0)}% stock B (${pc(r2,0)}). What is its expected return?`,w1*r1+w2*r2,[(r1+r2)/2+.0013,w2*r1+w1*r2,r1*r2*10],[`Weighted average: ${w1}(${pc(r1,0)}) + ${w2}(${pc(r2,0)}) = ${pc(w1*r1+w2*r2,2)}.`,`Note: portfolio return is a weighted average, but portfolio risk (SD) is usually lower than the weighted average because of diversification.`],v=>pc(v,2))}},
 expret:{label:"Expected return from scenarios",u:"u9",f(){const p=pick([[.3,.5,.2],[.25,.5,.25],[.2,.6,.2],[.4,.4,.2]]),r=[R(15,35)/100,R(5,14)/100,-R(5,20)/100],e=p.reduce((s,x,i)=>s+x*r[i],0);
   return mc(`Boom (p = ${p[0]}): ${pc(r[0],0)} return. Normal (p = ${p[1]}): ${pc(r[1],0)}. Recession (p = ${p[2]}): ${pc(r[2],0)}. What is the expected return?`,e,[(r[0]+r[1]+r[2])/3+.0007,p[0]*r[0]+p[1]*r[1]-p[2]*r[2],r[1]],[`E(r) = Σ p × r.`,`${p[0]}(${pc(r[0],0)}) + ${p[1]}(${pc(r[1],0)}) + ${p[2]}(${pc(r[2],0)}) = ${pc(e,2)}.`],v=>pc(v,2))}},
 wacc:{label:"WACC",u:"u10",f(){const wd=R(2,6)/10,we=rd(1-wd,1),rdb=R(4,9)/100,T=pick([.21,.25,.3]),re=R(9,16)/100,w=wd*rdb*(1-T)+we*re;
   if(Math.random()<.3)return mc(`A firm's bonds yield ${pc(rdb,0)} and its tax rate is ${pc(T,0)}. What is its after-tax cost of debt?`,rdb*(1-T),[rdb,rdb*T,rdb/(1-T)],[`Interest is tax-deductible, so after-tax rd = rd × (1 − T).`,`${pc(rdb,0)} × (1 − ${T}) = ${pc(rdb*(1-T),2)}.`],v=>pc(v,2));
   return mc(`Target capital structure: ${wd*100}% debt, ${rd(we*100,0)}% equity. Pre-tax cost of debt ${pc(rdb,0)}, tax rate ${pc(T,0)}, cost of equity ${pc(re,0)}. What is the WACC?`,w,[wd*rdb+we*re,(rdb*(1-T)+re)/2,we*rdb*(1-T)+wd*re],[`After-tax cost of debt = ${pc(rdb,0)} × (1 − ${T}) = ${pc(rdb*(1-T),2)}.`,`WACC = ${wd}(${pc(rdb*(1-T),2)}) + ${we}(${pc(re,0)}) = ${pc(w,2)}.`,`Forgetting the tax shield gives ${pc(wd*rdb+we*re,2)} — a common wrong answer.`],v=>pc(v,2))}},
 npv:{label:"Net present value",u:"u11",f(){const I=R(50,200)*1000,n=pick([3,4,5]),c=[-I].concat([...Array(n)].map(()=>R(15,Math.round(I/1000*0.5))*1000)),r=R(6,14)/100,v=npvF(r,c),pv=v+I;
   return mc(`A project costs ${m0(I)} today and returns ${c.slice(1).map(m0).join(", ")} over the next ${n} years. The cost of capital is ${pc(r,0)}. What is its NPV?`,v,[c.reduce((s,x)=>s+x,0),pv,v/(1+r)],[`Discount each cash flow: ${c.slice(1).map((x,t)=>`${m0(x)}/${fmt(1+r,2)}^${t+1} = ${m2(x/Math.pow(1+r,t+1))}`).join("; ")}.`,`PV of inflows = ${m2(pv)}.`,`NPV = ${m2(pv)} − ${m0(I)} = ${m2(v)} → ${v>0?"accept (adds value)":"reject (destroys value)"}.`,`Excel trap: =NPV(r, CF1..CFn) + CF0 — don't put CF0 inside NPV().`],m2)}},
 irr:{label:"IRR",u:"u11",f(){const I=R(20,120)*1000,n=pick([3,4,5,6]),C=Math.round(I*(R(25,45)/100)/1000)*1000,c=[-I].concat(Array(n).fill(C)),irr=irrF(c),h=R(7,14)/100;if(!(irr>=.02))return GEN.irr.f();
   return mc(`A machine costs ${m0(I)} and saves ${m0(C)} a year for ${n} years. What is its IRR (to the nearest 0.1%)? The hurdle rate is ${pc(h,0)}.`,rd(irr,3),[rd(irr+.03,3),rd(Math.max(.001,irr-.03),3),rd((C*n-I)/I/n,3)],[`IRR is the rate that makes NPV = 0: ${m0(I)} = ${m0(C)} × annuity factor(IRR, ${n}).`,`Annuity factor = ${m0(I)} ÷ ${m0(C)} = ${fmt(I/C,4)} → IRR ≈ ${pc(irr,1)} (calculator: CF0=−${I}, C01=${C}, F01=${n}, IRR; Excel =IRR).`,`Decision: IRR ${pc(irr,1)} ${irr>h?">":"<"} hurdle ${pc(h,0)} → ${irr>h?"accept":"reject"}.`],v=>pc(v,1))}},
 payback:{label:"Payback period",u:"u11",f(){const I=R(40,120)*1000,c=[...Array(5)].map(()=>R(10,45)*1000);let cum=0,pb=NaN;for(let t=0;t<5;t++){if(cum+c[t]>=I){pb=t+(I-cum)/c[t];break}cum+=c[t]}if(isNaN(pb)||pb===Math.floor(pb))return GEN.payback.f();
   return mc(`A project costs ${m0(I)} and returns ${c.map(m0).join(", ")} in years 1–5. What is the payback period?`,rd(pb,2),[rd(I/(c.reduce((a,b)=>a+b,0)/5),2),Math.ceil(pb),rd(pb+1,2),rd(Math.max(.1,pb-.5),2),Math.floor(pb)+.5],[`Cumulative cash flows: ${c.reduce((a,x,i)=>(a.push((a[i-1]||0)+x),a),[]).map(m0).join(", ")}.`,`Full years before recovery: ${Math.floor(pb)} (recovered ${m0(c.slice(0,Math.floor(pb)).reduce((a,b)=>a+b,0))}).`,`Fraction of next year = remaining ${m0(I-c.slice(0,Math.floor(pb)).reduce((a,b)=>a+b,0))} ÷ ${m0(c[Math.floor(pb)])} → payback = ${fmt(pb,2)} years.`,`Payback ignores the time value of money and cash flows after the cutoff.`],v=>fmt(v,2)+" years")}},
 pi:{label:"Profitability index",u:"u11",f(){const I=R(50,150)*1000,c=[...Array(3)].map(()=>R(20,70)*1000),r=R(6,12)/100,pv=npvF(r,[0].concat(c));
   return mc(`Cost ${m0(I)}; cash flows ${c.map(m0).join(", ")} in years 1–3; cost of capital ${pc(r,0)}. What is the profitability index?`,rd(pv/I,3),[rd(c.reduce((a,b)=>a+b,0)/I,3),rd((pv-I)/I,3),rd(I/pv,3)],[`PV of inflows = ${m2(pv)}.`,`PI = PV inflows ÷ initial cost = ${m2(pv)} ÷ ${m0(I)} = ${fmt(pv/I,3)}.`,`PI > 1 ⇔ NPV > 0 → ${pv>I?"accept":"reject"}.`],v=>fmt(v,3))}},
 ratio:{label:"Financial ratios",u:"u3",f(){const CA=R(200,900)*1000,CL=R(100,600)*1000,Inv=Math.round(CA*R(20,50)/100/1000)*1000,S=R(1,5)*1000000,NI=Math.round(S*R(3,12)/100/1000)*1000,TA=R(1,4)*1000000,E=Math.round(TA*R(30,70)/100/1000)*1000,EBIT=Math.round(NI*1.6/1000)*1000,Int=Math.round(EBIT*R(8,30)/100/1000)*1000;
   const data=`Current assets ${m0(CA)}, inventory ${m0(Inv)}, current liabilities ${m0(CL)}, sales ${m0(S)}, net income ${m0(NI)}, total assets ${m0(TA)}, equity ${m0(E)}, EBIT ${m0(EBIT)}, interest expense ${m0(Int)}.`;
   const k=pick(["current","quick","roe","roa","margin","tie","de"]),f2=v=>fmt(v,2),fp=v=>pc(v,1);
   const Q={current:["current ratio",CA/CL,[CL/CA,(CA-Inv)/CL,CA/TA],`Current ratio = current assets ÷ current liabilities = ${f2(CA/CL)}.`,f2,"Liquidity"],
     quick:["quick (acid-test) ratio",(CA-Inv)/CL,[CA/CL,Inv/CL,(CA+Inv)/CL],`Quick = (current assets − inventory) ÷ current liabilities = ${m0(CA-Inv)} ÷ ${m0(CL)} = ${f2((CA-Inv)/CL)}.`,f2,"Liquidity"],
     roe:["return on equity",NI/E,[NI/TA,NI/S,EBIT/E],`ROE = net income ÷ equity = ${fp(NI/E)}.`,fp,"Profitability"],
     roa:["return on assets",NI/TA,[NI/E,NI/S,EBIT/TA],`ROA = net income ÷ total assets = ${fp(NI/TA)}.`,fp,"Profitability"],
     margin:["net profit margin",NI/S,[NI/TA,EBIT/S,NI/E],`Net margin = net income ÷ sales = ${fp(NI/S)}.`,fp,"Profitability"],
     tie:["times-interest-earned ratio",EBIT/Int,[NI/Int,Int/EBIT,(EBIT-Int)/Int],`TIE = EBIT ÷ interest = ${f2(EBIT/Int)}×.`,f2,"Leverage (coverage)"],
     de:["debt-to-equity ratio",(TA-E)/E,[(TA-E)/TA,E/TA,TA/E],`Total debt = assets − equity = ${m0(TA-E)}. D/E = ${m0(TA-E)} ÷ ${m0(E)} = ${f2((TA-E)/E)}.`,f2,"Leverage"]}[k];
   return mc(`${data} What is the ${Q[0]}?`,Q[1],Q[2],[Q[3],`Category: ${Q[5]} ratio.`],Q[4])}},
 dupont:{label:"DuPont ROE",u:"u3",f(){const m=R(3,12)/100,t=R(6,25)/10,em=R(12,30)/10,roe=m*t*em;
   return mc(`Net profit margin ${pc(m,0)}, total asset turnover ${t}×, equity multiplier ${em}×. What is ROE?`,roe,[m*t,m+t/100+em/100,m*em],[`DuPont: ROE = margin × turnover × equity multiplier.`,`${m} × ${t} × ${em} = ${pc(roe,2)}.`,`ROA = margin × turnover = ${pc(m*t,2)}; leverage (equity multiplier) lifts ROE above ROA.`],v=>pc(v,2))}},
 ccc:{label:"Cash conversion cycle",u:"u4",f(){const dio=R(20,90),dso=R(15,60),dpo=R(15,60),c=dio+dso-dpo;
   return mc(`Days inventory outstanding ${dio}, days sales outstanding ${dso}, days payables outstanding ${dpo}. What is the cash conversion cycle?`,c,[dio+dso+dpo,dio+dpo-dso,dso-dpo],[`CCC = DIO + DSO − DPO.`,`${dio} + ${dso} − ${dpo} = ${c} days.`,`Shorter is better: cash is tied up for fewer days.`],v=>v+" days")}},
 fcf:{label:"Free cash flow",u:"u2",f(){const EBIT=R(200,900)*1000,T=pick([.21,.25]),dep=R(30,150)*1000,cap=R(50,250)*1000,nwc=R(-20,60)*1000,f=EBIT*(1-T)+dep-cap-nwc;
   return mc(`EBIT ${m0(EBIT)}, tax rate ${pc(T,0)}, depreciation ${m0(dep)}, capital expenditures ${m0(cap)}, increase in net working capital ${m0(nwc)}. What is free cash flow?`,f,[EBIT+dep-cap-nwc,EBIT*(1-T)+dep+cap-nwc,EBIT*(1-T)-dep-cap-nwc],[`NOPAT = EBIT × (1 − T) = ${m0(EBIT*(1-T))}.`,`Operating cash flow = NOPAT + depreciation = ${m0(EBIT*(1-T)+dep)} (depreciation is non-cash, add it back).`,`FCF = OCF − capex − ΔNWC = ${m0(f)}.`],m0)}},
 trade:{label:"Cost of trade credit",u:"u4",f(){const d=pick([1,2,3])/100,dd=10,net=pick([30,45,60]),c=d/(1-d)*365/(net-dd);
   return mc(`A supplier offers ${d*100}/${dd} net ${net}. What is the nominal annual cost of NOT taking the discount?`,c,[d*365/(net-dd),d/(1-d),d*365/net],[`Cost = d ÷ (1 − d) × 365 ÷ (net days − discount days).`,`= ${d} ÷ ${fmt(1-d,2)} × 365 ÷ ${net-dd} = ${pc(c,2)}.`,`That is far above most bank loan rates, so firms usually take the discount.`],v=>pc(v,2))}},
 lev:{label:"Leverage & break-even",u:"u12",f(){const p=R(20,90),v=R(5,p-8),F=R(20,200)*1000,Q=Math.ceil(F/(p-v))+R(500,8000);
   if(Math.random()<.5)return mc(`Price $${p}/unit, variable cost $${v}/unit, fixed operating costs ${m0(F)}. What is the operating break-even quantity?`,F/(p-v),[F/p,F/v,F/(p+v)],[`Break-even Q = F ÷ (P − V) = ${m0(F)} ÷ $${p-v} = ${fmt(F/(p-v),1)} units.`],x=>Math.ceil(x).toLocaleString()+" units");
   const CM=Q*(p-v),dol=CM/(CM-F);return mc(`At ${Q.toLocaleString()} units, price $${p}, variable cost $${v}, fixed costs ${m0(F)}: what is the degree of operating leverage (DOL)?`,rd(dol,2),[rd(CM/F,2),rd(F/(CM-F),2),rd((CM-F)/CM,2)],[`Contribution margin = Q(P − V) = ${m0(CM)}. EBIT = ${m0(CM)} − ${m0(F)} = ${m0(CM-F)}.`,`DOL = contribution ÷ EBIT = ${fmt(dol,2)}: a 1% change in sales changes EBIT by about ${fmt(dol,2)}%.`],x=>fmt(x,2)+"×")}},
 fisher:{label:"Real vs nominal rates",u:"u1",f(){const n=R(4,12)/100,inf=R(1,6)/100;if(Math.random()<.5)return mc(`A bond yields ${pc(n,0)} and expected inflation is ${pc(inf,0)}. Using the Fisher approximation, what is the real rate?`,n-inf,[n+inf,n/inf/100,inf],[`Real ≈ nominal − inflation = ${pc(n,0)} − ${pc(inf,0)} = ${pc(n-inf,0)}.`,`Exact Fisher: (1.${String(Math.round(n*100)).padStart(2,"0")} ÷ ${fmt(1+inf,2)}) − 1 = ${pc((1+n)/(1+inf)-1,2)}.`],v=>pc(v,2));
   const real=R(1,4)/100,dp=R(0,3)/100,lp=R(0,2)/100,mrp=R(0,3)/100,r=real+inf+dp+lp+mrp;return mc(`Real risk-free rate ${pc(real,0)}, inflation premium ${pc(inf,0)}, default premium ${pc(dp,0)}, liquidity premium ${pc(lp,0)}, maturity premium ${pc(mrp,0)}. What is the nominal rate on this bond?`,r,[real+inf,r-mrp,real+dp+lp+mrp],[`r = r* + IP + DRP + LP + MRP.`,`${[real,inf,dp,lp,mrp].map(x=>pc(x,0)).join(" + ")} = ${pc(r,0)}.`],v=>pc(v,2))}}
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
function askClaudeQ(q,mine){return claude(`I'm studying for WGU C214 (Financial Management) and got this practice question wrong.\n\nQuestion: ${q.q}\nOptions:\n${q.o.map((o,j)=>"ABCD"[j]+") "+o).join("\n")}\n${mine!=null?`My answer: ${"ABCD"[mine]}\n`:""}Correct answer: ${"ABCD"[q.a]}\n\nExplain step by step why the correct answer is right and why mine is wrong, in plain English for a beginner. Then give me one similar practice question.`)}
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
   ${ans!==null?`<div class="explain"><strong>${ans===cur.a?"✓ Correct. +5 XP":"✗ Answer: "+esc(cur.o[cur.a])}</strong><ol class="steps">${cur.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol></div><div class="row"><button class="btn primary" data-next>Next problem →</button><button class="btn sm ghost" data-learn="${GEN[k].u}">Review the lesson</button></div>`:`<p class="muted small">Work it on paper, then pick an answer. Use the financial calculator in Cram &amp; Tools if you need it.</p>`}</div>`}
  next();draw();
  app.onchange=e=>{if(e.target.id==="dk2"){skill=e.target.value;next();draw()}};
  app.onclick=e=>{const t=e.target;
    if(t.closest("[data-quit]"))return go("practice");
    const o=t.closest("[data-o]");if(o&&ans===null){ans=+o.dataset.o;n++;const ok=ans===cur.a;if(ok)sc++;S.drill[k]=S.drill[k]||{c:0,t:0};S.drill[k].t++;if(ok)S.drill[k].c++;addXP(ok?5:1);draw();return}
    if(t.closest("[data-next]")){next();draw();window.scrollTo(0,0);return}
    const l=t.closest("[data-learn]");if(l)go("learn",l.dataset.learn)};
}

/* ================= LABS ================= */
const LABS=[["grow","Compound growth explorer","See interest earn interest. Change the rate, years, compounding and yearly savings."],["amort","Loan amortization","Watch each payment split between interest and principal over the life of a loan."],["npv","NPV profile & IRR","Enter two projects' cash flows and see NPV at every discount rate, each IRR and the crossover rate."],["bond","Bond price vs. yield","Slide the yield and watch the price move the other way. Long bonds swing more."],["capm","CAPM, SML & diversification","Plot stocks against the security market line and watch diversification remove unsystematic risk."],["lev","Break-even & operating leverage","Move price, costs and volume to find break-even and see how leverage magnifies EBIT."]];
function axes(c,w,h,o){const L=o.l||56,Rr=o.r||16,T=o.t||14,B=o.b||28,X=x=>L+(x-o.x0)/(o.x1-o.x0)*(w-L-Rr),Y=y=>h-B-(y-o.y0)/(o.y1-o.y0)*(h-B-T);
  c.strokeStyle=col("line");c.lineWidth=1;c.fillStyle=col("muted");c.font="11px JetBrains Mono, monospace";
  (o.yt||[]).forEach(v=>{c.beginPath();c.moveTo(L,Y(v));c.lineTo(w-Rr,Y(v));c.stroke();c.textAlign="right";c.fillText(o.fy?o.fy(v):v,L-6,Y(v)+4)});
  (o.xt||[]).forEach(v=>{c.textAlign="center";c.fillText(o.fx?o.fx(v):v,X(v),h-B+16)});
  c.strokeStyle=col("muted");c.beginPath();c.moveTo(L,T);c.lineTo(L,h-B);c.lineTo(w-Rr,h-B);c.stroke();return{X,Y,L,Rr,T,B}}
const ticks=(a,b,n)=>{const s=(b-a)/n,out=[];for(let k=0;k<=n;k++)out.push(a+s*k);return out};
const kfmt=v=>Math.abs(v)>=1e6?"$"+fmt(v/1e6,1)+"M":Math.abs(v)>=1e3?"$"+fmt(v/1e3,0)+"K":"$"+fmt(v,0);
function canvasFor(id,h){const cv=document.getElementById(id);if(!cv)return null;const dpr=window.devicePixelRatio||1,w=cv.parentElement.clientWidth;cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);cv.style.height=h+"px";const c=cv.getContext&&cv.getContext("2d");if(!c)return null;c.setTransform(dpr,0,0,dpr,0,0);c.font="12px JetBrains Mono, monospace";return{c,w,h,cv}}
function vLabs(){
  if(sub&&LABS.find(l=>l[0]===sub))return lab(sub);
  app.innerHTML=`<div class="stack"><div><span class="eyebrow">See the money move</span><h1>Labs</h1><p class="muted" style="margin-top:6px">Six interactive finance simulators. Play with each one for five minutes and the formulas start to make sense.</p></div>
  <div class="grid">${LABS.map(l=>`<button class="card stack" style="gap:8px;text-align:left;cursor:pointer;font:inherit;color:inherit" data-lab="${l[0]}"><div class="row between"><h3>${l[1]}</h3>${S.labs[l[0]]?`<span class="chip good">tried</span>`:""}</div><p class="muted small">${l[2]}</p></button>`).join("")}</div></div>`;
  app.onclick=e=>{const b=e.target.closest("[data-lab]");if(b)go("labs",b.dataset.lab)};
}
function lab(id){
  const ls=[];const on=(t,f)=>{app.addEventListener(t,f);ls.push([t,f])};const L=LABS.find(l=>l[0]===id);if(!S.labs[id]){S.labs[id]=1;addXP(10)}
  const shell=(ctl,note,extra)=>`<div class="stack lab"><div class="row"><button class="btn sm ghost" data-back>← Labs</button></div><div><span class="eyebrow">Lab</span><h1>${L[1]}</h1><p class="muted" style="margin-top:6px">${L[2]}</p></div><canvas id="cv" role="img" aria-label="${L[1]} chart"></canvas><div class="ctl">${ctl}</div><dl class="out" id="out"></dl>${extra||""}${note?`<div class="card small">${note}</div>`:""}</div>`;
  const outp=rows=>{const o=$("#out");if(o)o.innerHTML=rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")};
  const rng=(id,label,min,max,step,val,unit)=>`<div class="field"><label for="${id}">${label}: <span class="num" id="${id}v">${val}${unit||""}</span></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-unit="${unit||""}"></div>`;
  const num=(id,label,val)=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="number" value="${val}"></div>`;
  const g$=id=>+$("#"+id).value;
  let redraw=()=>{};
  if(id==="grow"){
    app.innerHTML=shell(num("pv","Starting amount ($)",10000)+rng("r","Annual rate",0,15,.5,8,"%")+rng("n","Years",1,40,1,25)+`<div class="field"><label for="m">Compounding</label><select id="m"><option value="1">Annually</option><option value="4">Quarterly</option><option value="12" selected>Monthly</option><option value="365">Daily</option></select></div>`+num("pm","Added each year ($)",0),"Green = money you put in. Yellow = interest, including interest on interest. The dashed line is simple interest, which earns nothing on past interest. The gap between them is the power of compounding. Rule of 72: years to double ≈ 72 ÷ rate.");
    redraw=()=>{const pv=g$("pv"),r=g$("r")/100,n=g$("n"),m=g$("m"),pm=g$("pm"),ear=Math.pow(1+r/m,m)-1;
      const bal=t=>pv*Math.pow(1+ear,t)+fvA(pm,ear,t),cont=t=>pv+pm*t,simple=t=>pv*(1+r*t)+pm*t;
      const g=canvasFor("cv",300);if(g){const{c,w,h}=g,ymax=Math.max(bal(n),1)*1.08;c.clearRect(0,0,w,h);const A=axes(c,w,h,{x0:-.6,x1:n+.6,y0:0,y1:ymax,yt:ticks(0,ymax,4),fy:kfmt,xt:ticks(0,n,Math.min(n,8)).map(Math.round),fx:v=>"yr "+v});
        const bw=Math.max(2,(A.X(1)-A.X(0))*.7);for(let t=0;t<=n;t++){const b=bal(t),k=cont(t),x=A.X(t)-bw/2;c.fillStyle=col("accent");c.fillRect(x,A.Y(Math.min(k,b)),bw,A.Y(0)-A.Y(Math.min(k,b)));c.fillStyle=col("hi");if(b>k)c.fillRect(x,A.Y(b),bw,A.Y(k)-A.Y(b))}
        c.strokeStyle=col("ink");c.setLineDash([6,5]);c.lineWidth=2;c.beginPath();for(let t=0;t<=n;t++){t?c.lineTo(A.X(t),A.Y(simple(t))):c.moveTo(A.X(t),A.Y(simple(t)))}c.stroke();c.setLineDash([])}
      outp([["ending balance",m2(bal(n))],["you put in",m2(cont(n))],["interest earned",m2(bal(n)-cont(n))],["simple interest would give",m2(simple(n))],["EAR",pc(ear,3)],["rule of 72",r?`doubles in about ${fmt(72/(r*100),1)} years`:"—"]])};
  }
  if(id==="amort"){
    app.innerHTML=shell(num("P","Loan amount ($)",300000)+rng("r","APR",1,12,.25,6.5,"%")+`<div class="field"><label for="y">Term</label><select id="y"><option>5</option><option>15</option><option selected>30</option></select></div>`,"Early payments are mostly interest (yellow) because interest is charged on a large balance. As the balance falls, more of each fixed payment goes to principal (green). Shorter terms mean higher payments but far less total interest.",`<div class="card" style="overflow-x:auto"><table id="tb" class="num small" style="border-collapse:collapse;width:100%;min-width:420px"></table></div>`);
    redraw=()=>{const P=g$("P"),r=g$("r")/100,y=g$("y"),i=r/12,n=y*12,pm=P*i/(1-Math.pow(1+i,-n));let bal=P;const yr=[],rows=[];
      for(let k=1;k<=n;k++){const int=bal*i,pr=pm-int;bal-=pr;const Y=Math.ceil(k/12)-1;yr[Y]=yr[Y]||{i:0,p:0};yr[Y].i+=int;yr[Y].p+=pr;if(k<=6||k===n)rows.push([k,int,pr,Math.max(0,bal)])}
      const g=canvasFor("cv",300);if(g){const{c,w,h}=g,ymax=pm*12*1.1;c.clearRect(0,0,w,h);const A=axes(c,w,h,{x0:.4,x1:y+.6,y0:0,y1:ymax,yt:ticks(0,ymax,4),fy:kfmt,xt:ticks(1,y,Math.min(y-1,6)).map(Math.round),fx:v=>"yr "+v});
        const bw=Math.max(2,(A.X(2)-A.X(1))*.75);yr.forEach((v,k)=>{const x=A.X(k+1)-bw/2;c.fillStyle=col("hi");c.fillRect(x,A.Y(v.i),bw,A.Y(0)-A.Y(v.i));c.fillStyle=col("accent");c.fillRect(x,A.Y(v.i+v.p),bw,A.Y(v.i)-A.Y(v.i+v.p))})}
      const tot=pm*n-P;outp([["monthly payment",m2(pm)],["total paid",m2(pm*n)],["total interest",m2(tot)+` (${fmt(tot/P*100,0)}% of the loan)`],["first payment",`${m2(P*i)} interest / ${m2(pm-P*i)} principal`]]);
      const tb=$("#tb");if(tb)tb.innerHTML=`<tr><th style="text-align:left">Month</th><th>Interest</th><th>Principal</th><th>Balance</th></tr>`+rows.map(r=>`<tr><td>${r[0]}</td><td style="text-align:right">${m2(r[1])}</td><td style="text-align:right">${m2(r[2])}</td><td style="text-align:right">${m2(r[3])}</td></tr>`).join("")};
  }
  if(id==="npv"){
    app.innerHTML=shell(`<div class="field" style="grid-column:1/-1"><label for="ca">Project A cash flows (CF0 first)</label><input id="ca" value="-1000, 500, 400, 300, 100"></div><div class="field" style="grid-column:1/-1"><label for="cb">Project B cash flows</label><input id="cb" value="-1000, 100, 300, 400, 675"></div>`+rng("h","Cost of capital",0,30,.5,10,"%"),"Each curve shows NPV at every discount rate. Where a curve crosses zero is that project's IRR. Left of the crossover rate the projects rank one way and right of it they flip. That is why NPV and IRR can disagree for mutually exclusive projects. When they conflict, follow NPV at your cost of capital.");
    const parse=s=>s.split(/[\s,;]+/).map(Number).filter(x=>x===x&&isFinite(x));
    redraw=()=>{const a=parse($("#ca").value),b=parse($("#cb").value),h=g$("h")/100;const ia=irrF(a),ib=irrF(b),diff=a.map((v,k)=>v-(b[k]||0));const ix=a.length===b.length?irrF(diff):NaN;
      const g=canvasFor("cv",320);if(g&&a.length>1){const{c,w,h:H}=g;let lo=Infinity,hi=-Infinity;for(let r=0;r<=.4001;r+=.01){[a,b].forEach(cf=>{if(cf.length>1){const v=npvF(r,cf);lo=Math.min(lo,v);hi=Math.max(hi,v)}})}lo=Math.min(lo,0);hi=Math.max(hi,0);const pad=(hi-lo)*.1||1;
        c.clearRect(0,0,w,H);const A=axes(c,w,H,{x0:0,x1:.4,y0:lo-pad,y1:hi+pad,yt:ticks(lo-pad,hi+pad,4),fy:v=>fmt(v,0),xt:[0,.1,.2,.3,.4],fx:v=>v*100+"%"});
        c.strokeStyle=col("ink");c.lineWidth=1.5;c.beginPath();c.moveTo(A.X(0),A.Y(0));c.lineTo(A.X(.4),A.Y(0));c.stroke();
        [[a,col("accent"),"A"],[b,col("warn"),"B"]].forEach(([cf,s,lab])=>{if(cf.length<2)return;c.strokeStyle=s;c.lineWidth=3;c.beginPath();for(let r=0;r<=.4001;r+=.005){const y=A.Y(npvF(r,cf));r?c.lineTo(A.X(r),y):c.moveTo(A.X(r),y)}c.stroke();c.fillStyle=s;c.textAlign="left";c.font="700 12px JetBrains Mono, monospace";c.fillText(lab,A.X(0)+4,A.Y(npvF(0,cf))-6)});
        c.strokeStyle=col("bad");c.setLineDash([5,4]);c.lineWidth=1.5;c.beginPath();c.moveTo(A.X(h),A.T);c.lineTo(A.X(h),H-A.B);c.stroke();c.setLineDash([]);
        [ia,ib].forEach((r,k)=>{if(r>=0&&r<=.4){c.beginPath();c.arc(A.X(r),A.Y(0),6,0,7);c.fillStyle=k?col("warn"):col("accent");c.fill()}})}
      const na=npvF(h,a),nb=npvF(h,b),best=na>=nb?"A":"B";
      outp([["NPV at "+pc(h,1),`A ${m2(na)} · B ${m2(nb)}`],["IRR",`A ${isNaN(ia)?"—":pc(ia,2)} · B ${isNaN(ib)?"—":pc(ib,2)}`],["crossover rate",isNaN(ix)?"—":pc(ix,2)],["if independent",`A ${na>0?"accept":"reject"} · B ${nb>0?"accept":"reject"}`],["if mutually exclusive",Math.max(na,nb)>0?`choose ${best} (higher NPV)`:"reject both"]])};
  }
  if(id==="bond"){
    app.innerHTML=shell(rng("cr","Coupon rate",0,12,.25,6,"%")+rng("y","Yield to maturity",.25,15,.25,8,"%")+rng("n","Years to maturity",1,30,1,20)+`<div class="field"><label for="f">Coupons</label><select id="f"><option value="1">Annual</option><option value="2" selected>Semiannual</option></select></div>`,"Price and yield move in opposite directions. When the YTM is above the coupon rate the bond sells at a discount, and when it is below the coupon rate it sells at a premium. The dashed 2-year curve is much flatter than the long bond's curve, so longer maturity means more interest-rate risk.");
    redraw=()=>{const cr=g$("cr")/100,y=g$("y")/100,n=g$("n"),f=g$("f"),P=bondP(1000,cr,y,n,f),P1=bondP(1000,cr,y+.01,n,f);
      const g=canvasFor("cv",300);if(g){const{c,w,h}=g,ymax=Math.max(bondP(1000,cr,.0025,n,f),1300),A=(c.clearRect(0,0,w,h),axes(c,w,h,{x0:0,x1:.15,y0:0,y1:ymax*1.05,yt:ticks(0,ymax*1.05,4),fy:v=>"$"+fmt(v,0),xt:[0,.03,.06,.09,.12,.15],fx:v=>fmt(v*100,0)+"%"}));
        c.strokeStyle=col("line");c.setLineDash([3,3]);c.beginPath();c.moveTo(A.X(0),A.Y(1000));c.lineTo(A.X(.15),A.Y(1000));c.stroke();
        c.strokeStyle=col("muted");c.setLineDash([7,5]);c.lineWidth=2;c.beginPath();for(let r=.0025;r<=.15;r+=.0025){const v=A.Y(bondP(1000,cr,r,2,f));r===.0025?c.moveTo(A.X(r),v):c.lineTo(A.X(r),v)}c.stroke();c.setLineDash([]);
        c.strokeStyle=col("accent");c.lineWidth=3;c.beginPath();for(let r=.0025;r<=.15;r+=.0025){const v=A.Y(bondP(1000,cr,r,n,f));r===.0025?c.moveTo(A.X(r),v):c.lineTo(A.X(r),v)}c.stroke();
        c.beginPath();c.arc(A.X(y),A.Y(P),7,0,7);c.fillStyle=col("hi");c.fill();c.strokeStyle=col("ink");c.lineWidth=1.5;c.stroke()}
      const kind=Math.abs(P-1000)<.5?"Par (coupon = YTM)":P>1000?"Premium (coupon > YTM)":"Discount (coupon < YTM)";
      outp([["price",m2(P)],["trades at",kind],["coupon per year",m2(1000*cr)],["current yield",P?pc(1000*cr/P,2):"—"],["if YTM rises 1 point",`${m2(P1)} (${fmt((P1-P)/P*100,2)}%)`],["2-year bond, same change",`${fmt((bondP(1000,cr,y+.01,2,f)-bondP(1000,cr,y,2,f))/bondP(1000,cr,y,2,f)*100,2)}%`]])};
  }
  if(id==="capm"){
    const stocks=[["Utility",.6,.08],["Retailer",1.0,.095],["Biotech",1.8,.13],["Chipmaker",1.4,.135]];
    app.innerHTML=shell(rng("rf","Risk-free rate",0,8,.25,4,"%")+rng("rm","Market return",2,16,.25,10,"%"),"Line: CAPM required return = rf + β(rm − rf). A stock above the line offers more than its risk requires, so it is undervalued (buy). A stock below the line is overvalued. Second chart: adding random stocks removes unsystematic risk, but the market (systematic) risk floor never goes away. That is why only beta is priced.",`<canvas id="cv2" role="img" aria-label="Diversification chart"></canvas>`);
    redraw=()=>{const rf=g$("rf")/100,rm=g$("rm")/100,req=b=>rf+b*(rm-rf);const g=canvasFor("cv",300);
      if(g){const{c,w,h}=g,ymax=Math.max(.2,req(2.2)+.02),A=(c.clearRect(0,0,w,h),axes(c,w,h,{x0:0,x1:2.2,y0:0,y1:ymax,yt:ticks(0,ymax,4),fy:v=>fmt(v*100,0)+"%",xt:[0,.5,1,1.5,2],fx:v=>"β "+v}));
        c.strokeStyle=col("accent");c.lineWidth=3;c.beginPath();c.moveTo(A.X(0),A.Y(rf));c.lineTo(A.X(2.2),A.Y(req(2.2)));c.stroke();
        c.fillStyle=col("muted");c.textAlign="left";c.fillText("SML",A.X(2.05),A.Y(req(2.05))-8);c.beginPath();c.arc(A.X(1),A.Y(rm),5,0,7);c.fillStyle=col("ink");c.fill();c.fillText("market",A.X(1)+10,A.Y(rm)+16);
        stocks.forEach(([n,b,e])=>{const up=e>req(b);c.beginPath();c.arc(A.X(b),A.Y(e),7,0,7);c.fillStyle=up?col("good"):col("bad");c.fill();c.fillStyle=col("ink");c.textAlign="center";c.fillText(n,A.X(b),A.Y(e)-13)})}
      const g2=canvasFor("cv2",220);if(g2){const{c,w,h}=g2,sd=N=>Math.sqrt(.2*.2+.35*.35/N),A=(c.clearRect(0,0,w,h),axes(c,w,h,{x0:1,x1:40,y0:0,y1:.45,yt:[0,.1,.2,.3,.4],fy:v=>fmt(v*100,0)+"%",xt:[1,10,20,30,40],fx:v=>v+" stocks"}));
        c.fillStyle=col("soft");c.fillRect(A.X(1),A.Y(.2),A.X(40)-A.X(1),A.Y(0)-A.Y(.2));c.strokeStyle=col("bad");c.setLineDash([6,4]);c.beginPath();c.moveTo(A.X(1),A.Y(.2));c.lineTo(A.X(40),A.Y(.2));c.stroke();c.setLineDash([]);
        c.strokeStyle=col("accent");c.lineWidth=3;c.beginPath();for(let N=1;N<=40;N++){N===1?c.moveTo(A.X(N),A.Y(sd(N))):c.lineTo(A.X(N),A.Y(sd(N)))}c.stroke();c.fillStyle=col("muted");c.textAlign="left";c.fillText("systematic (market) risk floor",A.X(14),A.Y(.2)+16);c.fillText("total portfolio risk",A.X(4),A.Y(sd(4))-8)}
      outp([["market risk premium",pc(rm-rf,2)]].concat(stocks.map(([n,b,e])=>[n+` (β ${b})`,`required ${pc(req(b),2)} vs expected ${pc(e,1)} → ${e>req(b)?"undervalued":"overvalued"}`])))};
  }
  if(id==="lev"){
    app.innerHTML=shell(rng("p","Price per unit",10,100,1,50,"")+rng("v","Variable cost per unit",1,90,1,30,"")+rng("F","Fixed costs ($K)",10,500,10,200,"")+rng("q","Units sold (K)",1,50,1,15,""),"The break-even point is where revenue (green) crosses total cost (red). Above it, each unit adds the contribution margin (P − V) to EBIT. High fixed costs mean a higher break-even but a bigger DOL, so EBIT swings more when sales change. That is operating leverage, a form of business risk.");
    redraw=()=>{let p=g$("p"),v=g$("v");if(v>=p){v=p-1}const F=g$("F")*1000,q=g$("q")*1000,be=F/(p-v),qmax=Math.max(50000,be*1.4),ebit=q*(p-v)-F,dol=ebit>0?q*(p-v)/ebit:NaN;
      const g=canvasFor("cv",300);if(g){const{c,w,h}=g,ymax=qmax*p,A=(c.clearRect(0,0,w,h),axes(c,w,h,{x0:0,x1:qmax,y0:0,y1:ymax,yt:ticks(0,ymax,4),fy:kfmt,xt:ticks(0,qmax,4),fx:v=>fmt(v/1000,0)+"K u"}));
        c.lineWidth=3;c.strokeStyle=col("accent");c.beginPath();c.moveTo(A.X(0),A.Y(0));c.lineTo(A.X(qmax),A.Y(qmax*p));c.stroke();c.strokeStyle=col("bad");c.beginPath();c.moveTo(A.X(0),A.Y(F));c.lineTo(A.X(qmax),A.Y(F+qmax*v));c.stroke();
        c.strokeStyle=col("muted");c.lineWidth=1.5;c.setLineDash([5,4]);c.beginPath();c.moveTo(A.X(0),A.Y(F));c.lineTo(A.X(qmax),A.Y(F));c.stroke();c.setLineDash([]);
        if(be<=qmax){c.beginPath();c.arc(A.X(be),A.Y(be*p),7,0,7);c.fillStyle=col("hi");c.fill();c.strokeStyle=col("ink");c.stroke()}
        c.strokeStyle=col("ink");c.setLineDash([2,3]);c.beginPath();c.moveTo(A.X(q),A.T);c.lineTo(A.X(q),h-A.B);c.stroke();c.setLineDash([])}
      $("#pv").textContent="$"+p;$("#vv").textContent="$"+v;$("#Fv").textContent="$"+g$("F")+"K";$("#qv").textContent=g$("q")+"K";
      outp([["contribution margin",`$${p-v} per unit (${fmt((p-v)/p*100,1)}%)`],["break-even",`${Math.ceil(be).toLocaleString()} units = ${m0(Math.ceil(be)*p)} revenue`],["EBIT at "+q.toLocaleString()+" units",m0(ebit)],["DOL",isNaN(dol)?"— (below break-even)":`${fmt(dol,2)}× → a 10% sales rise lifts EBIT about ${fmt(dol*10,1)}%`]])};
  }
  on("click",e=>{if(e.target.closest("[data-back]"))go("labs")});
  const onIn=e=>{if(e.target.matches("input,select")){if(e.target.type==="range"){const s=$("#"+e.target.id+"v");if(s)s.textContent=e.target.value+(e.target.dataset.unit||"")}redraw()}};on("input",onIn);on("change",onIn);
  const onR=()=>redraw();window.addEventListener("resize",onR);
  redraw();
  cleanup=()=>{window.removeEventListener("resize",onR);ls.forEach(([t,f])=>app.removeEventListener(t,f))};
}
function qnorm(p){/* Acklam inverse normal */const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.357751867269,-30.66479806614716,2.506628277459239],b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572],c=[-.007784894002430293,-.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783],d=[.007784695709041462,.3224671290700398,2.445134137142996,3.754408661907416];const pl=.02425;let q,r;if(p<pl){q=Math.sqrt(-2*Math.log(p));return(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}if(p<=1-pl){q=p-.5;r=q*q;return(((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)}q=Math.sqrt(-2*Math.log(1-p));return-(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}

/* ================= GAMES ================= */
const SORTS={
 cfs:{t:"Cash flow statement section",b:["Operating","Investing","Financing"],i:[["Add back depreciation",0],["Increase in accounts receivable",0],["Increase in inventory",0],["Increase in accounts payable",0],["Net income",0],["Buy new equipment",1],["Sell an old warehouse",1],["Buy another company's stock as an investment",1],["Issue new bonds",2],["Pay cash dividends",2],["Repurchase the firm's own shares",2],["Repay principal on a bank loan",2]]},
 ratio:{t:"Ratio category",b:["Liquidity","Efficiency","Leverage","Profitability","Market value"],i:[["Current ratio",0],["Quick ratio",0],["Inventory turnover",1],["Days sales outstanding",1],["Total asset turnover",1],["Debt ratio",2],["Times interest earned",2],["Equity multiplier",2],["Return on equity",3],["Net profit margin",3],["Return on assets",3],["Price-to-earnings ratio",4],["Market-to-book ratio",4],["Dividend yield",4]]},
 risk:{t:"Systematic or unsystematic risk",b:["Systematic (market)","Unsystematic (firm-specific)"],i:[["The Fed raises interest rates",0],["A recession hits the economy",0],["Inflation comes in far above forecast",0],["A global pandemic shuts down travel",0],["The CEO suddenly resigns",1],["A major product recall",1],["A lawsuit against one company",1],["A strike at one firm's factory",1],["The FDA rejects one company's drug",1]]},
 mkt:{t:"Which market?",b:["Primary market","Secondary market","Money market","Capital market"],i:[["A company sells new shares in its IPO",0],["A firm sells newly issued bonds through an underwriter",0],["One investor sells Apple shares to another on the NYSE",1],["Investors trade existing corporate bonds with each other",1],["90-day Treasury bills",2],["Commercial paper due in 60 days",2],["Negotiable certificates of deposit under one year",2],["30-year mortgage-backed securities",3],["Long-term corporate bonds",3],["Common stock held for years",3]]},
 rel:{t:"Relevant cash flow for capital budgeting?",b:["Include it","Exclude it"],i:[["Increase in net working capital for the project",0],["Rent you give up on a building the firm already owns",0],["Lost sales of an existing product (cannibalization)",0],["After-tax salvage value at the end",0],["Depreciation tax shield",0],["Market research already paid last year",1],["Interest payments on the loan used to fund it",1],["Corporate overhead that does not change",1],["Money spent on a failed prototype in the past",1]]},
 law:{t:"Which law or rule?",b:["Securities Act of 1933","Securities Exchange Act of 1934","Sarbanes-Oxley (2002)","Dodd-Frank (2010)"],i:[["Requires registration and a prospectus for new public securities",0],["“Truth in securities” — full disclosure when securities are first sold",0],["Created the SEC and regulates secondary-market trading",1],["Requires periodic reports like the 10-K and 10-Q",1],["CEO and CFO must certify the financial statements",2],["Passed after the Enron and WorldCom scandals",2],["Requires audits of internal controls",2],["Response to the 2008 financial crisis",3],["Created the Consumer Financial Protection Bureau",3],["Includes the Volcker Rule limiting bank proprietary trading",3]]},
 method:{t:"Capital budgeting method",b:["NPV","IRR","Payback","Profitability index","MIRR"],i:[["Dollar value a project adds to shareholder wealth",0],["Theoretically best decision method",0],["Discount rate that makes NPV equal zero",1],["Can have multiple answers when cash flows change sign twice",1],["Years until the initial investment is recovered",2],["Ignores all cash flows after the cutoff",2],["PV of future cash flows ÷ initial cost",3],["Useful for ranking projects under capital rationing",3],["Assumes cash flows are reinvested at the cost of capital",4]]},
 stmt:{t:"Which financial statement?",b:["Income statement","Balance sheet","Cash flow statement"],i:[["Revenue, expenses and net income over a period",0],["Earnings per share",0],["Cost of goods sold",0],["Assets = liabilities + equity at a point in time",1],["Retained earnings balance",1],["Accounts payable",1],["Long-term debt outstanding",1],["Cash from operating, investing and financing activities",2],["Capital expenditures for the year",2],["Dividends actually paid in cash",2]]}
};
function vGames(){
  if(sub&&sub.game==="match")return match(sub.unit||"mix");
  if(sub&&sub.game==="blitz")return blitz(sub.unit||"all");
  if(sub&&sub.game==="sort")return sortGame(sub.set||"cfs");
  app.innerHTML=`<div class="stack"><div><span class="eyebrow">Memory games</span><h1>Games</h1></div>
  <div class="grid">
   <div class="card stack" style="gap:10px"><h3>Sort It</h3><p class="muted small">Classify scenarios fast: cash flow sections, ratio types, systematic vs unsystematic risk, markets, relevant cash flows, securities laws, budgeting methods, statements.</p><select id="gs" aria-label="Set">${Object.entries(SORTS).map(([k,v])=>`<option value="${k}">${v.t}${S.best["sort_"+k]?` (best ${S.best["sort_"+k]}%)`:""}</option>`).join("")}</select><button class="btn primary" data-g="sort">Play Sort It</button></div>
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
const FORMULAS=[["Balance sheet","Assets = Liabilities + Equity"],["Free cash flow","EBIT(1 − T) + Depreciation − CapEx − ΔNWC"],["NOPAT","EBIT × (1 − T)"],["Current ratio","Current assets ÷ Current liabilities"],["Quick ratio","(CA − Inventory) ÷ CL"],["Inventory turnover","COGS ÷ Inventory"],["DSO","Receivables ÷ (Sales ÷ 365)"],["Debt ratio","Total debt ÷ Total assets"],["Times interest earned","EBIT ÷ Interest"],["ROA / ROE","NI ÷ Total assets / NI ÷ Equity"],["DuPont","ROE = Margin × Asset turnover × Equity multiplier"],["P/E · M/B","Price ÷ EPS · Price ÷ Book value per share"],["Cash conversion cycle","DIO + DSO − DPO"],["Cost of trade credit","d ÷ (1 − d) × 365 ÷ (net − discount days)"],["Future value","FV = PV(1 + r)ⁿ"],["Present value","PV = FV ÷ (1 + r)ⁿ"],["EAR","(1 + APR ÷ m)ᵐ − 1"],["Rule of 72","years to double ≈ 72 ÷ rate%"],["PV of annuity","PMT × [1 − (1 + r)⁻ⁿ] ÷ r"],["FV of annuity","PMT × [(1 + r)ⁿ − 1] ÷ r"],["Annuity due","ordinary annuity value × (1 + r)"],["Perpetuity","PV = C ÷ r · growing: C₁ ÷ (r − g)"],["Bond price","PV of coupons + Face ÷ (1 + YTM)ⁿ"],["Current yield","Annual coupon ÷ Price"],["Fisher","nominal ≈ real + inflation"],["Preferred stock","P = D ÷ r"],["Gordon growth","P₀ = D₁ ÷ (r − g), D₁ = D₀(1 + g)"],["Required return (DDM)","r = D₁ ÷ P₀ + g"],["Expected return","Σ pᵢ × rᵢ"],["Portfolio beta","Σ wᵢ × βᵢ"],["CAPM","r = rf + β(rm − rf)"],["After-tax cost of debt","rd × (1 − T)"],["Cost of preferred","Dp ÷ Pp"],["WACC","wd·rd(1 − T) + wp·rp + we·re"],["NPV","Σ CFₜ ÷ (1 + r)ᵗ − initial cost; accept if > 0"],["IRR","rate where NPV = 0; accept if IRR > WACC"],["Profitability index","PV of inflows ÷ initial cost; accept if > 1"],["Payback","years until cumulative CF recovers cost"],["Break-even units","Fixed costs ÷ (Price − Variable cost)"],["DOL · DFL · DTL","%ΔEBIT÷%ΔSales · %ΔEPS÷%ΔEBIT · DOL × DFL"],["Interest tax shield","T × Interest (perpetual debt: T × D)"]];
function vCram(){
  app.innerHTML=`<div class="stack"><div class="row between"><div><span class="eyebrow">The night before</span><h1>Cram sheet &amp; tools</h1></div><div class="row noprint"><button class="btn primary" data-pod>▶ Podcast mode (all units)</button><button class="btn" data-print>Print / save PDF</button></div></div>
  <p class="muted noprint">Podcast mode reads every unit's memory hook, key points and exam traps aloud in order. Good for the car or the gym.</p>
  <h2>Formula sheet</h2><div class="formula">${FORMULAS.map(([n,f])=>`<div><b>${esc(n)}</b><div class="f">${esc(f)}</div></div>`).join("")}</div>
  <h2>Must-know by unit</h2><div class="grid">${U.map(u=>`<div class="card stack" style="gap:8px"><span class="eyebrow">Unit ${u.id.slice(1)}</span><h3>${esc(u.title)}</h3>${u.mnemonic?`<p><span class="mark"><strong>${esc(u.mnemonic)}</strong></span></p>`:""}<ul style="margin:0;padding-left:1.1em" class="small">${(u.cram.length?u.cram:u.keyPoints.slice(0,6)).map(c=>`<li>${esc(c)}</li>`).join("")}</ul>${u.traps.length?`<p class="small" style="color:var(--bad)"><strong>Traps:</strong> ${esc(u.traps.slice(0,3).map(t=>t.replace(/^Trap:\s*/,"")).join(" · "))}</p>`:""}</div>`).join("")}</div>
  <div class="noprint stack"><h2>Financial calculator</h2>
  <section class="card stack" style="gap:10px"><h3>Time value of money (TVM) solver</h3><p class="muted small">Works like a BA II Plus. Money you pay out is negative and money you receive is positive. Enter four values, pick the one to solve for, and press Solve.</p>
   <div class="ctl"><div class="field"><label for="tN">N (periods)</label><input id="tN" type="number" value="10"></div><div class="field"><label for="tI">I/Y (% per period)</label><input id="tI" type="number" value="6"></div><div class="field"><label for="tPV">PV</label><input id="tPV" type="number" value="-1000"></div><div class="field"><label for="tPMT">PMT</label><input id="tPMT" type="number" value="0"></div><div class="field"><label for="tFV">FV</label><input id="tFV" type="number" value="0"></div><div class="field"><label for="tM">Payments at</label><select id="tM"><option value="0">End (ordinary)</option><option value="1">Beginning (due)</option></select></div><div class="field"><label for="tS">Solve for</label><select id="tS"><option>FV</option><option>PV</option><option>PMT</option><option>N</option><option>I/Y</option></select></div><button class="btn primary" data-c="tvm">Solve</button></div><dl class="out" id="tvo"></dl></section>
  <section class="card stack" style="gap:10px"><h3>NPV · IRR · MIRR · payback · PI</h3><label for="cf">Cash flows, CF0 first (comma separated)</label><input id="cf" value="-50000, 15000, 18000, 20000, 12000"><div class="ctl"><div class="field"><label for="cr">Cost of capital %</label><input id="cr" type="number" value="10"></div><button class="btn primary" data-c="cb">Calculate</button></div><dl class="out" id="cbo"></dl></section>
  <section class="card stack" style="gap:10px"><h3>Bond price &amp; YTM</h3><div class="ctl"><div class="field"><label for="bF">Face</label><input id="bF" type="number" value="1000"></div><div class="field"><label for="bC">Coupon %</label><input id="bC" type="number" value="6"></div><div class="field"><label for="bY">YTM % (blank = solve)</label><input id="bY" type="number" value="8"></div><div class="field"><label for="bP">Price (for YTM)</label><input id="bP" type="number" value="950"></div><div class="field"><label for="bN">Years</label><input id="bN" type="number" value="10"></div><div class="field"><label for="bM">Coupons / yr</label><select id="bM"><option>1</option><option selected>2</option></select></div><button class="btn primary" data-c="bd">Calculate</button></div><dl class="out" id="bdo"></dl></section>
  <section class="card stack" style="gap:10px"><h3>CAPM &amp; WACC</h3><div class="ctl"><div class="field"><label for="wrf">Risk-free %</label><input id="wrf" type="number" value="4"></div><div class="field"><label for="wrm">Market return %</label><input id="wrm" type="number" value="10"></div><div class="field"><label for="wb">Beta</label><input id="wb" type="number" value="1.2"></div><div class="field"><label for="wwd">Debt weight %</label><input id="wwd" type="number" value="40"></div><div class="field"><label for="wwp">Preferred weight %</label><input id="wwp" type="number" value="0"></div><div class="field"><label for="wrd">Pre-tax cost of debt %</label><input id="wrd" type="number" value="7"></div><div class="field"><label for="wrp">Cost of preferred %</label><input id="wrp" type="number" value="0"></div><div class="field"><label for="wT">Tax rate %</label><input id="wT" type="number" value="25"></div><button class="btn primary" data-c="wc">Calculate</button></div><dl class="out" id="wco"></dl></section></div></div>`;
  const out=(id,rows)=>{$(id).innerHTML=rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")};
  const nums=s=>s.split(/[\s,;]+/).map(Number).filter(x=>x===x&&isFinite(x));
  const v=id=>{const s=$("#"+id).value;return s===""?NaN:+s};
  function tvmF(N,i,PV,PMT,FV,t){if(Math.abs(i)<1e-12)return PV+PMT*N+FV;const a=(1-Math.pow(1+i,-N))/i;return PV+PMT*(1+i*t)*a+FV*Math.pow(1+i,-N)}
  function bis(f,lo,hi){let flo=f(lo);if(!(flo*f(hi)<=0))return NaN;for(let k=0;k<300;k++){const m=(lo+hi)/2,fm=f(m);if(flo*fm<=0)hi=m;else{lo=m;flo=fm}}return(lo+hi)/2}
  function calc(c){
    if(c==="tvm"){const N=v("tN"),i=v("tI")/100,PV=v("tPV"),PMT=v("tPMT"),FV=v("tFV"),t=+$("#tM").value,s=$("#tS").value;let r,lab=s;
      if(s==="FV"){r=Math.abs(i)<1e-12?-(PV+PMT*N):-(PV+PMT*(1+i*t)*(1-Math.pow(1+i,-N))/i)*Math.pow(1+i,N)}
      else if(s==="PV"){r=Math.abs(i)<1e-12?-(PMT*N+FV):-(PMT*(1+i*t)*(1-Math.pow(1+i,-N))/i+FV*Math.pow(1+i,-N))}
      else if(s==="PMT"){r=Math.abs(i)<1e-12?-(PV+FV)/N:-(PV+FV*Math.pow(1+i,-N))/((1+i*t)*(1-Math.pow(1+i,-N))/i)}
      else if(s==="N"){r=bis(n=>tvmF(n,i,PV,PMT,FV,t),1e-6,2000)}
      else{r=bis(x=>tvmF(N,x,PV,PMT,FV,t),-.99,5);r=r*100;lab="I/Y (%)"}
      return out("#tvo",[[lab,isNaN(r)?"No solution — check your signs (one of PV/PMT/FV should be negative).":fmt(r,s==="N"||s==="I/Y"?4:2)],["equation","PV + PMT·annuity factor + FV·(1+i)^−N = 0"],["Excel",s==="FV"?`=FV(${i},${N},${PMT},${PV},${t})`:s==="PV"?`=PV(${i},${N},${PMT},${FV},${t})`:s==="PMT"?`=PMT(${i},${N},${PV},${FV},${t})`:s==="N"?`=NPER(${i},${PMT},${PV},${FV},${t})`:`=RATE(${N},${PMT},${PV},${FV},${t})`]])}
    if(c==="cb"){const cf=nums($("#cf").value),r=v("cr")/100;if(cf.length<2)return out("#cbo",[["Error","Enter CF0 and at least one future cash flow."]]);
      const n=npvF(r,cf),irr=irrF(cf),N=cf.length-1;const fvIn=cf.slice(1).reduce((s,x,t)=>s+(x>0?x*Math.pow(1+r,N-1-t):0),0),pvOut=-cf.reduce((s,x,t)=>s+(x<0?x/Math.pow(1+r,t):0),0),mirr=pvOut>0?Math.pow(fvIn/pvOut,1/N)-1:NaN;
      let cum=cf[0],pb=NaN,dcum=cf[0],dpb=NaN;for(let t=1;t<=N;t++){if(isNaN(pb)&&cum+cf[t]>=0)pb=t-1+(-cum)/cf[t];cum+=cf[t];const d=cf[t]/Math.pow(1+r,t);if(isNaN(dpb)&&dcum+d>=0)dpb=t-1+(-dcum)/d;dcum+=d}
      const pi=-cf[0]>0?(n-cf[0])/(-cf[0]):NaN;
      out("#cbo",[["NPV",m2(n)+(n>0?" → accept":" → reject")],["IRR",isNaN(irr)?"—":pc(irr,2)],["MIRR",isNaN(mirr)?"—":pc(mirr,2)],["profitability index",isNaN(pi)?"—":fmt(pi,3)],["payback",isNaN(pb)?"never recovered":fmt(pb,2)+" years"],["discounted payback",isNaN(dpb)?"never recovered":fmt(dpb,2)+" years"],["Excel",`=NPV(${r},CF1:CF${N}) + CF0  ·  =IRR(CF0:CF${N})`]])}
    if(c==="bd"){const F=v("bF"),cr=v("bC")/100,y=v("bY")/100,P=v("bP"),n=v("bN"),m=+$("#bM").value;
      if(!isNaN(y)){const pr=bondP(F,cr,y,n,m);out("#bdo",[["price",m2(pr)],["trades at",Math.abs(pr-F)<.005?"par":pr>F?"premium":"discount"],["current yield",pc(F*cr/pr,3)]])}
      else{const ytm=bis(x=>bondP(F,cr,x,n,m)-P,-.5,2);out("#bdo",[["YTM",isNaN(ytm)?"—":pc(ytm,3)],["current yield",pc(F*cr/P,3)]])}}
    if(c==="wc"){const rf=v("wrf")/100,rm=v("wrm")/100,b=v("wb"),wd=v("wwd")/100,wp=v("wwp")/100,rdb=v("wrd")/100,rp=v("wrp")/100,T=v("wT")/100,re=rf+b*(rm-rf),we=1-wd-wp,w=wd*rdb*(1-T)+wp*rp+we*re;
      out("#wco",[["cost of equity (CAPM)",pc(re,3)],["after-tax cost of debt",pc(rdb*(1-T),3)],["equity weight",pc(we,1)],["WACC",pc(w,3)],["meaning","Average-risk projects must earn more than this to add value."]])}}
  ["tvm","cb","bd","wc"].forEach(calc);
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
