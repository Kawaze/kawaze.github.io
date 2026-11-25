/* Bobine : le carnet ciné. Repris du prototype v0, branché sur Supabase (même compte Twitch que Kawaze Paris et le Kawazino). */
(function(){
'use strict';
var MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
var MOIS_C=['JANV','FÉVR','MARS','AVR','MAI','JUIN','JUIL','AOÛT','SEPT','OCT','NOV','DÉC'];
var MOIS_I=['J','F','M','A','M','J','J','A','S','O','N','D'];
var PAL=['#2c3b57','#7b2d33','#35553e','#6d5216','#4b2d55','#1d5160','#8b3d17','#3a3a40','#5d3b2c','#3a4b80','#5a5f2a','#6a2c4a'];
var VERSION='1.8.3';
var NOUVEAUTES=[
  ['1.8.3','Le logo de Bobine dans l’onglet, en bas du site et sur les stories, les films qui te manquent pour chaque réalisateur, une roulette qui part de tous tes films aimés, et pour l’admin des stats avec le compteur en direct et la liste des carnets'],
  ['1.8.2','La roulette part des notes et critiques des membres de Bobine, et le top 5 de Bobine arrive dans À voir'],
  ['1.8.1','Nouveautés repliées dans le Manifeste, feuille de route mise à jour'],
  ['1.8','Carnets visibles depuis le forum et les critiques, Sur Bobine avec la moyenne et les critiques des membres, roulette découverte, réalisateurs et succès, date à l’année'],
  ['1.7','Recherche avec affiches dans À voir et dans les listes, roulette pour choisir ton film, défis et badges, carte illimitée, ton année en story, Forum et Déménager en boutons'],
  ['1.6','Fond crème ou sombre et six couleurs au choix, ticket qui se détache, ampoules pour les coups de cœur, critiques avec spoilers floutés, plus de compteur de séances'],
  ['1.5','Forum pour les idées, les bugs et les discussions, et conversation privée avec l’équipe'],
  ['1.4','Carnets publics avec un lien à partager, carnet privé en un clic, suppression du carnet et page Confidentialité'],
  ['1.3','La date de visionnage devient un bonus, et le temps devant l’écran se compte depuis toujours'],
  ['1.2','Formulaire plus simple, l’année et la durée se remplissent toutes seules'],
  ['1.1','Vraies affiches, durées et réalisateurs avec TMDB, recherche pendant la frappe'],
  ['1.0','Connexion avec Twitch, carnet enregistré sur ton compte']
];
/* Lecture du carnet de quelqu'un : bobine.html?carnet=pseudo (rien n'est jamais enregistré dans ce mode) */
var LECTURE=null;try{LECTURE=(new URLSearchParams(location.search).get('carnet')||'').trim().slice(0,60)||null;}catch(e){}
var LECTEUR={charge:false,trouve:false,pseudo:LECTURE,avatar:null};
var ROUTES=[['journal','Journal'],['films','Films'],['a-voir','À voir'],['listes','Listes'],['bilan','Bilan'],['manifeste','Manifeste']];

function $(s,r){return (r||document).querySelector(s);}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function norm(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function keyOf(t,y){return norm(t)+'|'+String(y||'').trim();}
function uid(){return Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-5);}
function pad(n){return String(n).padStart(2,'0');}
function today(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function fmtN(n){return Number(n).toLocaleString('fr-FR');}
function plural(n,one,many){return fmtN(n)+' '+(n>1?many:one);}
function hash(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function stars(r){if(!r)return '';var f=Math.floor(r);return '★'.repeat(f)+(r-f>=0.5?'½':'');}
function ratingWords(r){return r?String(r).replace('.',',')+' sur 5':'sans note';}
function monthLabel(ym){if(/^\d{4}$/.test(ym))return 'En '+ym;var p=ym.split('-');if(!p[1])return 'Vus';return MOIS[+p[1]-1]+' '+p[0];}
function fmtDate(d){if(!d)return '';if(/^\d{4}$/.test(d))return 'en '+d;var p=d.split('-');return +p[2]+' '+MOIS[+p[1]-1]+' '+p[0];}

/* ---------- État ---------- */
var S=blank();
function blank(){return {v:1,updatedAt:0,films:{},diary:[],lists:[]};}
function upgrade(x){if(!x||typeof x!=='object')return blank();return {v:1,updatedAt:x.updatedAt||0,films:(x.films&&typeof x.films==='object')?x.films:{},diary:Array.isArray(x.diary)?x.diary:[],lists:Array.isArray(x.lists)?x.lists:[]};}
function hasData(){return Object.keys(S.films).length>0||S.diary.length>0||S.lists.length>0;}
function film(k){return S.films[k];}
function ensureFilm(t,y){t=String(t||'').trim();y=String(y||'').trim();var k=keyOf(t,y);if(!S.films[k])S.films[k]={k:k,t:t,y:y,r:null,l:false,w:false,wl:null};return S.films[k];}
function lastSeenMap(){var m={};S.diary.forEach(function(e){if(!m[e.k]||(e.d||'')>m[e.k])m[e.k]=e.d||'';});return m;}

/* ---------- Stockage ----------
   Sans connexion : le carnet reste sur cet appareil (localStorage).
   Connecté avec Twitch : le carnet vit dans Supabase. La page garde une copie de ce qui
   a été enregistré (Store.last) et n'envoie que les différences, par paquets. */
var LS='bobine.carnet.v1';
var CFG=window.PARIS_CONFIG||{};
var sb=(window.supabase&&CFG.url&&CFG.cle)?window.supabase.createClient(CFG.url,CFG.cle,{auth:{flowType:'pkce',persistSession:true,detectSessionInUrl:true}}):null;
var Store={mode:'local',user:null,profil:null,saving:false,dirty:false,timer:null,last:null};
function lsKey(){return Store.mode==='db'&&Store.user?'bobine.compte.'+Store.user:LS;}
function lsGet(k){try{return JSON.parse(localStorage.getItem(k||LS)||'null');}catch(e){return null;}}
function lsSet(){if(LECTURE)return;try{localStorage.setItem(lsKey(),JSON.stringify(S));}catch(e){}}
function lsDel(k){try{localStorage.removeItem(k);}catch(e){}}
var STATUS={local:'Sur cet appareil',loading:'Connexion…',pending:'Modifié',saving:'Enregistrement…',saved:'Synchronisé',error:'Échec, on réessaiera',full:'Espace plein',offline:'Hors ligne, gardé ici'};
function setStatus(s){var c=$('#sync');c.dataset.s=s;c.lastElementChild.textContent=STATUS[s]||s;c.title=STATUS[s]||s;}
function timeout(p,ms){return new Promise(function(res,rej){var t=setTimeout(function(){rej({code:'timeout'});},ms);p.then(function(v){clearTimeout(t);res(v);},function(e){clearTimeout(t);rej(e);});});}

function commit(opts){
  if(LECTURE){render();return;}
  S.updatedAt=Date.now();lsSet();
  if(Store.mode==='db'){clearTimeout(Store.timer);setStatus('pending');Store.timer=setTimeout(flush,900);}
  if(!opts||!opts.norender)render();
}

/* Ce qui est comparé pour savoir si un élément a changé */
function sigFilm(f){return JSON.stringify([f.t,f.y,f.r||null,!!f.l,!!f.w,f.wl||null,f.m||null,f.tm==null?null:f.tm,f.p||null,f.dr||null]);}
function sigSeance(e){return JSON.stringify([e.k,e.d||'',e.r||null,!!e.l,!!e.rw,e.rv||'',e.tg||'',e.u||'',!!e.sp,!!e.ca]);}
function sigListe(l,i){return JSON.stringify([l.n,l.ds||'',l.items,i]);}
function photo(){
  var p={films:{},diary:{},lists:{}};
  Object.keys(S.films).forEach(function(k){p.films[k]=sigFilm(S.films[k]);});
  S.diary.forEach(function(e){p.diary[e.id]=sigSeance(e);});
  S.lists.forEach(function(l,i){p.lists[l.id]=sigListe(l,i);});
  return p;
}
function differences(){
  var L=Store.last,c={films:[],films_suppr:[],seances:[],seances_suppr:[],listes:[],listes_suppr:[]};
  Object.keys(S.films).forEach(function(k){var f=S.films[k];if(L.films[k]!==sigFilm(f))c.films.push({k:k,t:f.t,y:f.y,r:f.r||null,l:!!f.l,w:!!f.w,wl:f.wl||null,m:f.m||null,tm:f.tm==null?null:f.tm,p:f.p||null,dr:f.dr||null});});
  Object.keys(L.films).forEach(function(k){if(!S.films[k])c.films_suppr.push(k);});
  var ids={};
  S.diary.forEach(function(e){ids[e.id]=1;if(L.diary[e.id]!==sigSeance(e))c.seances.push({id:e.id,k:e.k,d:e.d||'',r:e.r||null,l:!!e.l,rw:!!e.rw,rv:e.rv||'',tg:e.tg||'',u:e.u||'',ts:e.ts||null,sp:!!e.sp,ca:!!e.ca});});
  Object.keys(L.diary).forEach(function(id){if(!ids[id])c.seances_suppr.push(id);});
  var lids={};
  S.lists.forEach(function(l,i){lids[l.id]=1;if(L.lists[l.id]!==sigListe(l,i))c.listes.push({id:l.id,n:l.n,ds:l.ds||'',items:l.items,rang:i});});
  Object.keys(L.lists).forEach(function(id){if(!lids[id])c.listes_suppr.push(id);});
  return c;
}
/* Découpe en paquets de 500 (un gros import Letterboxd part en plusieurs fois) */
function paquets(c){
  var out=[],T=500;
  var sup={films_suppr:c.films_suppr,seances_suppr:c.seances_suppr,listes_suppr:c.listes_suppr};
  if(sup.films_suppr.length||sup.seances_suppr.length||sup.listes_suppr.length)out.push(sup);
  for(var i=0;i<c.films.length;i+=T)out.push({films:c.films.slice(i,i+T)});
  for(var j=0;j<c.seances.length;j+=T)out.push({seances:c.seances.slice(j,j+T)});
  for(var n=0;n<c.listes.length;n+=100)out.push({listes:c.listes.slice(n,n+100)});
  return out;
}
function flush(){
  if(LECTURE||Store.mode!=='db')return;
  if(Store.saving){Store.dirty=true;return;}
  var c=differences(),parts=paquets(c);
  if(!parts.length){setStatus('saved');return;}
  Store.saving=true;Store.dirty=false;setStatus('saving');
  var cible=photo(),gros=parts.length>2,fait=0;
  var chain=Promise.resolve();
  parts.forEach(function(p){chain=chain.then(function(){
    return timeout(sb.rpc('bobine_appliquer',{p:p}),30000).then(function(r){
      if(r.error)throw r.error;
      fait++;if(gros)$('#sync').lastElementChild.textContent='Envoi '+Math.round(fait/parts.length*100)+' %';
    });
  });});
  chain.then(function(){Store.last=cible;setStatus('saved');},
    function(e){console.warn('Bobine : échec d’enregistrement',e);setStatus(e&&e.code==='timeout'?'offline':'error');setTimeout(function(){if(!Store.saving)flush();},15000);})
  .then(function(){Store.saving=false;if(Store.dirty||Store.mode==='db'&&differences_non_vides())flush();});
}
function differences_non_vides(){var c=differences();return c.films.length+c.films_suppr.length+c.seances.length+c.seances_suppr.length+c.listes.length+c.listes_suppr.length>0;}

/* Ajoute à S tout ce qui manque, sans écraser ce qui existe (carnet local, ou JSON d'un autre appareil) */
function fusionner(x){
  x=upgrade(x);var c={films:0,diary:0,lists:0};
  Object.keys(x.films).forEach(function(k){var f=x.films[k];if(!f||!f.t)return;if(!S.films[k]){S.films[k]={k:k,t:String(f.t),y:String(f.y||''),r:f.r||null,l:!!f.l,w:!!f.w,wl:f.wl||null,m:f.m||null,tm:f.tm==null?null:f.tm,p:f.p||null,dr:f.dr||null};c.films++;}});
  var ids={},lieu={};S.diary.forEach(function(e){ids[e.id]=1;lieu[e.k+'#'+e.d]=1;});
  x.diary.forEach(function(e){if(!e||!e.k||!S.films[e.k]||ids[e.id]||lieu[e.k+'#'+(e.d||'')]&&!e.rv)return;S.diary.push({id:e.id||uid(),k:e.k,d:e.d||'',r:e.r||null,l:!!e.l,rw:!!e.rw,rv:e.rv||'',tg:e.tg||'',u:e.u||'',ts:e.ts||Date.now(),sp:!!e.sp,ca:!!e.ca});ids[e.id]=1;c.diary++;});
  x.lists.forEach(function(l){if(!l||!l.n)return;var ex=S.lists.find(function(y){return y.id===l.id||y.n===l.n;});var items=(l.items||[]).filter(function(k){return S.films[k];});if(ex){items.forEach(function(k){if(ex.items.indexOf(k)<0)ex.items.push(k);});}else{S.lists.push({id:l.id||uid(),n:String(l.n),ds:l.ds||'',items:items});c.lists++;}});
  return c;
}

/* Connexion : charge le carnet du compte, y ajoute ce qui était sur cet appareil */
function connect(){
  if(!sb){setStatus('local');renderCompte();return;}
  sb.auth.onAuthStateChange(function(ev,session){
    var id=session&&session.user?session.user.id:null;
    if(ev==='INITIAL_SESSION'||id!==Store.user)setTimeout(function(){changerCompte(id);},0);
  });
}
/* ---------- Stats de fréquentation : une visite par ouverture de Bobine, sans traceur ---------- */
function compterUneFois(cle,quoi,carnet){
  if(!sb)return;
  try{if(sessionStorage.getItem(cle))return;sessionStorage.setItem(cle,'1');}catch(e){return;}
  sb.rpc('bobine_compter',{p_quoi:quoi,p_carnet:carnet||null}).then(function(){},function(){});
}
/* ---------- En ce moment sur Bobine : compteur en direct (Supabase Presence) ----------
   Chaque page ouverte dit seulement « membre ou pas » et « où » (site, carnet, forum).
   Rien n'est enregistré, et la connexion se coupe quand l'onglet reste en arrière-plan. */
var PRES={ch:null,cle:null,timer:null,cb:null,ou:null};
function presOu(){var r=route();return LECTURE?'carnet':(r==='forum'||r==='contact'||r==='admin')?'forum':'site';}
function presCharge(){PRES.ou=presOu();return {m:Store.mode==='db'?1:0,ou:PRES.ou};}
function presRejoindre(){
  if(!sb||typeof sb.channel!=='function'||PRES.ch||document.hidden)return;
  try{
    PRES.cle=PRES.cle||Math.random().toString(36).slice(2)+Date.now().toString(36);
    var ch=sb.channel('bobine-en-ligne',{config:{presence:{key:PRES.cle}}});
    ch.on('presence',{event:'sync'},function(){if(PRES.cb)PRES.cb(ch.presenceState());});
    ch.subscribe(function(st){if(st==='SUBSCRIBED')ch.track(presCharge());});
    PRES.ch=ch;
  }catch(e){PRES.ch=null;}
}
function presQuitter(){if(!PRES.ch)return;var ch=PRES.ch;PRES.ch=null;try{sb.removeChannel(ch);}catch(e){}}
function presMaj(force){if(PRES.ch&&(force||presOu()!==PRES.ou))try{PRES.ch.track(presCharge());}catch(e){}}
document.addEventListener('visibilitychange',function(){
  clearTimeout(PRES.timer);
  if(document.hidden)PRES.timer=setTimeout(presQuitter,60000);else presRejoindre();
});
function changerCompte(id){
  setTimeout(function(){compterUneFois('bobine.vis','visite');presRejoindre();presMaj(true);},1200);
  if(!id){
    if(Store.mode==='db'){lsDel('bobine.compte.'+Store.user);Store.mode='local';Store.user=null;Store.profil=null;Store.last=null;reglages={prive:false};reglagesOk=false;S=upgrade(lsGet(LS));render();}
    FZ.notifs={admin:false,contact:0,a_traiter:0};setStatus('local');renderCompte();renderTabs();setTimeout(rattraper,1500);return;
  }
  Store.user=id;Store.mode='db';Store.last=null;setStatus('loading');renderCompte();
  var avant=lsGet('bobine.compte.'+id);if(avant){S=upgrade(avant);render();}
  timeout(Promise.all([sb.rpc('synchroniser_profil'),sb.rpc('bobine_mon_carnet')]),20000).then(function(r){
    if(r[0].error)console.warn(r[0].error);else Store.profil=r[0].data;
    if(r[1].error)throw r[1].error;
    S=upgrade(r[1].data);
    Store.last=photo();
    var local=lsGet(LS),apport=null;
    if(local){apport=fusionner(local);lsDel(LS);}
    lsSet();render();renderCompte();setStatus('saved');
    if(apport&&(apport.films||apport.diary||apport.lists)){toast('Ton carnet de cet appareil a rejoint ton compte');commit({norender:true});}
    setTimeout(rattraper,1500);chargerNotifs();chargerReglages();
  }).catch(function(e){
    console.warn('Bobine : lecture du compte impossible',e);
    Store.mode='local';Store.user=null;
    S=upgrade(lsGet(LS));render();renderCompte();
    setStatus(e&&e.code==='timeout'?'offline':'error');
    toast(/bobine_mon_carnet|function|schema/i.test(String(e&&e.message))?'Bobine n’est pas encore installé dans la base.':'Connexion au carnet impossible, réessaie plus tard.');
  });
}
function seConnecter(){if(sb)sb.auth.signInWithOAuth({provider:'twitch',options:{redirectTo:location.origin+location.pathname}});}
function seDeconnecter(){if(!sb)return;var fin=function(){sb.auth.signOut();};if(Store.saving||Store.dirty||Store.timer&&$('#sync').dataset.s==='pending'){clearTimeout(Store.timer);flush();setTimeout(fin,1500);}else fin();}
function renderCompte(){
  var el=$('#compte');if(!el)return;
  if(LECTURE){el.innerHTML='<a class="cbtn" href="bobine.html">Mon carnet</a>';return;}
  if(!sb){el.innerHTML='';return;}
  if(Store.mode==='db'&&Store.user){
    var p=Store.profil||{};
    el.innerHTML='<button type="button" class="cbtn moi" data-action="compte" aria-label="Mon compte">'+(p.avatar?'<img src="'+esc(p.avatar)+'" alt="" width="22" height="22">':'')+'<span class="cp">'+esc(p.pseudo||'Mon compte')+'</span></button>';
  }else{
    el.innerHTML='<button type="button" class="cbtn twitch" data-action="login">Se connecter avec Twitch</button>';
  }
}

/* ---------- TMDB : recherche, affiches, durées ----------
   Tout passe par la fonction Supabase bobine-tmdb : le jeton TMDB n'est jamais dans la page. */
var TMDB_FN=CFG.url?CFG.url.replace(/\/$/,'')+'/functions/v1/bobine-tmdb':null;
var IMG='https://image.tmdb.org/t/p/';
var AFF={}; /* affiches chargées pour l'image de story */
function tmdbGet(params){return timeout(fetch(TMDB_FN+'?'+new URLSearchParams(params),{headers:{apikey:CFG.cle||''}}).then(function(r){return r.json();}),12000);}
function chargerAffiche(f){
  if(!f||!f.p||AFF[f.p])return Promise.resolve();
  return timeout(new Promise(function(ok){var im=new Image();im.crossOrigin='anonymous';im.onload=function(){AFF[f.p]=im;ok();};im.onerror=function(){ok();};im.src=IMG+'w780'+f.p;}),5000).catch(function(){});
}
/* Rattrapage : retrouve sur TMDB les films importés (affiche, durée, réalisateur), 20 par 20, en tâche de fond */
var ratt=false;
function rattraper(){
  if(LECTURE||!TMDB_FN||ratt)return;
  var liste=Object.values(S.films).filter(function(f){return f.tm==null&&f.t;});
  if(!liste.length){completer();return;}
  ratt=true;var i=0,ajoutes=0,gros=liste.length>15;
  if(gros)toast('Recherche des affiches pour '+plural(liste.length,'film','films')+'…');
  (function suivant(){
    var lot=liste.slice(i,i+20);i+=20;
    if(!lot.length){ratt=false;commit();if(gros)toast(plural(ajoutes,'affiche ajoutée','affiches ajoutées')+' depuis TMDB');setTimeout(completer,800);return;}
    timeout(fetch(TMDB_FN,{method:'POST',headers:{'Content-Type':'application/json',apikey:CFG.cle||''},body:JSON.stringify({films:lot.map(function(f){return {k:f.k,t:f.t,y:f.y};})})}).then(function(r){return r.json();}),30000)
    .then(function(d){
      (d.films||[]).forEach(function(r){
        var f=S.films[r.k];if(!f||r.id===null||r.id===undefined)return;
        f.tm=r.id||0;
        if(r.id){if(r.p)f.p=r.p;if(r.dr)f.dr=r.dr;if(!f.m&&r.m)f.m=r.m;if(r.g)appliquerFiche(f,r);ajoutes++;}
      });
      commit({norender:i%100!==0});
      setTimeout(suivant,300);
    },function(e){console.warn('Bobine : TMDB indisponible',e);ratt=false;commit();});
  })();
}
/* Suggestions pendant la frappe dans « Noter un film » */
var sugTimer=null,sugSeq=0,sugItems=[],sugIdx=-1;
function fermerSug(){clearTimeout(sugTimer);sugSeq++;var b=$('#lf-sug');if(b){b.hidden=true;b.innerHTML='';}sugItems=[];sugIdx=-1;}
function afficherSug(items,enCours){
  var b=$('#lf-sug');sugItems=items;sugIdx=-1;
  b.innerHTML=items.map(function(it,i){
    return '<button type="button" class="si" role="option" data-i="'+i+'">'+(it.p?'<img src="'+IMG+'w92'+esc(it.p)+'" alt="" loading="lazy">':'<span class="noimg"></span>')+
      '<span class="st"><b>'+esc(it.t)+'</b> <span class="fy">'+esc(it.y||'')+'</span>'+(it.local?'<small class="dt">dans ton carnet</small>':it.to?'<small>'+esc(it.to)+'</small>':'')+'</span></button>';
  }).join('')+(enCours?'<p class="sl">Recherche…</p>':'');
  b.hidden=!items.length&&!enCours;
}
function chercherSug(q){
  var seq=++sugSeq,nq=norm(q);
  var locaux=Object.values(S.films).filter(function(f){return norm(f.t).indexOf(nq)>=0;}).slice(0,3)
    .map(function(f){return {local:true,k:f.k,t:f.t,y:f.y,p:f.p,tm:f.tm};});
  afficherSug(locaux,true);
  tmdbGet({q:q}).then(function(d){
    if(seq!==sugSeq)return;
    var dist=(d.resultats||[]).filter(function(r){return !locaux.some(function(l){return l.tm===r.id||(norm(l.t)===norm(r.t)&&l.y===r.y);});}).slice(0,6);
    afficherSug(locaux.concat(dist.map(function(r){return {tm:r.id,t:r.t,y:r.y,p:r.p,to:r.to};})),false);
  },function(){if(seq===sugSeq)afficherSug(locaux,false);});
}
function choisirSug(i){
  var it=sugItems[i];if(!it)return;fermerSug();
  $('#lf-t').value=it.t;$('#lf-y').value=it.y||'';
  if(it.local){var f=film(it.k);logCtx.tmdb=null;if(f&&f.m&&!$('#lf-m').value)$('#lf-m').value=fmtDurShort(f.m);statsNoter(f);$('#lf-r').focus();return;}
  logCtx.tmdb={id:it.tm,t:it.t,y:it.y||'',p:it.p};statsNoter({tm:it.tm,k:'tm'+it.tm});
  $('#lf-r').focus();
  tmdbGet({id:it.tm}).then(function(d){
    var fi=d&&d.fiche;if(!fi||!logCtx.tmdb||logCtx.tmdb.id!==it.tm)return;
    logCtx.tmdb.m=fi.m;logCtx.tmdb.dr=fi.dr;logCtx.tmdb.fi=fi;if(fi.p)logCtx.tmdb.p=fi.p;
    if(fi.m&&!$('#lf-m').value)$('#lf-m').value=fmtDurShort(fi.m);
  },function(){});
}
function brancherSug(){
  var t=$('#lf-t'),b=$('#lf-sug');if(!TMDB_FN||!t||!b)return;
  t.removeAttribute('list');
  t.addEventListener('input',function(){
    if(logCtx)logCtx.tmdb=null;
    $('#lf-y').value='';$('#lf-m').value=''; /* année et durée viennent du film choisi */
    var q=t.value.trim();clearTimeout(sugTimer);
    if(q.length<2){fermerSug();return;}
    sugTimer=setTimeout(function(){chercherSug(q);},250);
  });
  t.addEventListener('keydown',function(ev){
    if(b.hidden||!sugItems.length){return;}
    var bt=b.querySelectorAll('.si');
    if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){ev.preventDefault();sugIdx=(sugIdx+(ev.key==='ArrowDown'?1:-1)+bt.length)%bt.length;bt.forEach(function(x,j){x.classList.toggle('on',j===sugIdx);});bt[sugIdx].scrollIntoView({block:'nearest'});}
    else if(ev.key==='Enter'&&sugIdx>=0){ev.preventDefault();choisirSug(sugIdx);}
    else if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();fermerSug();}
  });
  t.addEventListener('blur',function(){setTimeout(function(){if(document.activeElement&&b.contains(document.activeElement))return;fermerSug();},180);});
  b.addEventListener('mousedown',function(ev){ev.preventDefault();});
  b.addEventListener('click',function(ev){var x=ev.target.closest('.si');if(x)choisirSug(+x.dataset.i);});
}


/* ---------- Mon compte : lien public, carnet privé, suppression ---------- */
var reglages={prive:false},confirmSuppr=0;
function lienCarnet(){var p=(Store.profil&&Store.profil.pseudo)||'';return location.origin+location.pathname+'?carnet='+encodeURIComponent(p);}
function ouvrirCompte(){
  confirmSuppr=0;renderDlgCompte();showDialog($('#compte-dlg'));
  sb.rpc('bobine_reglages').then(function(r){if(!r.error&&r.data){reglages=r.data;renderDlgCompte();}});
}
function renderDlgCompte(){
  var p=Store.profil||{};
  $('#cpt-body').innerHTML=
    '<div class="fld"><span>Le lien de ton carnet</span><div class="datebox"><input id="cpt-lien" readonly value="'+esc(lienCarnet())+'"><button type="button" class="ghost small" data-action="cptcopie">Copier</button></div>'+
    '<p class="muted petit">'+(reglages.prive?'Ton carnet est privé, ce lien n’affiche rien aux autres.':'Ton carnet est visible sur Bobine, depuis ton pseudo et sous tes critiques. Ce lien sert à le partager ailleurs.')+'</p></div>'+
    '<label class="tog large"><input type="checkbox" id="cpt-prive"'+(reglages.prive?' checked':'')+'><span>Carnet privé</span></label>'+
    '<div class="fld"><span>Tes données</span><p class="muted petit"><a href="#contact" data-action="close">Écrire à l’équipe</a><br><button class="lien" type="button" data-action="dem">Exporter tout ton carnet</button><br><a href="#confidentialite" data-action="close">Confidentialité</a></p></div>'+
    (confirmSuppr===0?'<button type="button" class="ghost danger" data-action="cptsuppr">Supprimer mon carnet</button>':
     '<div class="confirm">'+(confirmSuppr===1?'Tout ton carnet sera effacé, films, séances, critiques et listes, ainsi que tes messages du forum et ta conversation avec l’équipe. Ton compte Twitch et tes centimes Kawaze Games ne bougent pas.':'Dernière confirmation, ça ne se rattrape pas.')+
     ' <button type="button" class="primary small" data-action="cptsuppr">'+(confirmSuppr===1?'Continuer':'Oui, tout effacer')+'</button> <button type="button" class="ghost small" data-action="cptnon">Non</button></div>')+
    '<div class="df"><button type="button" class="ghost" data-action="logout">Déconnexion</button><span class="sp"></span><button type="button" class="primary" data-action="close">Fermer</button></div>';
}
document.addEventListener('change',function(ev){
  if(ev.target.id!=='cpt-prive')return;
  var v=ev.target.checked;ev.target.disabled=true;
  sb.rpc('bobine_rendre_prive',{p_prive:v}).then(function(r){
    if(r.error){toast('Impossible de changer, réessaie');reglages.prive=!v;}else{reglages.prive=v;toast(v?'Ton carnet est privé':'Ton carnet est visible sur Bobine');}
    renderDlgCompte();
  });
});
function actionCompte(act){
  if(act==='compte')ouvrirCompte();
  if(act==='cptcopie'){var i=$('#cpt-lien');i.select();(navigator.clipboard?navigator.clipboard.writeText(i.value):Promise.reject()).then(function(){toast('Lien copié');},function(){document.execCommand('copy');toast('Lien copié');});}
  if(act==='cptnon'){confirmSuppr=0;renderDlgCompte();}
  if(act==='cptsuppr'){
    if(confirmSuppr<2){confirmSuppr++;renderDlgCompte();return;}
    sb.rpc('bobine_supprimer_carnet').then(function(r){
      if(r.error){toast('La suppression a échoué, réessaie');return;}
      clearTimeout(Store.timer);S=blank();Store.last=photo();lsSet();importReport='';
      closeDialog($('#compte-dlg'));render();setStatus('saved');toast('Ton carnet a été supprimé');
    });
  }
}
function chargerLecture(){
  if(!sb){LECTEUR.charge=true;render();return;}
  timeout(sb.rpc('bobine_carnet_public',{p_pseudo:LECTURE}),15000).then(function(r){
    var d=r&&r.data;LECTEUR.charge=true;
    if(d&&d.trouve){LECTEUR.trouve=true;LECTEUR.pseudo=d.pseudo;LECTEUR.avatar=d.avatar;S=upgrade(d);document.title='Carnet de '+d.pseudo+', Bobine';}
    render();
  },function(){LECTEUR.charge=true;render();});
}

/* ---------- Forum, conversation avec l'équipe, espace admin ----------
   Tout passe par des fonctions Supabase qui vérifient qui écrit. Pas de messages privés entre membres. */
var CATS={idee:'Idée',bug:'Bug',discussion:'Discussion'};
var FZ={liste:null,filtre:'tous',sujet:null,contact:null,notifs:{admin:false,contact:0,a_traiter:0},adm:{conv:null,une:null,sign:null},envoi:false};
function connecte(){return !!(sb&&Store.mode==='db'&&Store.user);}
function routeParam(){var p=location.hash.slice(1).split('/');return p[1]?decodeURIComponent(p[1]):'';}
function quand(iso){
  var d=new Date(iso),s=(Date.now()-d.getTime())/1000;
  if(s<60)return 'à l’instant';if(s<3600)return 'il y a '+Math.floor(s/60)+' min';if(s<86400)return 'il y a '+Math.floor(s/3600)+' h';
  if(s<86400*7)return 'il y a '+plural(Math.floor(s/86400),'jour','jours');
  return d.getDate()+' '+MOIS[d.getMonth()]+(d.getFullYear()!==new Date().getFullYear()?' '+d.getFullYear():'');
}
function texteMsg(t){return esc(t).replace(/\n/g,'<br>');}
function erreurRpc(e){return (e&&e.message?String(e.message):'Ça n’a pas marché, réessaie.').replace(/^(psql:\S+\s*)?ERROR:\s*/,'').split(/\s*CONTEXT:/)[0].trim();}
function appel(nom,args){
  if(!sb)return Promise.reject({message:'Le forum a besoin de la connexion au site.'});
  return timeout(sb.rpc(nom,args||{}),15000).then(function(r){if(r.error)throw r.error;return r.data;});
}
function avatarDe(a){return a&&a.avatar?'<img class="av" src="'+esc(a.avatar)+'" alt="" width="32" height="32" loading="lazy">':'<span class="av vide">'+esc(((a&&a.pseudo)||'?').charAt(0))+'</span>';}
function nomDe(a){return '<b>'+(a&&a.carnet&&a.pseudo?lienPseudo(a.pseudo):esc((a&&a.pseudo)||'Membre'))+'</b>'+(a&&a.admin?'<span class="badge-eq">équipe</span>':'');}
function pastille(n){return n?'<span class="pastille" aria-label="'+n+' à lire">'+n+'</span>':'';}

/* Pastilles de non-lus (onglets Forum et Admin) */
var notifT=null;
function chargerNotifs(){
  clearTimeout(notifT);
  if(!sb||LECTURE)return;
  timeout(sb.rpc('bobine_notifs'),10000).then(function(r){
    if(r.error)return;
    var n=r.data||{},avant=JSON.stringify(FZ.notifs),etaitAdmin=FZ.notifs.admin;FZ.notifs={admin:!!n.admin,contact:n.contact||0,a_traiter:n.a_traiter||0};
    if(FZ.notifs.admin!==etaitAdmin&&/^#(admin|forum|contact)/.test(location.hash))render();
    else if(JSON.stringify(FZ.notifs)!==avant)renderTabs();
  },function(){}).then(function(){notifT=setTimeout(chargerNotifs,60000);});
}

/* ---- Vues ---- */
/* Le forum vit à part : bouton en haut à droite, retour au carnet, onglets Forum, équipe et Admin */
function fzNav(actif){
  var o=[['forum','Le forum',0],['contact','Écrire à l’équipe',FZ.notifs.contact]];
  if(FZ.notifs.admin){o.push(['admin','Admin',FZ.notifs.a_traiter]);o.push(['admin/stats','Stats',0]);}
  return '<p class="fz-carnet"><a href="#journal">← Mon carnet</a></p><nav class="fz-nav" aria-label="Forum">'+o.map(function(x){return '<a href="#'+x[0]+'"'+(x[0]===actif?' aria-current="page"':'')+'>'+x[1]+pastille(x[2])+'</a>';}).join('')+'</nav>';
}
function vueForum(){
  var p=routeParam();
  if(p==='nouveau')return vueNouveauSujet();
  if(p)return '<div id="fz"><p class="muted">Chargement du sujet…</p></div>';
  var chip=function(id,l){return '<button type="button" data-action="fzfiltre" data-v="'+id+'" aria-pressed="'+(FZ.filtre===id)+'">'+l+'</button>';};
  return fzNav('forum')+'<div class="viewhead"><h2>Forum</h2>'+(connecte()?'<a class="primary small" href="#forum/nouveau">Nouveau sujet</a>':'<button class="primary small" type="button" data-action="login">Se connecter pour écrire</button>')+'</div>'+
    '<div class="chips">'+chip('tous','Tous')+chip('idee','Idées')+chip('bug','Bugs')+chip('discussion','Discussions')+'</div>'+
    '<div id="fz"><p class="muted">Chargement du forum…</p></div>';
}
function remplirForum(){
  var el=$('#fz');if(!el)return;
  var l=(FZ.liste||[]).filter(function(s){return FZ.filtre==='tous'||s.categorie===FZ.filtre;});
  if(!l.length){el.innerHTML='<div class="card-box"><h3>Rien pour l’instant</h3><p>Sois le premier à lancer un sujet.</p></div>';return;}
  el.innerHTML='<ul class="fz-liste">'+l.map(function(s){
    return '<li><a href="#forum/'+s.id+'" class="fz-sujet'+(s.masque?' masque':'')+'">'+
      '<span class="fz-tags"><span class="cat cat-'+s.categorie+'">'+CATS[s.categorie]+'</span>'+(s.epingle?'<span class="tag">épinglé</span>':'')+(s.verrouille?'<span class="tag">fermé</span>':'')+(s.masque?'<span class="tag danger">masqué</span>':'')+'</span>'+
      '<span class="fz-titre">'+esc(s.titre)+'</span>'+
      '<span class="fz-meta">'+esc(s.auteur.pseudo)+', '+quand(s.activite_le)+', '+plural(s.reponses,'réponse','réponses')+'</span></a></li>';
  }).join('')+'</ul>';
}
function remplirSujet(){
  var el=$('#fz'),s=FZ.sujet;if(!el)return;
  if(!s||!s.trouve){el.innerHTML='<p><a href="#forum">← Forum</a></p><div class="card-box"><h3>Sujet introuvable</h3><p>Il a peut-être été supprimé.</p></div>';return;}
  var adm=FZ.notifs.admin;
  var h='<p class="fz-retour"><a href="#forum">← Forum</a></p>'+
    '<div class="viewhead fz-tete"><h2>'+esc(s.titre)+'</h2></div>'+
    '<p class="fz-tags"><span class="cat cat-'+s.categorie+'">'+CATS[s.categorie]+'</span>'+(s.epingle?'<span class="tag">épinglé</span>':'')+(s.verrouille?'<span class="tag">fermé</span>':'')+(s.masque?'<span class="tag danger">masqué</span>':'')+'</p>';
  if(adm)h+='<div class="fz-adm">'+
    '<button class="ghost small" type="button" data-action="fzmod" data-quoi="sujet" data-id="'+s.id+'" data-act="'+(s.epingle?'desepingler':'epingler')+'">'+(s.epingle?'Désépingler':'Épingler')+'</button>'+
    '<button class="ghost small" type="button" data-action="fzmod" data-quoi="sujet" data-id="'+s.id+'" data-act="'+(s.verrouille?'deverrouiller':'verrouiller')+'">'+(s.verrouille?'Rouvrir':'Fermer le sujet')+'</button>'+
    '<button class="ghost small danger" type="button" data-action="fzmod" data-quoi="sujet" data-id="'+s.id+'" data-act="'+(s.masque?'afficher':'masquer')+'">'+(s.masque?'Afficher le sujet':'Masquer le sujet')+'</button></div>';
  h+=s.messages.map(function(m){
    var act='';
    if(m.a_moi)act+='<button class="lien" type="button" data-action="fzsuppr" data-id="'+m.id+'">Supprimer</button>';
    else if(connecte())act+='<button class="lien" type="button" data-action="fzsignal" data-id="'+m.id+'">Signaler</button>';
    if(adm){
      act+='<button class="lien" type="button" data-action="fzmod" data-quoi="message" data-id="'+m.id+'" data-act="'+(m.masque?'afficher':'masquer')+'">'+(m.masque?'Afficher':'Masquer')+'</button>';
      if(!m.a_moi&&m.user_id)act+='<button class="lien danger" type="button" data-action="fzban" data-u="'+esc(m.user_id)+'" data-v="'+(m.banni?'0':'1')+'">'+(m.banni?'Réintégrer':'Exclure du forum')+'</button>';
      if(!m.a_moi&&!m.masque)act+='<button class="lien danger" type="button" data-action="fzsuppr" data-id="'+m.id+'">Supprimer</button>';
    }
    return '<article class="msg'+(m.masque?' masque':'')+'">'+avatarDe(m.auteur)+'<div class="msg-corps"><div class="msg-tete">'+nomDe(m.auteur)+'<span class="quand">'+quand(m.cree_le)+'</span>'+(m.masque?'<span class="tag danger">masqué</span>':'')+'</div>'+
      '<p>'+texteMsg(m.texte)+'</p><div class="msg-act">'+act+'</div></div></article>';
  }).join('');
  if(!connecte())h+='<p class="muted">Connecte-toi avec Twitch pour répondre.</p>';
  else if(s.verrouille&&!adm)h+='<p class="muted">Ce sujet est fermé.</p>';
  else h+='<form class="fz-form" id="fz-rep"><label class="fld"><span>Ta réponse</span><textarea name="t" rows="4" maxlength="4000" required></textarea></label><div class="df"><span class="sp"></span><button class="primary" type="submit">Envoyer</button></div></form>';
  el.innerHTML=h;
}
function vueNouveauSujet(){
  if(!connecte())return '<p><a href="#forum">← Forum</a></p><div class="card-box"><h3>Connecte-toi pour écrire</h3><p>Le forum se lit sans compte, mais il faut se connecter avec Twitch pour ouvrir un sujet.</p><button class="primary" type="button" data-action="login">Se connecter avec Twitch</button></div>';
  return '<p class="fz-retour"><a href="#forum">← Forum</a></p><div class="viewhead"><h2>Nouveau sujet</h2></div>'+
    '<form class="fz-form card-box" id="fz-nouveau">'+
    '<label class="fld"><span>Catégorie</span><select name="c"><option value="idee">Idée</option><option value="bug">Bug</option><option value="discussion">Discussion</option></select></label>'+
    '<label class="fld"><span>Titre</span><input name="ti" maxlength="120" required autocomplete="off"></label>'+
    '<label class="fld"><span>Message</span><textarea name="t" rows="6" maxlength="4000" required></textarea></label>'+
    '<p class="muted petit">Ton message sera public, signé de ton pseudo Twitch.</p>'+
    '<div class="df"><a class="ghost" href="#forum">Annuler</a><span class="sp"></span><button class="primary" type="submit">Publier</button></div></form>';
}
function vueContact(){
  if(!connecte())return fzNav('contact')+'<div class="viewhead"><h2>Écrire à l’équipe</h2></div><div class="card-box"><p>Connecte-toi avec Twitch pour écrire à l’équipe.</p><button class="primary" type="button" data-action="login">Se connecter avec Twitch</button></div>';
  return fzNav('contact')+'<div class="viewhead"><h2>Écrire à l’équipe</h2></div>'+
    '<p class="muted">Un bug, une idée, une question sur tes données. Seuls toi et l’équipe lisez cette conversation.</p>'+
    '<div id="fz"><p class="muted">Chargement…</p></div>'+
    '<form class="fz-form" id="fz-contact"><label class="fld"><span>Ton message</span><textarea name="t" rows="4" maxlength="4000" required></textarea></label><div class="df"><span class="sp"></span><button class="primary" type="submit">Envoyer</button></div></form>';
}
function bulles(msgs,cote){
  if(!msgs.length)return '<p class="muted">Pas encore de message.</p>';
  return '<div class="bulles">'+msgs.map(function(m){
    var moi=cote==='membre'?!m.de_admin:m.de_admin;
    return '<div class="bulle'+(moi?' moi':'')+'"><p>'+texteMsg(m.texte)+'</p><span class="quand">'+(m.de_admin?'Équipe, ':'')+quand(m.cree_le)+'</span></div>';
  }).join('')+'</div>';
}
function vueAdmin(){
  if(!FZ.notifs.admin)return '<div class="card-box"><h3>Réservé à l’équipe</h3></div>';
  var p=routeParam();
  if(p==='stats')return fzNav('admin/stats')+'<div class="viewhead"><h2>Stats</h2><p class="sub">visible par toi seul</p></div><div id="fz-stats"><p class="muted">Chargement…</p></div>';
  if(p)return '<p class="fz-retour"><a href="#admin">← Admin</a></p><div id="fz"><p class="muted">Chargement…</p></div>';
  return fzNav('admin')+'<div class="viewhead"><h2>Admin</h2><p class="sub">visible par toi seul</p></div>'+
    '<section class="card-box"><h3>Messages privés</h3><div id="fz-conv"><p class="muted">Chargement…</p></div></section>'+
    '<section class="card-box"><h3>Signalements</h3><div id="fz-sign"><p class="muted">Chargement…</p></div></section>'+
    '<section class="card-box"><h3>Critiques signalées</h3><div id="fz-crit"><p class="muted">Chargement…</p></div></section>';
}
function remplirAdmin(){
  var c=$('#fz-conv'),g=$('#fz-sign'),k=$('#fz-crit');
  if(k)k.innerHTML=(FZ.adm.crit||[]).length?FZ.adm.crit.map(function(x){
    return '<div class="sign"><p class="fz-meta">'+esc(x.par.pseudo)+' signale la critique de '+esc(x.auteur.pseudo)+' sur '+esc(x.film||'un film')+', '+quand(x.cree_le)+'</p>'+
      '<blockquote>'+texteMsg(x.texte)+'</blockquote><div class="btnrow"><button class="primary small" type="button" data-action="fzcrit" data-n="'+x.num+'" data-act="masquer">Masquer la critique</button><button class="ghost small" type="button" data-action="fzcrit" data-n="'+x.num+'" data-act="ignorer">Laisser, rien à faire</button></div></div>';}).join(''):'<p class="muted">Rien à traiter.</p>';
  if(c)c.innerHTML=(FZ.adm.conv||[]).length?'<ul class="fz-liste">'+FZ.adm.conv.map(function(x){
    return '<li><a class="fz-sujet" href="#admin/'+encodeURIComponent(x.user_id)+'"><span class="fz-titre">'+esc(x.membre.pseudo)+pastille(x.non_lus)+'</span><span class="fz-meta">'+esc(x.apercu||'')+'</span><span class="fz-meta">'+quand(x.dernier_le)+'</span></a></li>';}).join('')+'</ul>':'<p class="muted">Aucun message.</p>';
  if(g)g.innerHTML=(FZ.adm.sign||[]).length?FZ.adm.sign.map(function(x){
    return '<div class="sign"><p class="fz-meta">'+esc(x.par.pseudo)+' signale '+esc(x.auteur.pseudo)+' dans <a href="#forum/'+x.sujet_id+'">'+esc(x.sujet||'un sujet')+'</a>, '+quand(x.cree_le)+(x.raison?', « '+esc(x.raison)+' »':'')+'</p>'+
      '<blockquote>'+texteMsg(x.texte)+'</blockquote><div class="btnrow"><button class="primary small" type="button" data-action="fzmod" data-quoi="message" data-id="'+x.message_id+'" data-act="masquer">Masquer le message</button><button class="ghost small" type="button" data-action="fztraite" data-id="'+x.id+'">Laisser, rien à faire</button></div></div>';}).join(''):'<p class="muted">Rien à traiter.</p>';
}
function remplirConvAdmin(){
  var el=$('#fz'),x=FZ.adm.une;if(!el||!x)return;
  el.innerHTML='<div class="viewhead"><h2>'+esc(x.membre.pseudo)+'</h2></div>'+
    '<div class="btnrow"><button class="ghost small danger" type="button" data-action="fzban" data-u="'+esc(routeParam())+'" data-v="'+(x.banni?'0':'1')+'">'+(x.banni?'Réintégrer au forum':'Exclure du forum')+'</button></div>'+
    bulles(x.messages,'admin')+regleAdmin(x)+
    (FZ.adm.regle?'':'<form class="fz-form" id="fz-admrep"><label class="fld"><span>Ta réponse</span><textarea name="t" rows="4" maxlength="4000" required></textarea></label><div class="df"><span class="sp"></span><button class="primary" type="submit">Répondre</button></div></form>');
}
/* ---- Stats ---- */
function remplirStats(d){
  var el=$('#fz-stats');if(!el||!d)return;
  var J=d.jours||[],som=function(cle,n){return J.slice(-n).reduce(function(s,x){return s+(x[cle]||0);},0);};
  var tuile=function(v,l){return '<div class="tile"><b>'+fmtN(v)+'</b><span>'+l+'</span></div>';};
  var max=Math.max.apply(null,[1].concat(J.map(function(x){return x.visite+x.anonyme;})));
  var barres=J.map(function(x){var t=x.visite+x.anonyme,dd=new Date(x.j+'T12:00:00');
    return '<div class="st-j" title="'+esc(fmtDate(x.j))+', '+t+' visites"><div class="st-b"><i class="anon" style="height:'+(x.anonyme/max*100).toFixed(1)+'%"></i><i style="height:'+(x.visite/max*100).toFixed(1)+'%"></i></div><span>'+(dd.getDate()===1||J.indexOf(x)%7===6?dd.getDate():'')+'</span></div>';}).join('');
  el.innerHTML=
    '<section class="card-box st-direct"><h3>En ce moment sur Bobine</h3><div id="st-live" aria-live="polite"><p class="muted">Connexion au compteur…</p></div></section>'+
    '<section class="card-box"><h3>Membres</h3><div class="tiles">'+tuile(d.membres,'comptes Bobine')+tuile(d.nouveaux7,'nouveaux sur 7 jours')+tuile(d.connectes1,'connectés aujourd’hui')+tuile(d.connectes7,'connectés sur 7 jours')+tuile(d.connectes30,'connectés sur 30 jours')+tuile(d.prives,'carnets privés')+'</div></section>'+
    '<section class="card-box"><h3>Visites</h3><div class="tiles">'+tuile(som('visite',1)+som('anonyme',1),'visites aujourd’hui')+tuile(som('visite',7)+som('anonyme',7),'visites sur 7 jours')+tuile(som('anonyme',30),'visites sans compte sur 30 jours')+tuile(som('carnet',30),'carnets ouverts par d’autres sur 30 jours')+tuile(som('forum',30),'passages sur le forum sur 30 jours')+'</div>'+
      '<div class="st-graph" role="img" aria-label="Visites des 30 derniers jours">'+barres+'</div><p class="muted petit"><span class="st-leg"></span>membres connectés <span class="st-leg anon"></span>sans compte. Une visite est comptée une fois par ouverture de Bobine.</p></section>'+
    '<section class="card-box"><h3>Carnets les plus visités</h3>'+((d.top_carnets||[]).length?'<ol class="st-top">'+d.top_carnets.map(function(x){return '<li>'+lienPseudo(x.pseudo)+'<span>'+plural(+x.n,'visite','visites')+'</span></li>';}).join('')+'</ol>':'<p class="muted">Pas encore de visite de carnet.</p>')+'<p class="muted petit">Sur 30 jours, sans compter les propriétaires qui regardent leur propre carnet.</p></section>'+
    '<section class="card-box"><h3>Tous les carnets</h3><div id="st-carnets"><p class="muted">Chargement…</p></div></section>';
  appel('bobine_admin_carnets').then(function(c){
    var el2=$('#st-carnets');if(!el2)return;
    var l=c.carnets||[];
    el2.innerHTML=(l.length?'<ul class="st-carnets">'+l.map(function(x){return '<li><a href="bobine.html?carnet='+encodeURIComponent(x.pseudo)+'">'+esc(x.pseudo)+'</a><span>'+plural(+x.films,'film','films')+(+x.visites?', '+plural(+x.visites,'visite','visites')+' sur 30 jours':'')+'</span></li>';}).join('')+'</ul>':'<p class="muted">Aucun carnet public pour l’instant.</p>')+
      (c.prives?'<p class="muted petit">Et '+plural(c.prives,'carnet privé','carnets privés')+', qui restent privés même pour toi.</p>':'');
  },function(e){var el2=$('#st-carnets');if(el2)el2.innerHTML='<p class="muted">'+esc(erreurRpc(e))+'</p>';});
}
function enDirect(st){
  var el=$('#st-live');if(!el)return;
  var l=Object.keys(st||{}).map(function(k){var a=st[k]||[];return a[a.length-1]||{};});
  var n=l.length,m=l.filter(function(x){return x.m;}).length,c=l.filter(function(x){return x.ou==='carnet';}).length,f=l.filter(function(x){return x.ou==='forum';}).length;
  el.innerHTML='<div class="st-n"><b>'+fmtN(n)+'</b><span>'+(n>1?'personnes':'personne')+' en ce moment</span></div>'+
    '<p class="sub">'+plural(m,'membre connecté','membres connectés')+', '+fmtN(n-m)+' sans compte'+(c?', '+fmtN(c)+' sur le carnet de quelqu’un':'')+(f?', '+fmtN(f)+' sur le forum':'')+'. Toi compris.</p>';
}
function brancherDirect(){
  PRES.cb=enDirect;presRejoindre();
  if(!sb||typeof sb.channel!=='function'){var el=$('#st-live');if(el)el.innerHTML='<p class="muted">Le compteur en direct n’est pas disponible ici.</p>';return;}
  if(PRES.ch)try{enDirect(PRES.ch.presenceState());}catch(e){}
}
/* Une conversation réglée peut être effacée en entier, après confirmation */
function regleAdmin(x){
  var rg=FZ.adm.regle||0,n=(x.messages||[]).length;
  if(!n)return '';
  if(rg===0)return '<div class="btnrow"><button class="ghost small ok" type="button" data-action="fzregle">Marquer comme réglé</button></div>';
  if(rg===1)return '<div class="regle"><b>Conversation réglée</b><p class="muted petit">Tu peux effacer toute la suite de messages, pour toi et pour '+esc(x.membre.pseudo)+'.</p><div class="btnrow"><button class="ghost small danger" type="button" data-action="fzsupconv">Supprimer la conversation</button><button class="ghost small" type="button" data-action="fzrouvrir">Rouvrir</button></div></div>';
  return '<div class="confirm">Supprimer '+(n>1?'les '+n+' messages':'le message')+' pour de bon ? <button class="primary small" type="button" data-action="fzsupconvok">Oui, supprimer</button><button class="ghost small" type="button" data-action="fzregle">Non</button></div>';
}

/* ---- Chargements après l'affichage d'une vue ---- */
function apresRendu(r){
  presMaj();
  if(r==='forum')compterUneFois('bobine.forum','forum');
  if(r==='bilan'){garderTrophees();chargerFilmos();}
  if(r==='a-voir'&&!LECTURE){chargerPool();chargerTop();}
  if(r==='forum'){
    var p=routeParam();
    if(p==='nouveau')return;
    if(p){appel('bobine_sujet',{p_id:+p}).then(function(d){FZ.sujet=d;if(route()==='forum'&&routeParam()===p)remplirSujet();},function(e){FZ.sujet=null;remplirSujet();});return;}
    if(FZ.liste)remplirForum();
    appel('bobine_forum').then(function(d){FZ.liste=d||[];if(route()==='forum'&&!routeParam())remplirForum();},function(e){var el=$('#fz');if(el)el.innerHTML='<p class="muted">'+esc(erreurRpc(e))+'</p>';});
  }
  if(r==='contact'&&connecte()){
    appel('bobine_contact').then(function(d){FZ.contact=d||[];var el=$('#fz');if(el&&route()==='contact')el.innerHTML=bulles(FZ.contact,'membre');FZ.notifs.contact=0;renderTabs();},function(e){var el=$('#fz');if(el)el.innerHTML='<p class="muted">'+esc(erreurRpc(e))+'</p>';});
  }
  if(r==='admin'&&FZ.notifs.admin){
    var u=routeParam();
    if(u==='stats'){appel('bobine_admin_stats').then(function(d){remplirStats(d);brancherDirect();},function(e){var el=$('#fz-stats');if(el)el.innerHTML='<p class="muted">'+esc(erreurRpc(e))+'</p>';});return;}
    if(u){if(FZ.adm.pour!==u){FZ.adm.regle=0;FZ.adm.pour=u;}appel('bobine_admin_conversation',{p_user:u}).then(function(d){FZ.adm.une=d;remplirConvAdmin();chargerNotifs();});return;}
    Promise.all([appel('bobine_admin_conversations'),appel('bobine_admin_signalements'),appel('bobine_admin_signal_critiques').catch(function(){return [];})]).then(function(d){FZ.adm.conv=d[0]||[];FZ.adm.sign=d[1]||[];FZ.adm.crit=d[2]||[];if(route()==='admin'&&!routeParam())remplirAdmin();});
  }
}

/* ---- Envois ---- */
function envoyer(form,nom,args,ok){
  if(FZ.envoi)return;FZ.envoi=true;
  var b=form.querySelector('button[type=submit]');if(b)b.disabled=true;
  appel(nom,args).then(function(d){FZ.envoi=false;if(b)b.disabled=false;ok(d);},function(e){FZ.envoi=false;if(b)b.disabled=false;toast(erreurRpc(e));});
}
document.addEventListener('submit',function(ev){
  var f=ev.target;
  if(f.id==='fz-nouveau'){ev.preventDefault();envoyer(f,'bobine_nouveau_sujet',{p_categorie:f.c.value,p_titre:f.ti.value,p_texte:f.t.value},function(id){FZ.liste=null;toast('Sujet publié');location.hash='#forum/'+id;});}
  if(f.id==='fz-rep'){ev.preventDefault();envoyer(f,'bobine_repondre',{p_sujet:FZ.sujet.id,p_texte:f.t.value},function(){f.t.value='';FZ.liste=null;apresRendu('forum');});}
  if(f.id==='fz-contact'){ev.preventDefault();envoyer(f,'bobine_contact_envoyer',{p_texte:f.t.value},function(){f.t.value='';toast('Message envoyé à l’équipe');apresRendu('contact');});}
  if(f.classList.contains('fz-sig')){ev.preventDefault();envoyer(f,'bobine_signaler',{p_message:+f.dataset.id,p_raison:f.r.value},function(){f.outerHTML='<span class="muted petit">Merci, l’équipe va regarder.</span>';});}
  if(f.id==='fz-admrep'){ev.preventDefault();envoyer(f,'bobine_admin_repondre',{p_user:routeParam(),p_texte:f.t.value},function(){f.t.value='';apresRendu('admin');});}
},true);
function actionForum(act,a){
  if(act==='fzfiltre'){FZ.filtre=a.dataset.v;document.querySelectorAll('[data-action=fzfiltre]').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.v===FZ.filtre);});remplirForum();}
  if(act==='fzsuppr'){
    if(a.dataset.ok!=='1'){a.dataset.ok='1';a.textContent='Sûr ? Re-clique';return;}
    appel('bobine_supprimer_message',{p_id:+a.dataset.id}).then(function(d){FZ.liste=null;if(d&&d.sujet_supprime){toast('Sujet supprimé');location.hash='#forum';}else{toast('Message supprimé');apresRendu('forum');}},function(e){toast(erreurRpc(e));});
  }
  if(act==='fzsignal'){
    var zone=a.closest('.msg-act');
    zone.innerHTML='<form class="fz-sig" data-id="'+esc(a.dataset.id)+'"><input name="r" maxlength="300" placeholder="Raison, si tu veux" aria-label="Raison du signalement"><button class="ghost small" type="submit">Signaler</button></form>';
    zone.querySelector('input').focus();
  }
  if(act==='fzmod'){
    appel('bobine_moderer',{p_quoi:a.dataset.quoi,p_id:+a.dataset.id,p_action:a.dataset.act}).then(function(){FZ.liste=null;toast('C’est fait');apresRendu(route());chargerNotifs();},function(e){toast(erreurRpc(e));});
  }
  if(act==='fzcrit'){
    appel('bobine_moderer_critique',{p_num:+a.dataset.n,p_action:a.dataset.act}).then(function(){toast(a.dataset.act==='masquer'?'Critique masquée':'Signalement classé');FZ.adm.crit=(FZ.adm.crit||[]).filter(function(x){return String(x.num)!==a.dataset.n;});remplirAdmin();chargerNotifs();},function(e){toast(erreurRpc(e));});
  }
  if(act==='fzregle'){FZ.adm.regle=1;remplirConvAdmin();}
  if(act==='fzrouvrir'){FZ.adm.regle=0;remplirConvAdmin();}
  if(act==='fzsupconv'){FZ.adm.regle=2;remplirConvAdmin();}
  if(act==='fzsupconvok'){
    appel('bobine_admin_supprimer_conversation',{p_user:routeParam()}).then(function(){FZ.adm.regle=0;FZ.adm.conv=null;toast('Conversation supprimée');location.hash='#admin';chargerNotifs();},function(e){toast(erreurRpc(e));});
  }
  if(act==='fztraite'){appel('bobine_admin_traiter',{p_id:+a.dataset.id}).then(function(){apresRendu('admin');chargerNotifs();},function(e){toast(erreurRpc(e));});}
  if(act==='fzban'){
    var oui=a.dataset.v==='1';
    if(oui&&a.dataset.ok!=='1'){a.dataset.ok='1';a.textContent='Sûr ? Re-clique';return;}
    appel('bobine_bannir',{p_user:a.dataset.u,p_banni:oui}).then(function(){toast(oui?'Exclu du forum':'Réintégré au forum');apresRendu(route());},function(e){toast(erreurRpc(e));});
  }
}

