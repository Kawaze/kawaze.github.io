/* Bobine : le carnet ciné. Repris du prototype v0, branché sur Supabase (même compte Twitch que Kawaze Paris et le Kawazino). */
(function(){
'use strict';
var MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
var MOIS_C=['JANV','FÉVR','MARS','AVR','MAI','JUIN','JUIL','AOÛT','SEPT','OCT','NOV','DÉC'];
var MOIS_I=['J','F','M','A','M','J','J','A','S','O','N','D'];
var PAL=['#2c3b57','#7b2d33','#35553e','#6d5216','#4b2d55','#1d5160','#8b3d17','#3a3a40','#5d3b2c','#3a4b80','#5a5f2a','#6a2c4a'];
var VERSION='1.5';
var NOUVEAUTES=[
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
var ROUTES=[['journal','Journal'],['films','Films'],['a-voir','À voir'],['listes','Listes'],['bilan','Bilan'],['forum','Forum'],['demenager','Déménager'],['manifeste','Manifeste']];

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
function monthLabel(ym){var p=ym.split('-');if(!p[1])return 'Vus';return MOIS[+p[1]-1]+' '+p[0];}
function fmtDate(d){if(!d)return '';var p=d.split('-');return +p[2]+' '+MOIS[+p[1]-1]+' '+p[0];}

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
function setStatus(s){var c=$('#sync');c.dataset.s=s;c.lastElementChild.textContent=STATUS[s]||s;}
function timeout(p,ms){return new Promise(function(res,rej){var t=setTimeout(function(){rej({code:'timeout'});},ms);p.then(function(v){clearTimeout(t);res(v);},function(e){clearTimeout(t);rej(e);});});}

function commit(opts){
  if(LECTURE){render();return;}
  S.updatedAt=Date.now();lsSet();
  if(Store.mode==='db'){clearTimeout(Store.timer);setStatus('pending');Store.timer=setTimeout(flush,900);}
  if(!opts||!opts.norender)render();
}

/* Ce qui est comparé pour savoir si un élément a changé */
function sigFilm(f){return JSON.stringify([f.t,f.y,f.r||null,!!f.l,!!f.w,f.wl||null,f.m||null,f.tm==null?null:f.tm,f.p||null,f.dr||null]);}
function sigSeance(e){return JSON.stringify([e.k,e.d||'',e.r||null,!!e.l,!!e.rw,e.rv||'',e.tg||'',e.u||'']);}
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
  S.diary.forEach(function(e){ids[e.id]=1;if(L.diary[e.id]!==sigSeance(e))c.seances.push({id:e.id,k:e.k,d:e.d||'',r:e.r||null,l:!!e.l,rw:!!e.rw,rv:e.rv||'',tg:e.tg||'',u:e.u||'',ts:e.ts||null});});
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
  x.diary.forEach(function(e){if(!e||!e.k||!S.films[e.k]||ids[e.id]||lieu[e.k+'#'+(e.d||'')]&&!e.rv)return;S.diary.push({id:e.id||uid(),k:e.k,d:e.d||'',r:e.r||null,l:!!e.l,rw:!!e.rw,rv:e.rv||'',tg:e.tg||'',u:e.u||'',ts:e.ts||Date.now()});ids[e.id]=1;c.diary++;});
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
function changerCompte(id){
  if(!id){
    if(Store.mode==='db'){lsDel('bobine.compte.'+Store.user);Store.mode='local';Store.user=null;Store.profil=null;Store.last=null;S=upgrade(lsGet(LS));render();}
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
    setTimeout(rattraper,1500);chargerNotifs();
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
  if(!liste.length)return;
  ratt=true;var i=0,ajoutes=0,gros=liste.length>15;
  if(gros)toast('Recherche des affiches pour '+plural(liste.length,'film','films')+'…');
  (function suivant(){
    var lot=liste.slice(i,i+20);i+=20;
    if(!lot.length){ratt=false;commit();if(gros)toast(plural(ajoutes,'affiche ajoutée','affiches ajoutées')+' depuis TMDB');return;}
    timeout(fetch(TMDB_FN,{method:'POST',headers:{'Content-Type':'application/json',apikey:CFG.cle||''},body:JSON.stringify({films:lot.map(function(f){return {k:f.k,t:f.t,y:f.y};})})}).then(function(r){return r.json();}),30000)
    .then(function(d){
      (d.films||[]).forEach(function(r){
        var f=S.films[r.k];if(!f||r.id===null||r.id===undefined)return;
        f.tm=r.id||0;
        if(r.id){if(r.p)f.p=r.p;if(r.dr)f.dr=r.dr;if(!f.m&&r.m)f.m=r.m;ajoutes++;}
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
  if(it.local){var f=film(it.k);logCtx.tmdb=null;if(f&&f.m&&!$('#lf-m').value)$('#lf-m').value=fmtDurShort(f.m);$('#lf-r').focus();return;}
  logCtx.tmdb={id:it.tm,t:it.t,y:it.y||'',p:it.p};
  $('#lf-r').focus();
  tmdbGet({id:it.tm}).then(function(d){
    var fi=d&&d.fiche;if(!fi||!logCtx.tmdb||logCtx.tmdb.id!==it.tm)return;
    logCtx.tmdb.m=fi.m;logCtx.tmdb.dr=fi.dr;if(fi.p)logCtx.tmdb.p=fi.p;
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
    '<p class="muted petit">'+(reglages.prive?'Ton carnet est privé, ce lien n’affiche rien aux autres.':'Toute personne qui a ce lien peut lire ton carnet. Il n’apparaît nulle part ailleurs.')+'</p></div>'+
    '<label class="tog large"><input type="checkbox" id="cpt-prive"'+(reglages.prive?' checked':'')+'><span>Carnet privé</span></label>'+
    '<div class="fld"><span>Tes données</span><p class="muted petit"><a href="#contact" data-action="close">Écrire à l’équipe</a><br><a href="#demenager" data-action="close">Exporter tout ton carnet</a><br><a href="#confidentialite" data-action="close">Confidentialité</a></p></div>'+
    (confirmSuppr===0?'<button type="button" class="ghost danger" data-action="cptsuppr">Supprimer mon carnet</button>':
     '<div class="confirm">'+(confirmSuppr===1?'Tout ton carnet sera effacé, films, séances, critiques et listes, ainsi que tes messages du forum et ta conversation avec l’équipe. Ton compte Twitch et tes centimes Kawaze Games ne bougent pas.':'Dernière confirmation, ça ne se rattrape pas.')+
     ' <button type="button" class="primary small" data-action="cptsuppr">'+(confirmSuppr===1?'Continuer':'Oui, tout effacer')+'</button> <button type="button" class="ghost small" data-action="cptnon">Non</button></div>')+
    '<div class="df"><button type="button" class="ghost" data-action="logout">Déconnexion</button><span class="sp"></span><button type="button" class="primary" data-action="close">Fermer</button></div>';
}
document.addEventListener('change',function(ev){
  if(ev.target.id!=='cpt-prive')return;
  var v=ev.target.checked;ev.target.disabled=true;
  sb.rpc('bobine_rendre_prive',{p_prive:v}).then(function(r){
    if(r.error){toast('Impossible de changer, réessaie');reglages.prive=!v;}else{reglages.prive=v;toast(v?'Ton carnet est privé':'Ton carnet est public pour qui a le lien');}
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
function nomDe(a){return '<b>'+esc((a&&a.pseudo)||'Membre')+'</b>'+(a&&a.admin?'<span class="badge-eq">équipe</span>':'');}
function pastille(n){return n?'<span class="pastille" aria-label="'+n+' à lire">'+n+'</span>':'';}

/* Pastilles de non-lus (onglets Forum et Admin) */
var notifT=null;
function chargerNotifs(){
  clearTimeout(notifT);
  if(!sb||LECTURE)return;
  timeout(sb.rpc('bobine_notifs'),10000).then(function(r){
    if(r.error)return;
    var n=r.data||{},avant=JSON.stringify(FZ.notifs),etaitAdmin=FZ.notifs.admin;FZ.notifs={admin:!!n.admin,contact:n.contact||0,a_traiter:n.a_traiter||0};
    if(FZ.notifs.admin!==etaitAdmin&&/^#admin/.test(location.hash))render();
    else if(JSON.stringify(FZ.notifs)!==avant)renderTabs();
  },function(){}).then(function(){notifT=setTimeout(chargerNotifs,60000);});
}

/* ---- Vues ---- */
function vueForum(){
  var p=routeParam();
  if(p==='nouveau')return vueNouveauSujet();
  if(p)return '<div id="fz"><p class="muted">Chargement du sujet…</p></div>';
  var chip=function(id,l){return '<button type="button" data-action="fzfiltre" data-v="'+id+'" aria-pressed="'+(FZ.filtre===id)+'">'+l+'</button>';};
  return '<div class="viewhead"><h2>Forum</h2><p class="sub">idées, bugs et discussions</p></div>'+
    '<div class="btnrow fz-actions">'+(connecte()?'<a class="primary" href="#forum/nouveau">Ouvrir un sujet</a><a class="ghost" href="#contact">Écrire à l’équipe'+pastille(FZ.notifs.contact)+'</a>':'<button class="primary" type="button" data-action="login">Se connecter pour écrire</button>')+'</div>'+
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
  if(!connecte())return '<div class="viewhead"><h2>Écrire à l’équipe</h2></div><div class="card-box"><p>Connecte-toi avec Twitch pour écrire à l’équipe.</p><button class="primary" type="button" data-action="login">Se connecter avec Twitch</button></div>';
  return '<p class="fz-retour"><a href="#forum">← Forum</a></p><div class="viewhead"><h2>Écrire à l’équipe</h2></div>'+
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
  if(p)return '<p class="fz-retour"><a href="#admin">← Admin</a></p><div id="fz"><p class="muted">Chargement…</p></div>';
  return '<div class="viewhead"><h2>Admin</h2><p class="sub">visible par toi seul</p></div>'+
    '<section class="card-box"><h3>Messages privés</h3><div id="fz-conv"><p class="muted">Chargement…</p></div></section>'+
    '<section class="card-box"><h3>Signalements</h3><div id="fz-sign"><p class="muted">Chargement…</p></div></section>';
}
function remplirAdmin(){
  var c=$('#fz-conv'),g=$('#fz-sign');
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
    bulles(x.messages,'admin')+
    '<form class="fz-form" id="fz-admrep"><label class="fld"><span>Ta réponse</span><textarea name="t" rows="4" maxlength="4000" required></textarea></label><div class="df"><span class="sp"></span><button class="primary" type="submit">Répondre</button></div></form>';
}

/* ---- Chargements après l'affichage d'une vue ---- */
function apresRendu(r){
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
    if(u){appel('bobine_admin_conversation',{p_user:u}).then(function(d){FZ.adm.une=d;remplirConvAdmin();chargerNotifs();});return;}
    Promise.all([appel('bobine_admin_conversations'),appel('bobine_admin_signalements')]).then(function(d){FZ.adm.conv=d[0]||[];FZ.adm.sign=d[1]||[];if(route()==='admin'&&!routeParam())remplirAdmin();});
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
    zone.innerHTML='<form class="fz-sig" data-id="'+esc(a.dataset.id)+'"><input name="r" maxlength="300" placeholder="Pourquoi ? (facultatif)" aria-label="Raison du signalement"><button class="ghost small" type="submit">Signaler</button></form>';
    zone.querySelector('input').focus();
  }
  if(act==='fzmod'){
    appel('bobine_moderer',{p_quoi:a.dataset.quoi,p_id:+a.dataset.id,p_action:a.dataset.act}).then(function(){FZ.liste=null;toast('C’est fait');apresRendu(route());chargerNotifs();},function(e){toast(erreurRpc(e));});
  }
  if(act==='fztraite'){appel('bobine_admin_traiter',{p_id:+a.dataset.id}).then(function(){apresRendu('admin');chargerNotifs();},function(e){toast(erreurRpc(e));});}
  if(act==='fzban'){
    var oui=a.dataset.v==='1';
    if(oui&&a.dataset.ok!=='1'){a.dataset.ok='1';a.textContent='Sûr ? Re-clique';return;}
    appel('bobine_bannir',{p_user:a.dataset.u,p_banni:oui}).then(function(){toast(oui?'Exclu du forum':'Réintégré au forum');apresRendu(route());},function(e){toast(erreurRpc(e));});
  }
}

/* ---------- Rendu ---------- */
var journalLimit=60,gridLimit=120,fq='',fsort='recent',ffilter='all',openListId=null,confirmWipe=false,listConfirm=false,importReport='';

function route(){var h=location.hash.slice(1).split('/')[0];if(h==='confidentialite')return h;if(LECTURE&&(h==='demenager'||h==='forum'||h==='contact'||h==='admin'))return 'journal';if(h==='contact'||(h==='admin'&&FZ.notifs.admin))return h;return ROUTES.some(function(r){return r[0]===h;})?h:'journal';}
function renderTabs(){var r=route(),onglets=ROUTES.filter(function(x){return !(LECTURE&&(x[0]==='demenager'||x[0]==='forum'));});if(!LECTURE&&FZ.notifs.admin)onglets=onglets.concat([['admin','Admin']]);$('#tabs').innerHTML=onglets.map(function(x){return '<li><a href="#'+x[0]+'"'+(x[0]===r||(x[0]==='forum'&&r==='contact')?' aria-current="page"':'')+'>'+x[1]+(x[0]==='forum'?pastille(FZ.notifs.contact):x[0]==='admin'?pastille(FZ.notifs.a_traiter):'')+'</a></li>';}).join('');}
function renderAffiche(){
  var films=Object.values(S.films).filter(function(f){return f.w;}).length;
  var rv=S.diary.filter(function(e){return e.rv;}).length;
  var t=screenTime();
  $('#affiche').textContent=plural(films,'film','films')+" à l'affiche, "+fmtDur(t.total)+' devant l’écran, '+plural(S.diary.length,'séance','séances')+', '+plural(rv,'critique','critiques');
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
  v.innerHTML=VIEWS[r]();
  if(r==='films')fillGrid();
  if(r==='demenager')wireDrop();
  updateDatalist();
  apresRendu(r);
}
function poster(f,cls){
  var c=PAL[hash(f.k||f.t||'')%PAL.length],L=(f.t||'').length;
  var sz=L<=6?'s':L<=14?'m':L<=28?'l':'xl';
  var img=f.p?'<img src="'+IMG+(cls==='mini'?'w92':'w342')+esc(f.p)+'" alt="" loading="lazy" decoding="async" onerror="this.remove()">':'';
  return '<div class="poster '+(cls||'')+' sz-'+sz+(f.p?' has-img':'')+'" style="--pc:'+c+'" aria-hidden="true"><span class="pt">'+esc(f.t)+'</span><span class="py">'+esc(f.y)+'</span>'+img+'</div>';
}
function ticket(e,f,example){
  var p=(e.d||'').split('-');
  var attrs=example?'':' data-action="edit" data-id="'+esc(e.id)+'" tabindex="0" role="button" aria-label="Modifier la séance de '+esc(f.t)+'"';
  return '<article class="ticket'+(example?' example':'')+'"'+attrs+'>'+
    (e.d?'<div class="stub"><span class="day">'+(p[2]?+p[2]:'?')+'</span><span class="mon">'+(p[1]?MOIS_C[+p[1]-1]:'')+'</span><span class="yr">'+(p[0]||'')+'</span></div>':'<div class="stub nodate"><span class="mon">vu</span></div>')+
    '<div class="tbody"><h4>'+esc(f.t)+' <span class="fy">'+esc(f.y)+'</span></h4>'+
    '<div class="meta">'+(e.r?'<span class="stars" aria-label="'+ratingWords(e.r)+'">'+stars(e.r)+'</span>':'')+(e.l?'<span class="heart" aria-label="Coup de cœur">♥</span>':'')+(e.rw?'<span class="tag">revu</span>':'')+((f.m||e.m)?'<span class="dur-tag">'+fmtDurShort(f.m||e.m)+'</span>':'')+(example?'<span class="tag ex">exemple</span>':'')+'</div>'+
    (e.rv?'<p class="rv">'+esc(e.rv)+'</p>':'')+'</div>'+poster(f,'mini')+'</article>';
}

var VIEWS={
journal:function(){
  if(!S.diary.length){
    var ex1={k:'ex1',t:'Les Glaneurs et la Glaneuse',y:'2000'},ex2={k:'ex2',t:'Paris, Texas',y:'1984'};
    var anyFilms=Object.keys(S.films).length;
    return '<section class="hello"><h2>Ton carnet est vide.</h2>'+
      '<p>'+(anyFilms?'Tes films sont là, mais ton journal est encore vide. Note le prochain film que tu regardes.':'Ramène tout ton historique Letterboxd en une fois, ou commence par le dernier film que tu as vu. Tout reste à toi et sort en un clic.')+'</p>'+
      '<div class="actions"><button class="primary" type="button" data-action="log">Noter un film</button><a class="ghost" href="#demenager">Déménager depuis Letterboxd</a></div>'+
      (sb&&Store.mode!=='db'?'<p class="invite">Connecte-toi avec Twitch pour retrouver ton carnet sur tous tes appareils. Sans compte, il reste sur cet appareil.</p>':'')+
      '<h3 class="month">Aperçu</h3>'+
      ticket({d:'2026-11-14',r:4.5,l:true,rv:'Varda ramasse ce que le monde jette et en fait un film sur nous tous.'},ex1,true)+
      ticket({d:'2026-11-02',r:4,rw:true,rv:'Le plan du peep-show, vu en salle cette fois. Rien à ajouter.'},ex2,true)+
      '</section>';
  }
  var list=S.diary.slice().sort(function(a,b){return (b.d||'').localeCompare(a.d||'')||(b.ts||0)-(a.ts||0);});
  var h='<div class="viewhead"><h2>Journal</h2><p class="sub">'+plural(list.length,'séance','séances')+'</p></div>',cur=null;
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
  if(!n)return '<div class="viewhead"><h2>Films</h2></div><div class="card-box"><h3>Aucun film vu pour l’instant</h3><p>Chaque film que tu notes ou que tu importes apparaît ici, avec son affiche.</p><div class="btnrow"><button class="primary" type="button" data-action="log">Noter un film</button><a class="ghost" href="#demenager" style="text-decoration:none;color:inherit">Importer</a></div></div>';
  var chip=function(id,l){return '<button type="button" data-action="ffilter" data-v="'+id+'" aria-pressed="'+(ffilter===id)+'">'+l+'</button>';};
  return '<div class="viewhead"><h2>Films</h2><p class="sub" id="fcount"></p></div>'+
   '<div class="controls"><input type="search" id="fq" placeholder="Chercher un titre ou une année" value="'+esc(fq)+'" aria-label="Chercher un film">'+
   '<select id="fsort" aria-label="Trier"><option value="recent"'+(fsort==='recent'?' selected':'')+'>Vus récemment</option><option value="note"'+(fsort==='note'?' selected':'')+'>Ta note</option><option value="titre"'+(fsort==='titre'?' selected':'')+'>Titre</option><option value="annee"'+(fsort==='annee'?' selected':'')+'>Année de sortie</option></select></div>'+
   '<div class="chips">'+chip('all','Tous')+chip('liked','♥ Coups de cœur')+chip('unrated','Sans note')+chip('rated5','★★★★★')+'</div>'+
   '<div class="grid" id="fgrid"></div><div id="fmore"></div>';
},
'a-voir':function(){
  var arr=Object.values(S.films).filter(function(f){return f.wl;}).sort(function(a,b){return (b.wl||'').localeCompare(a.wl||'');});
  var h='<div class="viewhead"><h2>À voir</h2><p class="sub">'+plural(arr.length,'film','films')+'</p></div>'+
   '<form class="inline-form" id="wlform" autocomplete="off"><input name="t" placeholder="Titre du film" aria-label="Titre" list="known"><input class="y" name="y" placeholder="Année" inputmode="numeric" maxlength="4" aria-label="Année"><button class="primary" type="submit">Ajouter</button></form>';
  if(!arr.length)return h+'<p class="muted">Rien en attente. Ajoute les films qu’on t’a conseillés, ou importe ta watchlist Letterboxd.</p>';
  return h+'<div class="grid">'+arr.slice(0,240).map(function(f){
    return '<div class="card">'+poster(f)+'<span class="ct" title="'+esc(f.t)+'">'+esc(f.t)+'</span><div class="card-actions"><button class="primary small" type="button" data-action="seen" data-k="'+esc(f.k)+'">Vu</button><button class="ghost small" type="button" data-action="unwl" data-k="'+esc(f.k)+'" aria-label="Retirer '+esc(f.t)+' de la liste">Retirer</button></div></div>';
  }).join('')+'</div>'+(arr.length>240?'<p class="muted">Et '+fmtN(arr.length-240)+' autres.</p>':'');
},
listes:function(){
  var L=openListId&&S.lists.find(function(l){return l.id===openListId;});
  if(L){
    var rows=L.items.map(function(k,i){var f=film(k)||{k:k,t:'?',y:''};
      return '<div class="lrow"><span class="n">'+(i+1)+'</span>'+poster(f,'mini')+'<span class="lt">'+esc(f.t)+' <span class="fy">'+esc(f.y)+'</span></span><span class="acts">'+(i>0?'<button class="icon" type="button" data-action="lup" data-i="'+i+'" aria-label="Monter">↑</button>':'')+'<button class="icon" type="button" data-action="ldel" data-i="'+i+'" aria-label="Retirer de la liste">×</button></span></div>';}).join('');
    return '<button class="back" type="button" data-action="lback">← Toutes les listes</button>'+
     '<div class="viewhead"><h2>'+esc(L.n)+'</h2><p class="sub">'+plural(L.items.length,'film','films')+'</p></div>'+
     (L.ds?'<p class="muted" style="margin-top:-6px">'+esc(L.ds)+'</p>':'')+
     '<form class="inline-form" id="liform" autocomplete="off"><input name="t" placeholder="Ajouter un film" aria-label="Titre" list="known"><input class="y" name="y" placeholder="Année" inputmode="numeric" maxlength="4" aria-label="Année"><button class="primary" type="submit">Ajouter</button></form>'+
     '<div class="lrows">'+(rows||'<p class="muted">Liste vide. Ajoute ton premier film ci-dessus.</p>')+'</div>'+
     '<div style="margin-top:22px">'+(listConfirm?'<div class="confirm">Supprimer la liste « '+esc(L.n)+' » ? <button class="primary small" type="button" data-action="lkill">Oui, supprimer</button><button class="ghost small" type="button" data-action="lnokill">Non</button></div>':'<button class="ghost danger small" type="button" data-action="laskkill">Supprimer la liste</button>')+'</div>';
  }
  var h='<div class="viewhead"><h2>Listes</h2><p class="sub">'+plural(S.lists.length,'liste','listes')+'</p></div>'+
   '<form class="inline-form" id="lform" autocomplete="off"><input name="n" placeholder="Nom de la liste, ex. Mes Varda préférés" aria-label="Nom de la liste"><button class="primary" type="submit">Créer</button></form>';
  if(!S.lists.length)return h+'<p class="muted">Pas encore de liste. Tes listes Letterboxd arrivent aussi avec l’import.</p>';
  return h+'<div class="lists">'+S.lists.map(function(l){
    var st=l.items.slice(0,4).map(function(k){var f=film(k);return f?poster(f):'';}).join('')||'<span class="empty"></span>';
    return '<button class="lcard" type="button" data-action="lopen" data-id="'+esc(l.id)+'"><div class="stack">'+st+'</div><div><h3>'+esc(l.n)+'</h3><p class="sub" style="margin-top:4px">'+plural(l.items.length,'film','films')+'</p></div></button>';
  }).join('')+'</div>';
},
bilan:function(){
  var films=Object.values(S.films).filter(function(f){return f.w;});
  if(!films.length)return '<div class="viewhead"><h2>Bilan</h2></div><p class="muted">Le bilan se remplit dès que tu as noté quelques films.</p>';
  var Y=new Date().getFullYear(),ys=String(Y);
  var ty=S.diary.filter(function(e){return (e.d||'').slice(0,4)===ys;});
  var rated=films.filter(function(f){return f.r;});
  var avg=rated.length?rated.reduce(function(s,f){return s+f.r;},0)/rated.length:0;
  var likes=films.filter(function(f){return f.l;}).length;
  var rv=S.diary.filter(function(e){return e.rv;}).length;
  var tile=function(v,l){return '<div class="tile"><b>'+v+'</b><span>'+l+'</span></div>';};
  var st=screenTime(ys),days=st.total/1440;
  var h='<div class="viewhead"><h2>Bilan</h2><p class="sub">tout ton carnet</p></div>'+
    '<section class="clock" aria-label="Compteur d’heures"><span class="lbl">Temps passé devant l’écran</span><span class="big">'+fmtDur(st.total)+'</span>'+
    '<span class="lbl">depuis ton premier film'+(days>=1?', soit '+days.toFixed(1).replace('.',',')+' jours':'')+(st.unknown?', durée inconnue pour '+plural(st.unknown,'séance','séances'):'')+'</span></section>'+
    '<div class="tiles">'+
    tile(fmtN(films.length),'films vus')+tile(fmtN(S.diary.length),'séances')+tile(avg?avg.toFixed(2).replace('.',','):'–','note moyenne sur 5')+tile(fmtN(likes),'coups de cœur')+tile(fmtN(rv),'critiques écrites')+'</div>';
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
    h+='<section class="card-box"><h3>Durées à compléter</h3><p>Letterboxd n’exporte pas les durées. Remplis-les ici pour ton compteur. Plus tard, la base de films les remplira toute seule.</p>'+
      '<p class="sub" style="margin-bottom:10px">'+plural(miss.length,'film','films')+' sans durée</p><div class="miss">'+
      miss.slice(0,15).map(function(f){return '<form class="mrow" data-k="'+esc(f.k)+'" autocomplete="off"><span class="lt">'+esc(f.t)+' <span class="fy">'+esc(f.y)+'</span></span><input name="m" placeholder="1h30" aria-label="Durée de '+esc(f.t)+'"><button class="ghost small" type="submit">OK</button></form>';}).join('')+'</div></section>';
  }
  return h;
},
demenager:function(){
  return '<div class="viewhead"><h2>Déménager</h2><p class="sub">tes données, ton carnet</p></div>'+
   '<section class="card-box"><h3>Arriver depuis Letterboxd</h3>'+
   '<ol class="steps"><li>Sur le site letterboxd.com (pas l’appli), va dans <b>Settings → Data → Export your data</b>.</li><li>Tu récupères un fichier <b>.zip</b>.</li><li>Dépose-le ici tel quel. Journal, notes, critiques, coups de cœur, watchlist et listes arrivent d’un coup. Le fichier est lu dans ton navigateur, seul ton carnet est enregistré.</li></ol>'+
   '<label class="drop" id="drop"><input type="file" id="imp" accept=".zip,.csv,.json,application/zip,text/csv,application/json" multiple><span class="dt">Choisir le .zip</span><span class="ds">ou des fichiers .csv, ou un carnet Bobine .json, ou glisse-les ici</span></label>'+
   '<div id="impres" aria-live="polite">'+importReport+'</div></section>'+
   '<section class="card-box"><h3>Repartir quand tu veux</h3><p>Ton carnet entier, à tout moment. Le CSV se réimporte dans Letterboxd et dans la plupart des autres sites.</p>'+
   '<div class="btnrow"><button class="primary" type="button" data-action="expcsv">Exporter en CSV</button><button class="ghost" type="button" data-action="expjson">Exporter en JSON</button></div><p class="muted" id="expmsg" style="margin:10px 0 0;font-size:14px"></p></section>'+
   '<section class="card-box"><h3>Tout effacer</h3><p>Vide ton carnet sur Bobine. Pense à exporter avant.</p>'+
   (confirmWipe?'<div class="confirm">Effacer définitivement tout le carnet ? <button class="primary small" type="button" data-action="wipe">Oui, tout effacer</button><button class="ghost small" type="button" data-action="nowipe">Non</button></div>':'<button class="ghost danger" type="button" data-action="askwipe">Effacer le carnet</button>')+'</section>';
},
manifeste:function(){
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
  '<div><span class="st">Ensuite</span><span>Mode salle obscure, ticket qui se détache, spoilers floutés</span></div>'+
  '<div><span class="st">Ensuite</span><span>Bilan en story, défis et succès, roulette À voir</span></div>'+
  '<div><span class="st">Plus tard</span><span>Ton carnet lisible depuis Mastodon et le reste du fédivers</span></div>'+
  '</div></section>'+
  '<section class="card-box" id="nouveautes"><h3>Nouveautés</h3><div class="roadmap">'+
  NOUVEAUTES.map(function(n){return '<div><span class="st ok">v'+n[0]+'</span><span>'+esc(n[1])+'</span></div>';}).join('')+
  '</div></section></article>';
},
forum:function(){return vueForum();},
contact:function(){return vueContact();},
admin:function(){return vueAdmin();},
confidentialite:function(){
  return '<article class="manifesto"><div class="viewhead"><h2>Confidentialité</h2></div>'+
  '<p class="lead">Bobine garde le strict nécessaire, et tu peux tout reprendre ou tout effacer quand tu veux.</p>'+
  '<section class="card-box"><h3>Qui s’en occupe</h3><p>Bobine est un projet perso de Kawaze, sans entreprise derrière et sans revenus. Pour toute question sur tes données, utilise Écrire à l’équipe, depuis le Forum.</p></section>'+
  '<section class="card-box"><h3>Ce que Bobine garde</h3><p>Ton pseudo et ton image de profil Twitch, et un identifiant technique de compte. Rien d’autre sur toi, ni mail, ni âge, ni vrai nom.</p><p>Ton carnet, c’est à dire les films, notes, critiques, tags, listes, films à voir, et la date de visionnage quand tu choisis de l’ajouter.</p><p>Tes messages sur le forum, publics et signés de ton pseudo, et ta conversation avec l’équipe, que seuls toi et l’équipe lisez. Il n’y a pas de messages privés entre membres.</p><p>Jamais de lieu, d’adresse ou de position.</p></section>'+
  '<section class="card-box"><h3>Qui voit ton carnet</h3><p>Ton carnet est public, mais seulement pour qui a son lien. Il n’y a pas d’annuaire des membres, pas de recherche de profils et pas de référencement sur Google.</p><p>Tu peux le passer en privé à tout moment depuis ton compte. Un carnet privé n’est plus visible par personne d’autre que toi.</p></section>'+
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
  x.fillStyle=ink;x.font='900 64px '+disp;x.textAlign='left';x.fillText('BOBINE',M,318);
  x.font='500 24px '+mono;x.fillStyle=grey;x.textAlign='right';x.fillText((e.rv?'CRITIQUE':'SÉANCE')+(e.d?'  '+fmtDate(e.d).toUpperCase():''),W-M,312);
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
  if(e.rv){
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
  var rv=e.rv?'\n« '+(e.rv.length>180?e.rv.slice(0,178).trimEnd()+'…':e.rv)+' »':'';
  return head+rv+'\n'+(SITE_URL?SITE_URL+' ':'')+'#Bobine #cinema';
}
function renderShare(){
  var e=S.diary.find(function(x){return x.id===shareCtx.id;});if(!e)return;
    var cv=buildCard(e);
  $('#sh-img').src=cv.toDataURL('image/png');
  shareCtx.blob=null;cv.toBlob(function(b){shareCtx.blob=b;},'image/png');
}
function openShare(id){
  shareCtx.id=id;$('#sh-msg').textContent='Sur téléphone, l’image s’ouvre dans le menu de partage. Choisis Instagram, puis Story.';
  closeDialog($('#log'));closeDialog($('#sheet'));showDialog($('#share'));
  var fonts=['900 86px "Big Shoulders Display"','800 60px "Big Shoulders Display"','500 40px "Instrument Sans"','500 28px "IBM Plex Mono"'];
  var ready=(document.fonts&&document.fonts.load)?Promise.all(fonts.map(function(s){return document.fonts.load(s).catch(function(){});})):Promise.resolve();
  var se=S.diary.find(function(x){return x.id===id;});ready=Promise.all([ready,chargerAffiche(se&&film(se.k))]);
  timeout(ready,2500).catch(function(){}).then(renderShare);
}
function slug(s){return norm(s).replace(/\s+/g,'-').slice(0,40)||'film';}
function doShare(){
  var e=S.diary.find(function(x){return x.id===shareCtx.id;}),msg=$('#sh-msg');if(!e)return;
  var f=film(e.k)||{t:'film'},name='bobine-'+slug(f.t)+'-story.png';
  var go=function(blob){
    var file=null;try{file=new File([blob],name,{type:'image/png'});}catch(err){}
    if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
      navigator.share({files:[file],text:caption(e)}).then(function(){msg.textContent='Partagé.';},function(err){if(err&&err.name==='AbortError')return;saveFile(blob,name);});
      return;
    }
    saveFile(blob,name);
  };
  if(shareCtx.blob)go(shareCtx.blob);else buildCard(e).toBlob(go,'image/png');
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
$('#lf-d-add').addEventListener('click',function(){montrerDate(true);$('#lf-d').focus();});
$('#lf-d-del').addEventListener('click',function(){$('#lf-d').value='';montrerDate(false);});
function openLog(o){
  o=o||{};
  var e=o.id?S.diary.find(function(x){return x.id===o.id;}):null;
  var f=e?film(e.k):(o.k?film(o.k):null);
  logCtx={id:e?e.id:null};
  $('#log-title').textContent=e?'Modifier la séance':'Noter un film';
  $('#lf-t').value=f?f.t:'';$('#lf-y').value=f?f.y:'';
  $('#lf-d').value=e?(e.d||''):'';montrerDate(!!(e&&e.d));
  $('#lf-m').value=f&&f.m?fmtDurShort(f.m):'';
  $('#lf-l').checked=e?!!e.l:!!(f&&f.l);
  $('#lf-rw').checked=e?!!e.rw:!!(f&&S.diary.some(function(x){return x.k===f.k;}));
  $('#lf-rv').value=e?(e.rv||''):'';
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
  var d=$('#lf-d-box').hidden?'':($('#lf-d').value||''),r=getRating()||null,l=$('#lf-l').checked,rw=$('#lf-rw').checked,rv=$('#lf-rv').value.trim(),tg=$('#lf-tg').value.trim();
  var tm=logCtx.tmdb&&logCtx.tmdb.t===t&&logCtx.tmdb.y===y?logCtx.tmdb:null,f=null;
  if(tm)f=Object.values(S.films).find(function(x){return x.tm===tm.id;})||null;
  if(!f&&!tm&&!y){var memes=Object.values(S.films).filter(function(x){return norm(x.t)===norm(t);});if(memes.length===1)f=memes[0];}
  if(!f)f=ensureFilm(t,y);
  if(tm){f.tm=tm.id;if(tm.p)f.p=tm.p;if(tm.dr)f.dr=tm.dr;if(!mm&&tm.m&&!f.m)f.m=tm.m;}
  f.w=true;f.wl=null;if(r)f.r=r;if(l)f.l=true;if(mm)f.m=mm;
  if(logCtx.id){var e=S.diary.find(function(x){return x.id===logCtx.id;});if(e){e.k=f.k;e.d=d;e.r=r;e.l=l;e.rw=rw;e.rv=rv;e.tg=tg;}}
  else S.diary.push({id:uid(),k:f.k,d:d,r:r,l:l,rw:rw,rv:rv,tg:tg,ts:Date.now()});
  closeDialog($('#log'));
  commit();
  toast(logCtx.id?'Séance modifiée':'« '+f.t+' » ajouté au journal');
});

/* ---------- Dialogue : fiche film ---------- */
var sheetK=null,sheetConfirm=false;
function openSheet(k){if(!film(k))return;sheetK=k;sheetConfirm=false;renderSheet();showDialog($('#sheet'));}
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
   '<div class="fld"><span>Séances</span>'+(ent.length?'<div class="entries">'+ent.map(function(e){return '<div class="entry"><div class="eh"><span class="ed">'+(fmtDate(e.d)||'Vu')+(e.rw?', revu':'')+'</span><span>'+(e.r?'<span class="stars">'+stars(e.r)+'</span> ':'')+(e.l?'<span class="heart">♥</span> ':'')+'<button class="ghost small" type="button" data-action="share" data-id="'+esc(e.id)+'">Partager</button> <button class="ghost small" type="button" data-action="edit" data-id="'+esc(e.id)+'">Modifier</button></span></div>'+(e.rv?'<p>'+esc(e.rv)+'</p>':'')+'</div>';}).join('')+'</div>':'<p class="muted" style="margin:0;font-size:14px">Dans tes films vus. Note-le pour qu’il entre dans ton journal.</p>')+'</div>'+
   (sheetConfirm?'<div class="confirm">Retirer ce film et ses séances du carnet ? <button class="primary small" type="button" data-action="fkill">Oui, retirer</button><button class="ghost small" type="button" data-action="fnokill">Non</button></div>':'<div><button class="ghost danger small" type="button" data-action="faskkill">Retirer du carnet</button></div>')+
   '</div>';
  picker($('#sh-r'),f.r||0,function(v){f.r=v||null;f.w=true;commit();});
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
    rows.push({Title:f.t,Year:f.y,Rating:e.r||'',WatchedDate:e.d||'',Rewatch:e.rw?'Yes':'',Review:e.rv||'',Tags:e.tg||''});});
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
  if(!LECTURE&&(ev.key==='Enter'||ev.key===' ')&&ev.target.matches&&ev.target.matches('article.ticket[data-action]')){ev.preventDefault();openLog({id:ev.target.dataset.id});}
});
document.addEventListener('click',function(ev){
  if(!ev.target.closest('#version'))return;
  ev.preventDefault();location.hash='#manifeste';
  setTimeout(function(){var n=$('#nouveautes');if(n)n.scrollIntoView({behavior:'smooth',block:'start'});},150);
});
var EN_LECTURE={close:1,more:1,gmore:1,ffilter:1,sheet:1,lopen:1,lback:1,compte:1};
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
    case 'compte':case 'cptcopie':case 'cptsuppr':case 'cptnon':actionCompte(act);break;
    case 'fzfiltre':case 'fzsuppr':case 'fzsignal':case 'fzmod':case 'fztraite':case 'fzban':actionForum(act,a);break;
  }
});
window.addEventListener('beforeunload',function(ev){if(Store.mode==='db'&&(Store.saving||$('#sync').dataset.s==='pending')){flush();ev.preventDefault();ev.returnValue='';}});
window.addEventListener('hashchange',function(){if(route()!=='listes')openListId=null;confirmWipe=false;render();window.scrollTo(0,0);});

/* ---------- Démarrage ---------- */
$('#version').textContent='v'+VERSION;
if(LECTURE){
  document.body.classList.add('lecture');$('#sync').style.display='none';
  render();renderCompte();chargerLecture();
}else{
  var cached=lsGet(LS);if(cached)S=upgrade(cached);
  render();renderCompte();brancherSug();
  connect();
  if(!sb)setTimeout(rattraper,1500);
}
})();
