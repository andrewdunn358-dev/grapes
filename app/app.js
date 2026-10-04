(function(){
"use strict";
const CATS=["Drinks stock (brewery, wholesaler)","Food & snacks stock","Cleaning & bar consumables","Gas, electric & water","Repairs & maintenance","Rent / tie payments","Insurance & licences","Sky / TV / music licences","Entertainment (bands, quiz)","Equipment","Bank & card machine charges","Phone & internet","Other"];
const HOW=["Cash from till","Card","Bank transfer","Direct debit","Cheque"];
const VAT_THRESHOLD=9000000; // £90,000 in pence
const COLS=["takings","expenses","wages","banking"];
const data={takings:[],expenses:[],wages:[],banking:[]};
let settings={vat:false,staff:[],float:0};
let me=null,users=[];
let status="loading"; // loading | ok | offline
const now=new Date();
let month=ym(now);
const editing={expenses:null,wages:null};

/* ---------- helpers ---------- */
function $(id){return document.getElementById(id)}
function pad(n){return String(n).padStart(2,"0")}
function ymd(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())}
function ym(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)}
function today(){return ymd(new Date())}
function toP(v){if(v===""||v==null)return 0;const n=Math.round(parseFloat(v)*100);return isFinite(n)?n:0}
function fromP(p){return p?(p/100).toFixed(2):""}
function gbp(p){const neg=p<0;const s=(Math.abs(p)/100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2});return (neg?"−£":"£")+s}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function newId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function dLabel(s){const d=new Date(s+"T12:00:00");return d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric"})}
function mLabel(m){const d=new Date(m+"-15T12:00:00");return d.toLocaleDateString("en-GB",{month:"long",year:"numeric"})}
function inMonth(arr){return arr.filter(r=>r.date&&r.date.slice(0,7)===month).sort((a,b)=>b.date.localeCompare(a.date)||(b.at||0)-(a.at||0))}
function sum(arr,f){return arr.reduce((t,r)=>t+(f(r)||0),0)}
function isCash(how){return how==="Cash from till"}
function toast(msg){const t=$("toast");t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2200)}

/* ---------- talking to the website ---------- */
async function api(action,body){
  const opts=body?{method:"POST",headers:{"Content-Type":"application/json","X-Grapes":"1"},body:JSON.stringify(body),credentials:"same-origin"}:{credentials:"same-origin",cache:"no-store"};
  const r=await fetch("api.php?a="+action,opts);
  if(r.status===401){location.reload();throw new Error("login")}
  if(!r.ok){let c="http "+r.status;try{c=(await r.json()).error||c}catch(e){}throw new Error(c)}
  return r.json();
}
async function refresh(){
  try{
    const j=await api("all");
    COLS.forEach(c=>data[c]=Array.isArray(j[c])?j[c]:[]);
    if(j.settings&&typeof j.settings==="object"){settings={vat:!!j.settings.vat,staff:Array.isArray(j.settings.staff)?j.settings.staff:[],float:j.settings.float||0}}
    me=j.me||null;users=Array.isArray(j.users)?j.users:[];
    const first=status==="loading";status="ok";
    if(first)fillSetup();
    renderAll();
    if(first)loadDay();
  }catch(e){if(e.message!=="login"){status="offline";renderBanner()}}
}
async function put(col,id,obj){
  obj.at=Date.now();
  try{const r=await api("put",{col,id,data:obj});if(r&&r.by)obj.by=r.by}
  catch(e){toast("Couldn't save. Check the signal and try again.");return false}
  const arr=data[col];const i=arr.findIndex(r=>r.id===id);const rec=Object.assign({id},obj);
  if(i>=0)arr[i]=rec;else arr.push(rec);
  status="ok";renderAll();return true;
}
async function del(col,id){
  try{await api("del",{col,id})}catch(e){toast("Couldn't delete. Try again.");return}
  data[col]=data[col].filter(r=>r.id!==id);renderAll();toast("Deleted");
}
async function saveSettings(){
  try{await api("settings",{settings})}catch(e){toast("Couldn't save setup");return}
  toast("Setup saved");renderAll();
}

/* ---------- rendering ---------- */
function renderBanner(){
  $("banner").innerHTML=status==="offline"?'<div class="banner warn"><b>Can\'t reach the books right now.</b> Check the Wi-Fi or mobile signal. Nothing new will save until it\'s back.</div>':"";
}
function renderAll(){
  $("mLabel").textContent=mLabel(month);
  $("nextM").disabled=month>=ym(new Date());
  renderBanner();renderDay();renderSuggestions();renderMonth();renderLists();renderPeople();renderRange();
  $("sVatWrap").hidden=!settings.vat;
}