/* ---------- Apparence : fond crème ou sombre, couleur au choix (gardé sur cet appareil) ---------- */
var THEMES=[['auto','Auto'],['creme','Crème'],['sombre','Sombre']];
var ACCENTS=[['rouge','Rouge cinéma'],['bordeaux','Bordeaux'],['sapin','Vert sapin'],['nuit','Bleu nuit'],['moutarde','Moutarde'],['violet','Violet']];
function lireApparence(){try{return JSON.parse(localStorage.getItem('bobine.apparence')||'{}')||{};}catch(e){return {};}}
function appliquerApparence(a){
  var r=document.documentElement;
  if(a.theme==='creme')r.dataset.theme='light';else if(a.theme==='sombre')r.dataset.theme='dark';else delete r.dataset.theme;
  if(a.accent&&a.accent!=='rouge')r.dataset.accent=a.accent;else delete r.dataset.accent;
  var m=document.querySelector('meta[name=theme-color]');if(m)m.content=getComputedStyle(r).getPropertyValue('--marquee').trim()||'#111216';
}
function choisirApparence(theme,accent){
  var a=lireApparence();if(theme)a.theme=theme;if(accent)a.accent=accent;
  try{localStorage.setItem('bobine.apparence',JSON.stringify(a));}catch(e){}
  appliquerApparence(a);renderApparence();
}
function ouvrirApparence(){renderApparence();showDialog($('#apparence'));}
function renderApparence(){
  var a=lireApparence(),t=a.theme||'auto',c=a.accent||'rouge';
  $('#app-body').innerHTML='<div class="fld"><span>Fond</span><div class="segs">'+THEMES.map(function(x){return '<button type="button" class="seg" data-action="theme" data-v="'+x[0]+'" aria-pressed="'+(t===x[0])+'">'+x[1]+'</button>';}).join('')+'</div>'+
    '<p class="muted petit">Auto suit le réglage de ton téléphone ou de ton ordi.</p></div>'+
    '<div class="fld"><span>Couleur</span><div class="pastilles-c">'+ACCENTS.map(function(x){return '<button type="button" class="pc pc-'+x[0]+'" data-action="accent" data-v="'+x[0]+'" aria-pressed="'+(c===x[0])+'"><i></i>'+x[1]+'</button>';}).join('')+'</div></div>'+
    '<p class="muted petit">Ton choix reste sur cet appareil.</p>'+
    '<div class="df"><span class="sp"></span><button type="button" class="primary" data-action="close">Fermer</button></div>';
}
/* Ampoules du bandeau qui s'allument pour un coup de cœur */
function allumerAmpoules(){
  var m=document.querySelector('.marquee');if(!m)return;
  m.classList.remove('coeur');void m.offsetWidth;m.classList.add('coeur');
  clearTimeout(allumerAmpoules.t);allumerAmpoules.t=setTimeout(function(){m.classList.remove('coeur');},2600);
}

