// Kawazino : roulette, crash et course en direct pendant le live de Kawaze.
// Les règles (soldes, horaires, tirages, admins) sont vérifiées dans la base Supabase
// (fichier kawaze-games.sql) : cette page affiche et envoie les mises.
// Ajouter ?stream à l'adresse donne la vue à capturer dans OBS (sans boutons) :
// elle suit tout seule le jeu en cours.

(function () {
  const $ = (id) => document.getElementById(id);
  const echap = (t) => String(t ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const nombre = (n) => Number(n || 0).toLocaleString("fr-FR");
  const imageSure = (u) => /^https:\/\//i.test(String(u || "")) ? String(u) : "";
  const court = (n) => {
    n = Number(n || 0);
    if (n < 1000) return String(n);
    if (n < 10000) return (Math.floor(n / 100) / 10).toString().replace(".", ",") + "k";
    if (n < 1e6) return Math.floor(n / 1000) + "k";
    return (Math.floor(n / 1e5) / 10).toString().replace(".", ",") + "M";
  };
  const fx = (x) => Number(x).toFixed(2).replace(".", ",") + "×";

  const STREAM = new URLSearchParams(location.search).has("stream");
  document.body.classList.toggle("kz-stream", STREAM);

  const JEUX = ["roulette", "crash", "course"];
  const NOM_JEU = { roulette: "Roulette", crash: "Crash", course: "Course" };
  const JETONS = [10, 50, 100, 500, 1000, 5000];
  const ROTATION_MS = 8000;                 // durée de la bille
  const ENCHAINER_APRES_MS = 12000;         // pause entre deux tours en mode « enchaîner »
  const VITESSE_CRASH = 0.07;                // identique à kz_vitesse_crash() dans la base
  const TACTILE = window.matchMedia("(hover: none)").matches;
  const REDUIT = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ROUGES = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const ROUE = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const couleur = (n) => n === 0 ? "zero" : ROUGES.has(n) ? "rouge" : "noir";
  const NOM_COULEUR = { rouge: "rouge", noir: "noir", zero: "zéro" };
  const CHAT = {
    roulette: "<code>!mise 50 rouge</code> · <code>!mise 50 c2 rouge</code> · <code>!mise 50 17</code> · <code>!change</code> · <code>!annule</code>",
    crash: "<code>!mise 50</code> · <code>!mise 50 2,5</code> · <code>!cash</code> · <code>!change</code> · <code>!annule</code>",
    course: "<code>!mise 50 3</code> · <code>!mise 50 poule tortue</code> · <code>!change</code> · <code>!annule</code>",
  };

  const config = window.PARIS_CONFIG || {};
  if (!config.url || !config.cle || !window.supabase) {
    $("phase").textContent = "Les jeux ne sont pas encore branchés.";
    return;
  }
  const sb = window.supabase.createClient(config.url, config.cle, {
    auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true },
  });

  // =====================================================================
  // ROULETTE : tous les paris et leur place sur le tapis
  // u le long (0 = zéro, 1 à 12 = rangées, 13 = colonnes), v en travers
  // (0 à 3 = numéros, 3 à 3,8 = douzaines, 3,8 à 4,6 = chances simples).
  // Les clés sont celles de la table kz_paris_valides.
  // =====================================================================
  const L_U = 14, L_V = 4.6;
  const rangee = (n) => Math.ceil(n / 3);
  const ligne = (n) => n % 3 === 0 ? 0 : n % 3 === 2 ? 1 : 2;
  const PARIS = [];
  const PAR_CLE = {};
  function ajouter(cle, type, cases, libelle, forme) {
    const p = { cle, type, cases, libelle, paie: 36 / cases.length - 1, ...forme };
    PARIS.push(p);
    PAR_CLE[cle] = p;
  }
  const cleDe = (cases) => [...cases].sort((a, b) => a - b).join("-");
  (function construireParis() {
    ajouter("0", "plein", [0], "Plein 0", { zone: [0, 0, 1, 3] });
    for (let n = 1; n <= 36; n++) ajouter(String(n), "plein", [n], "Plein " + n, { zone: [rangee(n), ligne(n), 1, 1] });
    for (let n = 1; n <= 33; n++) ajouter(cleDe([n, n + 3]), "cheval", [n, n + 3], `Cheval ${n}/${n + 3}`, { point: [rangee(n) + 1, ligne(n) + 0.5] });
    for (let n = 1; n <= 36; n++) if (n % 3 !== 0) ajouter(cleDe([n, n + 1]), "cheval", [n, n + 1], `Cheval ${n}/${n + 1}`, { point: [rangee(n) + 0.5, ligne(n)] });
    for (let n = 1; n <= 3; n++) ajouter("0-" + n, "cheval", [0, n], `Cheval 0/${n}`, { point: [1, ligne(n) + 0.5] });
    for (let c = 1; c <= 12; c++) ajouter(cleDe([3 * c - 2, 3 * c - 1, 3 * c]), "transversale", [3 * c - 2, 3 * c - 1, 3 * c], `Transversale ${3 * c - 2}-${3 * c}`, { point: [c + 0.5, 3] });
    ajouter("0-1-2", "trio", [0, 1, 2], "Trio 0/1/2", { point: [1, 2] });
    ajouter("0-2-3", "trio", [0, 2, 3], "Trio 0/2/3", { point: [1, 1] });
    for (let n = 1; n <= 32; n++) if (n % 3 !== 0) ajouter(cleDe([n, n + 1, n + 3, n + 4]), "carre", [n, n + 1, n + 3, n + 4], `Carré ${n}/${n + 1}/${n + 3}/${n + 4}`, { point: [rangee(n) + 1, ligne(n)] });
    ajouter("0-1-2-3", "quatre", [0, 1, 2, 3], "Premier quatre 0/1/2/3", { point: [1, 3] });
    for (let c = 1; c <= 11; c++) {
      const cs = [3 * c - 2, 3 * c - 1, 3 * c, 3 * c + 1, 3 * c + 2, 3 * c + 3];
      ajouter(cleDe(cs), "sixain", cs, `Sixain ${3 * c - 2}-${3 * c + 3}`, { point: [c + 1, 3] });
    }
    const ordinal = ["1re", "2e", "3e"];
    for (let c = 1; c <= 3; c++) {
      const d = []; for (let x = 12 * c - 11; x <= 12 * c; x++) d.push(x);
      ajouter("d" + c, "douzaine", d, `${ordinal[c - 1]} douzaine (${12 * c - 11}-${12 * c})`, { zone: [1 + 4 * (c - 1), 3, 4, 0.8], texte: `${ordinal[c - 1]} 12` });
      const col = []; for (let x = c; x <= 36; x += 3) col.push(x);
      ajouter("c" + c, "colonne", col, `${ordinal[c - 1]} colonne`, { zone: [13, 3 - c, 1, 1], texte: "2 à 1" });
    }
    const tous = []; for (let x = 1; x <= 36; x++) tous.push(x);
    [
      ["manque", "Manque (1-18)", tous.filter((x) => x <= 18), "1-18"],
      ["pair", "Pair", tous.filter((x) => x % 2 === 0), "Pair"],
      ["rouge", "Rouge", tous.filter((x) => ROUGES.has(x)), '<i class="kz-losange rouge" aria-hidden="true"></i>'],
      ["noir", "Noir", tous.filter((x) => !ROUGES.has(x)), '<i class="kz-losange noir" aria-hidden="true"></i>'],
      ["impair", "Impair", tous.filter((x) => x % 2 === 1), "Impair"],
      ["passe", "Passe (19-36)", tous.filter((x) => x >= 19), "19-36"],
    ].forEach(([cle, libelle, cases, texte], i) => ajouter(cle, "simple", cases, libelle, { zone: [1 + 2 * i, 3.8, 2, 0.8], texte }));
  })();

  // =====================================================================
  // COURSE : le modèle des coureurs (identique à celui qui a servi à
  // calculer les cotes de kz_coureurs). La base tire le gagnant et une
  // graine ; chaque navigateur rejoue la même course à partir de la graine.
  // =====================================================================
  const COUREURS = [
    { nom: "Tornade", espece: "Cheval", e: "🐎", cote: 5.3, base: 1.0, bruit: .22, ev: [{ p: .008, duree: 14, f: 0, txt: "se cabre et perd du terrain !" }] },
    { nom: "Coin-Coin", espece: "Canard", e: "🦆", cote: 6.1, base: .82, bruit: .5, ev: [{ p: .01, duree: 12, f: 1.9, txt: "s'envole sur quelques mètres !" }] },
    { nom: "Cocotte", espece: "Poule", e: "🐔", cote: 4.4, base: 1.06, bruit: .3, ev: [{ p: .016, duree: 10, f: 0, txt: "s'arrête pour picorer…" }] },
    { nom: "Turbo", espece: "Escargot", e: "🐌", cote: 8.9, base: .55, bruit: .08, ev: [{ p: .004, duree: 45, f: 3.4, txt: "passe en mode fusée !" }] },
    { nom: "Saucisse", espece: "Cochon", e: "🐖", cote: 6.4, base: .95, bruit: .3, ev: [{ p: .009, duree: 18, f: 0, txt: "se roule dans la boue" }, { p: .01, duree: 10, f: 1.6, txt: "charge tête baissée !" }] },
    { nom: "Caillou", espece: "Tortue", e: "🐢", cote: 4.7, base: .925, bruit: .04, ev: [] },
  ];
  // Couleurs des dossards (1 rouge, 2 blanc, 3 bleu, 4 jaune, 5 vert, 6 noir)
  const DOSSARDS = [["#D8382C", "#FFFFFF"], ["#F4EFE4", "#1C1719"], ["#2D6CD8", "#FFFFFF"], ["#F3C63F", "#1C1719"], ["#2C9A57", "#FFFFFF"], ["#1C1719", "#F3C63F"]];
  const LONGUEUR = 420, PAS_MS = 50;
  function hasard(graine) {           // mulberry32 : même suite de nombres partout
    let a = graine >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function simulerCourse(graine) {
    const r = hasard(graine);
    const st = COUREURS.map(() => ({ x: 0, reste: 0, f: 1 }));
    const pos = [], modes = [], evenements = [];
    let gagnant = -1;
    while (gagnant < 0 && pos.length < 2000) {
      const ligneP = [], ligneM = [];
      COUREURS.forEach((d, i) => {
        const s = st[i];
        if (s.reste > 0) {
          s.reste--; s.x += d.base * s.f;
          if (!s.reste) s.f = 1;
        } else {
          let declenche = null;
          for (const e of d.ev) if (r() < e.p) { declenche = e; break; }
          if (declenche) {
            s.reste = declenche.duree; s.f = declenche.f; s.x += d.base * s.f;
            evenements.push({ pas: pos.length, i, txt: declenche.txt });
          } else {
            s.x += d.base * (1 + d.bruit * (r() * 2 - 1));
          }
        }
        ligneP.push(s.x);
        ligneM.push(s.reste > 0 ? (s.f === 0 ? 1 : 2) : 0);
      });
      pos.push(ligneP); modes.push(ligneM);
      let mx = LONGUEUR;
      st.forEach((s, i) => { if (s.x >= mx) { mx = s.x; gagnant = i; } });
    }
    return { gagnant, pos, modes, evenements, duree: pos.length * PAS_MS };
  }
  const cacheCourses = new Map();
  function courseDuTour(t) {
    if (!t || t.graine == null || t.resultat == null) return null;
    if (cacheCourses.has(t.id)) return cacheCourses.get(t.id);
    let c = null;
    for (let k = 0; k < 600; k++) {
      c = simulerCourse((t.graine + k * 7919) >>> 0);
      if (c.gagnant === t.resultat - 1) break;
    }
    cacheCourses.set(t.id, c);
    return c;
  }

  // =====================================================================
  // État
  // =====================================================================
  const etat = {
    session: null,
    profil: null,
    rang: null,
    kz: null,
    tour: null,          // dernier tour, tous jeux confondus
    mises: [],           // jetons de ce tour
    histos: { roulette: [], crash: [], course: [] },
    classement: [],
    decalage: 0,
    onglet: "roulette",
    jeton: 50,
    gomme: false,
    choix: null,
    survol: null,
    roueTour: null,
    rotationFin: 0,
    tirageDemande: null,
    suiviVol: 0,
    reclame: false,
    enchainer: false,
    enchaineTour: null,
    confirmerAnnulation: false,
    soldeGele: null,
    installe: true,
    animFinie: new Set(),  // tours dont la fin d'animation a été traitée
  };
  try { etat.jeton = Number(localStorage.getItem("kz-jeton")) || 50; } catch (e) { /* rien */ }
  try { etat.enchainer = localStorage.getItem("kz-enchainer") === "1"; } catch (e) { /* rien */ }
  if (!JETONS.includes(etat.jeton)) etat.jeton = 50;
  const depuisAdresse = location.hash.replace("#", "");
  if ([...JEUX, "classement"].includes(depuisAdresse)) etat.onglet = depuisAdresse;
  const ongletChoisi = [...JEUX, "classement"].includes(depuisAdresse);

  const maintenant = () => Date.now() + etat.decalage;
  const estAdmin = () => !!(etat.profil && etat.profil.admin);
  const moi = () => etat.session ? etat.session.user.id : null;
  const jeuAffiche = () => STREAM ? (etat.tour ? etat.tour.jeu : "roulette") : (JEUX.includes(etat.onglet) ? etat.onglet : null);
  const tourDuJeu = () => etat.tour && etat.tour.jeu === jeuAffiche() ? etat.tour : null;
  const misesDuJeu = () => tourDuJeu() ? etat.mises : [];

  function finAnimation(t) {
    if (!t || t.statut !== "fini" || !t.tire_le) return 0;
    if (t.jeu === "roulette") return Date.parse(t.tire_le) + ROTATION_MS;
    if (t.jeu === "course") { const c = courseDuTour(t); return Date.parse(t.tire_le) + (c ? c.duree : 0) + 400; }
    return 0;
  }
  const enCours = (t) => !!t && (t.statut === "mises" || t.statut === "vol" || (t.statut === "fini" && maintenant() < finAnimation(t)));

  // ---------- Messages ----------
  let minuterieAnnonce;
  function annoncer(texte, type = "info") {
    if (STREAM) return;
    const el = $("annonce");
    el.textContent = texte;
    el.className = "annonce annonce-" + type;
    el.hidden = false;
    clearTimeout(minuterieAnnonce);
    minuterieAnnonce = setTimeout(() => { el.hidden = true; }, 4500);
  }
  const messageErreur = (e) =>
    (e && e.message && !/fetch|network/i.test(e.message)) ? e.message : "Connexion impossible. Vérifie ta connexion et réessaie.";
  const appel = async (nom, args) => {
    const r = await sb.rpc(nom, args);
    if (r.error) throw r.error;
    return r.data;
  };

  // ---------- Phase du jeu affiché ----------
  function phase() {
    if (!etat.installe) return "absent";
    if (!etat.kz) return "chargement";
    const j = jeuAffiche(), t = etat.tour;
    if (!j) return "classement";
    if (t && t.jeu !== j && enCours(t)) return "ailleurs";
    const tj = t && t.jeu === j ? t : null;
    if (tj && tj.statut === "fini" && maintenant() < finAnimation(tj)) return "animation";
    if (tj && tj.statut === "vol") return maintenant() < Date.parse(tj.depart) ? "decollage" : "vol";
    if (!etat.kz.ouvert) return "ferme";
    if (!tj) return "attente";
    if (tj.statut === "mises") return maintenant() < Date.parse(tj.ferme_le) ? "mises" : "tirage";
    if (tj.statut === "fini") return "resultat";
    return "annule";
  }
  const resultatVisible = () => {
    const ph = phase(), t = tourDuJeu();
    return !!t && t.statut === "fini" && (ph === "resultat" || ph === "ferme");
  };

  // =====================================================================
  // Chargement
  // =====================================================================
  async function chargerEtat() {
    const r = await sb.from("kz_etat").select("*").eq("id", 1).maybeSingle();
    if (r.error) { if (/kz_etat|relation|schema cache/i.test(r.error.message)) etat.installe = false; throw r.error; }
    etat.kz = r.data;
  }
  async function chargerTour() {
    const r = await sb.from("kz_tours").select("*").order("id", { ascending: false }).limit(1).maybeSingle();
    if (r.error) throw r.error;
    const nouveau = !etat.tour || !r.data || r.data.id !== etat.tour.id;
    etat.tour = r.data;
    if (nouveau) { await chargerMises(); if (etat.premierChargement && r.data) basculerVers(r.data); }
  }
  // Une nouvelle partie s'ouvre dans un autre jeu : on y emmène le joueur
  function basculerVers(t) {
    if (STREAM || !JEUX.includes(etat.onglet) || etat.onglet === t.jeu || t.statut !== "mises") return;
    changerOnglet(t.jeu);
    annoncer(`Les mises sont ouvertes : ${NOM_JEU[t.jeu]} !`, "info");
  }
  async function chargerMises() {
    if (!etat.tour) { etat.mises = []; return; }
    const id = etat.tour.id;
    const r = await sb.from("kz_mises").select("joueur, pseudo, cle, mise, auto, cash, gain, source").eq("tour_id", id);
    if (r.error) throw r.error;
    if (etat.tour && etat.tour.id === id) etat.mises = r.data || [];
  }
  async function chargerHistoriques() {
    await Promise.all(JEUX.map(async (j) => {
      const r = await sb.from("kz_tours").select("id, jeu, resultat, resultat_x").eq("statut", "fini").eq("jeu", j).order("id", { ascending: false }).limit(15);
      if (!r.error) etat.histos[j] = r.data || [];
    }));
  }
  async function chargerCoureurs() {
    const r = await sb.from("kz_coureurs").select("numero, cote").order("numero", { ascending: true });
    if (!r.error && r.data) r.data.forEach((c) => { if (COUREURS[c.numero - 1]) COUREURS[c.numero - 1].cote = Number(c.cote); });
  }
  async function chargerClassement() {
    if (STREAM) return;
    const r = await sb.from("profils").select("id, pseudo, avatar, solde").order("solde", { ascending: false }).limit(20);
    if (!r.error) etat.classement = r.data || [];
    if (etat.profil) {
      const c = await sb.from("profils").select("id", { count: "exact", head: true }).gt("solde", etat.profil.solde);
      etat.rang = c.error ? null : (c.count || 0) + 1;
    }
  }
  async function chargerDons() {
    const r = await sb.from("kz_dons").select("id, de_pseudo, montant, cree_le").eq("type", "tip").order("id", { ascending: false }).limit(6);
    if (!r.error) etat.tips = r.data || [];
  }
  function rendreCroupier() {
    const el = $("croupier");
    if (!el) return;
    el.hidden = STREAM || etat.onglet === "classement";
    $("tips").innerHTML = etat.session
      ? [50, 100, 500].map((v) => `<button class="bk-btn bk-btn-ligne bk-btn-petit" type="button" data-action="tip" data-montant="${v}">Tip ${nombre(v)} c</button>`).join("")
      : `<button class="bk-btn bk-btn-twitch bk-btn-petit" data-action="connexion">Se connecter pour tiper</button>`;
    const t = etat.tips || [];
    $("derniers-tips").innerHTML = t.length
      ? t.map((x) => `<li><b>${echap(x.de_pseudo || "Quelqu'un")}</b> · ${nombre(x.montant)} c</li>`).join("")
      : `<li class="bk-discret">Pas encore de pourboire ce soir.</li>`;
    $("admin-don").hidden = STREAM || !estAdmin() || etat.onglet === "classement";
  }

  async function chargerProfil() {
    if (!etat.session) { etat.profil = null; return; }
    const r = await sb.rpc("synchroniser_profil");
    if (r.error) throw r.error;
    etat.profil = r.data;
    if (!etat.reclame) {
      etat.reclame = true;
      try {
        const rc = await appel("kz_reclamer");
        if (rc && rc.montant > 0) {
          etat.profil.solde = rc.solde;
          annoncer(`+${nombre(rc.montant)} centimes de recharge Twitch ajoutés !`, "ok");
        }
      } catch (e) { /* on réessaiera */ }
    }
  }
  async function synchroniserHeure() {
    try {
      const avant = Date.now();
      const r = await sb.rpc("kz_heure");
      const apres = Date.now();
      if (!r.error && r.data) etat.decalage = Date.parse(r.data) - (avant + apres) / 2;
    } catch (e) { /* on garde l'heure locale */ }
  }
  async function toutRecharger() {
    try {
      await Promise.all([chargerEtat(), synchroniserHeure()]);
      await Promise.all([chargerProfil(), chargerTour(), chargerHistoriques(), chargerClassement(), chargerCoureurs(), chargerDons()]);
    } catch (e) {
      if (etat.installe) annoncer(messageErreur(e), "erreur");
    }
    // à l'arrivée sur la page, ouvrir l'onglet du jeu en cours
    if (!ongletChoisi && !etat.premierChargement && etat.tour && enCours(etat.tour)) etat.onglet = etat.tour.jeu;
    etat.premierChargement = true;
    rendreTout();
  }
  let minuterieMises = null;
  function planifierMises() {
    if (minuterieMises) return;
    minuterieMises = setTimeout(async () => {
      minuterieMises = null;
      try { await chargerMises(); } catch (e) { /* prochain essai */ }
      rendreJeu();
    }, 250);
  }

  // =====================================================================
  // ROULETTE : la roue
  // =====================================================================
  const roue = $("roue");
  let angleRoue = 0;
  function dessinerRoue() {
    const st = getComputedStyle(document.body);
    const v = (n) => st.getPropertyValue(n).trim();
    const x = roue.getContext("2d"), W = roue.width, R = W / 2, seg = Math.PI * 2 / 37;
    x.save(); x.clearRect(0, 0, W, W); x.translate(R, R);
    x.beginPath(); x.arc(0, 0, R - 2, 0, Math.PI * 2); x.fillStyle = "#6B5420"; x.fill();
    x.beginPath(); x.arc(0, 0, R - 10, 0, Math.PI * 2); x.fillStyle = v("--bk-panneau-2") || "#1B1F28"; x.fill();
    const r1 = R - 18;
    for (let i = 0; i < 37; i++) {
      const n = ROUE[i], a0 = -Math.PI / 2 + i * seg - seg / 2;
      x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, r1, a0, a0 + seg); x.closePath();
      x.fillStyle = n === 0 ? v("--kz-zero") : ROUGES.has(n) ? v("--kz-rouge") : v("--kz-noir");
      x.fill(); x.strokeStyle = "#8F7534"; x.lineWidth = 1.5; x.stroke();
      x.save(); x.rotate(i * seg);
      x.fillStyle = "#F4F1FF"; x.font = `700 ${Math.round(R * 0.075)}px Rubik, system-ui, sans-serif`;
      x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(String(n), 0, -r1 * 0.87);
      x.restore();
    }
    x.beginPath(); x.arc(0, 0, r1 * 0.73, 0, Math.PI * 2); x.fillStyle = v("--kz-tapis-2"); x.fill();
    x.lineWidth = 3; x.strokeStyle = "#8F7534"; x.stroke();
    x.beginPath(); x.arc(0, 0, r1 * 0.62, 0, Math.PI * 2); x.fillStyle = v("--kz-tapis"); x.fill();
    x.strokeStyle = v("--or"); x.lineWidth = 7; x.lineCap = "round";
    for (let s = 0; s < 4; s++) { x.save(); x.rotate(s * Math.PI / 2); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -r1 * 0.5); x.stroke(); x.restore(); }
    x.beginPath(); x.arc(0, 0, r1 * 0.12, 0, Math.PI * 2); x.fillStyle = v("--or"); x.fill();
    x.restore();
  }
  function angleVers(numero) {
    const idx = ROUE.indexOf(numero), segDeg = 360 / 37;
    return ((-idx * segDeg) % 360 + 360) % 360;
  }
  function lancerRoue(numero, duree) {
    const cible = angleVers(numero);
    const actuel = ((angleRoue % 360) + 360) % 360;
    let delta = cible - actuel; if (delta < 0) delta += 360;
    angleRoue += 360 * Math.max(2, Math.round(duree / 1300)) + delta;
    roue.style.transition = REDUIT ? "none" : `transform ${duree}ms cubic-bezier(.12,.6,.08,1)`;
    roue.style.transform = `rotate(${angleRoue}deg)`;
  }
  function poserRoue(numero) {
    angleRoue = angleVers(numero);
    roue.style.transition = "none";
    roue.style.transform = `rotate(${angleRoue}deg)`;
  }

  // Un tour vient d'être tiré : lancer l'animation du jeu (ou la sauter si on arrive après)
  function suivreTirage() {
    const t = etat.tour;
    if (!t || t.statut !== "fini" || etat.roueTour === t.id) return;
    etat.roueTour = t.id;
    const fin = finAnimation(t);
    const reste = fin - maintenant();
    if (t.jeu === "roulette" && t.resultat != null) {
      if (reste > 600) { $("resultat").hidden = true; lancerRoue(t.resultat, reste); } else poserRoue(t.resultat);
    }
    if (reste > 600) {
      etat.soldeGele = etat.profil ? etat.profil.solde : null;
      setTimeout(() => finAnimationTour(t.id), reste + 50);
      if (t.jeu === "course") boucleCourse();
    } else {
      etat.animFinie.add(t.id);
    }
  }
  async function finAnimationTour(id) {
    if (etat.animFinie.has(id)) return;
    etat.animFinie.add(id);
    etat.soldeGele = null;
    try { await Promise.all([chargerProfil(), chargerMises(), chargerHistoriques(), chargerClassement()]); } catch (e) { /* rien */ }
    rendreTout();
    const t = etat.tour;
    if (!t || t.id !== id) return;
    const g = mesTotaux();
    if (!STREAM && g.mise > 0 && g.gain > 0) {
      annoncer(t.jeu === "roulette" ? `Le ${t.resultat} sort : tu gagnes ${nombre(g.gain)} centimes !` : `${COUREURS[t.resultat - 1].nom} gagne : tu touches ${nombre(g.gain)} centimes !`, "ok");
    }
  }

  // =====================================================================
  // ROULETTE : le tapis
  // =====================================================================
  const tapis = $("tapis");
  let orientation = null;
  function poserRect(el, [u, v, du, dv]) {
    if (orientation === "horizontal") {
      el.style.left = (u / L_U * 100) + "%"; el.style.top = (v / L_V * 100) + "%";
      el.style.width = (du / L_U * 100) + "%"; el.style.height = (dv / L_V * 100) + "%";
    } else {
      el.style.left = ((L_V - v - dv) / L_V * 100) + "%"; el.style.top = (u / L_U * 100) + "%";
      el.style.width = (dv / L_V * 100) + "%"; el.style.height = (du / L_U * 100) + "%";
    }
  }
  function centre(p) {
    const [u, v] = p.point || [p.zone[0] + p.zone[2] / 2, p.zone[1] + p.zone[3] / 2];
    return orientation === "horizontal" ? { x: u / L_U * 100, y: v / L_V * 100 } : { x: (L_V - v) / L_V * 100, y: u / L_U * 100 };
  }
  function construireTapis() {
    const largeur = tapis.parentElement.clientWidth;
    if (!largeur) return;
    const voulu = STREAM || largeur >= 600 ? "horizontal" : "vertical";
    if (voulu === orientation && tapis.childElementCount) return;
    orientation = voulu;
    tapis.className = "kz-tapis " + orientation;
    tapis.replaceChildren();
    const frag = document.createDocumentFragment();
    for (const p of PARIS) {
      if (!p.zone) continue;
      const c = document.createElement("div");
      if (p.type === "plein") {
        const n = p.cases[0];
        c.className = "kz-case num " + couleur(n);
        c.innerHTML = `<span class="kz-num">${n}</span>`;
        c.dataset.numero = n;
      } else {
        c.className = "kz-case ext" + (p.type === "douzaine" || p.type === "simple" ? " long" : "");
        c.innerHTML = `<span>${p.texte}</span>`;
      }
      c.dataset.cases = p.cases.join(",");
      poserRect(c, p.zone);
      frag.append(c);
    }
    for (const p of PARIS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "kz-cible " + (p.zone ? "zone" : "point");
      b.dataset.cle = p.cle;
      b.setAttribute("aria-label", `${p.libelle}, paie ${p.paie} contre 1`);
      if (p.zone) poserRect(b, p.zone);
      else { const c = centre(p); b.style.left = c.x + "%"; b.style.top = c.y + "%"; }
      frag.append(b);
    }
    const couche = document.createElement("div");
    couche.id = "couche-jetons";
    frag.append(couche);
    tapis.append(frag);
    mesurerTapis();
    rendreRoulette();
  }
  function mesurerTapis() {
    const r = tapis.getBoundingClientRect();
    if (!r.width) return;
    const cw = orientation === "horizontal" ? r.width / L_U : r.width / L_V;
    const ch = orientation === "horizontal" ? r.height / L_V : r.height / L_U;
    const cell = Math.min(cw, ch);
    tapis.style.setProperty("--cell", cell.toFixed(1) + "px");
    tapis.style.setProperty("--jeton", Math.max(20, Math.min(56, cell * 0.66)).toFixed(1) + "px");
  }
  function allumer(cle) {
    const p = cle ? PAR_CLE[cle] : null;
    const set = new Set(p ? p.cases : []);
    tapis.querySelectorAll(".kz-case").forEach((c) => {
      const n = c.dataset.numero;
      c.classList.toggle("allume", (n != null && set.has(Number(n))) || (!!p && p.type !== "plein" && c.dataset.cases === p.cases.join(",")));
    });
  }
  const tierJeton = (m) => m >= 5000 ? "t6" : m >= 1000 ? "t5" : m >= 500 ? "t4" : m >= 100 ? "t3" : m >= 50 ? "t2" : "t1";
  function regrouperMises() {
    const parCle = new Map();
    for (const m of misesDuJeu()) {
      let g = parCle.get(m.cle);
      if (!g) parCle.set(m.cle, g = { total: 0, joueurs: [], moi: false });
      g.total += Number(m.mise);
      g.joueurs.push(m);
      if (m.joueur === moi()) g.moi = true;
    }
    for (const g of parCle.values()) g.joueurs.sort((a, b) => b.mise - a.mise);
    return parCle;
  }
  function rendreRoulette() {
    const couche = $("couche-jetons");
    if (!couche) return;
    const ph = phase();
    tapis.classList.toggle("ferme", ph !== "mises");
    tapis.classList.toggle("gomme", etat.gomme);
    const parCle = regrouperMises();
    const t = tourDuJeu();
    const res = resultatVisible() && t && t.resultat != null ? t.resultat : null;
    // Les jetons d'abord, puis les pseudos : un pseudo qui chevaucherait un autre
    // jeton ou un autre pseudo est masqué (il reste dans la liste et au survol).
    const r = tapis.getBoundingClientRect();
    const cell = parseFloat(tapis.style.getPropertyValue("--cell")) || 50;
    const dj = parseFloat(tapis.style.getPropertyValue("--jeton")) || 30;
    const places = [...parCle.entries()].filter(([cle]) => PAR_CLE[cle]).sort((a, b) => b[1].total - a[1].total).map(([cle, g]) => {
      const c = centre(PAR_CLE[cle]);
      return { cle, g, c, px: c.x / 100 * r.width, py: c.y / 100 * r.height };
    });
    const boites = places.map((x) => ({ x1: x.px - dj / 2, y1: x.py - dj / 2, x2: x.px + dj / 2, y2: x.py + dj / 2 }));
    const chevauche = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
    let html = "";
    for (const x of places) {
      const p = PAR_CLE[x.cle];
      const etatJeton = res == null ? "" : p.cases.includes(res) ? " gagnant" : " perdant";
      html += `<span class="kz-jeton ${tierJeton(x.g.total)}${x.g.moi ? " moi" : ""}${etatJeton}" style="left:${x.c.x}%;top:${x.c.y}%">${court(x.g.total)}</span>`;
    }
    if (orientation === "horizontal") {
      const etiquettes = [];
      places.forEach((x, i) => {
        const nom = x.g.joueurs[0].pseudo + (x.g.joueurs.length > 1 ? ` +${x.g.joueurs.length - 1}` : "");
        const taille = cell * 0.2;
        const larg = Math.min(cell * 1.9, nom.length * taille * 0.62 + 8);
        const b = { x1: x.px - larg / 2, y1: x.py + dj * 0.52, x2: x.px + larg / 2, y2: x.py + dj * 0.52 + taille * 1.3 };
        if (etiquettes.some((e) => chevauche(e, b)) || boites.some((e, j) => j !== i && chevauche(e, b))) return;
        etiquettes.push(b);
        html += `<span class="kz-nom" style="left:${x.c.x}%;top:${x.c.y}%">${echap(nom)}</span>`;
      });
    }
    couche.innerHTML = html;
    tapis.querySelectorAll(".kz-cible").forEach((b) => {
      const g = parCle.get(b.dataset.cle), p = PAR_CLE[b.dataset.cle];
      b.title = g ? `${p.libelle} : ${g.joueurs.map((j) => `${j.pseudo} ${nombre(j.mise)}`).join(", ")}` : p.libelle;
    });
    tapis.querySelectorAll(".kz-case").forEach((c) => {
      c.classList.toggle("gagnant", res != null && c.dataset.numero != null && Number(c.dataset.numero) === res);
    });
    // résultat au centre de la roue
    const el = $("resultat");
    if (resultatVisible() && t && t.resultat != null) {
      if (el.hidden || el.dataset.tour !== String(t.id)) {
        el.hidden = false; el.dataset.tour = t.id;
        el.className = "kz-resultat " + couleur(t.resultat);
        el.innerHTML = `<b>${t.resultat}</b><span>${NOM_COULEUR[couleur(t.resultat)]}</span>`;
      }
    } else if (ph !== "animation") {
      el.hidden = true;
    }
    if (!etat.survol) { allumer(etat.choix); infoPari(etat.choix); }
  }
  function infoPari(cle) {
    const el = $("info-pari");
    const p = cle ? PAR_CLE[cle] : null;
    if (!p) { el.innerHTML = TACTILE ? "Touche le tapis pour choisir un pari." : "Survole le tapis pour voir chaque pari et ce qu'il rapporte."; return; }
    const g = regrouperMises().get(cle);
    const pose = g ? ` · ${nombre(g.total)} c posés${g.joueurs.length > 1 ? ` par ${g.joueurs.length} joueurs` : ""}` : "";
    let action = "";
    if (phase() === "mises" && etat.session) action = etat.gomme ? " · clique pour reprendre ton jeton" : (TACTILE ? "" : ` · clique pour poser <b>${nombre(etat.jeton)} c</b>`);
    el.innerHTML = `<b>${echap(p.libelle)}</b> · paie ${p.paie} contre 1${pose}${action}`;
  }
  tapis.addEventListener("click", (ev) => {
    const b = ev.target.closest(".kz-cible");
    if (!b || STREAM) return;
    const cle = b.dataset.cle;
    if (TACTILE && !etat.gomme && etat.choix !== cle) {
      etat.choix = cle;
      allumer(cle); infoPari(cle); rendreConfirmer();
      tapis.querySelectorAll(".kz-cible.choisie").forEach((x) => x.classList.remove("choisie"));
      b.classList.add("choisie");
      return;
    }
    poser(cle);
  });
  tapis.addEventListener("mouseover", (ev) => {
    const b = ev.target.closest(".kz-cible");
    const cle = b ? b.dataset.cle : null;
    if (cle === etat.survol) return;
    etat.survol = cle;
    allumer(cle || etat.choix); infoPari(cle || etat.choix);
  });
  tapis.addEventListener("mouseleave", () => { etat.survol = null; allumer(etat.choix); infoPari(etat.choix); });
  tapis.addEventListener("focusin", (ev) => {
    const b = ev.target.closest(".kz-cible");
    if (b) { allumer(b.dataset.cle); infoPari(b.dataset.cle); }
  });
  function rendreConfirmer() {
    const el = $("confirmer");
    const p = etat.choix ? PAR_CLE[etat.choix] : null;
    if (!TACTILE || !p || jeuAffiche() !== "roulette" || phase() !== "mises" || !etat.session) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<span><b>${echap(p.libelle)}</b> · paie ${p.paie} contre 1</span>
      <span><button class="bk-btn bk-btn-ligne bk-btn-petit" type="button" data-action="choix-annuler">Annuler</button>
      <button class="bk-btn bk-btn-plein bk-btn-petit" type="button" data-action="choix-poser">Poser ${nombre(etat.jeton)} c</button></span>`;
  }

  // =====================================================================
  // CRASH
  // =====================================================================
  const ciel = $("crash-ciel"), crashCanvas = $("crash-canvas");
  const xAuTemps = (s) => Math.exp(VITESSE_CRASH * Math.max(0, s));
  function etatVol() {
    const t = tourDuJeu();
    if (!t || t.jeu !== "crash") return { x: 1, s: 0, fini: false };
    if (t.statut === "fini" && t.resultat_x != null) return { x: Number(t.resultat_x), s: Math.log(Number(t.resultat_x)) / VITESSE_CRASH, fini: true };
    if (t.statut === "vol") {
      const s = (maintenant() - Date.parse(t.depart)) / 1000;
      return { x: s > 0 ? Math.floor(xAuTemps(s) * 100) / 100 : 1, s: Math.max(0, s), fini: false, avant: s < 0 ? -s : 0 };
    }
    return { x: 1, s: 0, fini: false };
  }
  function dessinerCrash() {
    const r = crashCanvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = window.devicePixelRatio || 1;
    if (crashCanvas.width !== Math.round(r.width * dpr) || crashCanvas.height !== Math.round(r.height * dpr)) {
      crashCanvas.width = Math.round(r.width * dpr); crashCanvas.height = Math.round(r.height * dpr);
    }
    const x = crashCanvas.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const st = getComputedStyle(document.body), v = (n) => st.getPropertyValue(n).trim();
    const W = r.width, H = r.height, pg = 52, pd = 24, ph = 24, pb = 34;
    const vol = etatVol();
    const sMax = Math.max(10, vol.s * 1.15), xMax = Math.max(2, vol.x * 1.2);
    const X = (s) => pg + (s / sMax) * (W - pg - pd);
    const Y = (m) => H - pb - ((m - 1) / (xMax - 1)) * (H - ph - pb);
    x.clearRect(0, 0, W, H);
    x.font = "12px Rubik, system-ui, sans-serif";
    const pasX = [0.25, 0.5, 1, 2, 5, 10, 25, 50].find((p) => (xMax - 1) / p <= 5) || 100;
    for (let m = 1; m <= xMax; m += pasX) {
      const y = Y(m);
      x.strokeStyle = "rgba(255,255,255,.07)"; x.lineWidth = 1;
      x.beginPath(); x.moveTo(pg, y); x.lineTo(W - pd, y); x.stroke();
      x.fillStyle = v("--lilas"); x.textAlign = "right";
      x.fillText(fx(Math.round(m * 100) / 100).replace(",00", ""), pg - 8, y + 4);
    }
    const pasS = [2, 5, 10, 20, 30].find((p) => sMax / p <= 6) || 60;
    x.textAlign = "center";
    for (let s = pasS; s <= sMax - pasS * 0.3; s += pasS) x.fillText(s + " s", X(s), H - 12);
    const tailleFusee = Math.max(34, Math.min(56, W * 0.042));
    if (vol.s <= 0) { emojiFusee(x, X(0) + tailleFusee * 0.45, Y(1) - tailleFusee * 0.55, -Math.PI / 2, tailleFusee); return; }
    const coul = vol.fini ? v("--kz-perdu") : v("--or");
    x.beginPath(); x.moveTo(X(0), Y(1));
    for (let i = 1; i <= 100; i++) { const s = vol.s * i / 100; x.lineTo(X(s), Y(Math.min(vol.x, xAuTemps(s)))); }
    x.strokeStyle = coul; x.lineWidth = 4; x.lineJoin = "round"; x.stroke();
    x.lineTo(X(vol.s), Y(1)); x.closePath();
    const gr = x.createLinearGradient(0, ph, 0, H - pb); gr.addColorStop(0, coul); gr.addColorStop(1, "transparent");
    x.globalAlpha = .2; x.fillStyle = gr; x.fill(); x.globalAlpha = 1;
    // les encaissements (réels ou automatiques déjà atteints)
    let n = 0;
    x.textAlign = "left"; x.font = "700 12px Rubik, system-ui, sans-serif";
    for (const m of [...misesDuJeu()].sort((a, b) => Number(a.cash || a.auto || 0) - Number(b.cash || b.auto || 0))) {
      const c = m.cash != null ? Number(m.cash) : (m.auto != null && Number(m.auto) <= vol.x && (!vol.fini || Number(m.auto) < vol.x) ? Number(m.auto) : null);
      if (c == null) continue;
      const s = Math.log(c) / VITESSE_CRASH, px = X(s), py = Y(c);
      x.beginPath(); x.arc(px, py, 5, 0, Math.PI * 2); x.fillStyle = v("--kz-gagne"); x.fill();
      if (n++ < 10) {
        const texte = `${m.pseudo} ${fx(c)}`, larg = x.measureText(texte).width;
        x.fillStyle = "rgba(5, 8, 7, .7)"; x.fillRect(px + 6, py - 22, larg + 8, 18);
        x.fillStyle = v("--papier"); x.fillText(texte, px + 10, py - 9);
      }
    }
    // la fusée 🚀 au bout de la courbe, dans le sens de la montée ; 💥 quand elle explose
    const bx = X(vol.s), by = Y(vol.x);
    if (vol.fini) {
      emojiTexte(x, "💥", bx, by, 0, tailleFusee * 1.4);
    } else {
      const ds = Math.max(0.05, vol.s * 0.02);
      const angle = Math.atan2(by - Y(xAuTemps(vol.s - ds)), bx - X(vol.s - ds));
      const tremble = () => (Math.random() - 0.5) * 1.6;
      emojiFusee(x, bx + tremble(), by + tremble(), angle, tailleFusee);
    }
  }
  const POLICE_EMOJI = "'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
  function emojiTexte(x, e, px, py, rot, taille) {
    x.save();
    x.translate(px, py); x.rotate(rot);
    x.font = `${taille}px ${POLICE_EMOJI}`;
    x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#fff";
    x.fillText(e, 0, 0);
    x.restore();
  }
  // l'emoji 🚀 pointe vers le haut à droite (-45°) : on le tourne pour qu'il suive « angle »
  const emojiFusee = (x, px, py, angle, taille) => emojiTexte(x, "🚀", px, py, angle + Math.PI / 4, taille);
  function rendreCrash() {
    const ph = phase(), vol = etatVol(), t = tourDuJeu();
    ciel.classList.toggle("vol", ph === "vol");
    ciel.classList.toggle("boum", vol.fini && ph !== "ailleurs");
    let grand = "1,00×", petit = "La fusée attend les mises";
    if (ph === "mises" || ph === "tirage") petit = "Décollage à la fin des mises";
    else if (ph === "decollage") { grand = String(Math.ceil(vol.avant || 0)); petit = "Décollage…"; }
    else if (ph === "vol") { grand = fx(vol.x); petit = "Encaisse avant l'explosion !"; }
    else if (vol.fini && t) { grand = "💥 " + fx(vol.x); petit = "La fusée a explosé"; }
    else if (ph === "ailleurs") petit = "La fusée est au garage";
    $("crash-x").textContent = grand;
    $("crash-sous").textContent = petit;
    dessinerCrash();
    rendreActionCrash();
  }
  let signatureActionCrash = "";
  function rendreActionCrash() {
    if (STREAM) return;
    const el = $("crash-action");
    const ph = phase(), t = tourDuJeu(), vol = etatVol();
    const ma = misesDuJeu().find((m) => m.joueur === moi());
    const autoAtteint = ma && ma.cash == null && ma.auto != null && Number(ma.auto) <= vol.x && (ph === "vol" || vol.fini);
    const sig = [ph, !!etat.session, ma ? ma.mise + "|" + ma.auto + "|" + ma.cash + "|" + ma.gain : "", etat.jeton, t ? t.id : "", autoAtteint].join("/");
    if (sig !== signatureActionCrash) {
      signatureActionCrash = sig;
      let html = "";
      if (!etat.session) {
        html = `<p class="kz-ma-mise">Connecte-toi pour jouer.</p><button class="bk-btn bk-btn-twitch" data-action="connexion">Se connecter avec Twitch</button>`;
      } else if (ph === "mises") {
        html = `${ma ? `<p class="kz-ma-mise">Ta mise : <b>${nombre(ma.mise)} c</b>${ma.auto ? ` · encaissement auto à <b>${fx(ma.auto)}</b>` : ""}</p>` : `<p class="kz-ma-mise">Choisis un jeton plus bas, puis mise.</p>`}
          <label for="crash-auto">Encaisser tout seul à (facultatif)
            <input id="crash-auto" inputmode="decimal" placeholder="ex. 2,5" value="${ma && ma.auto ? String(ma.auto).replace(".", ",") : ""}" autocomplete="off"></label>
          <button class="bk-btn bk-btn-plein bk-btn-large" type="button" data-action="crash-miser">${ma ? "Ajouter" : "Miser"} ${nombre(etat.jeton)} c</button>
          ${ma ? `<button class="bk-btn bk-btn-ligne" type="button" data-action="crash-reprendre">Reprendre ma mise (${nombre(ma.mise)} c)</button>` : ""}`;
      } else if ((ph === "vol" || ph === "decollage") && ma) {
        if (ma.cash != null) html = `<p class="kz-ma-mise">Encaissé à <b>${fx(ma.cash)}</b> : <b>+${nombre(ma.gain - ma.mise)} c</b></p>`;
        else if (autoAtteint) html = `<p class="kz-ma-mise">Encaissé automatiquement à <b>${fx(ma.auto)}</b> : <b>+${nombre(Math.floor(ma.mise * ma.auto) - ma.mise)} c</b></p>`;
        else html = `<button class="kz-encaisser" type="button" data-action="crash-encaisser" id="btn-encaisser" ${ph === "decollage" ? "disabled" : ""}>Encaisser<small id="encaisser-detail"></small></button>
          <p class="kz-ma-mise">Ta mise : <b>${nombre(ma.mise)} c</b>${ma.auto ? ` · auto à ${fx(ma.auto)}` : ""}</p>`;
      } else if (vol.fini && ma && t) {
        const net = Number(ma.gain || 0) - Number(ma.mise);
        html = `<p class="kz-ma-mise">${ma.cash != null ? `Encaissé à <b>${fx(ma.cash)}</b> : <b>+${nombre(net)} c</b>` : `Perdu : la fusée a explosé à ${fx(vol.x)} avant ton encaissement.`}</p>`;
      } else if (ph === "vol" || ph === "decollage") {
        html = `<p class="kz-ma-mise">Tu n'as pas misé sur ce vol. Prochain tour dans un instant.</p>`;
      } else {
        html = `<p class="kz-ma-mise">Les mises s'ouvrent au prochain vol.</p>`;
      }
      el.innerHTML = html;
    }
    const d = $("encaisser-detail");
    if (d && ma) d.textContent = ph === "decollage" ? `décollage dans ${Math.ceil(vol.avant || 0)} s` : `${fx(vol.x)} · ${nombre(Math.floor(ma.mise * vol.x))} c`;
  }
  let boucleCrashActive = false;
  function boucleCrash() {
    if (boucleCrashActive) return;
    boucleCrashActive = true;
    const f = () => {
      const ph = phase();
      if (jeuAffiche() === "crash" && !document.hidden) { rendreCrash(); rendreStatut(); }
      if (jeuAffiche() === "crash" && (ph === "vol" || ph === "decollage")) requestAnimationFrame(f);
      else { boucleCrashActive = false; if (jeuAffiche() === "crash") rendreCrash(); }
    };
    requestAnimationFrame(f);
  }
  function lireAuto() {
    const champ = $("crash-auto");
    if (!champ || !champ.value.trim()) return null;
    const v = parseFloat(champ.value.replace(",", ".").replace(/[x×]/gi, ""));
    return Number.isFinite(v) ? v : NaN;
  }

  // =====================================================================
  // COURSE
  // =====================================================================
  const piste = $("piste");
  const couloirs = COUREURS.map((c, i) => {
    const el = document.createElement("div");
    el.className = "kz-couloir";
    const [fond, texte] = DOSSARDS[i];
    el.innerHTML = `
      <div class="kz-fiche">
        <span class="kz-dossard" style="background:${fond};color:${texte}">${i + 1}</span>
        <span class="kz-fiche-nom">${c.nom}<small>${c.espece}</small></span>
        <span class="kz-cote">×${String(c.cote).replace(".", ",")}</span>
        <span class="kz-fiche-qui"></span>
      </div>
      <button class="kz-couloir-piste" type="button" data-coureur="${i + 1}" aria-label="Miser sur ${c.nom}, ${c.espece}, numéro ${i + 1}">
        <span class="kz-coureur" aria-hidden="true"><span class="em">${c.e}</span></span>
        <span class="kz-parier" hidden></span>
      </button>`;
    piste.append(el);
    return { el, coureur: el.querySelector(".kz-coureur"), qui: el.querySelector(".kz-fiche-qui"), cote: el.querySelector(".kz-cote"), parier: el.querySelector(".kz-parier"), btn: el.querySelector(".kz-couloir-piste") };
  });
  function rendreCourse() {
    const ph = phase(), t = tourDuJeu();
    const c = t && t.jeu === "course" ? courseDuTour(t) : null;
    let pas = -1;
    if (c && t.statut === "fini") {
      pas = ph === "animation" ? Math.floor((maintenant() - Date.parse(t.tire_le)) / PAS_MS) : c.pos.length - 1;
      pas = Math.max(0, Math.min(c.pos.length - 1, pas));
    }
    const enCourse = ph === "animation" && pas >= 0;
    $("jeu-course").classList.toggle("en-course", enCourse);
    const montrerGagnant = resultatVisible() && t && t.resultat != null;
    const mises = misesDuJeu();
    couloirs.forEach((L, i) => {
      const p = pas >= 0 ? Math.min(1, c.pos[pas][i] / LONGUEUR) : 0;
      L.coureur.style.setProperty("--p", p.toFixed(4));
      L.coureur.classList.toggle("arret", pas >= 0 && c.modes[pas][i] === 1 && enCourse);
      L.coureur.classList.toggle("turbo", pas >= 0 && c.modes[pas][i] === 2 && enCourse);
      L.el.classList.toggle("gagnant", !!montrerGagnant && t.resultat === i + 1);
      L.cote.textContent = "×" + String(COUREURS[i].cote).replace(".", ",");
      const sur = mises.filter((m) => m.cle === "r" + (i + 1)).sort((a, b) => b.mise - a.mise);
      const total = sur.reduce((s, m) => s + Number(m.mise), 0);
      L.el.classList.toggle("mien", sur.some((m) => m.joueur === moi()));
      L.qui.innerHTML = sur.length ? `${sur.slice(0, 3).map((m) => `<b>${echap(m.pseudo)}</b>`).join(", ")}${sur.length > 3 ? ` +${sur.length - 3}` : ""} · ${nombre(total)} c` : "aucune mise";
      const peut = ph === "mises" && !!etat.session && !STREAM;
      L.parier.hidden = !peut;
      if (peut) L.parier.textContent = `Miser ${court(etat.jeton)}`;
      L.btn.disabled = !peut;
    });
    // commentaire
    let texte = "";
    if (enCourse) {
      const evs = c.evenements.filter((e) => e.pas <= pas);
      const dernier = evs[evs.length - 1];
      if (dernier && pas - dernier.pas < 60) texte = `${COUREURS[dernier.i].espece} ${COUREURS[dernier.i].nom} ${dernier.txt}`;
      else {
        let tete = 0; c.pos[pas].forEach((x, i) => { if (x > c.pos[pas][tete]) tete = i; });
        texte = `En tête : n°${tete + 1} ${COUREURS[tete].nom}`;
      }
    } else if (montrerGagnant) {
      const g = COUREURS[t.resultat - 1];
      texte = `🏁 Victoire de ${g.nom}, ${g.espece.toLowerCase()} n°${t.resultat}, cote ×${String(g.cote).replace(".", ",")}`;
    } else if (ph === "mises") texte = "Les coureurs s'échauffent…";
    $("commentaire").textContent = texte;
  }
  let boucleCourseActive = false;
  function boucleCourse() {
    if (boucleCourseActive) return;
    boucleCourseActive = true;
    const f = () => {
      if (jeuAffiche() === "course" && !document.hidden) { rendreCourse(); rendreStatut(); }
      if (phase() === "animation" && jeuAffiche() === "course") requestAnimationFrame(f);
      else { boucleCourseActive = false; if (jeuAffiche() === "course") rendreCourse(); }
    };
    requestAnimationFrame(f);
  }
  piste.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-coureur]");
    if (b && !STREAM) poser("r" + b.dataset.coureur);
  });

  // =====================================================================
  // Miser (commun aux trois jeux)
  // =====================================================================
  let file = Promise.resolve();
  const enFile = (fn) => { file = file.then(fn, fn); return file; };
  const solde = () => etat.profil ? Number(etat.profil.solde) : 0;
  function peutMiser() {
    if (!etat.session) { annoncer("Connecte-toi avec Twitch pour miser.", "info"); return false; }
    const ph = phase();
    if (ph !== "mises") { annoncer(ph === "ferme" ? "Les jeux sont fermés." : "Les mises sont fermées. Attends le prochain tour.", "info"); return false; }
    return true;
  }
  async function apresAction() {
    try { await chargerMises(); } catch (e) { /* rien */ }
    rendreJeu(); rendreCompte();
  }
  function poser(cle, auto) {
    if (!peutMiser()) return;
    if (etat.gomme && ["roulette", "course"].includes(jeuAffiche())) { reprendre(cle); return; }
    const mise = etat.jeton;
    if (solde() < mise) { annoncer(`Solde insuffisant : tu as ${nombre(solde())} centimes.`, "erreur"); return; }
    const tourId = etat.tour.id;
    // affichage immédiat, confirmé par la base juste après
    const ex = etat.mises.find((m) => m.cle === cle && m.joueur === moi());
    if (ex) { ex.mise = Number(ex.mise) + mise; if (auto) ex.auto = auto; }
    else etat.mises.push({ joueur: moi(), pseudo: etat.profil.pseudo, cle, mise, auto: auto || null, cash: null, gain: null, source: "site" });
    etat.profil.solde = solde() - mise;
    rendreJeu(); rendreCompte();
    enFile(async () => {
      try {
        const r = await appel("kz_miser", { p_tour: tourId, p_cle: cle, p_mise: mise, p_auto: auto || null });
        if (etat.profil && r) etat.profil.solde = r.solde;
      } catch (e) {
        annoncer(messageErreur(e), "erreur");
        try { await chargerProfil(); } catch (e2) { /* rien */ }
      }
      await apresAction();
    });
  }
  function reprendre(cle) {
    if (!etat.mises.some((m) => m.cle === cle && m.joueur === moi())) { annoncer("Tu n'as pas de jeton ici.", "info"); return; }
    const tourId = etat.tour.id;
    enFile(async () => {
      try {
        const r = await appel("kz_retirer", { p_tour: tourId, p_cle: cle });
        if (etat.profil && r) etat.profil.solde = r.solde;
      } catch (e) { annoncer(messageErreur(e), "erreur"); }
      await apresAction();
    });
  }
  function toutReprendre() {
    if (!peutMiser()) return;
    if (!mesTotaux().mise) { annoncer("Tu n'as aucune mise sur ce tour.", "info"); return; }
    const tourId = etat.tour.id;
    enFile(async () => {
      try {
        const r = await appel("kz_retirer", { p_tour: tourId, p_cle: null });
        if (etat.profil && r) etat.profil.solde = r.solde;
        annoncer(`${nombre(r.rendu)} centimes repris.`, "ok");
      } catch (e) { annoncer(messageErreur(e), "erreur"); }
      await apresAction();
    });
  }
  function remiser() {
    if (!peutMiser()) return;
    const tourId = etat.tour.id;
    enFile(async () => {
      try {
        const prec = await sb.from("kz_tours").select("id").eq("jeu", "roulette").lt("id", tourId).order("id", { ascending: false }).limit(30);
        if (prec.error) throw prec.error;
        const ids = (prec.data || []).map((x) => x.id);
        const r = ids.length ? await sb.from("kz_mises").select("tour_id, cle, mise").eq("joueur", moi()).in("tour_id", ids) : { data: [] };
        if (r.error) throw r.error;
        const dernier = Math.max(0, ...r.data.map((m) => m.tour_id));
        const liste = r.data.filter((m) => m.tour_id === dernier);
        if (!liste.length) { annoncer("Tu n'as pas encore joué à la roulette.", "info"); return; }
        const total = liste.reduce((s, m) => s + Number(m.mise), 0);
        if (total > solde()) { annoncer(`Il faut ${nombre(total)} centimes pour remettre tes mises, tu en as ${nombre(solde())}.`, "erreur"); return; }
        for (const m of liste) {
          const x = await appel("kz_miser", { p_tour: tourId, p_cle: m.cle, p_mise: m.mise, p_auto: null });
          if (etat.profil && x) etat.profil.solde = x.solde;
        }
        annoncer(`Mises remises : ${nombre(total)} centimes.`, "ok");
      } catch (e) { annoncer(messageErreur(e), "erreur"); }
      await apresAction();
    });
  }
  let encaissementEnCours = false;
  async function encaisser(bouton) {
    if (encaissementEnCours) return;
    encaissementEnCours = true;
    const b = bouton || $("btn-encaisser");
    if (b) { b.disabled = true; b.firstChild && (b.firstChild.textContent = "Encaissement…"); }
    // appel direct (sans file d'attente) : chaque dixième de seconde compte
    let essai = 0, r = null, erreur = null;
    while (essai < 3) {
      try { r = await appel("kz_encaisser"); erreur = null; break; }
      catch (e) {
        erreur = e;
        // cliqué pile au décollage : on réessaie tout de suite
        if (/pas encore décollé/i.test(e && e.message || "")) { essai++; await new Promise((ok) => setTimeout(ok, 250)); continue; }
        break;
      }
    }
    encaissementEnCours = false;
    if (r) {
      if (etat.profil) etat.profil.solde = r.solde;
      const ma = etat.mises.find((m) => m.joueur === moi() && m.cle === "crash");
      if (ma) { ma.cash = r.cash; ma.gain = r.gain; }
      annoncer(`Encaissé à ${fx(r.cash)} : ${nombre(r.gain)} centimes !`, "ok");
    } else {
      annoncer(messageErreur(erreur), "erreur");
    }
    signatureActionCrash = "";   // redessine le bouton, qui n'est jamais laissé bloqué
    rendreJeu(); rendreCompte();
    chargerMises().then(() => rendreJeu()).catch(() => {});
  }
  function mesTotaux() {
    let mise = 0, gain = 0;
    for (const m of misesDuJeu()) if (m.joueur === moi()) { mise += Number(m.mise); gain += Number(m.gain || 0); }
    return { mise, gain };
  }

  // =====================================================================
  // Affichage commun
  // =====================================================================
  function rendreCompte() {
    if (STREAM) return;
    const el = $("compte");
    if (!etat.session) { el.innerHTML = `<button class="bk-btn bk-btn-twitch" data-action="connexion">Se connecter avec Twitch</button>`; return; }
    const p = etat.profil;
    if (!p) { el.innerHTML = `<span class="bk-discret">Chargement…</span>`; return; }
    const avatar = imageSure(p.avatar);
    const aujourdhui = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    const bonus = !p.dernier_bonus || p.dernier_bonus < aujourdhui;
    const montre = etat.soldeGele != null ? etat.soldeGele : p.solde;
    el.innerHTML = `
      ${bonus ? `<button class="bk-btn bk-btn-bonus" data-action="bonus">+100<span class="bk-masque-mobile"> du jour</span></button>` : ""}
      <span class="bk-solde" title="Ton solde"><span class="piece" aria-hidden="true"></span>${nombre(montre)}</span>
      <span class="bk-profil">
        ${avatar ? `<img class="avatar avatar-petit" src="${echap(avatar)}" alt="">` : `<span class="avatar avatar-petit avatar-vide" aria-hidden="true">${echap((p.pseudo || "?").charAt(0))}</span>`}
        <span class="bk-profil-texte"><strong>${echap(p.pseudo)}</strong>${etat.rang ? `<span>${etat.rang === 1 ? "1er" : etat.rang + "e"} au classement</span>` : ""}</span>
      </span>
      <button class="bk-lien bk-masque-mobile" data-action="deconnexion">Déconnexion</button>`;
  }

  const dureeTexte = (d) => d === 0 ? "Sans minuteur" : d < 60 ? `${d} s` : d % 60 ? `${Math.floor(d / 60)} min ${String(d % 60).padStart(2, "0")}` : `${d / 60} min`;
  const formatMinuteur = (s) => s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : String(s);
  let signatureStatut = "";
  function rendreStatut() {
    const ph = phase(), j = jeuAffiche(), t = tourDuJeu();
    let titre = "", sous = "";
    switch (ph) {
      case "absent": titre = "Les jeux ne sont pas encore installés"; sous = "Il manque les tables kz_ dans la base."; break;
      case "chargement": titre = "Chargement…"; break;
      case "ferme": titre = "Les jeux sont fermés"; sous = STREAM ? "" : "La table ouvre pendant les lives."; break;
      case "ailleurs":
        titre = `En ce moment : ${NOM_JEU[etat.tour.jeu]}`;
        sous = `<span class="kz-ailleurs">La partie se joue de l'autre côté. <button class="bk-btn bk-btn-plein bk-btn-petit" type="button" data-onglet="${etat.tour.jeu}">${{ roulette: "Aller à la roulette", crash: "Aller au crash", course: "Aller à la course" }[etat.tour.jeu]}</button></span>`;
        break;
      case "attente":
      case "annule":
        titre = "Faites vos jeux dans un instant";
        sous = ph === "annule" ? "Tour annulé, toutes les mises ont été rendues." : (estAdmin() ? "Ouvre les mises quand tu es prêt." : "Le prochain tour va s'ouvrir.");
        break;
      case "mises": {
        const reste = Math.ceil((Date.parse(t.ferme_le) - maintenant()) / 1000);
        titre = reste <= 10 && !t.manuel ? "Dernières mises !" : j === "course" ? "Choisissez vos coureurs !" : j === "crash" ? "Embarquement !" : "Faites vos jeux !";
        sous = STREAM ? "Mise sur le site ou dans le chat."
          : !etat.session ? "Connecte-toi avec Twitch pour jouer."
          : j === "roulette" ? "Choisis un jeton, puis clique sur le tapis."
          : j === "course" ? "Choisis un jeton, puis clique sur le couloir de ton coureur."
          : "Choisis un jeton, règle l'encaissement automatique si tu veux, puis mise.";
        if (t.manuel) sous += (sous ? " " : "") + "Pas de minuteur : Kawaze lance quand tout le monde est prêt.";
        break;
      }
      case "tirage": titre = j === "crash" ? "Moteurs allumés" : "Rien ne va plus"; sous = "Les jeux sont faits."; break;
      case "decollage": titre = "Décollage imminent"; sous = "Plus de mises, accroche-toi."; break;
      case "vol": titre = `🚀 ${fx(etatVol().x)}`; sous = "La fusée monte. Encaisse avant qu'elle explose !"; break;
      case "animation": titre = j === "course" ? "Et c'est parti !" : "Rien ne va plus…"; sous = j === "course" ? "" : "La bille tourne."; break;
      case "resultat": {
        if (j === "roulette") titre = t.resultat === 0 ? "Zéro !" : `Le ${t.resultat} ${NOM_COULEUR[couleur(t.resultat)]} !`;
        else if (j === "course") titre = `Victoire de ${COUREURS[t.resultat - 1].nom} !`;
        else titre = `💥 Crash à ${fx(t.resultat_x)}`;
        const m = mesTotaux();
        if (!STREAM && m.mise > 0) {
          const net = m.gain - m.mise;
          sous = net > 0 ? `<span class="gagne">Tu gagnes ${nombre(m.gain)} c (+${nombre(net)})</span>`
            : net === 0 ? "Tu récupères ta mise." : `<span class="perdu">Tu perds ${nombre(-net)} c</span>${m.gain ? ` (${nombre(m.gain)} c récupérés)` : ""}`;
        } else {
          const joueurs = new Set(misesDuJeu().map((x) => x.joueur)).size;
          sous = joueurs ? `${joueurs} joueur${joueurs > 1 ? "s" : ""} · ${nombre(t.total_mise)} c misés · ${nombre(t.total_gain)} c redistribués` : "Personne n'avait misé sur ce tour.";
        }
        break;
      }
    }
    $("surtitre").textContent = j ? `${NOM_JEU[j]}${t ? ` · tour n°${t.id}` : ""}` : "";
    if ($("phase").textContent !== titre) $("phase").textContent = titre;
    if ($("sous-phase").dataset.html !== sous) { $("sous-phase").innerHTML = sous; $("sous-phase").dataset.html = sous; }

    const min = $("minuteur");
    if (ph === "mises" && !t.manuel) {
      const total = (Date.parse(t.ferme_le) - Date.parse(t.ouvert_le)) / 1000;
      const reste = Math.max(0, (Date.parse(t.ferme_le) - maintenant()) / 1000);
      min.hidden = false;
      $("minuteur-texte").textContent = formatMinuteur(Math.ceil(reste));
      min.style.setProperty("--p", Math.max(0, Math.min(1, reste / total)).toFixed(3));
      min.classList.toggle("urgent", reste <= 10);
    } else min.hidden = true;

    rendreAdmin(ph);
    rendreOnglets();
    const sig = ph + (etat.tour ? etat.tour.id + etat.tour.statut : "") + j;
    if (sig !== signatureStatut) { signatureStatut = sig; rendreJeu(); }
  }

  function rendreOnglets() {
    const enDirect = etat.tour && enCours(etat.tour) ? etat.tour.jeu : null;
    document.querySelectorAll(".bk-onglets [data-onglet]").forEach((b) => {
      b.setAttribute("aria-selected", b.dataset.onglet === etat.onglet ? "true" : "false");
      const pastille = b.querySelector(".kz-direct");
      if (pastille) pastille.hidden = b.dataset.onglet !== enDirect;
    });
  }

  let signatureAdmin = "";
  function rendreAdmin(ph) {
    const el = $("admin");
    const j = jeuAffiche();
    if (STREAM || !estAdmin() || !etat.kz || !j) { el.hidden = true; signatureAdmin = ""; return; }
    const k = etat.kz;
    const sig = [ph, j, k.ouvert, k.auto, k.duree_mises, etat.enchainer, etat.confirmerAnnulation].join("|");
    if (sig === signatureAdmin) return;
    signatureAdmin = sig;
    el.hidden = false;
    const durees = [60, 90, 180, 0]; if (!durees.includes(k.duree_mises)) durees.push(k.duree_mises);
    const lancer = (t0 => t0 && t0.manuel ? "Fermer les mises · " : "")(tourDuJeu()) + { roulette: "Lancer la bille", crash: "Décoller", course: "Donner le départ" }[j];
    let actions = "";
    if (k.ouvert && ["attente", "annule", "resultat"].includes(ph)) actions = `<button class="bk-btn bk-btn-plein" type="button" data-action="admin-tour">Ouvrir les mises · ${NOM_JEU[j]}</button>`;
    else if (ph === "mises") actions = `<button class="bk-btn bk-btn-plein" type="button" data-action="admin-tirer">${lancer}</button>
        <button class="bk-btn bk-btn-danger" type="button" data-action="admin-annuler">${etat.confirmerAnnulation ? "Confirmer : rendre toutes les mises" : "Annuler le tour"}</button>`;
    el.innerHTML = `
      <span class="kz-etiquette">Admin</span>
      <label><input type="checkbox" data-admin="ouvert" ${k.ouvert ? "checked" : ""}> Jeux ouverts</label>
      <label title="Ouvre et ferme les jeux tout seuls au début et à la fin de ton live"><input type="checkbox" data-admin="auto" ${k.auto ? "checked" : ""}> Suit le live</label>
      <label>Mises <select data-admin="duree">${durees.sort((a, b) => (a || 1e9) - (b || 1e9)).map((d) => `<option value="${d}" ${d === k.duree_mises ? "selected" : ""}>${dureeTexte(d)}</option>`).join("")}</select></label>
      <label title="Rouvre les mises du même jeu ${ENCHAINER_APRES_MS / 1000} s après chaque résultat"><input type="checkbox" data-admin="enchainer" ${etat.enchainer ? "checked" : ""}> Enchaîner</label>
      ${actions}`;
  }

  function rendreJeu() {
    const j = jeuAffiche();
    const ph = phase();
    const ferme = ph === "ferme" || ph === "absent";
    const classement = !STREAM && etat.onglet === "classement";
    document.querySelectorAll(".kz-vue-jeu").forEach((el) => { el.hidden = classement; });
    $("vue-classement").hidden = !classement;
    $("ferme").hidden = classement || !ferme;
    document.querySelectorAll(".kz-jeu").forEach((el) => { el.hidden = classement || ferme || el.dataset.jeu !== j; });
    $("rack").hidden = classement || ferme || ph === "ailleurs";
    document.querySelectorAll("[data-regles]").forEach((el) => { el.hidden = el.dataset.regles !== j; });
    $("bandeau-chat").innerHTML = "ou dans le chat : " + (CHAT[j] || CHAT.roulette);
    if (classement) { rendreClassement(); return; }
    if (j === "roulette") { construireTapis(); rendreRoulette(); rendreConfirmer(); }
    if (j === "crash") { rendreCrash(); if (ph === "vol" || ph === "decollage") boucleCrash(); }
    if (j === "course") { rendreCourse(); if (ph === "animation") boucleCourse(); }
    rendreRack();
    rendreMises();
    rendreHistorique();
  }

  function rendreRack() {
    if (STREAM) return;
    const box = $("jetons");
    if (!box.childElementCount) {
      box.innerHTML = JETONS.map((v) => `<button type="button" role="radio" class="kz-jeton kz-choix-jeton ${tierJeton(v)}" data-jeton="${v}" aria-label="Jeton de ${v} centimes">${court(v)}</button>`).join("");
    }
    box.querySelectorAll("[data-jeton]").forEach((b) => {
      const v = Number(b.dataset.jeton);
      b.setAttribute("aria-checked", v === etat.jeton ? "true" : "false");
      b.disabled = !!etat.profil && v > solde() && phase() === "mises";
    });
    const j = jeuAffiche();
    const m = mesTotaux();
    $("sur-tapis").innerHTML = m.mise ? `Ta mise : <b>${nombre(m.mise)} c</b>` : (etat.session ? "Aucune mise sur ce tour" : "");
    const actif = phase() === "mises" && !!etat.session;
    $("btn-gomme").hidden = !["roulette", "course"].includes(j);
    $("btn-remiser").hidden = j !== "roulette";
    $("btn-gomme").disabled = !actif || !m.mise;
    $("btn-tout").disabled = !actif || !m.mise;
    $("btn-remiser").disabled = !actif;
    if ((!m.mise || !["roulette", "course"].includes(j)) && etat.gomme) etat.gomme = false;
    $("btn-gomme").setAttribute("aria-pressed", etat.gomme ? "true" : "false");
  }

  function libelleMise(m) {
    if (m.cle === "crash") return m.cash != null ? `encaissé à ${fx(m.cash)}` : m.auto != null ? `auto à ${fx(m.auto)}` : (tourDuJeu() && tourDuJeu().statut === "vol" ? "en vol" : "encaisse à la main");
    if (/^r[1-6]$/.test(m.cle)) { const c = COUREURS[Number(m.cle.slice(1)) - 1]; return `n°${m.cle.slice(1)} ${c.nom}`; }
    return PAR_CLE[m.cle] ? PAR_CLE[m.cle].libelle.replace("Plein ", "") : m.cle;
  }
  function rendreMises() {
    const liste = $("liste-mises");
    const j = jeuAffiche(), ph = phase();
    const revele = resultatVisible();
    const vol = j === "crash" ? etatVol() : null;
    const parJoueur = new Map();
    for (const m of misesDuJeu()) {
      let x = parJoueur.get(m.joueur);
      if (!x) parJoueur.set(m.joueur, x = { pseudo: m.pseudo, mise: 0, gain: 0, details: [], chat: false, encaisse: false });
      x.mise += Number(m.mise);
      // au crash, un encaissement se voit tout de suite (même automatique)
      let gain = Number(m.gain || 0);
      if (j === "crash" && m.cash == null && m.auto != null && vol && Number(m.auto) <= vol.x && (ph === "vol" || vol.fini)) gain = Math.floor(m.mise * m.auto);
      if (j === "crash" && (m.cash != null || gain > 0)) x.encaisse = true;
      x.gain += gain;
      x.details.push(libelleMise(m));
      if (m.source === "chat") x.chat = true;
    }
    const total = [...parJoueur.values()].reduce((s, x) => s + x.mise, 0);
    $("pot").textContent = nombre(total) + " c";
    if (!parJoueur.size) {
      liste.innerHTML = `<li><p class="kz-vide">${ph === "mises" ? "Les premières mises arrivent…" : "Aucune mise pour l'instant."}</p></li>`;
      return;
    }
    const montre = (x) => revele || x.encaisse;
    const tri = [...parJoueur.entries()].sort((a, b) => revele ? (b[1].gain - b[1].mise) - (a[1].gain - a[1].mise) : b[1].mise - a[1].mise);
    const max = STREAM ? 14 : 30;
    liste.innerHTML = tri.slice(0, max).map(([id, x]) => {
      const net = x.gain - x.mise;
      const montant = montre(x) ? (net > 0 ? `+${nombre(net)}` : net === 0 ? "rendu" : `−${nombre(-net)}`) : nombre(x.mise);
      const cls = montre(x) ? (net > 0 ? " gagne" : net < 0 ? " perdu" : "") : "";
      return `<li class="kz-mise-joueur${id === moi() ? " moi" : ""}">
        <span class="kz-mj-nom">${echap(x.pseudo)}${x.chat ? "<small>chat</small>" : ""}</span>
        <span class="kz-mj-total${cls}">${montant}</span>
        <span class="kz-mj-detail">${echap(x.details.join(" · "))}</span></li>`;
    }).join("") + (tri.length > max ? `<li><p class="kz-vide">+ ${tri.length - max} autres joueurs</p></li>` : "");
  }

  function rendreHistorique() {
    const j = jeuAffiche();
    if (!j) return;
    let h = etat.histos[j] || [];
    if (phase() === "animation" && etat.tour) h = h.filter((x) => x.id !== etat.tour.id);
    const el = $("histo-" + j);
    const max = STREAM ? 12 : 14;
    if (!h.length) { el.innerHTML = `<span class="bk-discret">Aucun tour pour l'instant</span>`; return; }
    if (j === "roulette") el.innerHTML = h.slice(0, max).map((x) => `<span class="kz-histo ${couleur(x.resultat)}">${x.resultat}</span>`).join("");
    if (j === "crash") el.innerHTML = h.slice(0, max).map((x) => { const v = Number(x.resultat_x); return `<span class="kz-histo ${v < 1.5 ? "bas" : v < 5 ? "moyen" : "haut"}">${fx(v)}</span>`; }).join("");
    if (j === "course") el.innerHTML = h.slice(0, max).map((x) => { const [f, t] = DOSSARDS[x.resultat - 1]; return `<span class="kz-histo dossard" style="background:${f};color:${t}" title="${COUREURS[x.resultat - 1].nom}">${x.resultat}</span>`; }).join("");
  }

  function rendreClassement() {
    const el = $("classement");
    if (!etat.classement.length) { el.innerHTML = `<li class="bk-vide">Personne n'a encore joué. À toi !</li>`; return; }
    el.innerHTML = etat.classement.map((p, i) => {
      const a = imageSure(p.avatar);
      return `<li class="${p.id === moi() ? "c-moi" : ""}">
        <span class="c-rang">${i + 1}</span>
        ${a ? `<img class="avatar avatar-petit" src="${echap(a)}" alt="" loading="lazy">` : `<span class="avatar avatar-petit avatar-vide" aria-hidden="true">${echap((p.pseudo || "?").charAt(0))}</span>`}
        <span class="c-pseudo">${echap(p.pseudo)}</span>
        <span class="c-solde">${nombre(p.solde)}</span></li>`;
    }).join("");
    $("mon-rang").textContent = etat.profil && etat.rang ? `Toi : ${etat.rang === 1 ? "1er" : etat.rang + "e"} avec ${nombre(etat.profil.solde)} centimes.` : "";
  }

  function rendreTout() {
    suivreTirage();
    rendreCompte();
    rendreStatut();
    rendreJeu();
    rendreCroupier();
  }

  function changerOnglet(nom) {
    etat.onglet = nom;
    etat.choix = null; etat.gomme = false;
    try { history.replaceState(null, "", "#" + nom); } catch (e) { /* rien */ }
    if (nom === "classement") chargerClassement().then(rendreClassement);
    signatureStatut = "";
    rendreStatut();
    rendreJeu();
  }

  // =====================================================================
  // Admin
  // =====================================================================
  async function admin(fn, ok) {
    try { await fn(); if (ok) annoncer(ok, "ok"); } catch (e) { annoncer(messageErreur(e), "erreur"); }
    try { await Promise.all([chargerEtat(), chargerTour()]); } catch (e) { /* rien */ }
    rendreTout();
  }
  $("admin").addEventListener("change", (ev) => {
    const c = ev.target.dataset.admin;
    if (c === "ouvert") admin(() => appel("kz_ouvrir", { p_ouvert: ev.target.checked }), ev.target.checked ? "Jeux ouverts." : "Jeux fermés, le tour en cours est remboursé.");
    if (c === "auto") admin(() => appel("kz_regler", { p_auto: ev.target.checked }));
    if (c === "duree") admin(() => appel("kz_regler", { p_duree: Number(ev.target.value) }));
    if (c === "enchainer") {
      etat.enchainer = ev.target.checked;
      try { localStorage.setItem("kz-enchainer", etat.enchainer ? "1" : "0"); } catch (e) { /* rien */ }
      signatureAdmin = ""; rendreStatut();
    }
  });

  // =====================================================================
  // Clics
  // =====================================================================
  document.addEventListener("click", (ev) => {
    const onglet = ev.target.closest("[data-onglet]");
    if (onglet) { changerOnglet(onglet.dataset.onglet); return; }
    const jt = ev.target.closest("[data-jeton]");
    if (jt) {
      etat.jeton = Number(jt.dataset.jeton);
      etat.gomme = false;
      try { localStorage.setItem("kz-jeton", String(etat.jeton)); } catch (e) { /* rien */ }
      rendreJeu(); infoPari(etat.survol || etat.choix);
      return;
    }
    const b = ev.target.closest("[data-action]");
    if (!b) return;
    switch (b.dataset.action) {
      case "connexion":
        sb.auth.signInWithOAuth({ provider: "twitch", options: { redirectTo: location.origin + location.pathname } })
          .then((r) => { if (r.error) annoncer(messageErreur(r.error), "erreur"); });
        break;
      case "deconnexion": sb.auth.signOut(); break;
      case "tip": {
        if (!etat.session) return;
        const montant = Number(b.dataset.montant);
        if (solde() < montant) { annoncer(`Solde insuffisant : tu as ${nombre(solde())} centimes.`, "erreur"); return; }
        enFile(async () => {
          try {
            const r = await appel("kz_tip", { p_montant: montant });
            if (etat.profil && r) etat.profil.solde = r.solde;
            annoncer(`Merci pour le croupier ! ${nombre(montant)} centimes offerts.`, "ok");
          } catch (e) { annoncer(messageErreur(e), "erreur"); }
          await chargerDons(); rendreCompte(); rendreCroupier();
        });
        break;
      }
      case "bonus":
        appel("bonus_du_jour").then(() => { annoncer("+100 centimes ajoutés !", "ok"); return chargerProfil(); })
          .catch((e) => annoncer(messageErreur(e), "erreur")).then(rendreCompte);
        break;
      case "gomme": etat.gomme = !etat.gomme; etat.choix = null; rendreJeu(); break;
      case "tout-reprendre": toutReprendre(); break;
      case "remiser": remiser(); break;
      case "choix-poser": if (etat.choix) poser(etat.choix); break;
      case "choix-annuler":
        etat.choix = null;
        tapis.querySelectorAll(".kz-cible.choisie").forEach((x) => x.classList.remove("choisie"));
        rendreJeu();
        break;
      case "crash-miser": {
        const auto = lireAuto();
        if (Number.isNaN(auto) || (auto != null && (auto < 1.01 || auto > 1000))) { annoncer("L'encaissement automatique doit être un nombre entre 1,01 et 1 000.", "erreur"); return; }
        poser("crash", auto);
        break;
      }
      case "crash-encaisser": encaisser(b); break;
      case "crash-reprendre": if (peutMiser()) reprendre("crash"); break;
      case "admin-tour": admin(() => appel("kz_nouveau_tour", { p_jeu: jeuAffiche(), p_duree: etat.kz.duree_mises })); break;
      case "admin-tirer": admin(() => appel("kz_tirer", { p_tour: etat.tour.id })); break;
      case "admin-annuler":
        if (!etat.confirmerAnnulation) { etat.confirmerAnnulation = true; rendreStatut(); setTimeout(() => { etat.confirmerAnnulation = false; rendreStatut(); }, 5000); return; }
        etat.confirmerAnnulation = false;
        admin(() => appel("kz_annuler_tour", { p_tour: etat.tour.id }), "Tour annulé, toutes les mises sont rendues.");
        break;
    }
  });
  // changer l'encaissement automatique après avoir misé
  $("admin-don").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const nom = $("don-nom").value.trim(), montant = Math.floor(Number($("don-montant").value) || 0);
    if (!nom || montant < 1) { annoncer("Indique un pseudo et un nombre de centimes.", "erreur"); return; }
    enFile(async () => {
      try {
        const r = await appel("kz_donner", { p_nom: nom, p_montant: montant });
        annoncer(`${nombre(r.montant)} centimes donnés à ${r.pseudo}.`, "ok");
        $("don-nom").value = "";
        chargerClassement().then(() => rendreClassement && rendreClassement()).catch(() => {});
      } catch (e) { annoncer(messageErreur(e), "erreur"); }
    });
  });

  document.addEventListener("change", (ev) => {
    if (ev.target.id !== "crash-auto" || phase() !== "mises") return;
    const ma = misesDuJeu().find((m) => m.joueur === moi());
    if (!ma) return;
    const auto = lireAuto();
    if (Number.isNaN(auto) || (auto != null && (auto < 1.01 || auto > 1000))) { annoncer("L'encaissement automatique doit être un nombre entre 1,01 et 1 000.", "erreur"); return; }
    const tourId = etat.tour.id;
    enFile(async () => {
      try { await appel("kz_regler_auto", { p_tour: tourId, p_auto: auto }); annoncer(auto ? `Encaissement automatique à ${fx(auto)}.` : "Encaissement automatique retiré.", "ok"); }
      catch (e) { annoncer(messageErreur(e), "erreur"); }
      await apresAction();
    });
  });
  document.addEventListener("keydown", (ev) => {
    // Espace pendant le vol : encaisser
    if (ev.code === "Space" && jeuAffiche() === "crash" && phase() === "vol" && !ev.target.closest("input, textarea, select, button")) {
      const b = $("btn-encaisser");
      if (b && !b.disabled) { ev.preventDefault(); b.click(); }
    }
  });

  // =====================================================================
  // Temps réel
  // =====================================================================
  sb.channel("kawaze-games")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "kz_dons" }, () => {
      chargerDons().then(rendreCroupier).catch(() => {});
      chargerProfil().then(rendreCompte).catch(() => {});
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "kz_etat" }, (p) => {
      if (p.new && p.new.id === 1) { etat.kz = p.new; rendreTout(); }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "kz_tours" }, (p) => {
      const t = p.new;
      if (!t || !t.id || (etat.tour && t.id < etat.tour.id)) return;
      const nouveau = !etat.tour || t.id !== etat.tour.id;
      etat.tour = t;
      if (nouveau) {
        etat.mises = []; etat.choix = null; etat.gomme = false; planifierMises();
        basculerVers(t);
      }
      if (t.statut === "fini") { chargerHistoriques().then(() => rendreHistorique()); planifierMises(); }
      if (t.statut === "vol") planifierMises();
      rendreTout();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "kz_mises" }, (p) => {
      const tid = (p.new && p.new.tour_id) || (p.old && p.old.tour_id);
      if (!etat.tour || !tid || tid === etat.tour.id) planifierMises();
    })
    .subscribe();

  // =====================================================================
  // Horloge
  // =====================================================================
  setInterval(() => {
    const t = etat.tour;
    // temps de mise écoulé : le premier navigateur lance le tour (la base ne le fait qu'une fois)
    if (t && t.statut === "mises" && maintenant() >= Date.parse(t.ferme_le) && etat.tirageDemande !== t.id) {
      const id = t.id;
      etat.tirageDemande = id;
      setTimeout(() => {
        if (!etat.tour || etat.tour.id !== id || etat.tour.statut !== "mises") return;
        appel("kz_tirer", { p_tour: id })
          .then((r) => { if (r && etat.tour && r.id === etat.tour.id) { etat.tour = r; rendreTout(); } })
          .catch(() => { setTimeout(() => { if (etat.tirageDemande === id) etat.tirageDemande = null; }, 2000); });
      }, Math.random() * 1200);
    }
    // crash en vol : demander à la base si la fusée a explosé (environ chaque seconde)
    if (t && t.jeu === "crash" && t.statut === "vol" && maintenant() > Date.parse(t.depart) && Date.now() - etat.suiviVol > 450 + Math.random() * 200) {
      etat.suiviVol = Date.now();
      const id = t.id;
      appel("kz_suivre_vol", { p_tour: id }).then((r) => {
        if (r && etat.tour && r.id === etat.tour.id && r.statut !== etat.tour.statut) { etat.tour = r; planifierMises(); chargerHistoriques().then(rendreHistorique); rendreTout(); chargerProfil().then(rendreCompte).catch(() => {}); }
      }).catch(() => {});
    }
    // enchaîner : rouvrir le même jeu après le résultat
    if (etat.enchainer && estAdmin() && t && etat.kz && etat.kz.ouvert && t.statut !== "mises" && t.statut !== "vol" && !enCours(t) && etat.enchaineTour !== t.id && maintenant() - Date.parse(t.tire_le || 0) < 90000) {
      etat.enchaineTour = t.id;
      const id = t.id, jeu = t.jeu;
      setTimeout(() => {
        if (!etat.enchainer || !etat.tour || etat.tour.id !== id) return;
        appel("kz_nouveau_tour", { p_jeu: jeu, p_duree: etat.kz.duree_mises }).then((r) => { if (r) { etat.tour = r; etat.mises = []; rendreTout(); } })
          .catch((e) => annoncer(messageErreur(e), "erreur"));
      }, ENCHAINER_APRES_MS);
    }
    rendreStatut();
    if (jeuAffiche() === "crash" && ["vol", "decollage"].includes(phase())) boucleCrash();
  }, 250);
  // filet de sécurité si le temps réel décroche
  setInterval(() => {
    if (document.hidden) return;
    Promise.all([chargerEtat(), chargerTour()]).then(() => { suivreTirage(); planifierMises(); rendreStatut(); }).catch(() => {});
  }, 10000);
  setInterval(synchroniserHeure, 120000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) toutRecharger(); });

  // =====================================================================
  // Démarrage
  // =====================================================================
  dessinerRoue();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(dessinerRoue);
  if (window.ResizeObserver) {
    new ResizeObserver(() => { if (jeuAffiche() === "roulette") { construireTapis(); mesurerTapis(); rendreRoulette(); } }).observe(tapis.parentElement);
    new ResizeObserver(() => { if (jeuAffiche() === "crash") dessinerCrash(); }).observe(ciel);
  }
  rendreOnglets();
  rendreCompte();
  rendreJeu();

  sb.auth.onAuthStateChange((evenement, session) => {
    const changement = (etat.session && etat.session.user.id) !== (session && session.user.id);
    etat.session = session;
    if (changement) etat.reclame = false;
    if (evenement === "INITIAL_SESSION" || changement) setTimeout(toutRecharger, 0);
  });
})();