function itemHTML(col,r,main,sub,amt,editable){
  return `<div class="item"><span class="d">${dLabel(r.date)}</span><span class="w"><b>${esc(main)}</b>${sub?`<small>${esc(sub)}</small>`:""}${r.by?`<span class="by">Entered by ${esc(r.by)}</span>`:""}</span><span class="amt">${gbp(amt)}</span><span class="ops">${editable?`<button type="button" data-edit="${col}:${esc(r.id)}">Edit</button>`:""}<button type="button" data-del="${col}:${esc(r.id)}">Delete</button></span></div>`;
}
function emptyHTML(t){return `<p class="empty">${t}</p>`}

function renderLists(){
  if(status==="loading"){["lDay","lSpend","lWage","lBank"].forEach(id=>$(id).innerHTML=emptyHTML("Loading…"));return}
  const tk=inMonth(data.takings);
  $("lDay").innerHTML=tk.length?tk.map(r=>itemHTML("takings",r,"Card "+gbp(r.card||0)+" · Cash "+gbp(r.cash||0),r.note||"",(r.card||0)+(r.cash||0),true)).join(""):emptyHTML("No takings entered for "+mLabel(month)+" yet. Fill in the form above at the end of each day.");
  const ex=inMonth(data.expenses);
  $("lSpend").innerHTML=ex.length?ex.map(r=>itemHTML("expenses",r,r.who,[r.cat,r.how,r.note].filter(Boolean).join(" · "),r.amount,true)).join(""):emptyHTML("Nothing spent this month yet. Add each receipt or invoice as it comes in.");
  const wg=inMonth(data.wages);
  $("lWage").innerHTML=wg.length?wg.map(r=>itemHTML("wages",r,r.who,[r.hours?r.hours+" hrs":"",r.how,r.note].filter(Boolean).join(" · "),r.amount,true)).join(""):emptyHTML("No wages recorded this month yet.");
  const bk=inMonth(data.banking);
  $("lBank").innerHTML=bk.length?bk.map(r=>itemHTML("banking",r,"Paid in",r.note||"",r.amount,false)).join(""):emptyHTML("No cash paid in this month yet.");
}

/* cash that should be on the premises (beyond the float) */
function cashPosition(upTo){
  const f=r=>!upTo||r.date<=upTo;
  const inC=sum(data.takings.filter(f),r=>r.cash);
  const outEx=sum(data.expenses.filter(r=>f(r)&&isCash(r.how)),r=>r.amount);
  const outW=sum(data.wages.filter(r=>f(r)&&isCash(r.how)),r=>r.amount);
  const banked=sum(data.banking.filter(f),r=>r.amount);
  return inC-outEx-outW-banked;
}

function renderDay(){
  const tk=inMonth(data.takings);
  const total=sum(tk,r=>(r.card||0)+(r.cash||0));
  const days=tk.length;
  const pos=cashPosition();
  $("cashFigs").innerHTML=`
    <div class="fig"><h3>Taken this month</h3><span class="v">${gbp(total)}</span><span class="s">${days} day${days===1?"":"s"} entered</span></div>
    <div class="fig"><h3>Average day</h3><span class="v">${gbp(days?Math.round(total/days):0)}</span><span class="s">card and cash together</span></div>
    <div class="fig"><h3>Cash that should be in the safe</h3><span class="v ${pos<0?"neg":""}">${gbp(pos)}</span><span class="s">cash taken, less cash spent, paid out and banked${settings.float?" · plus the "+gbp(settings.float)+" float":""}</span></div>`;
}
function dayCheck(){
  const z=toP($("dZ").value),c=toP($("dCard").value)+toP($("dCash").value);
  const el=$("dCheck");
  if(!$("dZ").value||(!$("dCard").value&&!$("dCash").value)){el.innerHTML="";return}
  const diff=c-z;
  if(Math.abs(diff)<1)el.innerHTML=`<div class="check good"><b>Balances.</b> Card and cash match the Z-read.</div>`;
  else{const cls=Math.abs(diff)<=500?"warn":"bad";el.innerHTML=`<div class="check ${cls}"><b>${diff>0?"Over":"Short"} by ${gbp(Math.abs(diff))}.</b> Card + cash is ${gbp(c)} against a Z-read of ${gbp(z)}.</div>`}
}
function loadDay(){
  const d=$("dDate").value;const r=data.takings.find(x=>x.id===d);
  $("dZ").value=r?fromP(r.z):"";$("dCard").value=r?fromP(r.card):"";$("dCash").value=r?fromP(r.cash):"";$("dNote").value=r?r.note||"":"";
  $("dState").textContent=r?"Already entered. Saving will update it.":"";
  $("dSave").textContent=r?"Update takings":"Save takings";
  dayCheck();
}

function renderSuggestions(){
  const sups=[...new Set(data.expenses.map(r=>r.who).filter(Boolean))].sort();
  $("supList").innerHTML=sups.map(s=>`<option value="${esc(s)}">`).join("");
  const names=[...new Set(settings.staff.concat(data.wages.map(r=>r.who)).filter(Boolean))].sort();
  $("staffList").innerHTML=names.map(s=>`<option value="${esc(s)}">`).join("");
}