/* ---------- Recherche de films dans À voir et dans les listes ----------
   Même recherche que « Noter un film » : tes films d'abord, puis TMDB, avec les affiches. */
var RQ={};
function champRq(id,ph){
  return '<div class="rq"><label class="rq-champ"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'+
    '<input type="search" id="'+id+'-q" data-rq="'+id+'" placeholder="'+esc(ph)+'" aria-label="'+esc(ph)+'" aria-controls="'+id+'-sug" autocomplete="off" enterkeyhint="search"></label>'+
    '<div class="sug rq-sug" id="'+id+'-sug" role="listbox" hidden></div></div>';
}
function rqEtat(id){return RQ[id]||(RQ[id]={timer:null,seq:0,items:[],idx:-1,q:''});}
function rqFermer(id){var st=rqEtat(id);clearTimeout(st.timer);st.seq++;st.items=[];st.idx=-1;var b=$('#'+id+'-sug');if(b){b.hidden=true;b.innerHTML='';}}
function rqAfficher(id,items,enCours){
  var b=$('#'+id+'-sug'),st=rqEtat(id);if(!b)return;st.items=items;st.idx=-1;
  b.innerHTML=items.map(function(it,i){
    var f=it.local?film(it.k):null,etat='';
    if(f)etat=f.w?'déjà vu':f.wl?'dans À voir':'dans ton carnet';
    else if(it.raw)etat='ajouter tel quel';
    else if(it.to&&norm(it.to)!==norm(it.t))etat=it.to;
    return '<button type="button" class="si" role="option" data-rqi="'+i+'" data-rqid="'+id+'">'+(it.p?'<img src="'+IMG+'w92'+esc(it.p)+'" alt="" loading="lazy">':'<span class="noimg"></span>')+
      '<span class="st"><b>'+esc(it.t)+'</b> <span class="fy">'+esc(it.y||'')+'</span>'+(etat?'<small'+(f?' class="dt"':'')+'>'+esc(etat)+'</small>':'')+'</span><span class="aj">Ajouter</span></button>';
  }).join('')+(enCours?'<p class="sl">Recherche…</p>':'');
  b.hidden=!items.length&&!enCours;
}
function rqChercher(id,q){
  var st=rqEtat(id),seq=++st.seq,nq=norm(q);st.q=q;
  var locaux=Object.values(S.films).filter(function(f){return norm(f.t).indexOf(nq)>=0;}).slice(0,3)
    .map(function(f){return {local:true,k:f.k,t:f.t,y:f.y,p:f.p,tm:f.tm};});
  var brut={raw:true,t:q,y:''};
  if(!TMDB_FN){rqAfficher(id,locaux.concat([brut]),false);return;}
  rqAfficher(id,locaux,true);
  tmdbGet({q:q}).then(function(d){
    if(seq!==st.seq)return;
    var dist=(d.resultats||[]).filter(function(r){return !locaux.some(function(l){return l.tm===r.id||(norm(l.t)===norm(r.t)&&l.y===r.y);});}).slice(0,6);
    var tout=locaux.concat(dist.map(function(r){return {tm:r.id,t:r.t,y:r.y,p:r.p,to:r.to};}));
    rqAfficher(id,tout.length?tout:[brut],false);
  },function(){if(seq===st.seq)rqAfficher(id,locaux.concat([brut]),false);});
}
/* Le film choisi dans les suggestions, créé dans le carnet s'il n'y est pas encore */
function filmDepuis(it){
  if(!it)return null;
  if(it.local)return film(it.k)||null;
  if(it.raw){var p=splitTitle(it.t,'');if(!p[0])return null;var fr=ensureFilm(p[0],p[1]);setTimeout(rattraper,600);return fr;}
  var f=Object.values(S.films).find(function(x){return x.tm===it.tm;})||ensureFilm(it.t,it.y||'');
  f.tm=it.tm;if(it.p)f.p=it.p;if(it.dr&&!f.dr)f.dr=it.dr;if(it.m&&!f.m)f.m=it.m;
  if(!f.dr||!f.m||!f.g)tmdbGet({id:it.tm}).then(function(d){
    var fi=d&&d.fiche;if(!fi||!S.films[f.k])return;
    if(fi.dr)f.dr=fi.dr;if(!f.m&&fi.m)f.m=fi.m;if(fi.p)f.p=fi.p;appliquerFiche(f,fi);commit();
  },function(){});
  return f;
}
function rqChoisir(id,i){
  var st=rqEtat(id),it=st.items[i];if(!it)return;
  rqFermer(id);var inp=$('#'+id+'-q');if(inp)inp.value='';
  if(id==='wl')ajouterAVoir(it);
  if(id==='li')ajouterAListe(it);
  setTimeout(function(){var x=$('#'+id+'-q');if(x)x.focus();},0);
}
function ajouterAVoir(it){
  var f=filmDepuis(it);if(!f)return;
  if(f.w){toast('Tu as déjà vu « '+f.t+' »');return;}
  if(f.wl){toast('« '+f.t+' » est déjà dans ta liste');return;}
  f.wl=today();commit();toast('« '+f.t+' » ajouté à À voir');
}
function ajouterAListe(it){
  var L=S.lists.find(function(x){return x.id===openListId;});if(!L)return;
  var f=filmDepuis(it);if(!f)return;
  if(L.items.indexOf(f.k)>=0){toast('« '+f.t+' » est déjà dans la liste');return;}
  L.items.push(f.k);commit();toast('« '+f.t+' » ajouté à la liste');
}
document.addEventListener('input',function(ev){
  var id=ev.target.dataset&&ev.target.dataset.rq;if(!id)return;
  var st=rqEtat(id),q=ev.target.value.trim();clearTimeout(st.timer);
  if(q.length<2){rqFermer(id);return;}
  st.timer=setTimeout(function(){rqChercher(id,q);},250);
});
document.addEventListener('keydown',function(ev){
  var id=ev.target.dataset&&ev.target.dataset.rq;if(!id)return;
  var st=rqEtat(id),b=$('#'+id+'-sug'),bt=b?b.querySelectorAll('.si'):[];
  if((ev.key==='ArrowDown'||ev.key==='ArrowUp')&&bt.length){ev.preventDefault();st.idx=(st.idx+(ev.key==='ArrowDown'?1:-1)+bt.length)%bt.length;bt.forEach(function(x,j){x.classList.toggle('on',j===st.idx);});bt[st.idx].scrollIntoView({block:'nearest'});}
  else if(ev.key==='Enter'){ev.preventDefault();if(st.items.length)rqChoisir(id,st.idx>=0?st.idx:0);else{var q=ev.target.value.trim();if(q.length>=2)rqChercher(id,q);}}
  else if(ev.key==='Escape'){rqFermer(id);}
});
document.addEventListener('focusout',function(ev){
  var id=ev.target.dataset&&ev.target.dataset.rq;if(!id)return;
  setTimeout(function(){var b=$('#'+id+'-sug');if(b&&document.activeElement&&b.contains(document.activeElement))return;if(document.activeElement===ev.target)return;rqFermer(id);},200);
});
document.addEventListener('mousedown',function(ev){if(ev.target.closest('.rq-sug'))ev.preventDefault();});
document.addEventListener('click',function(ev){var x=ev.target.closest('[data-rqi]');if(x)rqChoisir(x.dataset.rqid,+x.dataset.rqi);});

/* ---------- 1.8 : genres, pays et réalisateur de chaque film ----------
   Complétés en tâche de fond depuis la fonction TMDB, 25 films à la fois. */
var GENRES={28:'Action',12:'Aventure',16:'Animation',35:'Comédie',80:'Crime',99:'Documentaire',18:'Drame',10751:'Familial',14:'Fantastique',36:'Histoire',27:'Horreur',10402:'Musique',9648:'Mystère',10749:'Romance',878:'Science-fiction',10770:'Téléfilm',53:'Thriller',10752:'Guerre',37:'Western'};
function appliquerFiche(f,fi){
  if(!f||!fi)return;
  f.g=fi.g||[];f.pa=fi.pa||[];f.dri=fi.dri||null;
  if(fi.p&&!f.p)f.p=fi.p;if(fi.dr&&!f.dr)f.dr=fi.dr;if(!f.m&&fi.m)f.m=fi.m;
}
var compl=false;
function completer(){
  if(LECTURE||!TMDB_FN||compl||ratt)return;
  var liste=Object.values(S.films).filter(function(f){return f.tm>0&&!f.g;});
  if(!liste.length){chargerFilmos();return;}
  compl=true;var i=0;
  (function suivant(){
    var lot=liste.slice(i,i+25);i+=25;
    if(!lot.length||i>1000){compl=false;commit({norender:true});if(route()==='bilan'||route()==='a-voir')render();chargerFilmos();return;}
    timeout(fetch(TMDB_FN,{method:'POST',headers:{'Content-Type':'application/json',apikey:CFG.cle||''},body:JSON.stringify({ids:lot.map(function(f){return f.tm;})})}).then(function(r){return r.json();}),40000)
    .then(function(d){
      var par={};(d.fiches||[]).forEach(function(fi){par[fi.id]=fi;});
      lot.forEach(function(f){if(par[f.tm])appliquerFiche(f,par[f.tm]);else f.g=f.g||[];});
      commit({norender:true});setTimeout(suivant,400);
    },function(e){console.warn('Bobine : TMDB indisponible',e);compl=false;});
  })();
}

/* ---------- « Sur Bobine » : moyenne, nombre de carnets et critiques des autres ---------- */
var FB={};
function cleFB(f){return f.tm>0?'tm'+f.tm:'k'+f.k;}
function surBobine(f){
  var c=cleFB(f),x=FB[c];
  if(x&&(x.d||x.attente)&&Date.now()-x.t<120000)return x.attente||Promise.resolve(x.d);
  if(!sb)return Promise.reject(new Error('hors ligne'));
  var p=appel('bobine_film_bobine',{p_tm:f.tm>0?f.tm:null,p_cle:f.k}).then(function(d){FB[c]={d:d||{nb:0,critiques:[]},t:Date.now()};return FB[c].d;},function(e){delete FB[c];throw e;});
  FB[c]={attente:p,t:Date.now()};
  return p;
}
function moyenne(v){return Number(v).toFixed(1).replace('.',',');}
function lienPseudo(ps){return '<a class="lien-carnet" href="bobine.html?carnet='+encodeURIComponent(ps)+'">'+esc(ps)+'</a>';}
function ligneStats(d,f){
  if(!d)return '';
  var autres=d.nb-(f&&f.w?1:0);
  if(d.nb<=0||autres<=0&&!d.moy)return '';
  return 'Noté par '+plural(d.nb,'personne','personnes')+' sur Bobine'+(d.moy?', moyenne '+moyenne(d.moy):'');
}
var surbTout=false;
function htmlSurBobine(f,d){
  if(!d)return '<h3>Sur Bobine</h3><p class="muted petit">Chargement…</p>';
  var st=ligneStats(d,f),cr=d.critiques||[];
  var h='<h3>Sur Bobine</h3><p class="surb-stats">'+(st||(f.w?'Tu es le premier à l’avoir noté sur Bobine.':'Personne ne l’a encore noté sur Bobine.'))+'</p>';
  if(!cr.length)return h;
  var vis=surbTout?cr:cr.slice(0,4);
  h+='<div class="surb-crits">'+vis.map(function(c){
    return '<div class="surb-c"><div class="surb-h">'+lienPseudo(c.pseudo)+(c.note?'<span class="stars" aria-label="'+ratingWords(c.note)+'">'+stars(c.note)+'</span>':'')+(c.cc?'<span class="heart" aria-label="Coup de cœur">♥</span>':'')+(c.d?'<span class="quand">'+esc(fmtDate(c.d))+'</span>':'')+'</div>'+
      critique({rv:c.texte,sp:c.sp},'')+'<button class="lien" type="button" data-action="sigcrit" data-n="'+c.n+'">Signaler</button></div>';
  }).join('')+'</div>';
  if(cr.length>4&&!surbTout)h+='<button class="ghost small" type="button" data-action="surbtout">Voir les '+(cr.length-4)+' autres critiques</button>';
  return h;
}
function remplirSurBobine(f){
  var el=$('#sh-bobine');if(!el||!sb)return;
  var c=FB[cleFB(f)];el.innerHTML=htmlSurBobine(f,c&&c.d);
  surBobine(f).then(function(d){var e2=$('#sh-bobine');if(e2&&sheetK===f.k)e2.innerHTML=htmlSurBobine(f,d);},function(){var e2=$('#sh-bobine');if(e2)e2.innerHTML='';});
}
/* Dans « Noter » : combien de personnes l'ont noté, et la moyenne */
function statsNoter(f){
  var el=$('#lf-stats');if(!el)return;el.hidden=true;el.textContent='';
  if(!f||!sb)return;
  surBobine(f).then(function(d){var t=ligneStats(d,f);if(t&&$('#log').open){el.textContent=t;el.hidden=false;}},function(){});
}
function signalerCritique(n){
  if(!connecte()){toast('Connecte-toi avec Twitch pour signaler une critique');return;}
  appel('bobine_signaler_critique',{p_num:+n,p_raison:''}).then(function(){toast('Merci, l’équipe va regarder');},function(e){toast(erreurRpc(e));});
}

/* ---------- Roulette découverte ----------
   Selon mes goûts : TMDB recommande des films à partir de ceux que tu as notés de 3,5 à 5 ou mis en coup de cœur.
   On enlève tout ce que tu as vu ou déjà mis dans À voir, puis on favorise tes genres préférés
   et les films qui ont une critique sur Bobine. */
function poidsAime(f){return f?Math.max(.5,(f.r||3.5)-2.5)+(f.l?1:0):0;}
function aimes(){return Object.values(S.films).filter(function(f){return f.w&&f.tm>0&&(f.r>=3.5||f.l);});}
/* Les films de départ : une vingtaine pris parmi TOUS tes films notés de 3,5 à 5 (ou en coup de cœur).
   Un 5 étoiles compte un peu plus qu'un 3,5, et ceux déjà utilisés aux visites précédentes passent après. */
function graines(){
  var deja={};try{(JSON.parse(localStorage.getItem('bobine.rl.graines')||'[]')||[]).forEach(function(tm){deja[tm]=1;});}catch(e){}
  var a=aimes(),out=[],poids=function(f){return poidsAime(f)*(deja[f.tm]?.35:1);};
  while(a.length&&out.length<24){
    var tot=a.reduce(function(s,f){return s+poids(f);},0),r=Math.random()*tot,i=0;
    for(;i<a.length;i++){r-=poids(a[i]);if(r<=0)break;}
    out.push(a.splice(Math.min(i,a.length-1),1)[0]);
  }
  try{var garde=out.map(function(f){return f.tm;}).concat(Object.keys(deja).map(Number)).slice(0,80);localStorage.setItem('bobine.rl.graines',JSON.stringify(garde));}catch(e){}
  return out;
}
function chargerReco(){
  if(RL.recoCharge||!TMDB_FN)return;
  var g=graines();if(!g.length){RL.reco=[];return;}
  RL.recoCharge=true;RL.graines=g;
  var lots=[];for(var i=0;i<g.length;i+=8)lots.push(g.slice(i,i+8));
  Promise.all(lots.map(function(l){return tmdbGet({reco:l.map(function(f){return f.tm;}).join(',')}).then(function(d){return d.reco||[];},function(){return [];});})).then(function(res){
    var par={};
    res.forEach(function(liste){liste.forEach(function(x){if(par[x.id]){par[x.id].de=par[x.id].de.concat(x.de||[]);}else par[x.id]=x;});});
    RL.reco=Object.values(par);
    if(sb&&RL.reco.length)appel('bobine_avec_critiques',{p_tms:RL.reco.map(function(x){return x.id;}).slice(0,200)}).then(function(a){RL.avecCrit=a||[];if(route()==='a-voir')render();},function(){});
    if(route()==='a-voir')render();
  });
}
function profilGenres(){var g={};aimes().forEach(function(f){(f.g||[]).forEach(function(id){g[id]=(g[id]||0)+poidsAime(f);});});return g;}
function dejaPris(){var d={};Object.values(S.films).forEach(function(f){if(f.tm&&(f.w||f.wl))d[f.tm]=1;});return d;}
/* La raison affichée : le vrai film d'origine, choisi une fois pour toutes pour ce film proposé */
var RAISON={};
function origine(id,liste){
  if(!(id in RAISON)){var l=liste.filter(Boolean);RAISON[id]=l.length?l[Math.floor(Math.random()*l.length)]:null;}
  return RAISON[id];
}
function candidatsGouts(){
  if(!RL.reco)return null;
  var deja=dejaPris(),pg=profilGenres(),tot=Object.values(pg).reduce(function(s,v){return s+v;},0)||1,gr={},crit={};
  (RL.graines||[]).forEach(function(f){gr[f.tm]=f;});(RL.avecCrit||[]).forEach(function(id){crit[id]=1;});
  return RL.reco.filter(function(x){return !deja[x.id]&&(x.vc||0)>=20;}).map(function(x){
    var s=1+Math.min(3,(x.de||[]).length)+(x.g||[]).reduce(function(a,id){return a+(pg[id]||0);},0)/tot*3+Math.max(0,(x.va||0)-6.5)+(crit[x.id]?1.5:0);
    var src=origine('tm:'+x.id,(x.de||[]).map(function(id){return gr[id];}));
    var f=Object.values(S.films).find(function(y){return y.tm===x.id;})||{k:'tm'+x.id,t:x.t,y:x.y,p:x.p,tm:x.id};
    return {id:'tm:'+x.id,f:f,poids:s,src:src&&src.tm,why:src?'Parce que tu as aimé '+src.t:'Une découverte pour toi',tm:{tm:x.id,t:x.t,y:x.y,p:x.p}};
  }).sort(function(a,b){return b.poids-a.poids;}).slice(0,120);
}
/* Le film proposé : sa fiche TMDB (réalisateur, durée) et ce qu'en dit Bobine, chargés une fois */
var RLF={};
function rlEnrichir(it){
  var tm=it.f.tm;if(!tm||RLF[tm])return;RLF[tm]={};
  var fin=function(){if(route()==='a-voir')render();};
  if(!it.f.dr||!it.f.m)tmdbGet({id:tm}).then(function(d){if(d&&d.fiche){RLF[tm].fi=d.fiche;fin();}},function(){});
  if(sb)surBobine({tm:tm,k:'tm'+tm}).then(function(){fin();},function(){});
}
function critiqueRoulette(tm){
  var c=FB['tm'+tm];if(!c||!c.d)return null;
  var cr=(c.d.critiques||[]).filter(function(x){return !x.sp&&x.texte.length>=20;});
  var bons=cr.filter(function(x){return !x.note||x.note>=3.5;});
  var l=(bons.length?bons:cr).slice(0,3);if(!l.length)return null;
  if(RLF[tm]&&RLF[tm].ci==null)RLF[tm].ci=Math.floor(Math.random()*l.length);
  return l[(RLF[tm]&&RLF[tm].ci)||0];
}
function tronque(s,n){s=String(s||'');return s.length>n?s.slice(0,n).replace(/\s+\S*$/,'')+'…':s;}

/* ---------- Roulette « Je sais pas quoi regarder » ----------
   Elle part d'abord de Bobine : les films notés et critiqués par les autres membres,
   choisis selon tes goûts (genres et réalisateurs des films que tu as aimés).
   Quand Bobine n'a pas encore assez de films pour toi, TMDB complète avec ses recommandations.
   Jamais un film déjà vu, jamais un film déjà dans ta liste À voir. */
var RL={id:null,pool:null,poolCharge:false,tourne:false,soir:null,reco:null,recoCharge:false,graines:null,avecCrit:null,top:null,topCharge:false};
try{RL.soir=localStorage.getItem('bobine.roulette')||null;}catch(e){}
function chargerPool(){
  if(RL.poolCharge)return;RL.poolCharge=true;
  if(!sb){RL.pool=[];chargerReco();return;}
  appel('bobine_roulette_pool').then(function(d){RL.pool=d||[];if(candidatsPool().length<5)chargerReco();if(route()==='a-voir')render();},
    function(){RL.pool=[];chargerReco();if(route()==='a-voir')render();});
}
function candidatsPool(){
  if(!RL.pool)return [];
  var deja=dejaPris(),pg=profilGenres(),tot=Object.values(pg).reduce(function(s,v){return s+v;},0)||1,am=aimes(),parReal={};
  am.forEach(function(f){if(f.dri)(parReal[f.dri]=parReal[f.dri]||[]).push(f);});
  return RL.pool.filter(function(x){return !deja[x.tm];}).map(function(x){
    var g=x.g||[],gout=g.reduce(function(a,id){return a+(pg[id]||0);},0)/tot,reals=x.dri&&parReal[x.dri];
    var s=2+gout*3+(reals?2:0)+Math.max(0,(Number(x.moy)||3)-3)+(x.crit?1.5:0)+(x.cc?.5:0);
    var why,src=null;
    if(reals){src=origine('tm:'+x.tm,reals);why='Parce que tu as aimé '+src.t+', aussi de '+x.dr;}
    else{
      var proches=am.filter(function(f){return (f.g||[]).some(function(id){return g.indexOf(id)>=0;});});
      src=origine('tm:'+x.tm,proches);
      why=src?'Parce que tu as aimé '+src.t:(x.cc>=2?'Coup de cœur de '+x.cc+' carnets sur Bobine':'Bien noté sur Bobine');
    }
    var f=Object.values(S.films).find(function(y){return y.tm===x.tm;})||{k:'tm'+x.tm,t:x.t,y:x.y,p:x.p,dr:x.dr,m:x.m,tm:x.tm};
    return {id:'tm:'+x.tm,f:f,poids:s,src:src&&src.tm,why:why,tm:x};
  });
}
/* Bobine d'abord : les films notés par les membres pèsent plus lourd,
   mais les recommandations TMDB sont toujours là pour avoir une vraie sélection. */
function rlCandidats(){
  if(RL.pool===null)return null;
  var c=candidatsPool().map(function(x){x.poids*=2;return x;});
  if(!TMDB_FN)return c;
  if(RL.reco===null){chargerReco();return c.length?c:null;}
  var vus={};c.forEach(function(x){vus[x.id]=1;});
  return c.concat((candidatsGouts()||[]).filter(function(x){return !vus[x.id];}));
}
/* Relancer : jamais un film déjà proposé pendant la soirée, et pas deux fois d'affilée le même film d'origine */
var DEJA_TIRES={};
function tirer(c,sauf){
  var der=sauf&&c.find(function(x){return x.id===sauf;}),srcDer=der&&der.src;
  var pool=c.filter(function(x){return x.id!==sauf&&!DEJA_TIRES[x.id];});
  if(!pool.length){DEJA_TIRES={};pool=c.filter(function(x){return x.id!==sauf;});}
  if(!pool.length)pool=c;
  var autre=pool.filter(function(x){return !srcDer||x.src!==srcDer;});if(autre.length)pool=autre;
  var tot=pool.reduce(function(s,x){return s+x.poids;},0),r=Math.random()*tot,choix=pool[pool.length-1];
  for(var i=0;i<pool.length;i++){r-=pool[i].poids;if(r<=0){choix=pool[i];break;}}
  DEJA_TIRES[choix.id]=1;
  return choix;
}
function rlCourant(c){
  if(!c||!c.length)return null;
  var it=c.find(function(x){return x.id===RL.id;})||(RL.soir&&c.find(function(x){return x.id===RL.soir;}));
  if(!it){it=tirer(c,null);RL.id=it.id;}
  return it;
}
function roulette(){
  var c=rlCandidats(),it=null,corps;
  if(c===null)corps='<p class="rl-vide">La roulette cherche des films pour toi…</p>';
  else if(!(it=rlCourant(c)))corps='<p class="rl-vide">'+(aimes().length?'Tu as déjà vu tout ce qu’on avait à te proposer. Reviens quand les autres membres auront noté de nouveaux films.':'Note quelques films que tu as aimés, et la roulette te proposera des films notés sur Bobine dans le même esprit.')+'</p>';
  else{
    rlEnrichir(it);
    var f=it.f,fi=(RLF[f.tm]&&RLF[f.tm].fi)||{},dr=f.dr||fi.dr,m=f.m||fi.m;
    var soir=RL.soir===it.id,info=[f.y,dr,m?fmtDurShort(m):''].filter(Boolean).join(', ');
    var fb=FB['tm'+f.tm],st=fb&&fb.d?ligneStats(fb.d,null):'',cr=critiqueRoulette(f.tm);
    corps='<div class="rl-choix'+(RL.tourne?' tourne':'')+'">'+poster(f)+'<div class="rl-txt">'+(soir?'<span class="rl-soir">Ce soir</span>':'')+'<b>'+esc(f.t)+'</b>'+(info?'<span class="rl-info">'+esc(info)+'</span>':'')+'<span class="rl-why">'+esc(it.why)+'</span>'+(st?'<span class="rl-stats">'+esc(st)+'</span>':'')+'</div></div>'+
      (cr?'<figure class="rl-crit"><blockquote>« '+esc(tronque(cr.texte,240))+' »</blockquote><figcaption>'+(cr.note?'<span class="stars" aria-label="'+ratingWords(cr.note)+'">'+stars(cr.note)+'</span>':'')+(cr.cc?'<span class="heart" aria-label="Coup de cœur">♥</span>':'')+'<span>par '+lienPseudo(cr.pseudo)+'</span><button class="lien" type="button" data-action="sigcrit" data-n="'+cr.n+'">Signaler</button></figcaption></figure>':'')+
      '<div class="btnrow">'+(soir?'<button class="primary" type="button" data-action="rlnote">Je l’ai vu, je le note</button>':'<button class="primary" type="button" data-action="rlgo">Je le regarde</button>')+
      (c.length>1?'<button class="ghost" type="button" data-action="rlnext">Relancer</button>':'')+'</div>';
  }
  return '<section class="roulette" aria-label="Roulette"><div class="bulbs" aria-hidden="true"></div><div class="rl-in"><h3>Je sais pas quoi regarder</h3>'+corps+'</div></section>';
}
/* Le top 5 de Bobine : les mieux notés du site, au moins 2 carnets par film */
function chargerTop(){
  if(RL.topCharge||!sb)return;RL.topCharge=true;
  appel('bobine_tendances').then(function(d){RL.top=(d||[]).slice(0,5);if(route()==='a-voir')render();},function(){RL.top=[];});
}
function topBobine(){
  if(!sb||!RL.top||!RL.top.length)return '';
  return '<section class="top5" aria-label="Le top 5 de Bobine"><h3>Le top 5 de Bobine</h3><ol>'+RL.top.map(function(x,i){
    var f=Object.values(S.films).find(function(y){return y.tm===x.tm;}),pf=f||{k:'tm'+x.tm,t:x.t,y:x.y,p:x.p,tm:x.tm};
    var etat=f&&f.w?'<span class="tag">vu</span>':f&&f.wl?'<span class="tag">dans À voir</span>':'<button class="ghost small" type="button" data-action="topwl" data-i="'+i+'">+ À voir</button>';
    return '<li><span class="rang">'+(i+1)+'</span>'+poster(pf,'mini')+'<span class="t5"><b>'+esc(x.t)+' <span class="fy">'+esc(x.y||'')+'</span></b><span class="t5-n"><span class="stars">'+stars(Math.round(x.moy*2)/2)+'</span> '+moyenne(x.moy)+', '+plural(x.nb,'carnet','carnets')+'</span></span>'+etat+'</li>';
  }).join('')+'</ol></section>';
}
function actionRoulette(act,a){
  if(act==='topwl'){var x=RL.top&&RL.top[+a.dataset.i];if(!x)return;var g2=filmDepuis({tm:x.tm,t:x.t,y:x.y,p:x.p,dr:x.dr,m:x.m});if(g2&&!g2.w&&!g2.wl){g2.wl=today();commit();toast('« '+g2.t+' » ajouté à À voir');}return;}
  var c=rlCandidats(),it=rlCourant(c);
  if(!it)return;
  if(act==='rlnext'){var n=tirer(c,it.id);RL.id=n.id;RL.tourne=true;render();setTimeout(function(){RL.tourne=false;},700);}
  if(act==='rlgo'){
    var fi=(RLF[it.f.tm]&&RLF[it.f.tm].fi)||{};
    var f=it.tm?filmDepuis({tm:it.tm.tm,t:it.tm.t,y:it.tm.y,p:it.tm.p,dr:it.tm.dr||fi.dr,m:it.tm.m||fi.m}):it.f;
    if(f&&!f.w&&!f.wl)f.wl=today();
    RL.soir=it.id;RL.id=it.id;try{localStorage.setItem('bobine.roulette',it.id);}catch(e){}
    commit();toast('Bonne séance !');
  }
  if(act==='rlnote'){
    var g=it.tm?filmDepuis({tm:it.tm.tm,t:it.tm.t,y:it.tm.y,p:it.tm.p}):it.f;
    RL.soir=null;try{localStorage.removeItem('bobine.roulette');}catch(e){}
    if(g)openLog({k:g.k});
  }
}

/* ---------- Défis de l'année et badges ----------
   Tout est calculé dans la page à partir du carnet. Rien de plus n'est enregistré. */
function filmsDeLAnnee(ys){var m={};S.diary.forEach(function(e){if((e.d||'').slice(0,4)===ys&&film(e.k))m[e.k]=film(e.k);});return Object.values(m);}
function decennie(f){var y=parseInt(f.y,10);return y>1870&&y<2100?Math.floor(y/10)*10:null;}
function defis(ys){
  var fa=filmsDeLAnnee(ys),dec={},dr={};
  fa.forEach(function(f){var d=decennie(f);if(d)dec[d]=1;if(f.dr)dr[f.dr]=1;});
  return [
    {t:'52 films dans l’année',n:fa.length,but:52},
    {t:'Le tour des décennies',n:Object.keys(dec).length,but:10},
    {t:'20 réalisateurs différents',n:Object.keys(dr).length,but:20}
  ];
}
function blocDefis(ys){
  var d=defis(ys),ok=d.filter(function(x){return x.n>=x.but;}).length;
  return '<section class="card-box defis"><div class="cb-tete"><h3>Défis '+ys+'</h3><span class="sub">'+ok+' réussi'+(ok>1?'s':'')+' sur '+d.length+'</span></div>'+
    d.map(function(x){var pct=Math.min(100,x.n/x.but*100);return '<div class="defi'+(x.n>=x.but?' fait':'')+'"><div class="dt"><b>'+esc(x.t)+'</b><span class="sub">'+fmtN(Math.min(x.n,x.but))+' sur '+x.but+'</span></div><div class="jauge" role="progressbar" aria-valuemin="0" aria-valuemax="'+x.but+'" aria-valuenow="'+Math.min(x.n,x.but)+'" aria-label="'+esc(x.t)+'"><i style="width:'+pct.toFixed(1)+'%"></i></div></div>';}).join('')+
    '<p class="muted petit">Ils comptent les films avec une date de visionnage en '+ys+'.</p></section>';
}
/* ---------- Badges du moment (obtenus une fois pour toutes) ---------- */
function badges(){
  var films=Object.values(S.films).filter(function(f){return f.w;});
  var rw=S.diary.filter(function(e){return e.rw;}).length;
  var jour={},an={},vieux=films.some(function(f){var y=parseInt(f.y,10);return y>1870&&y<1950;});
  S.diary.forEach(function(e){if(e.d){if(e.d.length===10)jour[e.d]=(jour[e.d]||0)+1;var y=e.d.slice(0,4);(an[y]=an[y]||{})[e.k]=1;}});
  var maxJour=Math.max.apply(null,[0].concat(Object.values(jour)));
  var maxAn=Math.max.apply(null,[0].concat(Object.values(an).map(function(o){return Object.keys(o).length;})));
  return [
    {id:'coeur',ic:'♥',t:'Premier coup de cœur',s:'Un film qui t’a marqué',ok:films.some(function(f){return f.l;})},
    {id:'marathon',ic:'3',t:'Marathon',s:'3 films le même jour',ok:maxJour>=3},
    {id:'annee52',ic:'52',t:'Une année de ciné',s:'52 films en une année',ok:maxAn>=52},
    {id:'fidele',ic:'↻',t:'Fidèle',s:'5 films revus',ok:rw>=5},
    {id:'temps',ic:'N&B',t:'Voyageur du temps',s:'Un film d’avant 1950',ok:vieux}
  ];
}
function blocBadges(){
  var T=trophees(),b=badges().map(function(x){x.ok=x.ok||!!T['b:'+x.id];return x;}),n=b.filter(function(x){return x.ok;}).length;
  return '<section class="badges-box"><div class="cb-tete"><h3>Badges</h3><span class="sub">'+n+' sur '+b.length+'</span></div><div class="badges">'+
    b.map(function(x,i){return '<div class="badge'+(x.ok?' ok b'+(i%3):'')+'"><span class="bi">'+esc(x.ic)+'</span><b>'+esc(x.t)+'</b><span>'+esc(x.s)+'</span></div>';}).join('')+'</div></section>';
}

/* ---------- Succès de tous les temps, à paliers ---------- */
var PALIERS=['Bronze','Argent','Or','Platine','Légende'];
function succes(){
  var vus=Object.values(S.films).filter(function(f){return f.w;}),min=0,dr={},g={},pa={};
  vus.forEach(function(f){if(f.m)min+=f.m;if(f.dr)String(f.dr).split(', ').forEach(function(n){dr[n]=1;});(f.g||[]).forEach(function(id){if(GENRES[id]&&id!==10770)g[id]=1;});(f.pa||[]).forEach(function(c){pa[c]=1;});});
  return [
    {id:'heures',t:'Heures devant l’écran',n:Math.floor(min/60),p:[100,250,500,1000,2500],u:' h',s:'chaque film compté une fois, sans les revus'},
    {id:'films',t:'Films vus',n:vus.length,p:[100,250,500,1000,2500]},
    {id:'reals',t:'Réalisateurs différents',n:Object.keys(dr).length,p:[50,100,250,500]},
    {id:'genres',t:'Genres explorés',n:Object.keys(g).length,p:[5,10,15,18],s:'sur les 18 genres du cinéma'},
    {id:'pays',t:'Pays',n:Object.keys(pa).length,p:[5,10,25,50],s:'pays de production des films'},
    {id:'critiques',t:'Critiques écrites',n:S.diary.filter(function(e){return e.rv;}).length,p:[10,50,100,250,500]},
    {id:'coeurs',t:'Coups de cœur',n:vus.filter(function(f){return f.l;}).length,p:[10,50,100,250]}
  ].map(function(x){x.niv=x.p.filter(function(v){return x.n>=v;}).length;return x;});
}
function blocSucces(){
  var T=trophees(),l=succes();
  return '<section class="card-box succes"><div class="cb-tete"><h3>Succès</h3><span class="sub">depuis ton premier film</span></div><div class="sc-liste">'+
    l.map(function(x){
      var niv=Math.max(x.niv,T['s:'+x.id]||0),fini=niv>=x.p.length,but=fini?x.p[x.p.length-1]:x.p[niv],bas=niv?x.p[niv-1]:0;
      var pct=fini?100:Math.max(0,Math.min(100,(x.n-bas)/(but-bas)*100));
      return '<div class="sc'+(niv?' n'+Math.min(niv,5):'')+'"><span class="sc-m" aria-hidden="true">'+(niv?niv:'')+'</span><div class="sc-c"><div class="dt"><b>'+esc(x.t)+'</b><span class="sc-niv">'+(niv?PALIERS[niv-1]:'Premier palier à '+fmtN(x.p[0])+(x.u||''))+'</span></div>'+
        '<div class="jauge" role="progressbar" aria-valuemin="'+bas+'" aria-valuemax="'+but+'" aria-valuenow="'+Math.min(x.n,but)+'" aria-label="'+esc(x.t)+'"><i style="width:'+pct.toFixed(1)+'%"></i></div>'+
        '<span class="sub">'+fmtN(x.n)+(x.u||'')+(fini?'':' sur '+fmtN(but)+(x.u||''))+(x.s?', '+x.s:'')+'</span></div></div>';
    }).join('')+'</div></section>';
}

/* ---------- Réalisateurs : part de la filmographie vue ----------
   Seulement les réalisateurs d'au moins 5 longs métrages (documentaires compris).
   Fan dès la moitié, Grand fan aux trois quarts, Filmographie complète à 100 %, et au moins 3 films vus. */
var NIV_REAL=['Curieux','Fan','Grand fan','Filmographie complète'];
var FILMO={};try{FILMO=JSON.parse(localStorage.getItem('bobine.filmos')||'{}')||{};}catch(e){FILMO={};}
var filmoEnCours=false;
function realsCandidats(){
  var n={};Object.values(S.films).forEach(function(f){if(f.w&&f.dri)n[f.dri]=(n[f.dri]||0)+1;});
  return Object.keys(n).filter(function(k){return n[k]>=3;}).sort(function(a,b){return n[b]-n[a];});
}
function chargerFilmos(){
  if(!TMDB_FN||filmoEnCours)return;
  var vieux=Date.now()-7*864e5,manque=realsCandidats().filter(function(pid){var F=FILMO[pid];return !F||F.at<vieux||F.films.length&&!('p' in F.films[0]);}).slice(0,24);
  if(!manque.length)return;
  filmoEnCours=true;var i=0;
  (function suivant(){
    var lot=manque.slice(i,i+4);i+=4;
    if(!lot.length){filmoEnCours=false;if(route()==='bilan')render();return;}
    timeout(fetch(TMDB_FN,{method:'POST',headers:{'Content-Type':'application/json',apikey:CFG.cle||''},body:JSON.stringify({reals:lot.map(Number)})}).then(function(r){return r.json();}),90000)
    .then(function(d){
      (d.filmos||[]).forEach(function(x){FILMO[x.id]={nom:x.nom,films:x.films||[],at:Date.now()};});
      try{localStorage.setItem('bobine.filmos',JSON.stringify(FILMO));}catch(e){}
      if(route()==='bilan')render();setTimeout(suivant,300);
    },function(){filmoEnCours=false;});
  })();
}
function reals(){
  var vus={};Object.values(S.films).forEach(function(f){if(f.w&&f.tm)vus[f.tm]=1;});
  return realsCandidats().filter(function(pid){return FILMO[pid]&&FILMO[pid].films.length>=5;}).map(function(pid){
    var F=FILMO[pid],tot=F.films.length,vu=F.films.filter(function(x){return vus[x.id];}).length,pct=vu/tot;
    var niv=vu<3?0:pct>=1?3:pct>=.75?2:pct>=.5?1:0;
    return {pid:pid,nom:F.nom||'?',tot:tot,vu:vu,pct:pct,niv:niv,docs:F.films.filter(function(x){return x.docu;}).length};
  });
}
function blocReals(){
  var T=trophees(),l=reals().map(function(r){r.garde=Math.max(r.niv,T['r:'+r.pid]||0);return r;});
  if(!l.length){
    if(!realsCandidats().length)return '';
    return '<section class="card-box reals"><h3>Mes réalisateurs</h3><p class="muted petit">'+(TMDB_FN?'Bobine compte les filmographies de tes réalisateurs…':'Il faut la connexion au site pour compter les filmographies.')+'</p></section>';
  }
  l.sort(function(a,b){return b.garde-a.garde||b.pct-a.pct||b.vu-a.vu;});
  var top=l.filter(function(r){return r.garde>0;}).slice(0,3),dansTop={};top.forEach(function(r){dansTop[r.pid]=1;});
  var reste=l.filter(function(r){return !dansTop[r.pid];});
  return '<section class="card-box reals"><div class="cb-tete"><h3>Mes réalisateurs</h3><span class="sub">'+plural(l.filter(function(r){return r.garde>0;}).length,'badge','badges')+'</span></div>'+
    '<p class="muted petit reals-aide">Touche un réalisateur pour voir ses films, ceux qui te manquent compris.</p>'+
    (top.length?top.map(ligneReal).join(''):'<p class="muted petit">Vois au moins la moitié des films d’un réalisateur pour décrocher ton premier badge.</p>')+
    (reste.length?'<details class="reals-tous"><summary>'+(top.length?'Mes autres réalisateurs':'Tous mes réalisateurs')+' ('+reste.length+')</summary>'+reste.map(ligneReal).join('')+'</details>':'')+
    '<p class="muted petit">Longs métrages et documentaires sortis, pour les réalisateurs d’au moins 5 films.</p></section>';
}
/* Une ligne de réalisateur qui se déplie : toute sa filmographie, les films vus et ceux qui manquent */
var realOuvert={};
function ligneReal(r){
  var nouveaux=r.garde>r.niv&&r.garde===3?r.tot-r.vu:0,label=r.garde?NIV_REAL[r.garde]:(r.pct>=.25?NIV_REAL[0]:'');
  var tete='<summary><span class="dt"><b>'+esc(r.nom)+'</b>'+(label?'<span class="real-niv">'+esc(label)+'</span>':'')+'</span>'+
    '<span class="jauge" role="progressbar" aria-valuemin="0" aria-valuemax="'+r.tot+'" aria-valuenow="'+r.vu+'" aria-label="Filmographie de '+esc(r.nom)+'"><i style="width:'+(Math.min(1,r.pct)*100).toFixed(1)+'%"></i></span>'+
    '<span class="sub">'+r.vu+' sur '+r.tot+(r.docs?', documentaires compris':'')+(nouveaux?', '+plural(nouveaux,'nouveau film','nouveaux films')+' depuis':'')+'</span></summary>';
  return '<details class="real'+(r.garde?' n'+r.garde:'')+'" data-pid="'+r.pid+'"'+(realOuvert[r.pid]?' open':'')+'>'+tete+(realOuvert[r.pid]?filmoReal(r.pid):'<div class="filmo-v"></div>')+'</details>';
}
function filmoReal(pid){
  var F=FILMO[pid];if(!F)return '';
  var parTm={};Object.values(S.films).forEach(function(f){if(f.tm)parTm[f.tm]=f;});
  var manque=F.films.filter(function(x){var f=parTm[x.id];return !(f&&f.w);});
  var adm=!LECTURE&&FZ.notifs.admin;
  return '<div class="filmo-v">'+(manque.length&&!LECTURE?'<div class="filmo-act"><span>'+plural(manque.length,'film te manque','films te manquent')+'</span>'+
      (manque.some(function(x){var f=parTm[x.id];return !(f&&f.wl);})?'<button class="ghost small" type="button" data-action="rwlall" data-pid="'+pid+'">Tout mettre dans À voir</button>':'')+'</div>':'')+
    '<ol class="filmo">'+F.films.map(function(x){
      var f=parTm[x.id],vu=f&&f.w,wl=f&&f.wl,pf=f||{k:'tm'+x.id,t:x.t,y:x.y,p:x.p,tm:x.id};
      if(!pf.p&&x.p)pf={k:pf.k,t:pf.t,y:pf.y,p:x.p,tm:x.id};
      return '<li class="'+(vu?'vu':'manque')+'">'+poster(pf)+(vu?'<span class="fl-ok" aria-label="Vu">✓</span>':'')+
        '<span class="fl-t">'+esc(x.t)+'</span><span class="fl-y">'+esc(x.y||'')+(x.docu?', docu':'')+'</span>'+
        (vu||LECTURE?'':wl?'<span class="tag">dans À voir</span>':'<button class="ghost small" type="button" data-action="rwl" data-pid="'+pid+'" data-tm="'+x.id+'">+ À voir</button>')+
        (adm?'<button class="lien fl-ex" type="button" data-action="rexcl" data-pid="'+pid+'" data-tm="'+x.id+'">Ne compte pas</button>':'')+'</li>';
    }).join('')+'</ol></div>';
}
document.addEventListener('toggle',function(ev){
  var d=ev.target;if(!d.classList||!d.classList.contains('real'))return;
  var pid=d.dataset.pid;realOuvert[pid]=d.open;
  if(d.open){var v=d.querySelector('.filmo-v');if(v)v.outerHTML=filmoReal(pid);}
},true);
function actionReal(act,a){
  var pid=a.dataset.pid,F=FILMO[pid];if(!F)return;
  var parTm={};Object.values(S.films).forEach(function(f){if(f.tm)parTm[f.tm]=f;});
  var ajouter=function(x){var f=parTm[x.id]||filmDepuis({tm:x.id,t:x.t,y:x.y,p:x.p});if(f&&!f.w&&!f.wl){f.wl=today();return 1;}return 0;};
  if(act==='rwl'){var x=F.films.find(function(y){return String(y.id)===a.dataset.tm;});if(x&&ajouter(x)){commit();toast('« '+x.t+' » ajouté à À voir');}}
  if(act==='rwlall'){var n=F.films.reduce(function(s,y){return s+ajouter(y);},0);if(n){commit();toast(plural(n,'film ajouté','films ajoutés')+' à À voir');}}
  if(act==='rexcl'){
    if(!a.dataset.arme){a.dataset.arme='1';a.textContent='Confirmer, il ne compte pas';return;}
    var tm=+a.dataset.tm,t=(F.films.find(function(y){return y.id===tm;})||{}).t||'ce film';
    appel('bobine_admin_exclure_film',{p_person:+pid,p_tm:tm}).then(function(){
      F.films=F.films.filter(function(y){return y.id!==tm;});try{localStorage.setItem('bobine.filmos',JSON.stringify(FILMO));}catch(e){}
      toast('« '+t+' » ne compte plus');render();
    },function(e){toast(erreurRpc(e));});
  }
}

/* ---------- Trophées gardés : un succès obtenu reste obtenu ---------- */
var reglagesOk=false;
function trophees(){
  if(LECTURE)return {};
  if(Store.mode==='db')return reglages.trophees||{};
  try{return JSON.parse(localStorage.getItem('bobine.trophees')||'{}')||{};}catch(e){return {};}
}
function garderTrophees(){
  if(LECTURE||Store.mode==='db'&&!reglagesOk)return;
  var T=trophees(),nv={};
  succes().forEach(function(x){if(x.niv>(T['s:'+x.id]||0))nv['s:'+x.id]=x.niv;});
  reals().forEach(function(r){if(r.niv>(T['r:'+r.pid]||0))nv['r:'+r.pid]=r.niv;});
  badges().forEach(function(b){if(b.ok&&!T['b:'+b.id])nv['b:'+b.id]=1;});
  if(!Object.keys(nv).length)return;
  var tout=Object.assign({},T,nv);
  if(Store.mode==='db'){reglages.trophees=tout;appel('bobine_garder_trophees',{p:nv}).catch(function(){});}
  else{try{localStorage.setItem('bobine.trophees',JSON.stringify(tout));}catch(e){}}
}

/* ---------- Carte illimitée : visible par toi seul ----------
   Prix de la carte et prix d'une place gardés dans tes réglages (ou sur cet appareil sans compte).
   La case « Vu avec ma carte » n'apparaît jamais sur ton carnet public. */
var carteEdit=false;
function carteCfg(){
  if(Store.mode==='db')return reglages.carte_prix?{prix:+reglages.carte_prix,place:+reglages.place_prix||0}:null;
  try{var c=JSON.parse(localStorage.getItem('bobine.carte')||'null');return c&&c.prix?c:null;}catch(e){return null;}
}
function euros(v){return (Math.round(v*100)/100).toFixed(2).replace('.',',').replace(',00','')+' €';}
function blocCarte(){
  if(LECTURE)return '';
  var c=carteCfg(),cad='<span class="prive"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>Toi seul la vois</span>';
  if(carteEdit){
    return '<section class="card-box carte"><div class="cb-tete"><h3>Ma carte illimitée</h3>'+cad+'</div>'+
      '<form id="carteform" class="carte-form" autocomplete="off"><label class="fld"><span>Prix de la carte par mois</span><input name="prix" inputmode="decimal" value="'+(c?String(c.prix).replace('.',','):'')+'" aria-label="Prix de la carte par mois, en euros"></label>'+
      '<label class="fld"><span>Prix moyen d’une place</span><input name="place" inputmode="decimal" value="'+(c&&c.place?String(c.place).replace('.',','):'')+'" aria-label="Prix moyen d’une place, en euros"></label>'+
      '<div class="df">'+(c?'<button class="ghost danger small" type="button" data-action="cartesuppr">Je n’ai plus de carte</button>':'')+'<span class="sp"></span><button class="ghost" type="button" data-action="cartenon">Annuler</button><button class="primary" type="submit">Enregistrer</button></div></form></section>';
  }
  if(!c)return '<section class="card-box carte"><div class="cb-tete"><h3>Carte illimitée</h3>'+cad+'</div><p>Tu as une carte UGC, Pathé ou autre ? Bobine te dit si elle est rentabilisée chaque mois.</p><button class="ghost" type="button" data-action="carteedit">Régler ma carte</button></section>';
  var now=new Date(),ym=now.getFullYear()+'-'+pad(now.getMonth()+1);
  var mois=S.diary.filter(function(e){return e.ca&&(e.d||'').slice(0,7)===ym;}).length;
  var tout=S.diary.filter(function(e){return e.ca;}).length;
  var gain=c.place?mois*c.place-c.prix:null,seuil=c.place?Math.ceil(c.prix/c.place):null;
  var tuile=function(v,l,cls){return '<div class="ct-t"><b'+(cls?' class="'+cls+'"':'')+'>'+v+'</b><span>'+l+'</span></div>';};
  return '<section class="card-box carte"><div class="cb-tete"><h3>Ma carte illimitée</h3>'+cad+'</div><div class="ct-tuiles">'+
    tuile(fmtN(mois),plural(mois,'film','films').replace(/^\S+\s/,'')+' en '+MOIS[now.getMonth()])+
    tuile(mois?euros(c.prix/mois):'–','la séance')+
    (gain===null?'':gain>=0?tuile('+'+euros(gain),'gagnés ce mois','gain'):tuile(fmtN(Math.max(1,seuil-mois)),(seuil-mois>1?'films':'film')+' de plus pour la rentabiliser'))+
    '</div><p class="muted petit">Carte à '+euros(c.prix)+' par mois'+(c.place?', place à '+euros(c.place)+' en moyenne':'')+'. '+plural(tout,'film vu','films vus')+' avec ta carte depuis le début. Coche « Vu avec ma carte » quand tu notes un film.</p>'+
    '<button class="lien" type="button" data-action="carteedit">Modifier</button></section>';
}
function enregistrerCarte(prix,place){
  var fin=function(){carteEdit=false;render();majCaseCarte();toast(prix?'Carte enregistrée':'Carte retirée');};
  if(Store.mode==='db'){
    appel('bobine_regler_carte',{p_prix:prix,p_place:place}).then(function(){reglages.carte_prix=prix;reglages.place_prix=place;fin();},function(e){toast(erreurRpc(e));});
  }else{
    try{if(prix)localStorage.setItem('bobine.carte',JSON.stringify({prix:prix,place:place}));else localStorage.removeItem('bobine.carte');}catch(e){}
    fin();
  }
}
function lireEuros(v){v=String(v||'').replace(/\s|€/g,'').replace(',','.');if(!v)return null;var n=parseFloat(v);return isFinite(n)&&n>0?Math.round(n*100)/100:NaN;}
document.addEventListener('submit',function(ev){
  if(ev.target.id!=='carteform')return;ev.preventDefault();
  var f=ev.target,prix=lireEuros(f.prix.value),place=lireEuros(f.place.value);
  if(!prix||isNaN(prix)||prix>500){toast('Écris le prix de ta carte, par exemple 21,90');f.prix.focus();return;}
  if(place!==null&&(isNaN(place)||place>100)){toast('Écris le prix d’une place, par exemple 11');f.place.focus();return;}
  enregistrerCarte(prix,place);
},true);
function majCaseCarte(){var b=$('#lf-ca-box');if(b)b.hidden=!carteCfg();}
function chargerReglages(){
  if(!sb||Store.mode!=='db')return;
  sb.rpc('bobine_reglages').then(function(r){if(!r.error&&r.data){reglages=r.data;reglagesOk=true;majCaseCarte();infoCarnets();if(route()==='bilan')render();}});
}

/* ---------- 1.8 : prévenir une fois que les carnets sont visibles entre membres ---------- */
function infoCarnets(){
  if(LECTURE||Store.mode!=='db'||reglages.prive)return;
  try{if(localStorage.getItem('bobine.info18'))return;localStorage.setItem('bobine.info18','1');}catch(e){return;}
  $('#info-body').innerHTML='<p>Bobine devient un vrai coin de cinéphiles. Ton carnet est maintenant visible par les autres membres, depuis ton pseudo dans le forum et sous tes critiques, dans la fiche des films et dans la roulette.</p>'+
    '<p>Tu préfères rester dans ton coin ? Passe ton carnet en privé, il disparaît de partout. Tu peux changer d’avis quand tu veux dans ton compte.</p>'+
    '<div class="df"><button class="ghost" type="button" data-action="infoprive">Passer en privé</button><span class="sp"></span><button class="primary" type="button" data-action="close">Compris</button></div>';
  setTimeout(function(){if(!$$('dialog[open]').length)showDialog($('#info'));},900);
}

/* ---------- Ton année en story ---------- */
function stAnnee(ys){
  var fa=filmsDeLAnnee(ys),st=screenTime(ys),dec={},dr={},best={};
  S.diary.forEach(function(e){if((e.d||'').slice(0,4)!==ys)return;var f=film(e.k);if(!f)return;var sc=(e.r||f.r||0)+(e.l||f.l?1:0);if(!(f.k in best)||sc>best[f.k])best[f.k]=sc;});
  fa.forEach(function(f){var d=decennie(f);if(d)dec[d]=(dec[d]||0)+1;if(f.dr)dr[f.dr]=(dr[f.dr]||0)+1;});
  var top=Object.keys(best).sort(function(a,b){return best[b]-best[a];}).slice(0,3).map(film);
  var kd=Object.keys(dec).sort(function(a,b){return dec[b]-dec[a];})[0],kr=Object.keys(dr).sort(function(a,b){return dr[b]-dr[a];})[0];
  return {films:fa.length,min:st.year,top:top,dec:kd?'Les années '+kd:null,dr:kr&&dr[kr]>1?kr:null};
}
function buildAnnee(ys){
  var A=stAnnee(ys),W=1080,H=1920,cv=document.createElement('canvas');cv.width=W;cv.height=H;var x=cv.getContext('2d');
  var M=90,ink='#f6f2ea',gold='#f2b632',red='#ff4a5f',grey='#b9b4aa',mono='"IBM Plex Mono", ui-monospace, monospace',disp='"Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
  x.fillStyle='#111216';x.fillRect(0,0,W,H);
  var glow=x.createRadialGradient(W/2,700,40,W/2,700,820);glow.addColorStop(0,'rgba(242,182,50,.10)');glow.addColorStop(1,'rgba(242,182,50,0)');x.fillStyle=glow;x.fillRect(0,0,W,H);
  drawBulbs(x,W,22);drawBulbs(x,W,H-22);
  x.textBaseline='alphabetic';x.textAlign='left';
  /* en-tête, sous la zone du profil Insta */
  enteteStory(x,M,ink,disp);
  x.textAlign='right';x.fillStyle=gold;x.font='600 26px '+mono;x.fillText(('Ton année '+ys).toUpperCase(),W-M,300);
  var ps=Store.profil&&Store.profil.pseudo;if(ps){x.fillStyle=grey;x.font='500 24px '+mono;x.fillText('carnet de '+ps,W-M,336);}
  x.textAlign='left';
  var h=Math.floor(A.min/60);
  x.fillStyle=ink;x.font='900 300px '+disp;x.fillText(h?fmtN(h)+' H':Math.round(A.min)+' MIN',M-8,650);
  var sl=('devant l’écran, pour '+plural(A.films,'film','films')).toUpperCase(),fs=58;
  do{x.font='700 '+fs+'px '+disp;fs-=2;}while(x.measureText(sl).width>W-2*M&&fs>30);
  x.fillText(sl,M,732);
  x.fillStyle=grey;x.font='600 26px '+mono;x.fillText('TON PODIUM',M,820);
  var pw=(W-2*M-2*36)/3,ph=pw*1.5;
  for(var i=0;i<3;i++){var f=A.top[i];if(f)drawPoster(x,f,M+i*(pw+36),850,pw,ph);else{x.strokeStyle='#3a3b42';x.lineWidth=3;rr(x,M+i*(pw+36),850,pw,ph,18);x.stroke();}}
  var y=850+ph+56,bw=(W-2*M-36)/2;
  [['TA DÉCENNIE',A.dec],['TA RÉAL',A.dr]].filter(function(b){return b[1];}).forEach(function(b,i){
    var X=M+i*(bw+36);
    x.strokeStyle='#3a3b42';x.lineWidth=3;rr(x,X,y,bw,150,22);x.stroke();
    x.fillStyle=grey;x.font='600 24px '+mono;x.fillText(b[0],X+30,y+52);
    x.fillStyle=red;var fz=52;do{x.font='800 '+fz+'px '+disp;fz-=4;}while(x.measureText(b[1].toUpperCase()).width>bw-60&&fz>28);
    x.fillText(b[1].toUpperCase(),X+30,y+118);
  });
  /* invitation au sticker lien, puis bande libre pour le sticker */
  x.fillStyle=gold;x.font='600 26px '+mono;x.textAlign='center';x.fillText(SITE_URL?SITE_URL.toUpperCase():'SUR BOBINE ↓',W/2,y+150+76);
  x.textAlign='center';x.font='500 22px '+mono;x.fillStyle='rgba(185,180,170,.55)';x.fillText('LE CARNET CINÉ QUI NE SERA JAMAIS À VENDRE',W/2,H-70);
  x.textAlign='left';
  return cv;
}
function openShareAnnee(ys){
  shareCtx.id=null;shareCtx.annee=ys;$('#sh-title').textContent='Ton année en story';
  $('#sh-msg').textContent='Sur téléphone, l’image s’ouvre dans le menu de partage. Choisis Instagram, puis Story.';
  showDialog($('#share'));
  var fonts=['900 86px "Big Shoulders Display"','800 60px "Big Shoulders Display"','600 28px "IBM Plex Mono"'];
  var ready=(document.fonts&&document.fonts.load)?Promise.all(fonts.map(function(s){return document.fonts.load(s).catch(function(){});})):Promise.resolve();
  ready=Promise.all([ready,chargerLogo()].concat(stAnnee(ys).top.map(chargerAffiche)));
  timeout(ready,3500).catch(function(){}).then(renderShare);
}