function renderMonth(){
  const tk=inMonth(data.takings),ex=inMonth(data.expenses),wg=inMonth(data.wages),bk=inMonth(data.banking);
  const card=sum(tk,r=>r.card),cash=sum(tk,r=>r.cash),tot=card+cash;
  const spend=sum(ex,r=>r.amount),wages=sum(wg,r=>r.amount),left=tot-spend-wages;
  $("mTitle").textContent=mLabel(month);
  $("mFigs").innerHTML=`
    <div class="fig"><h3>Money in</h3><span class="v">${gbp(tot)}</span><span class="s">card ${gbp(card)} · cash ${gbp(cash)}</span></div>
    <div class="fig"><h3>Spending</h3><span class="v">${gbp(spend)}</span><span class="s">${ex.length} item${ex.length===1?"":"s"}</span></div>
    <div class="fig"><h3>Wages</h3><span class="v">${gbp(wages)}</span><span class="s">${wg.length} payment${wg.length===1?"":"s"}</span></div>
    <div class="fig"><h3>Left over</h3><span class="v ${left<0?"neg":""}">${gbp(left)}</span><span class="s">before tax and any bills not entered</span></div>`;
  const [y,m]=month.split("-").map(Number);const dim=new Date(y,m,0).getDate();
  const per=Array.from({length:dim},(_,i)=>{const r=tk.find(x=>x.date===month+"-"+pad(i+1));return r?(r.card||0)+(r.cash||0):0});
  const max=Math.max(...per,1);
  $("mBars").innerHTML=per.map((v,i)=>`<div class="${v?"":"zero"}" style="height:${(v/max*100).toFixed(1)}%" title="${i+1}: ${gbp(v)}"></div>`).join("");
  $("mBarsEnd").textContent=dim+(dim===31?"st":"th");
  if(tk.length){const t=r=>(r.card||0)+(r.cash||0);const best=tk.reduce((a,b)=>t(a)>=t(b)?a:b);
    const dow={};tk.forEach(r=>{const k=new Date(r.date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long"});(dow[k]=dow[k]||[]).push(t(r))});
    const avg=Object.entries(dow).map(([k,v])=>[k,v.reduce((a,b)=>a+b,0)/v.length]).sort((a,b)=>b[1]-a[1])[0];
    $("mBest").textContent=`Best day: ${new Date(best.date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric"})} at ${gbp(t(best))}. Busiest on average: ${avg[0]}s.`;
  }else $("mBest").textContent="No takings entered for this month.";
  const byCat={};ex.forEach(r=>byCat[r.cat||"Other"]=(byCat[r.cat||"Other"]||0)+r.amount);
  const rows=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  $("mCats").innerHTML=rows.length?rows.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${gbp(v)}</td></tr>`).join("")+`<tr class="total"><td>Total</td><td>${gbp(spend)}</td></tr>`:`<tr><td class="muted">Nothing spent this month yet</td><td></td></tr>`;
  const exC=sum(ex.filter(r=>isCash(r.how)),r=>r.amount),wgC=sum(wg.filter(r=>isCash(r.how)),r=>r.amount),bank=sum(bk,r=>r.amount);
  const prevEnd=ymd(new Date(y,m-1,0));const start=cashPosition(prevEnd);const end=start+cash-exC-wgC-bank;
  $("mCash").innerHTML=`<tr><td>Cash in safe at start</td><td>${gbp(start)}</td></tr><tr><td>+ Cash taken</td><td>${gbp(cash)}</td></tr><tr><td>− Spent from the till</td><td>${gbp(exC)}</td></tr><tr><td>− Wages paid in cash</td><td>${gbp(wgC)}</td></tr><tr><td>− Paid into bank</td><td>${gbp(bank)}</td></tr><tr class="total"><td>Should be in safe at month end</td><td>${gbp(end)}</td></tr>`;
  const last12Start=ymd(new Date(y,m-12,1)),endM=ymd(new Date(y,m,0));
  const roll=sum(data.takings.filter(r=>r.date>=last12Start&&r.date<=endM),r=>(r.card||0)+(r.cash||0));
  if(settings.vat){
    const outV=Math.round(tot/6),inV=sum(ex,r=>r.vat||0);
    $("mVat").innerHTML=`<h3>VAT for ${mLabel(month)}</h3><table class="t"><tr><td>VAT in takings (one sixth of ${gbp(tot)})</td><td>${gbp(outV)}</td></tr><tr><td>VAT on spending (from receipts)</td><td>${gbp(inV)}</td></tr><tr class="total"><td>Rough amount owed to HMRC</td><td>${gbp(outV-inV)}</td></tr></table><p class="muted" style="font-size:.88rem">A guide only. It assumes everything sold is standard-rated at 20%. The accountant files the real return.</p>`;
  }else{
    const pct=Math.min(roll/VAT_THRESHOLD,1),cls=pct>=1?"bad":pct>=.85?"warn":"";
    $("mVat").innerHTML=`<h3>VAT threshold watch</h3><div class="figs"><div class="fig"><span class="v">${gbp(roll)}</span><span class="s">takings in the 12 months to the end of ${mLabel(month)}</span></div><div class="fig"><span class="v">${Math.round(roll/VAT_THRESHOLD*100)}%</span><span class="s">of the £90,000 registration threshold</span></div></div><div class="meter"><i class="${cls}" style="width:${(pct*100).toFixed(1)}%"></i></div><p class="muted" style="font-size:.88rem">${pct>=1?"Over the threshold. Speak to the accountant about VAT registration straight away.":pct>=.85?"Getting close. Worth a word with the accountant.":"Only counts days entered here. If the pub is already VAT registered, tick the box on the Setup tab."}</p>`;
  }
}

/* ---------- forms ---------- */
function fillSetup(){$("setVat").checked=!!settings.vat;$("setStaff").value=(settings.staff||[]).join("\n");$("setFloat").value=fromP(settings.float)}
function fillCats(){$("sCat").innerHTML=CATS.map(c=>`<option>${c}</option>`).join("");$("sHow").innerHTML=HOW.map(c=>`<option>${c}</option>`).join("")}

$("fDay").addEventListener("submit",async e=>{e.preventDefault();
  const d=$("dDate").value;if(!d)return;
  if(!$("dCard").value&&!$("dCash").value){toast("Enter the card or cash figure");return}
  const ok=await put("takings",d,{date:d,z:toP($("dZ").value),card:toP($("dCard").value),cash:toP($("dCash").value),note:$("dNote").value.trim()});
  if(ok){toast("Takings saved for "+dLabel(d));const n=new Date(d+"T12:00:00");n.setDate(n.getDate()+1);if(ymd(n)<=today()){$("dDate").value=ymd(n)}loadDay()}
});
["dZ","dCard","dCash"].forEach(id=>$(id).addEventListener("input",dayCheck));
$("dDate").addEventListener("change",loadDay);

function resetSpend(){editing.expenses=null;$("fSpend").reset();$("sDate").value=today();$("sEditing").innerHTML="";$("sCancel").hidden=true}
$("fSpend").addEventListener("submit",async e=>{e.preventDefault();
  const id=editing.expenses||newId();
  const rec={date:$("sDate").value,who:$("sWho").value.trim(),cat:$("sCat").value,amount:toP($("sAmt").value),vat:settings.vat?toP($("sVat").value):0,how:$("sHow").value,note:$("sNote").value.trim()};
  if(!rec.amount){toast("Enter the amount");return}
  const wasEdit=!!editing.expenses;
  if(await put("expenses",id,rec)){toast(wasEdit?"Updated":"Saved: "+gbp(rec.amount)+" to "+rec.who);const keep=rec.date;resetSpend();$("sDate").value=keep}
});
$("sCancel").addEventListener("click",resetSpend);

function resetWage(){editing.wages=null;$("fWage").reset();$("wDate").value=today();$("wEditing").innerHTML="";$("wCancel").hidden=true}
function wageCalc(){const h=parseFloat($("wHrs").value),r=parseFloat($("wRate").value);if(h>0&&r>0)$("wAmt").value=(Math.round(h*r*100)/100).toFixed(2)}
$("wHrs").addEventListener("input",wageCalc);$("wRate").addEventListener("input",wageCalc);
$("wWho").addEventListener("change",()=>{const last=data.wages.filter(r=>r.who===$("wWho").value&&r.rate).sort((a,b)=>b.date.localeCompare(a.date))[0];if(last&&!$("wRate").value){$("wRate").value=fromP(last.rate);wageCalc()}});
$("fWage").addEventListener("submit",async e=>{e.preventDefault();
  const id=editing.wages||newId();
  const rec={date:$("wDate").value,who:$("wWho").value.trim(),hours:parseFloat($("wHrs").value)||0,rate:toP($("wRate").value),amount:toP($("wAmt").value),how:$("wHow").value,note:$("wNote").value.trim()};
  if(!rec.amount){toast("Enter the amount paid");return}
  const wasEdit=!!editing.wages;
  if(await put("wages",id,rec)){toast(wasEdit?"Updated":"Saved: "+gbp(rec.amount)+" to "+rec.who);const keep=rec.date;resetWage();$("wDate").value=keep}
});
$("wCancel").addEventListener("click",resetWage);

$("fBank").addEventListener("submit",async e=>{e.preventDefault();
  const rec={date:$("bDate").value,amount:toP($("bAmt").value),note:$("bNote").value.trim()};
  if(!rec.amount){toast("Enter the amount banked");return}
  if(await put("banking",newId(),rec)){toast("Banking saved");$("bAmt").value="";$("bNote").value=""}
});

$("fSet").addEventListener("submit",e=>{e.preventDefault();
  settings={vat:$("setVat").checked,staff:$("setStaff").value.split("\n").map(s=>s.trim()).filter(Boolean),float:toP($("setFloat").value)};
  saveSettings();
});

/* edit / delete (two taps to delete) */
document.addEventListener("click",e=>{
  const ed=e.target.closest("[data-edit]"),dl=e.target.closest("[data-del]");
  if(dl){const [c,id]=dl.dataset.del.split(":");
    if(dl.classList.contains("armed"))del(c,id);
    else{document.querySelectorAll(".armed").forEach(b=>{b.classList.remove("armed");b.textContent="Delete"});dl.classList.add("armed");dl.textContent="Tap again to delete";setTimeout(()=>{if(dl.isConnected){dl.classList.remove("armed");dl.textContent="Delete"}},4000)}
    return}
  if(ed){const [c,id]=ed.dataset.edit.split(":");const r=data[c].find(x=>x.id===id);if(!r)return;
    if(c==="takings"){$("dDate").value=r.date;loadDay()}
    if(c==="expenses"){editing.expenses=id;$("sDate").value=r.date;$("sWho").value=r.who||"";$("sCat").value=r.cat;$("sAmt").value=fromP(r.amount);$("sVat").value=fromP(r.vat);$("sHow").value=r.how;$("sNote").value=r.note||"";$("sEditing").innerHTML=`<div class="editing">Editing ${esc(r.who)} · ${gbp(r.amount)}</div>`;$("sCancel").hidden=false}
    if(c==="wages"){editing.wages=id;$("wDate").value=r.date;$("wWho").value=r.who||"";$("wHrs").value=r.hours||"";$("wRate").value=fromP(r.rate);$("wAmt").value=fromP(r.amount);$("wHow").value=r.how;$("wNote").value=r.note||"";$("wEditing").innerHTML=`<div class="editing">Editing ${esc(r.who)} · ${gbp(r.amount)}</div>`;$("wCancel").hidden=false}
    window.scrollTo({top:0,behavior:"smooth"});
  }
});

/* tabs + month */
const TABKEY="grapes-keeper-tab";
function showTab(t){document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===t));
  document.querySelectorAll("section.panel").forEach(s=>s.hidden=s.id!=="tab-"+t);try{localStorage.setItem(TABKEY,t)}catch(e){}}
document.querySelectorAll("nav.tabs button").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
function shiftM(n){const [y,m]=month.split("-").map(Number);month=ym(new Date(y,m-1+n,1));renderAll()}
$("prevM").addEventListener("click",()=>shiftM(-1));$("nextM").addEventListener("click",()=>shiftM(1));

/* ---------- people & passwords ---------- */
const ERR={wrong_current:"Your current password isn't right.",too_short:"Passwords need at least 8 characters.",username_taken:"That username is already used.",bad_username:"Usernames use letters, numbers, dots or dashes, with no spaces.",no_name:"Enter their name.",last_admin:"There must always be at least one admin.",self:"You can't remove your own account.",admin_only:"Only an admin can do that."};
function errMsg(e){return ERR[e&&e.message]||"Couldn't save. Check the signal and try again."}
function renderPeople(){
  if(!me){$("meLine").textContent="";$("usersCard").hidden=true;return}
  $("meLine").textContent=`Logged in as ${me.name} (${me.username})${me.role==="admin"?" · admin":""}`;
  $("usersCard").hidden=me.role!=="admin";
  if(me.role!=="admin")return;
  const open=document.querySelector("#userList .reset:not([hidden])");const openId=open?open.dataset.uid:null;
  $("userList").innerHTML=users.map(u=>`<div class="user-row"><div><b>${esc(u.name)}</b>${u.id===me.id?' <span class="pill">you</span>':""}<br><small>${esc(u.username)} · ${u.role==="admin"?"admin":"books only"}</small></div>
    <div class="ops"><button type="button" data-act="pw" data-uid="${u.id}">Reset password</button>${u.id!==me.id?`<button type="button" data-act="role" data-uid="${u.id}">${u.role==="admin"?"Make books only":"Make admin"}</button><button type="button" data-act="del" data-uid="${u.id}">Remove</button>`:""}</div>
    <div class="reset" data-uid="${u.id}" ${openId===u.id?"":"hidden"}><input type="text" id="np-${u.id}" placeholder="New password (8+ characters)" autocomplete="new-password"><button type="button" class="btn primary" data-act="pwsave" data-uid="${u.id}" style="min-height:40px;padding:8px 16px">Save</button></div></div>`).join("");
}
$("userList").addEventListener("click",async e=>{
  const b=e.target.closest("button[data-act]");if(!b)return;const uid=b.dataset.uid,act=b.dataset.act;const u=users.find(x=>x.id===uid);if(!u)return;
  try{
    if(act==="pw"){const r=document.querySelector(`.reset[data-uid="${uid}"]`);r.hidden=!r.hidden;if(!r.hidden)$("np-"+uid).focus();return}
    if(act==="pwsave"){const pw=$("np-"+uid).value;const j=await api("user_update",{userId:uid,password:pw});users=j.users;renderPeople();toast("Password changed for "+u.name);return}
    if(act==="role"){const j=await api("user_update",{userId:uid,role:u.role==="admin"?"user":"admin"});users=j.users;renderPeople();toast("Updated "+u.name);return}
    if(act==="del"){
      if(!b.classList.contains("armed")){b.classList.add("armed");b.textContent="Tap again to remove";setTimeout(()=>{if(b.isConnected){b.classList.remove("armed");b.textContent="Remove"}},4000);return}
      const j=await api("user_del",{userId:uid});users=j.users;renderPeople();toast(u.name+" removed");
    }
  }catch(err){toast(errMsg(err))}
});
$("fUser").addEventListener("submit",async e=>{e.preventDefault();
  try{const j=await api("user_add",{name:$("uName").value.trim(),username:$("uUser").value.trim(),password:$("uPass").value,role:$("uRole").value});
    users=j.users;const n=$("uName").value.trim();$("fUser").reset();renderPeople();toast(n+" can now log in");}
  catch(err){toast(errMsg(err))}
});
$("uName").addEventListener("input",()=>{if(!$("uUser").dataset.touched)$("uUser").value=$("uName").value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g,"")});
$("uUser").addEventListener("input",()=>$("uUser").dataset.touched="1");
$("fMyPw").addEventListener("submit",async e=>{e.preventDefault();
  if($("pwNew1").value!==$("pwNew2").value){toast("The two new passwords don't match.");return}
  try{await api("my_password",{current:$("pwCur").value,new:$("pwNew1").value});$("fMyPw").reset();toast("Password changed. Other devices will need the new one.")}
  catch(err){toast(errMsg(err))}
});

/* ---------- reports: print and export ---------- */
function reportRange(){
  const kind=$("rPeriod").value;const [y,m]=month.split("-").map(Number);
  if(kind==="month")return{from:month+"-01",to:ymd(new Date(y,m,0)),label:mLabel(month)};
  if(kind==="quarter"){const q=Math.floor((m-1)/3);const a=new Date(y,q*3,1),b=new Date(y,q*3+3,0);
    return{from:ymd(a),to:ymd(b),label:a.toLocaleDateString("en-GB",{month:"short"})+" to "+b.toLocaleDateString("en-GB",{month:"short",year:"numeric"})}}
  if(kind==="taxyear"){const start=(m>4||(m===4))?y:y-1; // tax year starts 6 April
    return{from:start+"-04-06",to:(start+1)+"-04-05",label:`Tax year ${start}–${String(start+1).slice(2)}`}}
  const f=$("rFrom").value,t=$("rTo").value;
  if(!f||!t)return null;
  const a=f<=t?f:t,b=f<=t?t:f;
  return{from:a,to:b,label:longDate(a)+" to "+longDate(b)};
}
function longDate(s){return new Date(s+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
function renderRange(){
  $("rCustom").hidden=$("rPeriod").value!=="custom";
  const r=reportRange();
  $("rRange").textContent=r?`${longDate(r.from)} to ${longDate(r.to)}`:"Pick both dates.";
}
["rPeriod","rFrom","rTo"].forEach(id=>$(id).addEventListener("change",renderRange));
function inRange(arr,r){return arr.filter(x=>x.date&&x.date>=r.from&&x.date<=r.to).sort((a,b)=>a.date.localeCompare(b.date))}
function T(rows,head,foot){return `<table><thead><tr>${head.map(h=>`<th class="${h[1]||""}">${h[0]}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody>${foot?`<tfoot>${foot}</tfoot>`:""}</table>`}
function td(v,n){return `<td${n?' class="n"':""}>${v}</td>`}
function buildReport(r,full){
  const tk=inRange(data.takings,r),ex=inRange(data.expenses,r),wg=inRange(data.wages,r),bk=inRange(data.banking,r);
  const t=x=>(x.card||0)+(x.cash||0);
  const card=sum(tk,x=>x.card),cash=sum(tk,x=>x.cash),tot=card+cash,spend=sum(ex,x=>x.amount),wages=sum(wg,x=>x.amount),banked=sum(bk,x=>x.amount);
  const logo=(document.querySelector("#logo img")||{}).src||"icon.svg";
  let h=`<div class="rp-head"><img src="${esc(logo)}" alt=""><div><h1>The Grapes, Bedlington</h1><p><b>Books report:</b> ${esc(r.label)} (${longDate(r.from)} to ${longDate(r.to)})</p></div>
    <div class="rp-meta">Printed ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}<br>by ${esc(me?me.name:"")}</div></div>`;
  h+=`<div class="rp-figs"><div><span>Money in</span><b>${gbp(tot)}</b>card ${gbp(card)} · cash ${gbp(cash)}</div><div><span>Spending</span><b>${gbp(spend)}</b>${ex.length} items</div><div><span>Wages</span><b>${gbp(wages)}</b>${wg.length} payments</div><div><span>Left over</span><b>${gbp(tot-spend-wages)}</b>before tax</div></div>`;
  // spending by category + wages by person
  const byCat={};ex.forEach(x=>byCat[x.cat||"Other"]=(byCat[x.cat||"Other"]||0)+x.amount);
  const cats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const byP={};wg.forEach(x=>{const k=x.who||"?";byP[k]=byP[k]||{h:0,a:0,n:0};byP[k].h+=x.hours||0;byP[k].a+=x.amount;byP[k].n++});
  const ppl=Object.entries(byP).sort((a,b)=>b[1].a-a[1].a);
  h+=`<div class="two"><div><h2>Spending by type</h2>${cats.length?T(cats.map(([k,v])=>`<tr>${td(esc(k))}${td(gbp(v),1)}</tr>`),[["Type"],["Amount","n"]],`<tr class="tot">${td("Total")}${td(gbp(spend),1)}</tr>`):"<p class='note'>No spending in this period.</p>"}</div>
    <div><h2>Wages by person</h2>${ppl.length?T(ppl.map(([k,v])=>`<tr>${td(esc(k))}${td(v.h?String(v.h):"",1)}${td(gbp(v.a),1)}</tr>`),[["Name"],["Hours","n"],["Paid","n"]],`<tr class="tot">${td("Total")}${td(String(sum(wg,x=>x.hours||0)||""),1)}${td(gbp(wages),1)}</tr>`):"<p class='note'>No wages in this period.</p>"}</div></div>`;
  // cash check
  const dayBefore=ymd(new Date(new Date(r.from+"T12:00:00").getTime()-864e5));
  const start=cashPosition(dayBefore),exC=sum(ex.filter(x=>isCash(x.how)),x=>x.amount),wgC=sum(wg.filter(x=>isCash(x.how)),x=>x.amount);
  h+=`<div class="two"><div><h2>Cash check</h2>${T([`<tr>${td("Cash in safe at start")}${td(gbp(start),1)}</tr>`,`<tr>${td("+ Cash taken")}${td(gbp(cash),1)}</tr>`,`<tr>${td("− Spent from the till")}${td(gbp(exC),1)}</tr>`,`<tr>${td("− Wages paid in cash")}${td(gbp(wgC),1)}</tr>`,`<tr>${td("− Paid into bank")}${td(gbp(banked),1)}</tr>`],[["Cash"],["","n"]],`<tr class="tot">${td("Should be in safe at end")}${td(gbp(start+cash-exC-wgC-banked),1)}</tr>`)}${settings.float?`<p class="note">Plus the ${gbp(settings.float)} till float.</p>`:""}</div>`;
  if(settings.vat){const outV=Math.round(tot/6),inV=sum(ex,x=>x.vat||0);
    h+=`<div><h2>VAT (guide only)</h2>${T([`<tr>${td("VAT in takings (one sixth)")}${td(gbp(outV),1)}</tr>`,`<tr>${td("VAT on spending (receipts)")}${td(gbp(inV),1)}</tr>`],[["VAT"],["","n"]],`<tr class="tot">${td("Rough amount owed")}${td(gbp(outV-inV),1)}</tr>`)}<p class="note">Assumes all sales standard-rated at 20%. The accountant files the real return.</p></div></div>`;
  }else{const days=tk.length;
    h+=`<div><h2>Takings</h2>${T([`<tr>${td("Days entered")}${td(String(days),1)}</tr>`,`<tr>${td("Average day")}${td(gbp(days?Math.round(tot/days):0),1)}</tr>`,`<tr>${td("Best day")}${td(days?gbp(Math.max(...tk.map(t))):"–",1)}</tr>`],[["Takings"],["","n"]])}</div></div>`}
  if(full){
    const totZ=sum(tk,x=>x.z);
    h+=`<h2>Takings day by day</h2>${tk.length?T(tk.map(x=>{const d=x.z?t(x)-x.z:null;return `<tr>${td(new Date(x.date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"}))}${td(x.z?gbp(x.z):"",1)}${td(gbp(x.card||0),1)}${td(gbp(x.cash||0),1)}${td(gbp(t(x)),1)}<td class="n ${d<0?"short":""}">${d===null||Math.abs(d)<1?"":(d>0?"+":"")+gbp(d)}</td>${td(esc(x.note||""))}</tr>`}),[["Date"],["Z-read","n"],["Card","n"],["Cash","n"],["Total","n"],["Over/short","n"],["Notes"]],`<tr class="tot">${td("Total")}${td(totZ?gbp(totZ):"",1)}${td(gbp(card),1)}${td(gbp(cash),1)}${td(gbp(tot),1)}${td("",1)}${td("")}</tr>`):"<p class='note'>No takings in this period.</p>"}`;
    h+=`<h2>Spending</h2>${ex.length?T(ex.map(x=>`<tr>${td(x.date.split("-").reverse().join("/"))}${td(esc(x.who||""))}${td(esc(x.cat||""))}${td(esc(x.how||""))}${settings.vat?td(x.vat?gbp(x.vat):"",1):""}${td(gbp(x.amount),1)}${td(esc(x.note||""))}</tr>`),[["Date"],["Supplier"],["Type"],["Paid by"]].concat(settings.vat?[["VAT","n"]]:[]).concat([["Amount","n"],["Notes"]]),`<tr class="tot">${td("Total")}${td("")}${td("")}${td("")}${settings.vat?td(gbp(sum(ex,x=>x.vat||0)),1):""}${td(gbp(spend),1)}${td("")}</tr>`):"<p class='note'>No spending in this period.</p>"}`;
    h+=`<h2>Wages paid</h2>${wg.length?T(wg.map(x=>`<tr>${td(x.date.split("-").reverse().join("/"))}${td(esc(x.who||""))}${td(x.hours?String(x.hours):"",1)}${td(x.rate?gbp(x.rate):"",1)}${td(esc(x.how||""))}${td(gbp(x.amount),1)}</tr>`),[["Date"],["Name"],["Hours","n"],["Rate","n"],["Paid by"],["Amount","n"]],`<tr class="tot">${td("Total")}${td("")}${td("",1)}${td("",1)}${td("")}${td(gbp(wages),1)}</tr>`):"<p class='note'>No wages in this period.</p>"}`;
    h+=`<h2>Cash paid into the bank</h2>${bk.length?T(bk.map(x=>`<tr>${td(x.date.split("-").reverse().join("/"))}${td(esc(x.note||""))}${td(gbp(x.amount),1)}</tr>`),[["Date"],["Paying-in ref"],["Amount","n"]],`<tr class="tot">${td("Total")}${td("")}${td(gbp(banked),1)}</tr>`):"<p class='note'>No bankings in this period.</p>"}`;
  }
  h+=`<div class="rp-foot"><span>The Grapes Keeper</span><span>Figures are as entered. Not a substitute for the accountant's accounts.</span></div>`;
  return h;
}
$("rPrint").addEventListener("click",()=>{
  const r=reportRange();if(!r){toast("Pick both dates first");return}
  $("report").innerHTML=buildReport(r,$("rDetail").value==="full");
  const imgs=[...$("report").querySelectorAll("img")];
  Promise.all(imgs.map(i=>i.complete?0:new Promise(res=>{i.onload=i.onerror=res}))).then(()=>window.print());
});

/* export for the accountant (CSV opens in Excel) */
function csv(rows){return rows.map(r=>r.map(v=>{const s=String(v??"");return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(",")).join("\r\n")}
function exportRows(filter){
  const rows=[["Date","Type","Who / what","Category","Money in","Money out","VAT","Paid by","Notes","Entered by"]];
  const all=[];
  data.takings.filter(filter).forEach(r=>{if(r.card)all.push([r.date,"Takings","Card takings","",fromP(r.card),"","","Card",r.note||"",r.by||""]);if(r.cash)all.push([r.date,"Takings","Cash takings","",fromP(r.cash),"","","Cash",r.note||"",r.by||""])});
  data.expenses.filter(filter).forEach(r=>all.push([r.date,"Spending",r.who,r.cat,"",fromP(r.amount),fromP(r.vat),r.how,r.note||"",r.by||""]));
  data.wages.filter(filter).forEach(r=>all.push([r.date,"Wages",r.who,r.hours?r.hours+" hrs":"","",fromP(r.amount),"",r.how,r.note||"",r.by||""]));
  data.banking.filter(filter).forEach(r=>all.push([r.date,"Banked","Cash paid into bank","","","","","",r.note||"",r.by||""]));
  all.sort((a,b)=>a[0].localeCompare(b[0]));return csv(rows.concat(all));
}
function doExport(name,filter){
  const blob=new Blob(["﻿"+exportRows(filter)],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);toast("Downloaded");
}
$("rCsv").addEventListener("click",()=>{const r=reportRange();if(!r){toast("Pick both dates first");return}doExport(`grapes-keeper-${r.from}-to-${r.to}.csv`,x=>x.date&&x.date>=r.from&&x.date<=r.to)});
$("exAll").addEventListener("click",()=>doExport("grapes-keeper-all-to-"+today()+".csv",()=>true));


/* start: load, then keep phone and computer in step */
fillCats();
["dDate","sDate","wDate","bDate"].forEach(id=>$(id).value=today());
try{const t=localStorage.getItem(TABKEY);if(t&&$("tab-"+t))showTab(t)}catch(e){}
renderAll();
refresh();
setInterval(()=>{if(!document.hidden)refresh()},60000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});
})();