/* ---------- Déménager : un panneau ouvert depuis le petit bouton en haut à droite ---------- */
function contenuDem(){
  return '<section class="card-box"><h3>Arriver depuis Letterboxd</h3>'+
   '<ol class="steps"><li>Sur le site letterboxd.com (pas l’appli), va dans <b>Settings → Data → Export your data</b>.</li><li>Tu récupères un fichier <b>.zip</b>.</li><li>Dépose-le ici tel quel. Journal, notes, critiques, coups de cœur, watchlist et listes arrivent d’un coup. Le fichier est lu dans ton navigateur, seul ton carnet est enregistré.</li></ol>'+
   '<label class="drop" id="drop"><input type="file" id="imp" accept=".zip,.csv,.json,application/zip,text/csv,application/json" multiple><span class="dt">Choisir le .zip</span><span class="ds">ou des fichiers .csv, ou un carnet Bobine .json, ou glisse-les ici</span></label>'+
   '<div id="impres" aria-live="polite">'+importReport+'</div></section>'+
   '<section class="card-box"><h3>Repartir quand tu veux</h3><p>Ton carnet entier, à tout moment. Le CSV se réimporte dans Letterboxd et dans la plupart des autres sites.</p>'+
   '<div class="btnrow"><button class="primary" type="button" data-action="expcsv">Exporter en CSV</button><button class="ghost" type="button" data-action="expjson">Exporter en JSON</button></div><p class="muted" id="expmsg" style="margin:10px 0 0;font-size:14px"></p></section>'+
   '<section class="card-box"><h3>Tout effacer</h3><p>Vide ton carnet sur Bobine. Pense à exporter avant.</p>'+
   (confirmWipe?'<div class="confirm">Effacer définitivement tout le carnet ? <button class="primary small" type="button" data-action="wipe">Oui, tout effacer</button><button class="ghost small" type="button" data-action="nowipe">Non</button></div>':'<button class="ghost danger" type="button" data-action="askwipe">Effacer le carnet</button>')+'</section>';
}
function renderDem(){var b=$('#dem-body');if(!b)return;b.innerHTML=contenuDem();wireDrop();}
function ouvrirDem(){if(LECTURE)return;confirmWipe=false;$$('dialog[open]').forEach(function(d){if(d.id!=='dem')closeDialog(d);});renderDem();showDialog($('#dem'));}

/* ---------- Rendu ---------- */
var journalLimit=60,gridLimit=120,fq='',fsort='recent',ffilter='all',openListId=null,confirmWipe=false,listConfirm=false,importReport='';

function route(){var h=location.hash.slice(1).split('/')[0];if(h==='confidentialite')return h;if(LECTURE&&(h==='forum'||h==='contact'||h==='admin'))return 'journal';if(h==='forum'||h==='contact'||(h==='admin'&&FZ.notifs.admin))return h;return ROUTES.some(function(r){return r[0]===h;})?h:'journal';}
function renderTabs(){
  var r=route();
  $('#tabs').innerHTML=ROUTES.map(function(x){return '<li><a href="#'+x[0]+'"'+(x[0]===r?' aria-current="page"':'')+'>'+x[1]+'</a></li>';}).join('');
  var n=FZ.notifs.contact+(FZ.notifs.admin?FZ.notifs.a_traiter:0),b=$('#bt-forum-n');
  if(b)b.innerHTML=pastille(n);
  var bf=$('#bt-forum');if(bf)bf.classList.toggle('on',r==='forum'||r==='contact'||r==='admin');
}
function renderAffiche(){
  var films=Object.values(S.films).filter(function(f){return f.w;}).length;
  var rv=S.diary.filter(function(e){return e.rv;}).length;
  var t=screenTime();
  $('#affiche').textContent=plural(films,'film','films')+" à l'affiche, "+fmtDur(t.total)+' devant l’écran, '+plural(rv,'critique','critiques');
}
/* Temps devant l'écran : chaque séance compte (revoyures comprises) ; un film vu sans séance datée compte une fois. */
function screenTime(year){
  var total=0,yearT=0,known=0,unknown=0,withEntry={};
  S.diary.forEach(function(e){var f=film(e.k);withEntry[e.k]=1;if(f&&f.m){total+=f.m;known++;if(year&&(e.d||'').slice(0,4)===year)yearT+=f.m;}else unknown++;});
  Object.values(S.films).forEach(function(f){if(f.w&&!withEntry[f.k]){if(f.m){total+=f.m;known++;}else unknown++;}});
  return {total:total,year:yearT,known:known,unknown:unknown};
}
function fmtDur(min){min=Math.round(min||0);var h=Math.floor(min/60),m=min%60;return h?fmtN(h)+' h '+pad(m):m+' min';}
function fmtDurShort(min){if(!min)return '';var h=Math.floor(min/60),m=min%60;return h?h+'h'+(m?pad(m):''):m+' min';}
function parseDur(s){
  s=String(s||'').trim().toLowerCase().replace(/\s+/g,'');if(!s)return 0;var m;
  if((m=s.match(/^(\d{1,2})h(\d{1,2})?(min|mn|m)?$/)))return +m[1]*60+(+m[2]||0);
  if((m=s.match(/^(\d{1,2})[:.](\d{2})$/)))return +m[1]*60+(+m[2]);
  if((m=s.match(/^(\d{1,4})(min|mn|m)?$/)))return +m[1];
  return -1;
}
function render(){
  if(/^#demenager/.test(location.hash)){try{history.replaceState(null,'','#journal');}catch(e){}if(!LECTURE)setTimeout(ouvrirDem,0);}
  renderTabs();renderAffiche();
  var r=route(),v=$('#view');document.body.dataset.vue=r;
  if(LECTURE&&r!=='manifeste'&&r!=='confidentialite'){
    var tete='<div class="lecture-tete">'+(LECTEUR.avatar?'<img src="'+esc(LECTEUR.avatar)+'" alt="" width="36" height="36">':'')+'<div><span class="sub">Carnet de</span><b>'+esc(LECTEUR.pseudo||'')+'</b></div><a class="ghost small" href="bobine.html">Ouvrir mon carnet</a></div>';
    if(!LECTEUR.charge){v.innerHTML=tete+'<p class="muted">Chargement du carnet…</p>';return;}
    if(!LECTEUR.trouve){v.innerHTML=tete+'<div class="card-box"><h3>Carnet introuvable</h3><p>Ce carnet est privé, ou ce lien ne mène à aucun carnet.</p></div>';return;}
    v.innerHTML=tete+VIEWS[r]();
    if(r==='films')fillGrid();
    return;
  }
  var ae=document.activeElement,rqf=ae&&ae.dataset&&ae.dataset.rq||null,rqv={};
  $$('[data-rq]').forEach(function(i){rqv[i.dataset.rq]=i.value;});
  v.innerHTML=VIEWS[r]();
  Object.keys(rqv).forEach(function(id){var i=$('#'+id+'-q');if(i)i.value=rqv[id];});
  if(rqf){var ri=$('#'+rqf+'-q');if(ri){ri.focus();try{ri.setSelectionRange(ri.value.length,ri.value.length);}catch(e){}var st=rqEtat(rqf);if(st.items.length)rqAfficher(rqf,st.items,false);}}
  if(dernierAjout)setTimeout(function(){dernierAjout=null;},1600);
  if(r==='films')fillGrid();
  var dm=$('#dem');if(dm&&dm.open)renderDem();
  updateDatalist();
  apresRendu(r);
}
function poster(f,cls){
  var c=PAL[hash(f.k||f.t||'')%PAL.length],L=(f.t||'').length;
  var sz=L<=6?'s':L<=14?'m':L<=28?'l':'xl';
  var img=f.p?'<img src="'+IMG+(cls==='mini'?'w92':'w342')+esc(f.p)+'" alt="" loading="lazy" decoding="async" onerror="this.remove()">':'';
  return '<div class="poster '+(cls||'')+' sz-'+sz+(f.p?' has-img':'')+'" style="--pc:'+c+'" aria-hidden="true"><span class="pt">'+esc(f.t)+'</span><span class="py">'+esc(f.y)+'</span>'+img+'</div>';
}
function critique(e,cls){
  if(!e.sp)return '<p class="'+cls+'">'+esc(e.rv)+'</p>';
  return '<p class="'+cls+' spoiler" data-action="spoil" tabindex="0" role="button" aria-label="Critique avec spoilers, toucher pour lire"><span class="sp-txt">'+esc(e.rv)+'</span><span class="sp-lbl">Spoilers, touche pour lire</span></p>';
}
var dernierAjout=null;
function ticket(e,f,example){
  var p=(e.d||'').split('-');
  var nouveau=!example&&e.id===dernierAjout;
  var attrs=example?'':' data-action="edit" data-id="'+esc(e.id)+'" tabindex="0" role="button" aria-label="Modifier la séance de '+esc(f.t)+'"';
  return '<article class="ticket'+(example?' example':'')+(nouveau?' nouveau':'')+'"'+attrs+'>'+
    (/^\d{4}$/.test(e.d||'')?'<div class="stub annee"><span class="mon">en</span><span class="day">'+esc(e.d)+'</span></div>':
     e.d?'<div class="stub"><span class="day">'+(p[2]?+p[2]:'?')+'</span><span class="mon">'+(p[1]?MOIS_C[+p[1]-1]:'')+'</span><span class="yr">'+(p[0]||'')+'</span></div>':'<div class="stub nodate"><span class="mon">vu</span></div>')+
    '<div class="tbody"><h4>'+esc(f.t)+' <span class="fy">'+esc(f.y)+'</span></h4>'+
    '<div class="meta">'+(e.r?'<span class="stars" aria-label="'+ratingWords(e.r)+'">'+stars(e.r)+'</span>':'')+(e.l?'<span class="heart" aria-label="Coup de cœur">♥</span>':'')+(e.rw?'<span class="tag">revu</span>':'')+((f.m||e.m)?'<span class="dur-tag">'+fmtDurShort(f.m||e.m)+'</span>':'')+(example?'<span class="tag ex">exemple</span>':'')+'</div>'+
    (e.rv?critique(e,'rv'):'')+'</div>'+poster(f,'mini')+'</article>';
}

var VIEWS={
journal:function(){
  if(!S.diary.length){
    var ex1={k:'ex1',t:'Les Glaneurs et la Glaneuse',y:'2000'},ex2={k:'ex2',t:'Paris, Texas',y:'1984'};
    var anyFilms=Object.keys(S.films).length;
    return '<section class="hello"><h2>Ton carnet est vide.</h2>'+
      '<p>'+(anyFilms?'Tes films sont là, mais ton journal est encore vide. Note le prochain film que tu regardes.':'Ramène tout ton historique Letterboxd en une fois, ou commence par le dernier film que tu as vu. Tout reste à toi et sort en un clic.')+'</p>'+
      '<div class="actions"><button class="primary" type="button" data-action="log">Noter un film</button><button class="ghost" type="button" data-action="dem">Déménager depuis Letterboxd</button></div>'+
      (sb&&Store.mode!=='db'?'<p class="invite">Connecte-toi avec Twitch pour retrouver ton carnet sur tous tes appareils. Sans compte, il reste sur cet appareil.</p>':'')+
      '<h3 class="month">Aperçu</h3>'+
      ticket({d:'2026-11-14',r:4.5,l:true,rv:'Varda ramasse ce que le monde jette et en fait un film sur nous tous.'},ex1,true)+
      ticket({d:'2026-11-02',r:4,rw:true,rv:'Le plan du peep-show, vu en salle cette fois. Rien à ajouter.'},ex2,true)+
      '</section>';
  }
  var list=S.diary.slice().sort(function(a,b){return (b.d||'').localeCompare(a.d||'')||(b.ts||0)-(a.ts||0);});
  var h='<div class="viewhead"><h2>Journal</h2></div>',cur=null;
  list.slice(0,journalLimit).forEach(function(e){
    var f=film(e.k)||{k:e.k,t:'Film inconnu',y:''},ym=(e.d||'').slice(0,7);
    if(ym!==cur){cur=ym;h+='<h3 class="month">'+monthLabel(ym)+'</h3>';}
    h+=ticket(e,f);
  });
  if(list.length>journalLimit)h+='<button class="more" type="button" data-action="more">Afficher plus ('+fmtN(list.length-journalLimit)+' restantes)</button>';
  return h;
},
films:function(){
  var n=Object.values(S.films).filter(function(f){return f.w;}).length;
  if(!n)return '<div class="viewhead"><h2>Films</h2></div><div class="card-box"><h3>Aucun film vu pour l’instant</h3><p>Chaque film que tu notes ou que tu importes apparaît ici, avec son affiche.</p><div class="btnrow"><button class="primary" type="button" data-action="log">Noter un film</button><button class="ghost" type="button" data-action="dem">Importer</button></div></div>';
  var chip=function(id,l){return '<button type="button" data-action="ffilter" data-v="'+id+'" aria-pressed="'+(ffilter===id)+'">'+l+'</button>';};
  return '<div class="viewhead"><h2>Films</h2><p class="sub" id="fcount"></p></div>'+
   '<div class="controls"><input type="search" id="fq" placeholder="Chercher un titre ou une année" value="'+esc(fq)+'" aria-label="Chercher un film">'+
   '<select id="fsort" aria-label="Trier"><option value="recent"'+(fsort==='recent'?' selected':'')+'>Vus récemment</option><option value="note"'+(fsort==='note'?' selected':'')+'>Ta note</option><option value="titre"'+(fsort==='titre'?' selected':'')+'>Titre</option><option value="annee"'+(fsort==='annee'?' selected':'')+'>Année de sortie</option></select></div>'+
   '<div class="chips">'+chip('all','Tous')+chip('liked','♥ Coups de cœur')+chip('unrated','Sans note')+chip('rated5','★★★★★')+'</div>'+
   '<div class="grid" id="fgrid"></div><div id="fmore"></div>';
},
'a-voir':function(){
  var arr=Object.values(S.films).filter(function(f){return f.wl&&!f.w;}).sort(function(a,b){return (b.wl||'').localeCompare(a.wl||'');});
  var h='<div class="viewhead"><h2>À voir</h2><p class="sub">'+plural(arr.length,'film','films')+'</p></div>';
  if(!LECTURE)h+=champRq('wl','Chercher un film à ajouter')+roulette()+topBobine();
  if(!arr.length)return h+'<p class="muted">'+(LECTURE?'Rien en attente pour l’instant.':'Rien en attente. Cherche un film ci-dessus, ou importe ta watchlist Letterboxd.')+'</p>';
  return h+'<div class="grid wl-grid">'+arr.slice(0,240).map(function(f){
    return '<div class="card"><button class="card-p" type="button" data-action="sheet" data-k="'+esc(f.k)+'" aria-label="'+esc(f.t+(f.y?' ('+f.y+')':''))+'">'+poster(f)+'</button><span class="ct" title="'+esc(f.t)+'">'+esc(f.t)+'</span><span class="cy">'+esc([f.y,f.dr].filter(Boolean).join(', '))+'</span>'+
      (LECTURE?'':'<div class="card-actions"><button class="primary small" type="button" data-action="seen" data-k="'+esc(f.k)+'">Vu</button><button class="ghost small ico" type="button" data-action="unwl" data-k="'+esc(f.k)+'" aria-label="Retirer '+esc(f.t)+' de la liste">×</button></div>')+'</div>';
  }).join('')+'</div>'+(arr.length>240?'<p class="muted">Et '+fmtN(arr.length-240)+' autres.</p>':'');
},
listes:function(){
  var L=openListId&&S.lists.find(function(l){return l.id===openListId;});
  if(L){
    var nvu=L.items.filter(function(k){var f=film(k);return f&&f.w;}).length;
    var rows=L.items.map(function(k,i){var f=film(k)||{k:k,t:'?',y:''};
      var etat=f.w?'<span class="lv ok">✓ Vu'+(f.r?' <span class="stars">'+stars(f.r)+'</span>':'')+'</span>':
        '<span class="lv">Pas encore vu'+(LECTURE?'':f.wl?' <span class="tag">dans À voir</span>':' <button class="ghost small" type="button" data-action="lwl" data-k="'+esc(f.k)+'">+ À voir</button>')+'</span>';
      return '<div class="lrow"><span class="n">'+(i+1)+'</span>'+poster(f,'mini')+'<span class="lt"><span class="ltt">'+esc(f.t)+' <span class="fy">'+esc(f.y)+'</span></span>'+(f.dr?'<span class="ldr">'+esc(f.dr)+'</span>':'')+etat+'</span>'+
        (LECTURE?'':'<span class="acts">'+(i>0?'<button class="icon" type="button" data-action="lup" data-i="'+i+'" aria-label="Monter">↑</button>':'')+'<button class="icon" type="button" data-action="ldel" data-i="'+i+'" aria-label="Retirer de la liste">×</button></span>')+'</div>';}).join('');
    return '<button class="back" type="button" data-action="lback">← Toutes les listes</button>'+
     '<div class="viewhead"><h2>'+esc(L.n)+'</h2><p class="sub">'+plural(L.items.length,'film','films')+(L.items.length?', '+plural(nvu,'vu','vus'):'')+'</p></div>'+
     (L.ds?'<p class="muted" style="margin-top:-6px">'+esc(L.ds)+'</p>':'')+
     (LECTURE?'':champRq('li','Chercher un film à ajouter'))+
     '<div class="lrows">'+(rows||'<p class="muted">Liste vide pour l’instant.</p>')+'</div>'+
     (LECTURE?'':'<div style="margin-top:22px">'+(listConfirm?'<div class="confirm">Supprimer la liste « '+esc(L.n)+' » ? <button class="primary small" type="button" data-action="lkill">Oui, supprimer</button><button class="ghost small" type="button" data-action="lnokill">Non</button></div>':'<button class="ghost danger small" type="button" data-action="laskkill">Supprimer la liste</button>')+'</div>');
  }
  var h='<div class="viewhead"><h2>Listes</h2><p class="sub">'+plural(S.lists.length,'liste','listes')+'</p></div>'+
   (LECTURE?'':'<form class="inline-form" id="lform" autocomplete="off"><input name="n" placeholder="Nom de la liste" aria-label="Nom de la liste"><button class="primary" type="submit">Créer</button></form>');
  if(!S.lists.length)return h+'<p class="muted">Pas encore de liste. Tes listes Letterboxd arrivent aussi avec l’import.</p>';
  return h+'<div class="lists">'+S.lists.map(function(l){
    var st=l.items.slice(0,4).map(function(k){var f=film(k);return f?poster(f):'';}).join('')||'<span class="empty"></span>';
    return '<button class="lcard" type="button" data-action="lopen" data-id="'+esc(l.id)+'"><div class="stack">'+st+'</div><div><h3>'+esc(l.n)+'</h3><p class="sub" style="margin-top:4px">'+plural(l.items.length,'film','films')+'</p></div></button>';
  }).join('')+'</div>';
},
bilan:function(){
  var films=Object.values(S.films).filter(function(f){return f.w;});
  if(!films.length)return '<div class="viewhead"><h2>Bilan</h2></div><p class="muted">Le bilan se remplit dès que tu as noté quelques films.</p>'+blocCarte();
  var Y=new Date().getFullYear(),ys=String(Y);
  var ty=S.diary.filter(function(e){return (e.d||'').slice(0,4)===ys;});
  var rated=films.filter(function(f){return f.r;});
  var avg=rated.length?rated.reduce(function(s,f){return s+f.r;},0)/rated.length:0;
  var likes=films.filter(function(f){return f.l;}).length;
  var rv=S.diary.filter(function(e){return e.rv;}).length;
  var tile=function(v,l){return '<div class="tile"><b>'+v+'</b><span>'+l+'</span></div>';};
  var st=screenTime(ys),days=st.total/1440;
  var h='<div class="viewhead"><h2>Bilan</h2><p class="sub">tout ton carnet</p></div>'+
    (ty.length&&!LECTURE?'<button class="annee" type="button" data-action="storyan" data-y="'+ys+'"><span><b>Ton année '+ys+'</b><span>Ton bilan en story, prêt à partager</span></span><span class="primary small">Voir</span></button>':'')+
    '<section class="clock" aria-label="Compteur d’heures"><span class="lbl">Temps passé devant l’écran</span><span class="big">'+fmtDur(st.total)+'</span>'+
    '<span class="lbl">depuis ton premier film'+(days>=1?', soit '+days.toFixed(1).replace('.',',')+' jours':'')+(st.unknown?', durée inconnue pour '+plural(st.unknown,'séance','séances'):'')+'</span></section>'+
    '<div class="tiles">'+
    tile(fmtN(films.length),'films vus')+tile(avg?avg.toFixed(2).replace('.',','):'–','note moyenne sur 5')+tile(fmtN(likes),'coups de cœur')+tile(fmtN(rv),'critiques écrites')+'</div>'+
    blocDefis(ys)+blocReals()+blocSucces()+blocBadges()+blocCarte();
  // distribution des notes
  var dist=[0,0,0,0,0,0,0,0,0,0];rated.forEach(function(f){var i=Math.round(f.r*2)-1;if(i>=0&&i<10)dist[i]++;});
  var maxI=dist.indexOf(Math.max.apply(null,dist));
  var labs=['½','1','1½','2','2½','3','3½','4','4½','5'];
  h+='<section class="card-box chart"><h3>Tes notes</h3><p class="cap">'+(rated.length?'Ta note la plus donnée, c’est <b style="color:var(--gold)">'+stars((maxI+1)/2)+'</b>, pour '+plural(dist[maxI],'film','films')+' sur '+fmtN(rated.length)+' notés.':'Aucun film noté pour l’instant.')+'</p>'+
    bars(dist,labs,dist.map(function(v,i){return stars((i+1)/2)+', '+plural(v,'film','films');}),'')+'</section>';
  // mois de l'année
  var mo=[0,0,0,0,0,0,0,0,0,0,0,0];ty.forEach(function(e){var m=+(e.d||'').slice(5,7);if(m)mo[m-1]++;});
  var best=mo.indexOf(Math.max.apply(null,mo));
  h+='<section class="card-box chart"><h3>'+Y+', mois par mois</h3><p class="cap">'+(ty.length?'Ton mois le plus chargé, c’est '+MOIS[best]+' avec '+plural(mo[best],'séance','séances')+'.':'Ajoute la date de visionnage à tes séances pour les voir apparaître mois par mois.')+'</p>'+
    bars(mo,MOIS_I,mo.map(function(v,i){return MOIS[i]+', '+plural(v,'séance','séances');}),'acc')+'</section>';
  // décennies
  var dec={};films.forEach(function(f){var y=parseInt(f.y,10);if(y>1870&&y<2100){var d=Math.floor(y/10)*10;dec[d]=(dec[d]||0)+1;}});
  var ks=Object.keys(dec).sort();
  if(ks.length){var mx=Math.max.apply(null,ks.map(function(k){return dec[k];}));
    h+='<section class="card-box chart"><h3>Par décennie de sortie</h3><p class="cap">Les années de cinéma où tu passes ton temps.</p><div class="hbars">'+ks.map(function(k){return '<div class="hrow"><span>'+k+'s</span><span class="tr"><i style="width:'+(dec[k]/mx*100).toFixed(1)+'%"></i></span><span class="c">'+fmtN(dec[k])+'</span></div>';}).join('')+'</div></section>';}
  var miss=films.filter(function(f){return !f.m;});
  if(miss.length){
    var ls=lastSeenMap();miss.sort(function(a,b){return (ls[b.k]||'').localeCompare(ls[a.k]||'');});
    h+='<section class="card-box"><h3>Durées à compléter</h3><p>TMDB n’a pas trouvé la durée de ces films. Tu peux la remplir ici pour ton compteur.</p>'+
      '<p class="sub" style="margin-bottom:10px">'+plural(miss.length,'film','films')+' sans durée</p><div class="miss">'+
      miss.slice(0,15).map(function(f){return '<form class="mrow" data-k="'+esc(f.k)+'" autocomplete="off"><span class="lt">'+esc(f.t)+' <span class="fy">'+esc(f.y)+'</span></span><input name="m" placeholder="1h30" aria-label="Durée de '+esc(f.t)+'"><button class="ghost small" type="submit">OK</button></form>';}).join('')+'</div></section>';
  }
  return h;
},
manifeste:function(){
  function ligneNouv(n){return '<div><span class="st ok">v'+n[0]+'</span><span>'+esc(n[1])+'</span></div>';}
  return '<article class="manif"><h2>Bobine ne sera jamais à vendre.</h2>'+
  '<p class="lead">Letterboxd est en train de changer de mains pour 330 millions de dollars. Ce n’est pas un drame, c’est un rappel. Une communauté qui appartient à quelqu’un d’autre peut toujours être vendue. Bobine part de l’idée inverse.</p>'+
  '<ol>'+
  '<li><div><b>Ses membres en sont propriétaires</b><p>Une coopérative ou une association, une personne égale une voix. Pas d’actionnaire à rembourser, donc rien à revendre.</p></div></li>'+
  '<li><div><b>Tes données sortent en un clic</b><p>Export complet, quand tu veux, dans un format que Letterboxd et les autres savent lire. Partir doit être aussi simple qu’arriver.</p></div></li>'+
  '<li><div><b>Pas d’algorithme qui te retient</b><p>Le fil montre ce que tes amis regardent, dans l’ordre où ils l’ont vu. Pas de pub, pas de revente de données aux studios.</p></div></li>'+
  '<li><div><b>Le code est ouvert</b><p>Tout le monde peut le lire, le vérifier, le reprendre. Si Bobine tournait mal, ton carnet lui survivrait.</p></div></li>'+
  '<li><div><b>Le cinéma d’abord</b><p>La salle, les ciné-clubs, la critique longue autant que la vanne en une ligne.</p></div></li>'+
  '</ol>'+
  '<section class="card-box"><h3>Où on en est</h3><div class="roadmap">'+
  '<div><span class="st ok">Fait</span><span>Carnet perso avec journal, notes au demi-point, critiques, listes, à voir et bilan</span></div>'+
  '<div><span class="st ok">Fait</span><span>Import Letterboxd complet, export CSV et JSON</span></div>'+
  '<div><span class="st ok">Fait</span><span>Compteur d’heures passées devant l’écran</span></div>'+
  '<div><span class="st ok">Fait</span><span>Connexion avec Twitch, carnet enregistré sur ton compte</span></div>'+
  '<div><span class="st ok">Fait</span><span>Vraies affiches, durées et réalisateurs grâce à TMDB</span></div>'+
  '<div><span class="st ok">Fait</span><span>Carnets publics avec un lien, carnet privé en un clic</span></div>'+
  '<div><span class="st ok">Fait</span><span>Forum et conversation privée avec l’équipe</span></div>'+
  '<div><span class="st ok">Fait</span><span>Fond crème ou sombre, couleurs au choix, spoilers floutés</span></div>'+
  '<div><span class="st ok">Fait</span><span>Ton année en story, défis et badges, roulette À voir, carte illimitée</span></div>'+
  '<div><span class="st ok">Fait</span><span>Carnets visibles entre membres, moyenne et critiques de Bobine sur chaque film, roulette découverte, réalisateurs et succès</span></div>'+
  '<div><span class="st">Ensuite</span><span>Mentions légales, ouverture au public de Twitch</span></div>'+
  '<div><span class="st">Plus tard</span><span>Bobine sur son propre site, ouvert à tout le monde</span></div>'+
  '</div></section>'+
  '<section class="card-box" id="nouveautes"><h3>Nouveautés</h3><div class="roadmap">'+
  NOUVEAUTES.slice(0,3).map(ligneNouv).join('')+
  (NOUVEAUTES.length>3?'<details class="nouv-plus"><summary>Voir les '+(NOUVEAUTES.length-3)+' mises à jour d’avant</summary>'+NOUVEAUTES.slice(3).map(ligneNouv).join('')+'</details>':'')+
  '</div></section></article>';
},
forum:function(){return vueForum();},
contact:function(){return vueContact();},
admin:function(){return vueAdmin();},
confidentialite:function(){
  return '<article class="manifesto"><div class="viewhead"><h2>Confidentialité</h2></div>'+
  '<p class="lead">Bobine garde le strict nécessaire, et tu peux tout reprendre ou tout effacer quand tu veux.</p>'+
  '<section class="card-box"><h3>Qui s’en occupe</h3><p>Bobine est un projet perso de Kawaze, sans entreprise derrière et sans revenus. Pour toute question sur tes données, utilise Écrire à l’équipe, depuis le Forum.</p></section>'+
  '<section class="card-box"><h3>Ce que Bobine garde</h3><p>Ton pseudo et ton image de profil Twitch, et un identifiant technique de compte. Rien d’autre sur toi, ni mail, ni âge, ni vrai nom.</p><p>Ton carnet, c’est à dire les films, notes, critiques, tags, listes, films à voir, et la date de visionnage quand tu choisis de l’ajouter.</p><p>Si tu règles une carte illimitée, son prix et les séances vues avec. Ces deux infos ne sont visibles que par toi, jamais sur ton carnet public.</p><p>Tes messages sur le forum, publics et signés de ton pseudo, et ta conversation avec l’équipe, que seuls toi et l’équipe lisez. Il n’y a pas de messages privés entre membres.</p><p>Jamais de lieu, d’adresse ou de position.</p></section>'+
  '<section class="card-box"><h3>Qui voit ton carnet</h3><p>Bobine est fait pour partager ton carnet de cinéphile. Il est visible par les autres membres, depuis ton pseudo dans le forum, sous tes critiques dans la fiche d’un film et dans la roulette, et par toute personne à qui tu donnes son lien.</p><p>Ta carte illimitée et ses séances restent visibles par toi seul.</p><p>Les carnets ne sont pas référencés sur Google.</p><p>Tu préfères rester dans ton coin ? Passe ton carnet en privé depuis ton compte. Il disparaît alors de partout, des moyennes, des critiques, de la roulette et du forum, et plus personne d’autre que toi ne peut le lire.</p><p>Une critique qui pose problème peut être signalée, et l’équipe peut la masquer.</p></section>'+
  '<section class="card-box"><h3>Fréquentation</h3><p>Bobine compte ses visites pour savoir s’il est utilisé, sans traceur, sans cookie de mesure et sans garder d’adresse IP. On compte des visites, pas des personnes. Pour les membres connectés, seules la date de première et de dernière visite sont gardées. Ces compteurs sont effacés au bout de 13 mois et seul l’admin les voit.</p><p>L’admin voit aussi combien de personnes sont sur Bobine en ce moment, sans savoir qui. Ce compteur n’est enregistré nulle part.</p></section>'+
  '<section class="card-box"><h3>Où sont tes données</h3><p>Ton carnet est enregistré chez Supabase, l’hébergeur de la base, sur des serveurs en Irlande, dans l’Union européenne. La page elle-même est servie par GitHub Pages. Quand tu cherches un film, le titre tapé est envoyé à TMDB pour trouver l’affiche, sans rien sur toi.</p><p>Ton navigateur garde ta connexion et une copie de ton carnet pour aller plus vite. Pas de pub, pas de cookie de suivi, pas de revente de données.</p></section>'+
  '<section class="card-box"><h3>Tes droits</h3><p>Exporter tout ton carnet en CSV ou JSON, depuis Déménager. Le passer en privé, ou le supprimer entièrement depuis ton compte, ce qui efface aussi tes messages du forum et ta conversation avec l’équipe. Pour effacer aussi ton compte Twitch relié, écris à l’équipe.</p><p>Tes données restent tant que ton carnet existe, et partent dès que tu le supprimes.</p><p>Si tu as moins de 15 ans, demande l’accord d’un parent avant de créer ton carnet.</p></section>'+
  '</article>';
}
};

function bars(vals,labels,tips,cls){
  var mx=Math.max.apply(null,vals.concat([1]));
  return '<div class="bars '+cls+'">'+vals.map(function(v,i){return '<div class="bcol" tabindex="0" data-tip="'+esc(tips[i])+'" aria-label="'+esc(tips[i])+'"><div class="bar" style="height:'+(v?Math.max(2,v/mx*100):0).toFixed(1)+'%"></div></div>';}).join('')+'</div>'+
   '<div class="blabels" aria-hidden="true">'+labels.map(function(l){return '<span>'+l+'</span>';}).join('')+'</div>';
}

function filmsList(){
  var arr=Object.values(S.films).filter(function(f){return f.w;});
  if(ffilter==='liked')arr=arr.filter(function(f){return f.l;});
  if(ffilter==='unrated')arr=arr.filter(function(f){return !f.r;});
  if(ffilter==='rated5')arr=arr.filter(function(f){return f.r===5;});
  var q=norm(fq);
  if(q)arr=arr.filter(function(f){return (norm(f.t)+' '+f.y).indexOf(q)>=0;});
  if(fsort==='recent'){var m=lastSeenMap();arr.sort(function(a,b){return (m[b.k]||'').localeCompare(m[a.k]||'')||a.t.localeCompare(b.t,'fr');});}
  if(fsort==='note')arr.sort(function(a,b){return (b.r||0)-(a.r||0)||a.t.localeCompare(b.t,'fr');});
  if(fsort==='titre')arr.sort(function(a,b){return a.t.localeCompare(b.t,'fr',{sensitivity:'base'});});
  if(fsort==='annee')arr.sort(function(a,b){return (parseInt(b.y,10)||0)-(parseInt(a.y,10)||0);});
  return arr;
}
function fillGrid(){
  var g=$('#fgrid');if(!g)return;
  var arr=filmsList();
  $('#fcount').textContent=plural(arr.length,'film','films');
  g.innerHTML=arr.slice(0,gridLimit).map(function(f){
    return '<button class="card" type="button" data-action="sheet" data-k="'+esc(f.k)+'" aria-label="'+esc(f.t+(f.y?' ('+f.y+')':''))+'">'+poster(f)+'<span class="cs">'+(f.r?'<span class="stars">'+stars(f.r)+'</span>':'')+(f.l?'<span class="heart">♥</span>':'')+'</span></button>';
  }).join('')||'<p class="muted">Aucun film ne correspond.</p>';
  $('#fmore').innerHTML=arr.length>gridLimit?'<button class="more" type="button" data-action="gmore">Afficher plus ('+fmtN(arr.length-gridLimit)+')</button>':'';
}
var dlTimer=null;
function updateDatalist(){
  clearTimeout(dlTimer);
  dlTimer=setTimeout(function(){
    var arr=Object.values(S.films).slice(0,4000);
    $('#known').innerHTML=arr.map(function(f){return '<option value="'+esc(f.t+(f.y?' ('+f.y+')':''))+'"></option>';}).join('');
  },300);
}
function splitTitle(t,y){var m=String(t).match(/^(.*)\s\((\d{4})\)$/);if(m)return [m[1].trim(),y||m[2]];return [String(t).trim(),y];}

/* ---------- Carte à partager ---------- */
var SITE_URL='';            /* ex. 'bobine.fr/@pseudo' : s'affichera en bas de l'image quand le site aura son adresse */
var shareCtx={id:null,fmt:'story',blob:null};
function rr(x,X,Y,w,h,r){x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath();}
function wrapLines(x,text,maxW){
  var words=String(text).split(/\s+/),lines=[],cur='';
  words.forEach(function(w){var t=cur?cur+' '+w:w;if(x.measureText(t).width<=maxW||!cur)cur=t;else{lines.push(cur);cur=w;}});
  if(cur)lines.push(cur);return lines;
}
function clampLines(x,lines,max,maxW){
  if(lines.length<=max)return lines;
  var out=lines.slice(0,max),last=out[max-1];
  while(last.length&&x.measureText(last+'…').width>maxW)last=last.slice(0,-1).trimEnd();
  out[max-1]=last+'…';return out;
}
function drawPoster(x,f,X,Y,w,h){
  var im=f.p&&AFF[f.p];
  if(im){ /* vraie affiche TMDB, recadrée pour remplir le cadre */
    x.save();rr(x,X,Y,w,h,18);x.clip();
    var s=Math.max(w/im.naturalWidth,h/im.naturalHeight),iw=im.naturalWidth*s,ih=im.naturalHeight*s;
    x.drawImage(im,X+(w-iw)/2,Y+(h-ih)/2,iw,ih);x.restore();return;
  }
  var c=PAL[hash(f.k||f.t||'')%PAL.length];
  x.save();x.textAlign='left';rr(x,X,Y,w,h,18);x.clip();
  x.fillStyle=c;x.fillRect(X,Y,w,h);
  var g=x.createLinearGradient(X,Y,X+w*.4,Y+h);g.addColorStop(0,'rgba(255,255,255,.12)');g.addColorStop(1,'rgba(0,0,0,.32)');
  x.fillStyle=g;x.fillRect(X,Y,w,h);
  /* affiche « classique » sans texte : bandes de pellicule sur les côtés et halo de projecteur */
  var halo=x.createRadialGradient(X+w*.5,Y+h*.38,4,X+w*.5,Y+h*.38,w*.75);
  halo.addColorStop(0,'rgba(255,240,210,.22)');halo.addColorStop(1,'rgba(255,240,210,0)');
  x.fillStyle=halo;x.fillRect(X,Y,w,h);
  var band=w*.09,hw=band*.42,hh=band*.56,step=band*1.05;
  x.fillStyle='rgba(0,0,0,.38)';x.fillRect(X,Y,band,h);x.fillRect(X+w-band,Y,band,h);
  x.fillStyle='rgba(244,240,232,.22)';
  for(var yy=Y+step*.4;yy<Y+h-hh;yy+=step){rr(x,X+(band-hw)/2,yy,hw,hh,hw*.25);x.fill();rr(x,X+w-band+(band-hw)/2,yy,hw,hh,hw*.25);x.fill();}
  x.restore();
}
function drawBulbs(x,W,y){x.fillStyle='#f2b632';for(var i=18;i<W;i+=36){x.beginPath();x.arc(i,y,6.5,0,Math.PI*2);x.fill();}}
/* Story 1080x1920. Insta recouvre ~250px en haut (profil) et ~300px en bas (réponse) : le contenu tient entre les deux,
   et une bande vide est laissée sous la critique pour le sticker « Lien ». */
function buildCard(e){
  var f=film(e.k)||{t:'?',y:'',k:e.k},W=1080,H=1920;
  var cv=document.createElement('canvas');cv.width=W;cv.height=H;var x=cv.getContext('2d');
  var M=90,ink='#f6f2ea',gold='#f2b632',red='#ff4a5f',grey='#b9b4aa',mono='"IBM Plex Mono", ui-monospace, monospace',disp='"Big Shoulders Display", "Arial Narrow", Impact, sans-serif',body='"Instrument Sans", system-ui, sans-serif';
  x.fillStyle='#111216';x.fillRect(0,0,W,H);
  var glow=x.createRadialGradient(W/2,640,40,W/2,640,760);glow.addColorStop(0,'rgba(242,182,50,.10)');glow.addColorStop(1,'rgba(242,182,50,0)');
  x.fillStyle=glow;x.fillRect(0,0,W,H);
  drawBulbs(x,W,22);drawBulbs(x,W,H-22);
  x.textBaseline='alphabetic';
  /* en-tête, sous la zone du profil */
  x.textAlign='left';enteteStory(x,M,ink,disp);
  x.font='500 24px '+mono;x.fillStyle=grey;x.textAlign='right';x.fillText((e.rv&&!e.sp?'CRITIQUE':'SÉANCE')+(e.d?'  '+fmtDate(e.d).toUpperCase():''),W-M,312);
  /* affiche */
  var pw=420,ph=630,py=350;drawPoster(x,f,(W-pw)/2,py,pw,ph);
  /* titre sous l'affiche, toujours */
  x.textAlign='center';x.fillStyle=ink;var y=py+ph;
  {
    var ts=74,tl;do{x.font='800 '+ts+'px '+disp;tl=wrapLines(x,String(f.t).toUpperCase(),W-2*M);ts-=4;}while((tl.length>2||tl.some(function(l){return x.measureText(l).width>W-2*M;}))&&ts>40);
    ts+=4;tl=clampLines(x,tl,2,W-2*M);
    y+=86;tl.forEach(function(l,i){x.fillText(l,W/2,y+i*(ts+2));});
    y+=(tl.length-1)*(ts+2)+46;
  }
  var info=[f.y,f.m?fmtDurShort(f.m):''].filter(Boolean).join('   ');
  if(info){x.font='500 28px '+mono;x.fillStyle=grey;x.fillText(info,W/2,y);}else y-=40;
  /* étoiles + cœur sur une ligne */
  y+=96;
  if(e.r||e.l){
    x.font='88px '+body;var st=e.r?stars(e.r):'',sw=st?x.measureText(st).width:0,hw=e.l?70:0,gap=st&&e.l?28:0,sx=W/2-(sw+gap+hw)/2;
    x.textAlign='left';if(st){x.fillStyle=gold;x.fillText(st,sx,y);}
    if(e.l){x.font='70px '+body;x.fillStyle=red;x.fillText('♥',sx+sw+gap,y-6);}
    x.textAlign='center';
  }else y-=60;
  /* critique */
  var safeBottom=H-300,stickerBand=90;
  if(e.rv&&!e.sp){
    var rs=40,lh=Math.round(rs*1.38),maxW=W-2*M-76,top=y+44;
    x.font='500 '+rs+'px '+body;
    var maxL=Math.max(2,Math.min(5,Math.floor((safeBottom-stickerBand-top-60)/lh)));
    var rl=clampLines(x,wrapLines(x,'« '+e.rv+' »',maxW),maxL,maxW);
    var boxH=rl.length*lh+60;
    x.fillStyle='#1d1f25';rr(x,M,top,W-2*M,boxH,22);x.fill();
    x.fillStyle=red;x.fillRect(M,top+22,6,boxH-44);
    x.fillStyle=ink;x.textAlign='left';
    rl.forEach(function(l,i){x.fillText(l,M+40,top+42+rs*.8+i*lh);});
    y=top+boxH;
  }
  /* invitation au sticker lien */
  x.textAlign='center';x.font='600 26px '+mono;x.fillStyle=gold;
  x.fillText(SITE_URL?SITE_URL.toUpperCase():(e.rv&&e.rv.length>160?'LA SUITE SUR BOBINE ↓':'SUR BOBINE ↓'),W/2,y+66);
  /* zone recouverte par la barre de réponse : décor seulement */
  x.font='500 22px '+mono;x.fillStyle='rgba(185,180,170,.55)';x.fillText('LE CARNET CINÉ QUI NE SERA JAMAIS À VENDRE',W/2,H-70);
  x.textAlign='left';
  return cv;
}
function caption(e){
  var f=film(e.k)||{t:'?',y:''};
  var head=f.t+(f.y?' ('+f.y+')':'')+(e.r?' '+stars(e.r):'')+(e.l?' ♥':'');
  var rv=e.rv&&!e.sp?'\n« '+(e.rv.length>180?e.rv.slice(0,178).trimEnd()+'…':e.rv)+' »':'';
  return head+rv+'\n'+(SITE_URL?SITE_URL+' ':'')+'#Bobine #cinema';
}
function renderShare(){
  var cv;
  if(shareCtx.annee)cv=buildAnnee(shareCtx.annee);
  else{var e=S.diary.find(function(x){return x.id===shareCtx.id;});if(!e)return;cv=buildCard(e);}
  $('#sh-img').src=cv.toDataURL('image/png');
  shareCtx.blob=null;cv.toBlob(function(b){shareCtx.blob=b;},'image/png');
}
/* Le logo de Bobine sur les images de story, chargé une fois (intégré au code, sans dépendre du dossier images) */
var LOGO_DATA='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKoAAACGCAYAAABNGBHPAAAzZklEQVR42u19fZwbV3nu854zo9VI2qxl4oIJBLyYkBBCQkz4KAk25MsE24kDOHsxafko95ZCKSWF0OvmOoakLZTeX1rSlLa3NDdch00uZInNh5M4wWCHr8QhECjg69iEFgwYLG8saRTNnHPuHzpHOTs7I42k0e4amN9Pv9Xu6nP06P183ucl/Joc/iS4NwFhft9xFUorz8HpQrAVROpMACcBKNZ9xQoeSQBS35T0daWvQ1+3fw+BJx9b/8++v32EAAL9fwlA3LaXqT/9lzzTt1X6sQIA4mc/3CWD+rHALYwK63WE+sL0pUlggb6fsF5fYP0uY14nIu/JPD7Ma7Pep/2eeFCvcLdQVtbjmduHAKp8bLwG4AiAX1734RsqW7ZskfaTBo0p7tzNQevWiSw+XzreAVrbBFb4EEAMcvOz4LzvL9lqInVp3VevKJboZABFc1vXYzPuG/iy/bfAl+3bmOudjuj9on+rVVt4WLSE44//meMTd4WzHuPKjVfgpo+8D7IZzPg7y7mQzaD9M+5/SUfS/zs9ZprDup+0voxPADjGcu7PpRDfI7Bv8rHxhwB8xy2UG/rbQWFjikGukhr4v3lAta1odSv7L35DvrdYohdHbhbY7zUtEGO/FFWliiWKPW+1qkKxRHA9pmygAsBJf8hiH+++L9yGFaedbINAxTy2inxWWXxm9mNSAiBnPG+tVkWxWELkfmTfDwBkM3iC5dx9Uoj7wvr0to+On79rC5E0VtbNr7et+q8/UP1JON4EQn8Sy6Sk/5krscu0NQv0iWAAyPUY2dbStqa2JYwBLwFQ0f/Zvxtw2mAF0P5brarw2YcJ7/z47NN8wVkMn5m6/3h3aCrm4gDgGvCK5dyvK6E+wcfGJ91CuRrUKwSA3EK5J2vBjmNLGla3stc5Bf5VDdJm4MvA9RhzPea4HmMAyLj3JJDG/W5bLzs86ATSqHU1oJ36Oo+9zdvee2PbCh3HB2kMcQ1Q84ZC2QwCAEI2g5cTp3+R1YP3Nw7t/f0d9+7hbqEs1bZtzq+1RTXuvrqVvYM56ib9LW66HnOi7ydqSePiUHM9chvq4C7jgGonLO3/1aoq0e3/9Lv3RF0p+nGJA963l+fo9/FNwpbTIcKXWWnZn7mF8oPauiJN7MqOU5C+jjnqY1ZQ3wZp4Mv2JQmw5nocSKMJl7GMtaoi+zEi1lTVqqp9ss3/PvtwvB24cuMVGC2XszAcNIdGhzr8neLiVlNB0J9PCKApm8HK8Mi+nY1De9/pFsrKLZRVUK+wXxug1jaBeRMQ/iTOZY66xbIi3LjoKAg7uXwbzNHr9mFApxOl2ETM9disMMD1WGxsCgCXXLyyU6yXFjRpgJN1LJr2NSRhzdGG5QTidKN/6IGbg3ql4BbKshtYjwvXrySofg0IwAn1cdy/aAl/PoAmAB74krqVjfopNSWcn9Tub/c+YO0H40/vsZ882FeJKOXron5eb8YVI5UC+CHLuSNSiJ3O2PIJt1D+VVCvsKQk63ixqFS8HhKn03sXLeHPD3z5RODLWSC1rWPUqsa5/STARi1J3G2TkijzOFPfcBPd/hCy7UGsMwa0lP08L+nEqwkhL5DVg3cG9cpibVnpuATq5s1gYFD+JMaJ412BL6V297HgirOO0Zi1G2DjwJ8WpOb2cQX+BLf/G3vIZuBoz/iKcHr/1qAxlQdASs7+oix4oH7gNBABSkp6O4CyjnHI9Rh1AmuSO+8EzLguUxprY4O0VlXYuif5/Vxy3osGdftzURudy8ORzeAJxvnqsPKMj7mFsgwbs+NVttBjU28CorYJJxLHG12PKddj3K5vpgBXR+sY+JK6gTnyu4r+LZpI7T2Y7PZZzs0i0ck6WZpvsLqyGTQZ53/QOLT3LW6hLIJ6hR83QG3c3nLx6vns9a7HTraIGrNAFAVtkruP/N8u7FOHElbX+KtYojZgO7l9y5pSD4BMKv8kAZZSZv80YEya5cFkM5BKhH8V1CsnA5hRCWAL2P9QfgPEjqvg+A05EZcoRcHYKeNPsLYmWVJx4LEfP6nUZbt9AHjop9TR7afInHsFz7Az+06vZdDELWo0Bcu5Tw2n92+JNgEWLFDrm0DEoFaeg1OLJXqJSaLiivMaNMqmwWnwtYGo7y8BqMCXSocR7du5HhOux0TgS6lva2h39vPEWjfTMu2U7V937dVgORcs59ofrMo44+9U9zweDi6bQQghNwb1yit1q5UvdNfPAEAIts71mGdYUAnFeRn4kumSh+t6jAe+5K7HuLkOwNEcAK6rBtGLE/jS3Mb0rR2LoxnbRrUB2ynbf+vrLzCZbidLmDYcSBuvDgpY1Q8dcJAavf4iu+H0/vcCANbuVQu64K9LFM4v/w27Fy3hL9WsKB6TQCld+G8ogTuVoi8D+A+0uJKmhedC95pNK88iESsAI/pCVrfrqX5DvmXREv4iExt34AEAgNq6B4ndqJRF/n7cfRY8gU737/fxacAvSeAsPuVczQlgzgIFKaNW7fScYonODnwpALCYbFwCcI4eFvtLRfxe4Y34WpYer7YJn2x68o5cib0q8KVJ5GxG/IwkrsWUkrFuPwPeaBpAqSFYzPkIIUIAI+H0/jcCeBBsFzkLNNsnAFJKuiJXYm7gS8OOsg+ps/UjpSIu8ybwPX+yTTPL4uS63gSOVrfShwJfrowQr1VcuWvnwzLR7aesnaoEC6aOwxa4ihCrVQ/1YwZA1R5//NKgXvmQmy9XnIXo8olB+JN4mlNgr9eJDrcTKG1ZJYCcDOnvSxvV9/xJ5PIbkGUlXaoNoMbt8jEFqgI4QSdYFOWlLlrCcfM9sSAlzZTq5UNSC6RclCm9sMcmBwEIi8XSuJg+cC6A7WwBWlOTRF0C4OnaDVCkZKQCXzoAapzLz2zeDJbfgJAYVFaXO6ZAOtVcCqAAQNjdsGgZK4kgrVumvdYqB3XhNIfWtlMJq9/yVTuMadanVy3IrF8+0rIoROry6Bu0ivvS9Rg7elh8Tz6CH74/zN6iXBK0W7drdNghk+qytapKdPsrz36uks1ADXkUZD7KU2ouqj4jo4teEtQrCytGrW0CK14P6U/iNEVYGa31Rgv5BY++WLxeBf4kHGIIM644CB8oVWtqHXEJM3sVrToUS5TY279y4xVqtFyODssNCg6RkQVkyDYOzQS41hAh6ZDheQx41oKyqOyM1osTgr3e9Vgp6vbNCdF10SZj6gsAkN8AiYzDD2JQQrBzFi3hz9ONAJZEcuni9rM5N636JGc5N9ftAiDxb1Z9GHZTYwhWvdd2LgDYkw9Gb2GxmD7wggVlUfMbIH2gUK3JNzBn9liyybhdj/Gjh8X3S0U8ogAili1Q22eK1BqAuG42xKLx6GGBnQ+zYTOllGwGDMARKcQnAdStLhyhVSNmbcBwRlII23I64MyRQnjg7CmM8+fIZvA8lnNd/foS3988UP8QmbdyAZy6YID6mc+AE4OobmWvWLSETrfqltGYUGm3f7c3oXx/EhwTEFm+Fj3ykqvW1Ktzpc637TQX1a/YQ9znx3Iul0J8zlt6znsGfbCgXiky4DQxfeAilnPfDOC5shmEc5yEpRa9UJDLFwxQLwnaVmwtQCzKlLLIISzwZciY+uww42QALyyW6Hmm2ZB0+x7mogYy7rIZgLhzZ9CY4pCrnIRYtTvI2C7p5ss1AA8CeDCoV/4pnN5/Lcu575LNwPAh2EJIwI5VKiZePclZKEwpalmx0WpNXUy81aqMYUNJAE6tqr5TKuLhdnw6kX2cLCWtIQ4PrVasa0+szmROxWNjzfkviVL6VJ8tSQnAYTn3UVZadp+bXyGCeqWjPE7SOEfr0VbBos9xt1D+FYA/bhza+20AN+oQYFCwZjK3NVoukz6HxQWRTDUmwRRAQrCVxRI9F0CgBSSi5SDj9u/1JlBXEpxYtmUSbwJix1XgdV+t1s+ZmERdM5XrNBfVLYGgHtw+pBD3uIXy0aAxxbvNwZsx5KTbuYWy1JcgqFcoqFfc/NIV/4u4816daKmFoGd2rFJpGQ/OFwZQ8xugCFBE6nJdVJdxPFPt9pVS9HkAqF+TLUhrm1pfmJXn4PnFEr1A0/0Sz1GXuSiVUc2x5fbBvhA3S9TtiII2Cl6j2BfUKy4fG/9HcLZTJzBiCK4+jvidyMAqPjk6McIWSMtU+pM4iTjW6D870Vl97Y54raoOci4fAoDCh7IFKjsDjAAlBHut67GiKY9FCdOux3D0sEgzF5U0JZoWvFKfi//kY+PfIAYFuarvCkcHS9zi5BbKisA+noHUUNqGg4oD6bFKBbVa1VD+ACBgC2XcRAh2MYAlms43Q3nPtE31XSoAGkq2W5zISnQtvwHi9iXI+Q35Js0xYNHRFAPWTm4/xQfdS3xK4Owet1D+hdq2jaeVbuwYpyY/F/jY+FdkM/gPbVVlhglTKlUX2QxQLJZgNUoghag6C6BlKk3LNE6/1AIsC3wpiyUah1K/QwyP+ZNwlFXs16wr5Dc8ebLsv5nrsaEHQ4gJoHYr/TVxzCiPxY249DEO3XMHh+Vcpt3+NgAILzhvqM5NJ1m/Amf7IOQz54LokqQBO/NLd+znzgJpmZ6hCK+25CLjZB5Jx01lKekGf1K9w5vAz2Iz/rR/s/7nT+I0KWlLrsTeEPgy1PFwbOt2976exqH7Zrrrufcf87Hx3QCw4949Wbj5Tgd3C+XAP/TAoyznnj/EsW6VBriGGugWRh915rllylqWnb1mZJS8aIckRuuJAwhzJXZZ4MsVtVvxTQDTlmS3tPgBzOqNk1UiUhHpcxfAuCK8NFdiJ0TY/LPm9xct4Zj6Btc366vIn8qyymYgAHBw9kUtd8MzaHcmgjoSKlTmCpxRFWwLpDhWqVCxWAKBHZhXoHoTCDdvhuM35LqRUY7Al9RNEVqXrULXY88E8MwkqfNUcVxEevLoYREUS8S73ecTd6ksivzdAMsAKAK7EwCcnbtB69apHjtQlNbKarCaX0cwN/RA1YWratrXP2Lz6fYB4AOnYUWxRC82MWF0PDkhbmWBL4VOvILAl0HgyyZaYr5N/ebs/8Vet28DQHQD6aIlvFe3H5cBq5iZJ0oo8u/nY+P36/hUZpjlxx477t1jbr9oLhVZ4pJP2QxUsViiWq36S17+8Q+c+WZKSUnrcyU2EvjyiWiR35Ynty2gtpxkwoQkK5pkmbtpSXXSB2iNQ/fl9lUXJj9FNpZACvHlkUL5cb2hRGRckpp1rD7/XAEFws/w9PmSHTLnsFarymKxxIsnnPA9N3/+T5x5HjcpVWvqUt0yZQmgIrPAIS4s6LTNJCrU24MEJVlaAU+2S6siK7ePFG4fBPZ5AOTs3I0BSSjUDbCbN29mWk3vd0Kx71T7dWRIrolNmuy4NDpOTmC7543hb42bnFss0fPsBCYJbP0q7nUSUIvjTEa0qMgmSCcxpTKm9LV7+3xs/D4Aqh+336tV/Ys/P4uUBInpAy/SsX9okZeHTeebpXlQLJY4gICPje+c91EUInWpaZnGzEXZmk+IGe6L/k52oyDaTeoghNatfNR+zC7iZ5k5HJZzlRTiW27L7bN+9zPZyVTXBoBcBWJQCvIii7Q8X4fUJPEfge36Niym93y4/RMV4bUajKwHNb1Y125b3qRFZ71qntpg1dm+Sun2BxVfIAL7kqblsUFAY9x+J7ArCQobkEFjapF8nF8qhcR8EanN2h8do28bya+vBfUKY/Po9l/leuyZWvOJRVX5kjT2e5CTjAVs5DqlFeidI81TpSUYf8bHxj8LANf91cMD9fbTWOOwOcXcQlmJyslXAHiO0aCdJ4a/UaqpO2PLb4FF/sBcM6UwARCp9fpcqGhGH7FkKkV8mriVLwGgqWborY0omPq6o+IMm+32u+hKIeWqG657+z+1Ne3TJET9Wlzn7t0I6pWirB58d4YTs/16FQEgB86+5BbK31FqMyMqS2eua6eaKfUsRbgormWqAUcxRfwZmbhlgSnO5XdqBCRZ2riFZwasCePQFNE8VVm4PiXUPTqmnOH2hwRWh9atCxqH9v6JEqFZ4uFkxEPtB6wMgCSwfwCA8ImzaM6TKWvKdK3rsacYF5PktqOJVFKiZIcNcRqnSeGEJbKm0JpunbUmEkDXbD/DArgrm8FhPjZ+r1soK8e7QaZx430wpVpPuG2bo8nTZyoRvk9n+nwu49EYa+qAs7v42PjdQb3C3Px6MeeuP78BcvP3wSy3P0tC0TD5Y0R6VUJCFRUrs/X9VbcyV3TBblSct1gi7D3oqg5FfpVhWYqDs6+5hfJPg8YUD/1VEtjStSbaq5XVwOZUKIdBvXKyrB78FFrdqGAA46X64DNE788APOGMLf8fWh6dzXmMarn95YqwQo89s35YRp1cecqsnuzRlk47TQGoJErfWzZerrK2MEqoz+ty0axs31jOQUIA/RjGkp4kqwfvkM3gtAFcfib6WboT5YKzm43UpL1zis2D27/Q9diYnVlGY9KkXn9Sqcl2/bqLpZIkzrvUVmfUbYslUp16+ytOOznLbN+RzeBxXeQ3bhB6pomS3Hsvbj+oVzjYLqZBeoasHtwpm8GKHkE6DMl2WSyWXJZzf+SMLd8U1CvkeDfMz1aU/AbI2iZwvyGv6LKSXHWyot3695Z1VQmdKOpUk7V3m3ZbbNapyF+rVXud2ydw9oBbKO/XcuBq0P69Bjg3m5zdQlm4+fWicWjvxvDIvrtlMzjVbECcy7g0ct6McfBZadmb3UL55y0i/ZYZH7Qzx25/RZHopXp4zz45KiYLV1qoV8VZw4iuPuJKXDHAZnFEkKQvwNHD/ff2YzZHd7IymhnOPhfUKxQCHGwXIFepGdkz20V63HnGnbdv306rLwwV5CoYSiD27lXUcp3GMjti+sDFCvLdSoQXmVOWIQZSZfgxcWnIcu6IEur9bqH85aAx5bj58qxYy5ljptSaXImNmLXlCa7cbqm6cSt10i44SwBrW1BCl6BmVR3Mpug56u2bbP+Ys/iUu7S1bGZUI10KYLmYPrBSVg9epkS4wgIo68GSDmO/qgIQsJybl0Lc6C0954agXuFxIJ0zoGqJHF6tqdVdmFJG7pwHvgybVfl5AN9Sip6I8DaVBrOw9sGbddvM+p9+LnKJ1DhxXOZ6bJEeg0axRLGania5avX2w2HL9Zh6KYXT+2964hcPkW4fhgk6o8K6yMhjtONdxvni8Mi+kwE8jeVcrl9raJ0rzGNMCrRW9eSlEFudseXvVtu28bDDYzhzNRcF4GXFEp1pW7SYfrzR5D/g5dk7Shvl3Vl+if1J/AOATwM4OUqEsYv86H+Ar98PUgIoQshV4DzxCxDtgHWKka3HELIZNK3xnKFn8CnKcIrl3JwU4pPO2PK32cTwpIqGM4duf0OuxHKage8knBAW+PI/S0W8xpuQ+/zJGaodlHDS0m4zdrwJPFjdqj7IHPxrnGyN7kRRsUTYvS/5cVO6fepH+7RTCzP6nCleg4nJnbkuN3XQduUAHCnEDc7Y8vemTRCdudCU2nEVSnVfrdbKeDy6dc/K0rkM6SOljWqfP4kRb6K9gmdgxlbj9pZ1Z1w+qkAqsuFklkUdgMk/iKwNy1I3f0jxZb/bV0K0ZrGqxJ2r8ktX/LMpraWpYrBha0oBwLlntzSlAl8KuzdvuX6zK6rCufyskqCMF0cAABWvhxSCPcdwYKPy5hG3Tyn2mWIOdPG7iuCm5MKqeZBCV1ZbdoTl3Pudxae8Or90xT8HjSm3l1IbGzpTqkWQfo3rMXI9JuKK9CZeVAJf/eur8ROt+CyHQMYFkbrA1Gt18jarO9VtgC/Ftuc5XfHY4YtDQ96IkgagOQD/Sdx5Nyste5VbKD8Q1CuOm18f9tJdY0N1+63aaanuqwv1n3lcu9P8rhRt3/LY7CQnixOrKw8nEse52oqzzgN8SFvkpzmY1lRDsNLDeJ2mGsG1DPtRcPZRZ/EpL80vXfExAKGWJQp7fU/OEIcJSDGgJti5xZI6xbj9Dq+jxrm8z5L5yZqsLYVgF46M0jNtuR7t8hUAMu7/E3eFKmNxXnUcbSPpNVY1XtK1ymCPSSH+r7P4lH9xC+V9Opt33UI56Fcl0Bnm9j0PkLXWXBT0HL6TNMx29LB46EsfwAEtfqaybt9GyNrSSPZYLl8tWsJx37dltyI/pUx2KENQ0QD7pyhhVWUWXxLGci7T4ccvpBBfJu7cycfG73YL5cMGoJaSTd+HM+S5qHK1plbnSi1lvIRZJgkAXp7ds+GwFP7tcDxku4pHhyBPV4RV+nl5Ups1RbavUm58zqocNCghWQ3JIhOAaSnEpwnsi87iU75iwNkGKNslIVsnc1DCtzPEuSghBHt1saSebTSl4jZDayvb5Ly1imdIbl8IwV45MkpLjABa0qhKr719C7w0l7tF+6wnZx2CcLR4rE8BUA7qlWm3UG5ak60qq4kENuRx6DU2kwmzW6bK9RirVdUP5CN4BAB0F2sYlYdLbCZ/HM0vSqBOU+TvMIYy1+Wg+dhoUmScv444/VN4ZN+3ZPXgzsahve8M6pUlbqEcuIWyDBpTzoIEqpLtDLtc99UqS+xqFp/UuP2CR/cUr0fTn8yWbmZVHsbqvjpXM61YkpvuJs6bUqA3y9JUmsdTQ060On0BpGwGTdkMAgCebAbnEacbZfXgNxqH9l4V1CtlN78+VBJks/UXBFDtcehFS/izAYT2lGiE1eQAEIyp7cNsOAA4q1iiZ1sSlLMYW67Huvb2+yz0Z1kWShJbU/O0IMK0Z40kZiCbQSCbwTLi9FEN2LcQg9LWlS8410+kXmef3BhKnwTAjh4WPwTwTcOyGkZhWkq6JNpwiE6fptTkn7cNIQuwPBX3Xrm+CA3Y5xKnT/iHHvhS0Jg6y82vF4bEPa9Atdz+ScRxvlFBsTN96yJdj6Hg0SPeBPxhuP38Bkh/EsW6r9aaIn8Mf1UBUBm4feozwekX/DR3a8D6ipc5gFA2gyaEXBX+8un3NQ7tfROtWxfeeefbeK+Ts07Wbl8BsibY7zJHPVVrj/IEKUeyW5sAmJIJiRRr37jbclitDAs0bofrMTSrW9nqYkmdphsOM5SkTYE/TbafwqKqIQFSDZnAPEwrbaiFAYAxJcJPNg7tfXZ+6YrrlHoGC+qV+ev1631Rr4nOLWG2oh4BUMTxitomPMWbQKDjW6pf8+QFAEECqnVhmzeDKQmKuUBJ/fwMyptA05/EMr8h/7pWVTJupMWAtZ9sP0vXn2Ctk1b/zCmPIKOjHcMqEX7IP/TAh/VMFEu7O4sNwe2fqN0+EnaZwuq1C9djJ+N0utWfxBlffgC5xu0gdkbr8pEWX19pwAKAunazLjexFiD1BdduaQFbSbj+JJ5W3cquqNZwd7FEy4slmsU9tYUmOizepbnYuTRkNtZ8LeGlOG4sy7lNxvn7/UMPbHELZRE20yVYlOGeJu5NQFS3sg0jo3Sblhvn0e6PsaRRVn/gy2qtqn6I1u5RZY2b2NxRU/SmgkdmFIPqvuIWSdgF8DuLlvBn6+dIWvFNZjbqpD+M/75+6pabSLOlVAaum9DbMrTjCZRpuavKmrp1lVBvyi9dsTU6wz/UGFU+0i6sb7DDxQStJ1vynOndp4VFHlb089xmVXlEvie0a7iRgj6ZmSmt0qcyluuhLnEgH0Kx3/5yS3sWawGBlay1mRLADUG98k23UP5/3cDqZLwv6lm6n66ia3gibdNo3Grm2IO4Gf6Y1iu6KPbNmA+K3r9YIlWrKgI6DvBRn3I9lOJDq0YsrrKqBixmkLFbMmW8joOWWrUdTgTzCNhO0u+C5dwTw+n9HwVw6Zxk/ewMkAKoJtgFI6P0FOP2o8rQXVbtkE0W6SQXmaTGF8fUT7oNhjPAhy5yii44u80ZW75JE4pli7ixSlkgNQX0aLgTLYNFJ1MdAIvE9IElSqjTwdnLIeTLrA0nwXyJ8ybBRg8drjv26M4r3EL5tu3bt/O1a9eKoQE1vwGKJqBqpFYDhE4A7bR1pIcZfbLZ+b0clpSkav0kGuLc/gxrqLWlbnML5QNDBsFnNINpmZg+MKFE+A7M1OVfKLEsAVC50cXXBvXKFyxPk/0UqkWje4YinKeJJhQzbpIoXhbTWrWvdxLpnfWmDBCtmX1bS2rG/XW2r4ak0qeinFvZDH7uLD7l67rY3dJXurZ1g/Dq98DZuZvCi8QsbX2wXU9eb9ujXdHbtS2vs3M3hRecJ9xC+SCAvwrqlVvC6f1/DiH/KCrCMd9WVbddT1XTB96cX7riY9u3b3fWrl2bvVKKRaNbOzJKTw182Qx86SQJ6nYCaZwev3F9ET3TGVI+cVYzKRTQ1pQA4J0fJ5XxAB91mtcCZzvdQvlnsYnDli3JwmcWQHuhzQX1CoHt4m6+/BMA72oc2rtHifBf22HHwgArAVDVx4/+UVCv3Ozky9W42X6WCXu+le2vtZX5khbe2ip90daqAWBMyKASVPhUv9lzJ7meNee/ZCgJBYF9The4KY32/qA6qG6hrNz8+jCoVyhoTDn5pSsmiTvvwJOySWoe66pktVpFsVg6VUwfOJ8YlF6wkV3BX7t95U/iGcTxYvOY3WLQpOURCTugYiUhoyc50l1ql0GKJSLTfbKK/IlF+Cs3XpF1tqt0bfcIHxv/GrF2CamnhRGDEJDdQllBrhJBvZLLL11xCzj7Nz18J+azCVCrVY3qYStpgHwdADh388yTKeP2L2COWhK3HTqNcFmc9UySl4yTLjc1UcvNt4f1IglU+5j6evyy5gGzfZU0EwbOvukUyj8e1tKIlBukQx1W/GV4ZN96AIvjpI2GNMelOigeMi0+tCqoV5ZQoXw4ep4Gsqj1a9pF/nWWkAQ6lZiia3XS7CS1gV0skQEjmVpoJDZVUWlz+7oBbcLyiCxV+iKfKvsCJSzXmEOwSmfnbuYWygfB2XaWcyliVeet3VqrVUMAzxDTB15m7dca3PUr2VIe8SfxbOJYZWZouqlCJ1naqIXtIPSLbut2ImPQKu3yiIw38LWV9QBM87HxHRG22LwlL0G9QgS2U38hF0JChWKxZNz/ywFgxz0OZQLU+jUtFy8EW+16rBxdopWyyN9tD9QM0EbvWywRNCGabDBaVhdRllStqvDOjxM6ZfsZgrVVBuLsmwAenS+3P+NYu1e6hbLiY+Pfj2xBWSi11bMAYM2aB2VWyZRsSVirS5NqptHEadD9pCkeZ0YS04m+1ynbz9r1E9gX3UJZxmWzc32E/nvMSTkM4PGYLtd8lqnAOB8P6pUxoi3SLtP1deI2b2739p9HvFXkt1umMQsguq6D7JYhxugBKHtHFKIry2OSqC6UvkH2I3Vy+3WzIdmSOke/G006LZ7o1SkC8BfINCt0vAzZDJ4KYAkAON4NgwH15dX2AN/FrseK9gBfnKXrtKI8IRZV0V1T/eyIssKD9s9Wtt9/b78HpWmplUQeBvADJUFOPhu3n1H4ECaUp9Sw6YTWF51sTi7LuRJACUBRW//BXP/Ff9N6g0TqNZ0AGBMOGMny0PVYGJH5Fq7HROBLAaD9U38JQr3cd4YseFxiZWf20dd09LBIzPbXnP+SVADUt0lldXRv/y63UA7CRoXRgFJFg9ZTI+AY1aBI3Sjp5knSxvYJWggmBHHE9IHFphXcdx3V2nDyfEU4t71xLoHZZMtKmudLUxFIs/o88GVYLBHrRD4xM1Fdsv3UNUH9YSgLsKoDOyh0Fp+yM+1jZ51smceLhArm+jIA5V7qqN12vvYb21teyihSPwMAbN6D0welzyjjXTYySkVNeuYdkiMBwA18qWpV9UDBo28DOKpPTjGymNaM21KMsFZO/6+px6xfWizRC+xZ/WgsG838UxT5uwL2WKViF6o7uX2H5dy9APYG9Qo585Ttx8SzrSbN9IHn6vc7Z/tPo2FTTBhlXmspynFweh1Brj8C6U/CrdbkJSOjPHavU8SSukcPix96efbOE9+m7iMoldHoiydC+q/MUR/VKtYqbgGwHbv24PaTLCVZIO2UJSu92eT+kUL5iaAx5VAX4bcs1kem2ubHdpl65Ysy3OzSl+Bw9HfLCNBALdT6pnaR/9RiiV6kKX08IXuXAPjRw2J/qYjV3oT8kZJg/u2dv71GKwpoSVd2+HuztFH+Xe1WegmAN7oeC+yGQ5Q9lcLtZ2Il7NifwHZiHkQjYty9zcQSQb3iyerBlVb4Mq9HzPkbjOa34+y223/NyCgVzA7NSNw4Y7GZl2dXeRPyR/4kcsTQVDL9h5bfkPz3xu1wlISqfYp2AHhj9ItiJ1Oux7D3IDfvf4Z7T8j2u7KyDEBjTrJx+4+y0rKvaHDIOcrkZz1eBLDcLZTDxqG9r1QifMFC4aWynItjlYrtEepRzm1PL3L1Q5D+JDiReq128ZTQcTLW9Pv07/Ku2iaw/ERrHioy5tz3pbVy8cm2bbQ8ViwRFUtEi5ZwLTARIm6kI+L20wiSqYgVoJi9ppBC3OUWytNBvcLnsxtls6+cnbv1m5C/Z1H9MMfCaokWtaiTCrdQrvRN87MWm51GHOdEv412bGqp9O0qXo8n2BkgGoL702IXLzNiFwklMTNpGhVwUFduvEIN2JWJk9fhshmAwL4Yy8SfpyOoVxitWxcG9cpZEPJSK8PGEIf6qIdef9sL87Hxw9EGCetjjflrXY+Votl2BLBML48wnxKlVcToQewi1HKSr7bnqKJsq8CXAxf5e/hgzPTtY3xs/P60bn8uDmfnbgYA4fT+v2A5tziH5JiOn7u1hVuxnMvRmps60m+MSvkNkLVH4NYbcr3O9imhvWkEJX7CudqjY0pBGerym/EXAC8slmhcB58sIU5VSdn+yrOfazT5VUb805aV4uzrbqFcCeoVvgDYUlDbtjm0bl3YOLT394nT5VrPlA9xERr1Eacq3Z36BYBK9PyyXpj87AycUSzRWVqJjydMmCrXY1ACX/Um8HMlwYgNJ+uVki7SVQcRU47quCH6rRc7NFouU8ZJgf4GszvbuqvzzJYKGlNcu/xxJcKPDijjToN+maPdq9FyObob4Rc77t1zVJfperOopkwkBLt4ZJRGbCZ/TN1Sabf/FQVFdokpKzlJTED6k8hXa+q1SduqrQ3RBMxexzP+8quy3kIiZTNwAPyEj43fZVnYeQWpm18vgnrlBFk9+L8BnNjnfD9lpQ7YrZYqhfjB2rVrhfZGoieLqnVGR/yGXNeJcqf/7ga+rHEudxGgjNRPlirSOjE7s1ii06NJQXRtZJLAxJ+8/Q1ZF7vNpOnX3EL5yJ13vm1es321bZujQXpiOL3/07IZnJuBCIXKuiwViVNBYA/0peZX2wSuXfeKYonOBiBNspTEUa1V1UNffqDFGMp6eYTl9i91PZZzPSajE60GsJ99OH6ILwWlry/xWpZzQWD3KAli7DKar+w+aEw52t0vl9WDX2ScXzggSIfCVbXKUqZ97vOx8T1xXwonRbZvgLEubo15JNNWrsfgheqe1X8rQ/U34Fm7v3ZS56sLcqXOnNYkXakhyPUoLTBRcxaf8hViUEH9XDmn/Xy2i0GuglsoCwCycWjvZeGRfTcCOAm6MTMHgsCDeCOnVqv+YGwx9vcFVK+1xjxf99WaaDyYIE4Wci6/pGPbTA+LubW8SHSakV6Pu+3RwyJRRVpn+5kCVRN/HwGwX8dXKm4TyI579xAArD7/XAW2i3olU++4dw+tUarFLNIqKm6+bKiPCOqV08Pp/X+qRPhmi8TjzOcAXwpOgWQ5F0V+wlfdQrmhmyQiNVBNkX/lOThTET23CyVMuh5zjh4W3ykV8ZBeFZmpVbFquatGRqlkS69H66edmPwR9pPKaDbKUUJt1wtp59rdP0VMH3ixgrwyPLJvHcu5o1LIwJoyGBZIKdpS7oX+Z92HyWYA4s7ndM0XPdVRLWCcxxyVQ0tk1+0UaBc8usebUPXaI3CKGa6KNMSUzVeDEanXx51zOwyxevuz3L51grIAqdLdKEncYUG9cq4F3mgrkcT0ARcA8bFxYbHspdUs4JZCn4wo+rli+sAIgAJa2/LGFeTpsnrwRUqEy9vVxJZKHu8AzKw2Dao0XNQkEBtWv2wGnOXc77MTHtsNAOEF58megKqX3ZLeejfD7Uc1naxV5j+qbVLMxLZZHTuuggNAfODDOFURXmJGPRLE09K4/awX6kolwg+GR/bZI9HRMldbpzQ8sk/G9NvJkpuUkSSGorqvreSNm/cTWM/hpCgxqSGpSvdEqD5WqahisURSiDtG8utrcW6/I1CtePCFivByQzRJUioxfX4i9QxNBXT9Saj8Bqg7pkCXJLzWL7jA5etbt7l8fesN168BCh+aUcMl092q3Up/ShylwJdN12NOnALgzffIpCI/RsvlYXEwKQagcUmD6kLeEB0WqCkLkLbaIJtH7VM1yGxZsVjiAKrO2PL/owf6VE/6qJbbXzMySvmjh0Uz6fYaKAyAJI4ra5twszeBHwAAJvp8+9dHvjiP4ITarXQNcbxdz1w5cSMqgS8Ts31T5O9wEqkLqUJ1sSrUY8GcerB8FPFqtFAXqdnn175eq1Wj+YERN77DLZR/oNRmprelpO84KAm6dhn4u/4HdhdL9DJTh4tTdLYsmomzfixD+jsA39NZJ3Rs60SU5GZNQnIuTWzGhGAOAA/A6X5D/t6iJfx0PezHkkapa1WVuDzip9+9p5tF7Reovz16zPqttmnTWXzKK51CeW/YapvK1BbVcvtnKqIVtaqSZoguCtKYJWeh67GTAfytLh/JaHxmgUsavao2ywqtIr3rMThWTKaJMEHgSx4XlwKA99Qcdu9rdqSSxYC0V7LFb8E64HyUJkqLYrFkrOmD3ZZNsAS3b+R6znc95hZLFKZ1Na7HDLOpae0eVXoc2oxJh9oyygQw2EmDANDUW054UvIEAP7Pm5j6RnxR4rprrwbLuTPadR108Y+nFTlzvuIn4RzO3D9rSSOZSQjrd1UslhiAx52x5X+JflZMKoCwAaEP5Ko1eRlraVWxOJcfJwNpuKE6hpzhQgNfkm532ptRosK9KjIgSNFxl6i737oH2HuQ60w/viL21tdfEJU6/HUAXVZ7VFWPgmadrKiKlJ/ivJhgOTcnhbjRLZT/ffv27bGZfkeg3vEZsNcxCH8SLyuW6KXd5mqSxB56SSJitqNQwvaTGSsrb75HWoJnnUu2fWb76jc0Tu0rxOl2fjVwhWwGOQCPOGPLP6y7d7Jni3pJ0F4dvo44WK2qmsUSOZ108aP11G5a/VEhibjdUrZ11Yp9AFqt0c8+TBqg6QziNVe/p1u2321OaliuVy2QeDiT57K5puY8x9D6GIAGKy17h1soP67rpr0BVbt9oUkfv6vlcVi3PU7R0Q8kKPFFwdlBLSW6NE0dPSxwzVQusZCfdFy58Qq8/91v6gegx61l6zM2HZio0sHVmyNkOTenhPoLt1C+P6hXnLQtZ2fW3P6TpI8XmjKRDU7z07j7RUt6qzNH6XidgGviz6mvc+x8mKGXjux1116NP3n7G+ZiKe7xmkCpLosgum4MjKuXdujrh7IZ5KQQd+QfOPRRtW2bg3w5NbNuBlB3N9pz+2uYo4qux9qkj6iUo21V4+bp4xKvNKt7vKfm4P+8ia17YMWfMrX1vOTile0dpsc5QNVCf2z7/Cada13kD2UzyLGc+wg74bH/Fl6wSgCA28OIEkWL/He9D2zF83FvsUQr48i2Sdl/mv9HW52Ioea13HtvXJZP3XLTjJU7KVzQb1pNlAZoe3a9b+R+FLG6QjYDF8CPncWnXOgWyvvUtm2c1q3riafsxKv00YsByFpVsaStd0mg7ATiKH/VgPW+b0v83bbe3LttPeNOcEpr+psC1lRsqX7PWVy71JShNEh/4iw+ZZ1bKO8L6hVOhXLPZHonpre/fmSUikcPi76sqQ1WY0GT7vdkeSm9aMd1116Nt77+AoyWyzOKySnaoGoA99ct0aDjIDnrCtYeRNPaYLXvE+lEBbIZjAD4hbP4lEvdQvnbScyoXoBK+QnIHVe1BviYQ/Yu0UQratdQ4xY8xLn+BPdOHYJ8FWc9+1gKkZX1PJ6tsIp04dJY1DbAU/J4lbakIyznfo+Vll3pFsrfGgSkbaDWNoHoekj/HJymiJ5vM/m7WcW43aPmb8bVL1rCWwD9ZOfuUZSJdOXGK/DhP/8DGi2X23pPxyqVdvG+g8sZtORCMQoonaymOg5jVUoRs1LMee2U9Us95OhKIT7DTnjsD9382b8MGlOOmx9s8sGJuP0LmaO8LnP7nfY6zdDNf7K8RKnjzys3XqHirGcnYskQsnv1W+YUZrRDk2byrf59iJbYMqQQH84/7XP/nWiLVNu2OaE8b+ABT8fI9ex4AI7fkOu1O2dxa8TTtFDN709az1TlJaWtJyJCuZThuEi3WHJYLp2GxKrv5/FUCu4seiGnFFEyLfYcy7k/VEL9WX7pis8F9QqpzWC0bl0m40jOjqvAqNXbP1MRne16TBYxU8IxbvOIvdTBWNCZ8WeYOnOP7nfqVjzuZWGuTdZNIvT2GY9SFgz3eazPDvqlEfq8ugAkOLuRlZZ90G3tMTVt0cyGO52V5+hnFezCkVEaMSMeUZcftwnPgLUP9463bLwc55z5nNjEqNtSg16yVpvpE2X2dHHtnRIP6kG6Rh1nzYA0E7cGoGA5d48SanN+6Yr79ETsQElTosUwAmi1W+ku4riom6JGPDmk+/HWix1cuPHvE61nFvPh5v8ZWrMkQKZ1vT2FEzZ/c8jJVK9eQEU327Cc+zUl1A13ffOmOy699F9DzYJSw5IxIgDwJ/Gcag17iyU6ods6l1pV9dQ9MtZzxWknzwDSMD+QOQDqIHEppcmih/y6ukq/W+CESZL0a/yqEuof+dj4bW6hHBgZoTQMqIFcvwKoJthFi5bQWODLWXP7s8khMk15CZ+65SZlW8+kwnDC0Fff4BxCbKgyrrsmlrrs121Y9HHnxWiJZvR+VFSNu1arOno61Bz/Ac52Etinv/oPd979qi1bQkstUA4bpG1Q1W6lKeK4zHBP7dppgntPFB+75OKVpEtLysSEFhBpAcZcvbi/XixTptl+rValGNCqAb4wJv6OE6oIWc59VAqxh8C+xMs//pKbX//TiM6VnEu1Qqe2CcuI4xUAZLFE5HpMRbpHca6LJ2Xu0bYmy7koooRhyBWmsSr2baNZf7fZnn64mP3cPu41dRr/iCaece8r7jkSvoQNAEc0ML9DYN/lY+PfAfDdkUL5cTwpG8S1zpWcD91Xqm5l7xsZpY/0mBwdAPCzT91yk9AAJaClegEAo+WyeuLY0cAtjIaG0xrzTY6qgoT6OuuwVNa+H1kj12GMpbdHs+3HkmiNcIvI45mRCBmxmEZ6R0ZqkOaxAysBdazniw5P2hsJo3P6FJHxiXqufLsMNPN8Ntuz8U+eMxmpGzv6Ys71MQKbDuqVX7qF8s/42PghAD92C+XDMRqrXIuxyflWzqbarfSJW7+Gl73z4yQiJ5JZJy8AID3P+9UTzeZtJ5dHvrDvUPWXxxkp47dHF/n7sDnFIFfB2bkb4QXnzTs47eP/A//EedkbvlkhAAAAAElFTkSuQmCC';
var LOGO=null;
function chargerLogo(){
  if(LOGO)return LOGO.pret;
  LOGO=new Image();LOGO.pret=new Promise(function(ok){LOGO.onload=function(){ok();};LOGO.onerror=function(){LOGO.rate=true;ok();};});
  LOGO.src=LOGO_DATA;return LOGO.pret;
}
function enteteStory(x,M,ink,disp){
  var dx=M;
  if(LOGO&&LOGO.complete&&!LOGO.rate&&LOGO.naturalWidth){var h=74,w=h*LOGO.naturalWidth/LOGO.naturalHeight;x.drawImage(LOGO,M,256,w,h);dx=M+w+18;}
  x.fillStyle=ink;x.font='900 64px '+disp;x.fillText('BOBINE',dx,318);
}
function openShare(id){
  shareCtx.id=id;shareCtx.annee=null;$('#sh-title').textContent='Partager en story';$('#sh-msg').textContent='Sur téléphone, l’image s’ouvre dans le menu de partage. Choisis Instagram, puis Story.';
  closeDialog($('#log'));closeDialog($('#sheet'));showDialog($('#share'));
  var fonts=['900 86px "Big Shoulders Display"','800 60px "Big Shoulders Display"','500 40px "Instrument Sans"','500 28px "IBM Plex Mono"'];
  var ready=(document.fonts&&document.fonts.load)?Promise.all(fonts.map(function(s){return document.fonts.load(s).catch(function(){});})):Promise.resolve();
  var se=S.diary.find(function(x){return x.id===id;});ready=Promise.all([ready,chargerAffiche(se&&film(se.k)),chargerLogo()]);
  timeout(ready,2500).catch(function(){}).then(renderShare);
}
function slug(s){return norm(s).replace(/\s+/g,'-').slice(0,40)||'film';}
function doShare(){
  var ys=shareCtx.annee,e=ys?null:S.diary.find(function(x){return x.id===shareCtx.id;}),msg=$('#sh-msg');if(!e&&!ys)return;
  var f=e?film(e.k)||{t:'film'}:null,name=ys?'bobine-mon-annee-'+ys+'.png':'bobine-'+slug(f.t)+'-story.png';
  var texte=ys?'Mon année '+ys+' sur Bobine\n#Bobine #cinema':caption(e);
  var go=function(blob){
    var file=null;try{file=new File([blob],name,{type:'image/png'});}catch(err){}
    if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
      navigator.share({files:[file],text:texte}).then(function(){msg.textContent='Partagé.';},function(err){if(err&&err.name==='AbortError')return;saveFile(blob,name);});
      return;
    }
    saveFile(blob,name);
  };
  if(shareCtx.blob)go(shareCtx.blob);else (ys?buildAnnee(ys):buildCard(e)).toBlob(go,'image/png');
}
function saveFile(blob,name){
  telecharger(blob,name);
  $('#sh-msg').textContent='Image enregistrée. Dans Instagram, crée une story, choisis l’image et ajoute le sticker Lien en bas.';
}
function copyCaption(){
  var e=S.diary.find(function(x){return x.id===shareCtx.id;});if(!e)return;
  var msg=$('#sh-msg');
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(caption(e)).then(function(){msg.textContent='Légende copiée. Colle-la sous ta publication.';},function(){msg.textContent=caption(e);});
  else msg.textContent=caption(e);
}

/* ---------- Toast ---------- */
var toastT=null;
function toast(msg){var t=$('#toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('on');},2400);}

/* ---------- Sélecteur de note ---------- */
function picker(el,val,onChange){
  el.innerHTML=[1,2,3,4,5].map(function(i){return '<span class="ps" data-i="'+i+'"><span class="bg">★</span><span class="fg">★</span></span>';}).join('')+'<span class="pval"></span><button type="button" class="clr">Sans note</button>';
  var cur=val||0;
  function set(v,silent){cur=v;$$('.ps',el).forEach(function(s){var i=+s.dataset.i;s.lastElementChild.style.width=(v>=i?100:v>=i-0.5?50:0)+'%';});
    el.setAttribute('aria-valuenow',v);el.setAttribute('aria-valuetext',v?stars(v)+', '+ratingWords(v):'Sans note');
    $('.pval',el).textContent=v?ratingWords(v):'';
    if(!silent&&onChange)onChange(v);}
  el.onclick=function(ev){
    if(ev.target.closest('.clr')){set(0);return;}
    var s=ev.target.closest('.ps');if(!s)return;
    var r=s.getBoundingClientRect(),i=+s.dataset.i,v=(ev.clientX-r.left)<r.width/2?i-0.5:i;
    if(v===cur)v=0;set(v);
  };
  el.onkeydown=function(ev){
    if(ev.key==='ArrowRight'||ev.key==='ArrowUp'){ev.preventDefault();set(Math.min(5,cur+0.5));}
    else if(ev.key==='ArrowLeft'||ev.key==='ArrowDown'){ev.preventDefault();set(Math.max(0,cur-0.5));}
    else if(ev.key==='Backspace'||ev.key==='Delete'||ev.key==='0'){ev.preventDefault();set(0);}
  };
  set(cur,true);
  return function(){return cur;};
}

/* ---------- Dialogue : noter ---------- */
var logCtx={},getRating=function(){return 0;};
function showDialog(d){try{d.showModal();}catch(e){d.setAttribute('open','');}}
function closeDialog(d){try{d.close();}catch(e){d.removeAttribute('open');}}
function montrerDate(oui){
  $('#lf-d-box').hidden=!oui;$('#lf-d-add').hidden=oui;
  if(oui&&!$('#lf-d').value)$('#lf-d').value=today();
}
/* La date peut être le jour exact ou juste l'année, quand on ne se souvient plus du jour */
var precDate='jour';
function remplirAnnees(){var sl=$('#lf-an');if(sl.options.length)return;var y=new Date().getFullYear(),h='';for(var i=y;i>=1920;i--)h+='<option value="'+i+'">'+i+'</option>';sl.innerHTML=h;}
function choisirPrec(p){
  precDate=p;remplirAnnees();
  $$('#lf-d-box [data-prec]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.prec===p));});
  $('#lf-d').hidden=p!=='jour';$('#lf-an').hidden=p!=='annee';
  if(p==='annee'){var v=($('#lf-d').value||today()).slice(0,4);$('#lf-an').value=v;}
  else if(!$('#lf-d').value)$('#lf-d').value=today();
}
$$('#lf-d-box [data-prec]').forEach(function(b){b.addEventListener('click',function(){choisirPrec(b.dataset.prec);if(b.dataset.prec==='annee'&&$('#lf-ca').checked)$('#lf-ca').checked=false;});});
$('#lf-d-add').addEventListener('click',function(){montrerDate(true);$('#lf-d').focus();});
$('#lf-d-del').addEventListener('click',function(){$('#lf-d').value='';montrerDate(false);});
/* Vu avec ma carte : la séance a forcément un jour, proposé à aujourd'hui */
$('#lf-ca').addEventListener('change',function(){if(!this.checked)return;if($('#lf-d-box').hidden)montrerDate(true);if(precDate!=='jour')choisirPrec('jour');});
function openLog(o){
  o=o||{};
  var e=o.id?S.diary.find(function(x){return x.id===o.id;}):null;
  var f=e?film(e.k):(o.k?film(o.k):null);
  logCtx={id:e?e.id:null};
  $('#log-title').textContent=e?'Modifier la séance':'Noter un film';
  $('#lf-t').value=f?f.t:'';$('#lf-y').value=f?f.y:'';
  var an=e&&/^\d{4}$/.test(e.d||'');
  $('#lf-d').value=e&&!an?(e.d||''):'';montrerDate(!!(e&&e.d));choisirPrec(an?'annee':'jour');if(an)$('#lf-an').value=e.d;
  $('#lf-m').value=f&&f.m?fmtDurShort(f.m):'';
  $('#lf-l').checked=e?!!e.l:!!(f&&f.l);
  $('#lf-rw').checked=e?!!e.rw:!!(f&&S.diary.some(function(x){return x.k===f.k;}));
  $('#lf-rv').value=e?(e.rv||''):'';$('#lf-sp').checked=!!(e&&e.sp);
  majCaseCarte();$('#lf-ca').checked=!!(e&&e.ca);
  statsNoter(f);
  $('#lf-tg').value=e?(e.tg||''):'';
  getRating=picker($('#lf-r'),e?(e.r||0):0);
  $('#lf-del').hidden=!e;$('#lf-share').hidden=!e;$('#lf-confirm').hidden=true;$('#lf-err').textContent='';
  fermerSug();
  closeDialog($('#sheet'));
  showDialog($('#log'));
  setTimeout(function(){(f?$('#lf-r'):$('#lf-t')).focus();},60);
}
$('#lf-t').addEventListener('change',function(){var p=splitTitle(this.value,$('#lf-y').value);if(p[0]!==this.value){this.value=p[0];$('#lf-y').value=p[1]||'';}});
$('#logform').addEventListener('submit',function(ev){
  ev.preventDefault();
  var p=splitTitle($('#lf-t').value,$('#lf-y').value.trim()),t=p[0],y=(p[1]||'').trim();
  var err=$('#lf-err');
  if(!t){err.textContent='Donne au moins le titre du film.';$('#lf-t').focus();return;}
  if(y&&!/^\d{4}$/.test(y)){err.textContent='L’année s’écrit avec 4 chiffres, par exemple 1984.';$('#lf-y').focus();return;}
  var mm=parseDur($('#lf-m').value);
  if(mm<0||mm>1500){err.textContent='Durée non comprise. Écris par exemple 1h20, 80 ou 1:20.';$('#lf-m').focus();return;}
  var d=$('#lf-d-box').hidden?'':precDate==='annee'?($('#lf-an').value||''):($('#lf-d').value||''),r=getRating()||null,l=$('#lf-l').checked,rw=$('#lf-rw').checked,rv=$('#lf-rv').value.trim(),tg=$('#lf-tg').value.trim(),sp=!!rv&&$('#lf-sp').checked,ca=!$('#lf-ca-box').hidden&&$('#lf-ca').checked&&d.length===10;
  var tm=logCtx.tmdb&&logCtx.tmdb.t===t&&logCtx.tmdb.y===y?logCtx.tmdb:null,f=null;
  if(tm)f=Object.values(S.films).find(function(x){return x.tm===tm.id;})||null;
  if(!f&&!tm&&!y){var memes=Object.values(S.films).filter(function(x){return norm(x.t)===norm(t);});if(memes.length===1)f=memes[0];}
  if(!f)f=ensureFilm(t,y);
  if(tm){f.tm=tm.id;if(tm.p)f.p=tm.p;if(tm.dr)f.dr=tm.dr;if(!mm&&tm.m&&!f.m)f.m=tm.m;if(tm.fi)appliquerFiche(f,tm.fi);}
  f.w=true;f.wl=null;if(r)f.r=r;if(l)f.l=true;if(mm)f.m=mm;
  if(logCtx.id){var e=S.diary.find(function(x){return x.id===logCtx.id;});if(e){var etaitCoeur=e.l;e.k=f.k;e.d=d;e.r=r;e.l=l;e.rw=rw;e.rv=rv;e.tg=tg;e.sp=sp;e.ca=ca;if(l&&!etaitCoeur)allumerAmpoules();}}
  else{var nid=uid();S.diary.push({id:nid,k:f.k,d:d,r:r,l:l,rw:rw,rv:rv,tg:tg,ts:Date.now(),sp:sp,ca:ca});dernierAjout=nid;if(l)allumerAmpoules();}
  closeDialog($('#log'));
  commit();
  toast(logCtx.id?'Séance modifiée':'« '+f.t+' » ajouté au journal');
});

/* ---------- Dialogue : fiche film ---------- */
var sheetK=null,sheetConfirm=false;
function openSheet(k){if(!film(k))return;sheetK=k;sheetConfirm=false;surbTout=false;renderSheet();showDialog($('#sheet'));}
function renderSheet(){
  var f=film(sheetK);if(!f){closeDialog($('#sheet'));return;}
  var ent=S.diary.filter(function(e){return e.k===f.k;}).sort(function(a,b){return (b.d||'').localeCompare(a.d||'');});
  var opts=S.lists.filter(function(l){return l.items.indexOf(f.k)<0;}).map(function(l){return '<option value="'+esc(l.id)+'">'+esc(l.n)+'</option>';}).join('');
  var inL=S.lists.filter(function(l){return l.items.indexOf(f.k)>=0;}).map(function(l){return esc(l.n);});
  $('#sheet-body').innerHTML='<div class="dh"><span class="sub">Fiche du film</span><button type="button" class="x" data-action="close" aria-label="Fermer">×</button></div>'+
   '<div class="sheet-top">'+poster(f)+'<div><h2>'+esc(f.t)+'</h2><span class="fy">'+esc(f.y||'année inconnue')+'</span>'+(f.dr?'<span class="dr">de '+esc(f.dr)+'</span>':'')+
   '<div class="sheet-acts"><button class="ghost small" type="button" data-action="tlike" aria-pressed="'+!!f.l+'">♥ Coup de cœur</button><button class="ghost small" type="button" data-action="twl" aria-pressed="'+!!f.wl+'">À voir</button></div></div></div>'+
   '<div class="dbody"><div class="fld"><span id="sh-r-l">Ta note</span><div id="sh-r" class="picker" role="slider" tabindex="0" aria-labelledby="sh-r-l" aria-valuemin="0" aria-valuemax="5"></div></div>'+
   '<form class="fld" id="sh-dur" autocomplete="off"><span>Durée</span><div class="durrow"><input name="m" value="'+esc(fmtDurShort(f.m))+'" placeholder="1h30" aria-label="Durée du film"><button class="ghost small" type="submit">Enregistrer</button></div></form>'+
   '<button class="primary" type="button" data-action="logk">+ Ajouter une séance</button>'+
   (S.lists.length?'<div class="fld"><span>Listes</span>'+(inL.length?'<p class="muted" style="margin:0;font-size:14px">Dans '+inL.join(', ')+'</p>':'')+(opts?'<div class="addlist"><select id="sh-list" aria-label="Choisir une liste">'+opts+'</select><button class="ghost" type="button" data-action="tolist">Ajouter</button></div>':'')+'</div>':'')+
   '<div class="fld"><span>Séances</span>'+(ent.length?'<div class="entries">'+ent.map(function(e){return '<div class="entry"><div class="eh"><span class="ed">'+(fmtDate(e.d)||'Vu')+(e.rw?', revu':'')+'</span><span>'+(e.r?'<span class="stars">'+stars(e.r)+'</span> ':'')+(e.l?'<span class="heart">♥</span> ':'')+'<button class="ghost small" type="button" data-action="share" data-id="'+esc(e.id)+'">Partager</button> <button class="ghost small" type="button" data-action="edit" data-id="'+esc(e.id)+'">Modifier</button></span></div>'+(e.rv?critique(e,''):'')+'</div>';}).join('')+'</div>':'<p class="muted" style="margin:0;font-size:14px">Dans tes films vus. Note-le pour qu’il entre dans ton journal.</p>')+'</div>'+
   (sb?'<section class="surb" id="sh-bobine" aria-live="polite"></section>':'')+
   (sheetConfirm?'<div class="confirm">Retirer ce film et ses séances du carnet ? <button class="primary small" type="button" data-action="fkill">Oui, retirer</button><button class="ghost small" type="button" data-action="fnokill">Non</button></div>':'<div><button class="ghost danger small" type="button" data-action="faskkill">Retirer du carnet</button></div>')+
   '</div>';
  picker($('#sh-r'),f.r||0,function(v){f.r=v||null;f.w=true;commit();});
  remplirSurBobine(f);
}

/* ---------- Import Letterboxd ---------- */
function csv(text){return Papa.parse(text,{header:true,skipEmptyLines:true}).data;}
function lbRating(v){var n=parseFloat(String(v||'').replace(',','.'));return n>0&&n<=5?Math.round(n*2)/2:null;}
function importFiles(files){
  var res=$('#impres');
  if(typeof Papa==='undefined'){res.innerHTML='<div class="report">L’outil de lecture n’a pas pu se charger. Recharge la page et réessaie.</div>';return;}
  res.innerHTML='<div class="report">Lecture en cours…</div>';
  var texts={},jobs=[],carnets=[];
  Array.prototype.forEach.call(files,function(f){
    if(/\.zip$/i.test(f.name)){
      if(typeof JSZip==='undefined')return;
      jobs.push(JSZip.loadAsync(f).then(function(z){var inner=[];z.forEach(function(p,e){if(!e.dir&&/\.csv$/i.test(p))inner.push(e.async('string').then(function(s){texts[p]=s;}));});return Promise.all(inner);}));
    }else if(/\.csv$/i.test(f.name)){jobs.push(f.text().then(function(s){texts[f.name]=s;}));}
    else if(/\.json$/i.test(f.name)){jobs.push(f.text().then(function(s){try{carnets.push(JSON.parse(s));}catch(e){}}));}
  });
  Promise.all(jobs).then(function(){
    if(carnets.length&&!Object.keys(texts).length){
      var t={films:0,diary:0,lists:0};
      carnets.forEach(function(x){var c=fusionner(x);t.films+=c.films;t.diary+=c.diary;t.lists+=c.lists;});
      importReport='<div class="report"><b>Carnet Bobine importé.</b><ul><li>'+plural(t.films,'film nouveau','films nouveaux')+'</li><li>'+plural(t.diary,'séance','séances')+'</li><li>'+plural(t.lists,'liste','listes')+'</li></ul></div>';
      commit();toast('Import terminé');setTimeout(rattraper,800);return;
    }
    var rep=mergeLB(texts);
    if(!rep){importReport='<div class="report"><b>Rien à importer.</b> Ce fichier ne ressemble pas à un export Letterboxd. Il faut le .zip téléchargé depuis Settings → Data, ou les fichiers diary.csv, ratings.csv, watched.csv qu’il contient.</div>';render();return;}
    importReport='<div class="report"><b>Bienvenue chez toi.</b> Import terminé.<ul>'+rep+'</ul></div>';
    commit();toast('Import terminé');setTimeout(rattraper,800);
  }).catch(function(){res.innerHTML='<div class="report">Impossible de lire ce fichier. Vérifie que c’est bien le .zip d’export Letterboxd, sans le renommer.</div>';});
}
function mergeLB(texts){
  var paths=Object.keys(texts).filter(function(p){return !/(^|\/)(deleted|orphaned)\//i.test(p);});
  function find(name){return paths.find(function(p){return p.toLowerCase().split('/').slice(-1)[0]===name&&!/(^|\/)(likes|lists)\//i.test(p);});}
  var before=Object.keys(S.films).length,c={diary:0,rv:0,wl:0,lists:0,likes:0},touched=false;
  var watched=find('watched.csv'),ratings=find('ratings.csv'),diary=find('diary.csv'),reviews=find('reviews.csv'),wl=find('watchlist.csv');
  var likes=paths.find(function(p){return /(^|\/)likes\/films\.csv$/i.test(p);});
  var lists=paths.filter(function(p){return /(^|\/)lists\/[^/]+\.csv$/i.test(p);});
  if(watched){touched=true;csv(texts[watched]).forEach(function(r){if(r.Name){ensureFilm(r.Name,r.Year).w=true;}});}
  if(ratings){touched=true;csv(texts[ratings]).forEach(function(r){if(!r.Name)return;var f=ensureFilm(r.Name,r.Year);f.w=true;var v=lbRating(r.Rating);if(v)f.r=v;});}
  var seen={},byUri={};
  S.diary.forEach(function(e){seen[e.k+'#'+e.d]=e;if(e.u)byUri[e.u]=e;});
  function addEntry(r,withReview){
    if(!r.Name)return null;
    var f=ensureFilm(r.Name,r.Year);f.w=true;
    var d=(r['Watched Date']||r.Date||'').slice(0,10),uri=r['Letterboxd URI']||'';
    var e=(uri&&byUri[uri])||seen[f.k+'#'+d];
    var rt=lbRating(r.Rating);
    if(!e){e={id:uid(),k:f.k,d:d,r:rt,l:false,rw:/^yes$/i.test(r.Rewatch||''),rv:'',tg:r.Tags||'',u:uri,ts:Date.now()};S.diary.push(e);seen[f.k+'#'+d]=e;if(uri)byUri[uri]=e;c.diary++;}
    else{if(rt&&!e.r)e.r=rt;}
    if(withReview&&r.Review&&!e.rv){e.rv=r.Review;c.rv++;}
    if(rt&&!f.r)f.r=rt;
    return e;
  }
  if(diary){touched=true;csv(texts[diary]).forEach(function(r){addEntry(r,false);});}
  if(reviews){touched=true;csv(texts[reviews]).forEach(function(r){addEntry(r,true);});}
  if(likes){touched=true;csv(texts[likes]).forEach(function(r){if(r.Name){var f=ensureFilm(r.Name,r.Year);f.l=true;c.likes++;}});}
  if(wl){touched=true;csv(texts[wl]).forEach(function(r){if(r.Name){var f=ensureFilm(r.Name,r.Year);if(!f.w&&!f.wl){f.wl=(r.Date||today()).slice(0,10);c.wl++;}}});}
  lists.forEach(function(p){
    var rows=Papa.parse(texts[p],{skipEmptyLines:true}).data,name='',desc='',items=[],hi=-1,ni=-1,yi=-1;
    for(var i=0;i<rows.length;i++){
      var r=rows[i];
      if(r[0]==='Date'&&r[1]==='Name'&&rows[i+1]){name=rows[i+1][1]||'';desc=rows[i+1][4]||'';i++;continue;}
      if(hi<0&&r.indexOf('Name')>=0&&r.indexOf('Year')>=0){hi=i;ni=r.indexOf('Name');yi=r.indexOf('Year');continue;}
      if(hi>=0&&r[ni]){var f=ensureFilm(r[ni],r[yi]);if(items.indexOf(f.k)<0)items.push(f.k);}
    }
    if(!name)name=p.split('/').pop().replace(/\.csv$/i,'').replace(/[-_]+/g,' ');
    if(!items.length)return;
    touched=true;
    var ex=S.lists.find(function(l){return l.n===name;});
    if(ex){ex.items=items;ex.ds=desc;}else S.lists.push({id:uid(),n:name,ds:desc,items:items});
    c.lists++;
  });
  if(!touched)return null;
  var nf=Object.keys(S.films).length-before;
  return '<li>'+plural(nf,'film nouveau','films nouveaux')+'</li><li>'+plural(c.diary,'séance','séances')+' dans le journal</li><li>'+plural(c.rv,'critique','critiques')+'</li><li>'+plural(c.likes,'coup de cœur','coups de cœur')+'</li><li>'+plural(c.wl,'film','films')+' à voir</li><li>'+plural(c.lists,'liste','listes')+'</li>';
}
function wireDrop(){
  var d=$('#drop'),inp=$('#imp');if(!d)return;
  inp.addEventListener('change',function(){if(inp.files.length)importFiles(inp.files);});
  ['dragenter','dragover'].forEach(function(t){d.addEventListener(t,function(e){e.preventDefault();d.classList.add('over');});});
  ['dragleave','drop'].forEach(function(t){d.addEventListener(t,function(){d.classList.remove('over');});});
  d.addEventListener('drop',function(e){e.preventDefault();if(e.dataTransfer&&e.dataTransfer.files.length)importFiles(e.dataTransfer.files);});
}

/* ---------- Export ---------- */
function exportCSV(){
  var rows=[],inDiary={};
  S.diary.slice().sort(function(a,b){return (a.d||'').localeCompare(b.d||'');}).forEach(function(e){var f=film(e.k);if(!f)return;inDiary[e.k]=1;
    rows.push({Title:f.t,Year:f.y,Rating:e.r||'',WatchedDate:(e.d||'').length===10?e.d:'',Rewatch:e.rw?'Yes':'',Review:e.rv||'',Tags:e.tg||''});});
  Object.values(S.films).forEach(function(f){if(f.w&&!inDiary[f.k])rows.push({Title:f.t,Year:f.y,Rating:f.r||'',WatchedDate:'',Rewatch:'',Review:'',Tags:''});});
  return Papa.unparse(rows,{columns:['Title','Year','Rating','WatchedDate','Rewatch','Review','Tags']});
}
function doExport(kind){
  var msg=$('#expmsg');
  if(!hasData()){msg.textContent='Ton carnet est vide, rien à exporter pour l’instant.';return;}
  var data=kind==='csv'?exportCSV():JSON.stringify(S,null,1),name='bobine-carnet-'+today()+'.'+kind;
  telecharger(new Blob([data],{type:kind==='csv'?'text/csv;charset=utf-8':'application/json'}),name);
  msg.textContent='Fichier '+name+' téléchargé.';
}
function telecharger(blob,name){
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},4000);
}

/* ---------- Actions ---------- */
function addFromForm(form){var p=splitTitle(form.t.value,form.y.value.trim());if(!p[0])return null;if(p[1]&&!/^\d{4}$/.test(p[1])){toast('L’année s’écrit avec 4 chiffres');return null;}return ensureFilm(p[0],p[1]);}
document.addEventListener('submit',function(ev){
  var f=ev.target;
  if(LECTURE){ev.preventDefault();return;}
  if(f.id==='sh-dur'||f.classList.contains('mrow')){
    ev.preventDefault();
    var fk=f.id==='sh-dur'?film(sheetK):film(f.dataset.k),v=parseDur(f.m.value);
    if(!fk)return;
    if(v<0||v>1500){toast('Écris par exemple 1h20, 80 ou 1:20');f.m.focus();return;}
    fk.m=v||null;commit();
    if(f.id==='sh-dur')renderSheet();
    toast(v?'Durée de '+fmtDurShort(v)+' enregistrée':'Durée effacée');
    if(f.id!=='sh-dur')setTimeout(function(){var i=$('.mrow input');if(i)i.focus();},0);
    return;
  }
  if(f.id==='wlform'){ev.preventDefault();var fi=addFromForm(f);if(!fi){f.t.focus();return;}if(fi.w){toast('Tu as déjà vu « '+fi.t+' »');}else{fi.wl=today();commit();toast('Ajouté à ta liste À voir');setTimeout(function(){var i=$('#wlform input');if(i)i.focus();},0);}}
  if(f.id==='lform'){ev.preventDefault();var n=f.n.value.trim();if(!n){f.n.focus();return;}var l={id:uid(),n:n,ds:'',items:[]};S.lists.push(l);openListId=l.id;listConfirm=false;commit();}
  if(f.id==='liform'){ev.preventDefault();var L=S.lists.find(function(x){return x.id===openListId;});var fi2=addFromForm(f);if(!L||!fi2){f.t.focus();return;}if(L.items.indexOf(fi2.k)<0)L.items.push(fi2.k);commit();setTimeout(function(){var i=$('#liform input');if(i)i.focus();},0);}
});
document.addEventListener('input',function(ev){
  if(ev.target.id==='fq'){fq=ev.target.value;gridLimit=120;fillGrid();}
});
document.addEventListener('change',function(ev){
  if(ev.target.id==='fsort'){fsort=ev.target.value;fillGrid();}
});
document.addEventListener('keydown',function(ev){
  if((ev.key==='Enter'||ev.key===' ')&&ev.target.matches&&ev.target.matches('.spoiler')){ev.preventDefault();ev.target.classList.toggle('vu');return;}
  if(!LECTURE&&(ev.key==='Enter'||ev.key===' ')&&ev.target.matches&&ev.target.matches('article.ticket[data-action]')){ev.preventDefault();openLog({id:ev.target.dataset.id});}
});
document.addEventListener('click',function(ev){
  if(!ev.target.closest('#version'))return;
  ev.preventDefault();location.hash='#manifeste';
  setTimeout(function(){var n=$('#nouveautes');if(n)n.scrollIntoView({behavior:'smooth',block:'start'});},150);
});
var EN_LECTURE={sigcrit:1,surbtout:1,spoil:1,apparence:1,theme:1,accent:1,close:1,more:1,gmore:1,ffilter:1,sheet:1,lopen:1,lback:1,compte:1};
document.addEventListener('click',function(ev){
  var a=ev.target.closest('[data-action]');if(!a)return;
  var act=a.dataset.action,L;
  if(LECTURE&&!EN_LECTURE[act])return;
  switch(act){
    case 'log':openLog();break;
    case 'edit':openLog({id:a.dataset.id});break;
    case 'close':closeDialog(a.closest('dialog'));break;
    case 'more':journalLimit+=100;render();break;
    case 'gmore':gridLimit+=200;fillGrid();break;
    case 'ffilter':ffilter=a.dataset.v;$$('.chips button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.v===ffilter);});gridLimit=120;fillGrid();break;
    case 'sheet':openSheet(a.dataset.k);break;
    case 'askdel':$('#lf-confirm').hidden=false;break;
    case 'nodel':$('#lf-confirm').hidden=true;break;
    case 'dodel':S.diary=S.diary.filter(function(x){return x.id!==logCtx.id;});closeDialog($('#log'));commit();toast('Séance supprimée');break;
    case 'seen':openLog({k:a.dataset.k});break;
    case 'unwl':var f1=film(a.dataset.k);if(f1){f1.wl=null;if(!f1.w&&!S.lists.some(function(l){return l.items.indexOf(f1.k)>=0;}))delete S.films[f1.k];commit();}break;
    case 'tlike':var f2=film(sheetK);f2.l=!f2.l;commit();renderSheet();break;
    case 'twl':var f3=film(sheetK);f3.wl=f3.wl?null:today();commit();renderSheet();break;
    case 'logk':openLog({k:sheetK});break;
    case 'tolist':L=S.lists.find(function(l){return l.id===$('#sh-list').value;});if(L&&L.items.indexOf(sheetK)<0){L.items.push(sheetK);commit();renderSheet();toast('Ajouté à « '+L.n+' »');}break;
    case 'faskkill':sheetConfirm=true;renderSheet();break;
    case 'fnokill':sheetConfirm=false;renderSheet();break;
    case 'fkill':var k=sheetK;delete S.films[k];S.diary=S.diary.filter(function(e){return e.k!==k;});S.lists.forEach(function(l){l.items=l.items.filter(function(x){return x!==k;});});closeDialog($('#sheet'));commit();toast('Film retiré');break;
    case 'lopen':openListId=a.dataset.id;listConfirm=false;render();window.scrollTo(0,0);break;
    case 'lback':openListId=null;render();break;
    case 'lup':L=S.lists.find(function(l){return l.id===openListId;});var i=+a.dataset.i;if(L&&i>0){var t=L.items[i-1];L.items[i-1]=L.items[i];L.items[i]=t;commit();}break;
    case 'ldel':L=S.lists.find(function(l){return l.id===openListId;});if(L){L.items.splice(+a.dataset.i,1);commit();}break;
    case 'laskkill':listConfirm=true;render();break;
    case 'lnokill':listConfirm=false;render();break;
    case 'lkill':S.lists=S.lists.filter(function(l){return l.id!==openListId;});openListId=null;listConfirm=false;commit();toast('Liste supprimée');break;
    case 'share':openShare(a.dataset.id);break;
    case 'sharelog':if(logCtx.id)openShare(logCtx.id);break;
    case 'fmt':shareCtx.fmt=a.dataset.v;renderShare();break;
    case 'dosave':doShare();break;
    case 'copycap':copyCaption();break;
    case 'expcsv':doExport('csv');break;
    case 'expjson':doExport('json');break;
    case 'askwipe':confirmWipe=true;render();break;
    case 'nowipe':confirmWipe=false;render();break;
    case 'wipe':var keep=S.updatedAt;S=blank();S.updatedAt=keep;confirmWipe=false;importReport='';commit();toast('Carnet effacé');break;
    case 'login':seConnecter();break;
    case 'logout':closeDialog($('#compte-dlg'));seDeconnecter();break;
    case 'spoil':a.classList.toggle('vu');break;
    case 'apparence':ouvrirApparence();break;
    case 'dem':ouvrirDem();break;
    case 'rwl':case 'rwlall':case 'rexcl':actionReal(act,a);break;
    case 'storyan':openShareAnnee(a.dataset.y);break;
    case 'infoprive':closeDialog($('#info'));ouvrirCompte();break;
    case 'carteedit':carteEdit=true;render();setTimeout(function(){var i=$('#carteform input');if(i)i.focus();},0);break;
    case 'cartenon':carteEdit=false;render();break;
    case 'cartesuppr':enregistrerCarte(null,null);break;
    case 'rlnext':case 'rlgo':case 'rlnote':case 'topwl':actionRoulette(act,a);break;
    case 'sigcrit':signalerCritique(a.dataset.n);break;
    case 'surbtout':surbTout=true;var fs=film(sheetK);if(fs){var cs=FB[cleFB(fs)];$('#sh-bobine').innerHTML=htmlSurBobine(fs,cs&&cs.d);}break;
    case 'lwl':var f5=film(a.dataset.k);if(f5&&!f5.w){f5.wl=today();commit();toast('« '+f5.t+' » ajouté à À voir');}break;
    case 'theme':choisirApparence(a.dataset.v,null);break;
    case 'accent':choisirApparence(null,a.dataset.v);break;
    case 'compte':case 'cptcopie':case 'cptsuppr':case 'cptnon':actionCompte(act);break;
    case 'fzfiltre':case 'fzsuppr':case 'fzsignal':case 'fzmod':case 'fztraite':case 'fzban':case 'fzregle':case 'fzrouvrir':case 'fzsupconv':case 'fzsupconvok':case 'fzcrit':actionForum(act,a);break;
  }
});
window.addEventListener('beforeunload',function(ev){if(Store.mode==='db'&&(Store.saving||$('#sync').dataset.s==='pending')){flush();ev.preventDefault();ev.returnValue='';}});
window.addEventListener('hashchange',function(){if(route()!=='listes')openListId=null;confirmWipe=false;render();window.scrollTo(0,0);});

/* ---------- Démarrage ---------- */
$('#version').textContent='v'+VERSION;
if(LECTURE){
  document.body.classList.add('lecture');$('#sync').style.display='none';
  render();renderCompte();chargerLecture();
  setTimeout(function(){compterUneFois('bobine.vis','visite');compterUneFois('bobine.carnet.'+LECTURE.toLowerCase(),'carnet',LECTURE);presRejoindre();},1500);
}else{
  var cached=lsGet(LS);if(cached)S=upgrade(cached);
  render();renderCompte();brancherSug();
  connect();
  if(!sb)setTimeout(rattraper,1500);
}
})();
