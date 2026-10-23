// Page Paris : connexion Twitch, cotes, coupon de pari, classement et espace admin.
// Les règles (solde, heure de fermeture, admins) sont vérifiées dans la base Supabase.

(function () {
  const $ = (id) => document.getElementById(id);
  const echap = (t) => String(t ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const nombre = (n) => Number(n || 0).toLocaleString("fr-FR");
  const imageSure = (u) => /^https:\/\//i.test(String(u || "")) ? String(u) : "";
  const MISE_MIN = 10;
  const CASHOUT_MINUTES = 10;   // identique à la base
  const CASHOUT_POURCENT = 75;

  const config = window.PARIS_CONFIG || {};
  if (!config.url || !config.cle || !window.supabase) {
    $("liste-matchs").innerHTML = `<p class="bk-vide">Les paris ne sont pas encore ouverts. Reviens bientôt !</p>`;
    return;
  }

  const sb = window.supabase.createClient(config.url, config.cle, {
    auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true },
  });

  const etat = {
    session: null,
    profil: null,
    rang: null,
    ouverts: [],
    resultats: [],
    paris: [],
    mesParis: [],
    classement: [],
    coupon: null,        // { match, choix, mise }
    couponOuvert: false, // feuille du coupon sur mobile
    onglet: "matchs",
    confirmation: null,
    cashout: null,
    synchro: null,       // réglages et état de la synchro lolesports (admins)       // match dont le cash out attend une confirmation
    occupe: false,
  };

  // ---------- Messages ----------
  let minuterieAnnonce;
  function annoncer(texte, type = "info") {
    const el = $("annonce");
    el.textContent = texte;
    el.className = "annonce annonce-" + type;
    el.hidden = false;
    clearTimeout(minuterieAnnonce);
    minuterieAnnonce = setTimeout(() => { el.hidden = true; }, 5000);
  }
  const messageErreur = (e) =>
    (e && e.message && !/fetch|network/i.test(e.message)) ? e.message : "Connexion impossible. Vérifie ta connexion et réessaie.";

  // ---------- Dates ----------
  const debutJour = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  function libelleJour(iso) {
    const ecart = Math.round((debutJour(iso) - debutJour(Date.now())) / 86400000);
    if (ecart === 0) return "Aujourd'hui";
    if (ecart === 1) return "Demain";
    if (ecart === -1) return "Hier";
    const t = new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  const heure = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  const versChampDate = (iso) => {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // ---------- Règles de jeu (identiques à la base) ----------
  const nomEquipe = (m, choix) => (choix === "a" ? m.equipe_a : m.equipe_b);
  function logoEquipe(m, choix) {
    const u = imageSure(choix === "a" ? m.logo_a : m.logo_b);
    return u ? `<img class="bk-logo-equipe" src="${echap(u)}" alt="" loading="lazy" onerror="this.remove()">` : "";
  }
  const fermeture = (m) => new Date(m.debut).getTime() + (m.delai_minutes ?? 5) * 60000;
  function phaseMatch(m) {
    const t = Date.now();
    if (t < new Date(m.debut).getTime()) return "avant";
    return t < fermeture(m) ? "live-ouvert" : "live-ferme";
  }
  const parisOuverts = (m) => m.statut === "ouvert" && phaseMatch(m) !== "live-ferme";

  function cagnottes(matchId) {
    let a = 0, b = 0, n = 0;
    for (const p of etat.paris) {
      if (p.match_id !== matchId || p.encaisse) continue;
      if (p.choix === "a") a += p.mise; else b += p.mise;
      n++;
    }
    return { a, b, total: a + b, n };
  }
  const monPari = (matchId) =>
    etat.session ? etat.paris.find((p) => p.match_id === matchId && p.joueur === etat.session.user.id) : null;

  // Mise + part des perdants + part de la cagnotte offerte (au plus le double de la mise)
  function gain(c, choix, mise, dejaCompte, bonus) {
    const camp = (choix === "a" ? c.a : c.b) + (dejaCompte ? 0 : mise);
    const autre = choix === "a" ? c.b : c.a;
    if (camp <= 0) return mise;
    return mise + Math.floor((mise * autre) / camp) + Math.min(mise, Math.floor((mise * (bonus || 0)) / camp));
  }
  // Cagnotte offerte + les 25 % laissés par les cash out
  const cagnotteOfferte = (m) => (m.bonus || 0) + (m.bonus_encaisse || 0);
  // Cote indicative : ce que rapporte 100 centimes misés maintenant
  const cote = (m, choix) => gain(cagnottes(m.id), choix, 100, false, cagnotteOfferte(m)) / 100;
  // Cash out : jusqu'à 10 minutes après le début, 75 % de la mise
  const cashoutPossible = (m, pari) => !!pari && !pari.encaisse && m.statut === "ouvert" &&
    Date.now() < new Date(m.debut).getTime() + CASHOUT_MINUTES * 60000;
  const montantCashout = (pari) => Math.floor((pari.mise * CASHOUT_POURCENT) / 100);
  function blocCashout(m, pari) {
    if (!cashoutPossible(m, pari)) return "";
    const rendu = nombre(montantCashout(pari));
    if (etat.cashout === m.id) {
      return `<span class="bk-cashout-confirmer">Récupérer ${rendu} sur ${nombre(pari.mise)} misés ?
        <button class="bk-btn bk-btn-plein bk-btn-petit" data-action="cashout-confirmer" data-match="${m.id}">Oui, cash out</button>
        <button class="bk-btn bk-btn-ligne bk-btn-petit" data-action="cashout-renoncer">Non</button></span>`;
    }
    const reste = Math.max(1, Math.ceil((new Date(m.debut).getTime() + CASHOUT_MINUTES * 60000 - Date.now()) / 60000));
    const delai = Date.now() >= new Date(m.debut).getTime() ? ` · encore ${reste} min` : "";
    return `<button class="bk-btn bk-btn-cashout bk-btn-petit" data-action="cashout-demander" data-match="${m.id}">Cash out ${rendu}${delai}</button>`;
  }
  const coteTexte = (x) => x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const bonusDispo = () => {
    if (!etat.profil) return false;
    const aujourdhui = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    return !etat.profil.dernier_bonus || etat.profil.dernier_bonus < aujourdhui;
  };

  // ---------- Chargement ----------
  async function chargerMatchs() {
    const [ouverts, finis] = await Promise.all([
      sb.from("matchs").select("*").eq("statut", "ouvert").order("debut", { ascending: true }),
      sb.from("matchs").select("*").neq("statut", "ouvert").order("debut", { ascending: false }).limit(30),
    ]);
    if (ouverts.error) throw ouverts.error;
    if (finis.error) throw finis.error;
    etat.ouverts = ouverts.data || [];
    etat.resultats = finis.data || [];

    const ids = [...etat.ouverts, ...etat.resultats].map((m) => m.id);
    if (ids.length) {
      const r = await sb.from("paris").select("match_id, joueur, choix, mise, gain, encaisse").in("match_id", ids);
      if (r.error) throw r.error;
      etat.paris = r.data || [];
    } else {
      etat.paris = [];
    }
    // Le coupon ne garde pas un match fermé ou déjà parié
    if (etat.coupon) {
      const m = etat.ouverts.find((x) => x.id === etat.coupon.match);
      if (!m || !parisOuverts(m) || monPari(m.id)) etat.coupon = null;
    }
  }

  async function chargerMesParis() {
    if (!etat.session) { etat.mesParis = []; return; }
    const r = await sb.from("paris")
      .select("match_id, choix, mise, gain, encaisse, cree_le, matchs(id, equipe_a, equipe_b, debut, statut, gagnant, bonus, bonus_encaisse, delai_minutes)")
      .eq("joueur", etat.session.user.id)
      .order("cree_le", { ascending: false })
      .limit(50);
    if (r.error) throw r.error;
    etat.mesParis = r.data || [];
  }

  async function chargerSynchro() {
    if (!(etat.profil && etat.profil.admin)) { etat.synchro = null; return; }
    const r = await sb.from("synchro").select("*").eq("id", 1).maybeSingle();
    etat.synchro = r.error ? { absente: true } : (r.data || { absente: true });
  }

  async function chargerClassement() {
    const r = await sb.from("profils").select("id, pseudo, avatar, solde").order("solde", { ascending: false }).limit(20);
    if (r.error) throw r.error;
    etat.classement = r.data || [];
    if (etat.profil) {
      const c = await sb.from("profils").select("id", { count: "exact", head: true }).gt("solde", etat.profil.solde);
      etat.rang = c.error ? null : (c.count || 0) + 1;
    }
  }

  async function chargerProfil() {
    if (!etat.session) { etat.profil = null; etat.rang = null; return; }
    const r = await sb.rpc("synchroniser_profil");
    if (r.error) throw r.error;
    etat.profil = r.data;
  }

  async function toutRecharger() {
    try {
      await chargerProfil();
      await Promise.all([chargerMatchs(), chargerClassement(), chargerMesParis(), chargerSynchro()]);
    } catch (e) {
      annoncer(messageErreur(e), "erreur");
    }
    afficherTout();
  }

  // ---------- Barre du haut : compte ----------
  function afficherCompte() {
    const el = $("compte");
    if (!etat.session) {
      el.innerHTML = `<button class="bk-btn bk-btn-twitch" data-action="connexion">Se connecter avec Twitch</button>`;
      return;
    }
    const p = etat.profil;
    if (!p) { el.innerHTML = `<span class="bk-discret">Chargement…</span>`; return; }
    const avatar = imageSure(p.avatar);
    el.innerHTML = `
      ${bonusDispo() ? `<button class="bk-btn bk-btn-bonus" data-action="bonus">+100<span class="bk-masque-mobile"> du jour</span></button>` : ""}
      <span class="bk-solde" title="Ton solde"><span class="piece" aria-hidden="true"></span>${nombre(p.solde)}</span>
      <span class="bk-profil">
        ${avatar ? `<img class="avatar avatar-petit" src="${echap(avatar)}" alt="">` : `<span class="avatar avatar-petit avatar-vide" aria-hidden="true">${echap(p.pseudo.charAt(0))}</span>`}
        <span class="bk-profil-texte"><strong>${echap(p.pseudo)}</strong>${etat.rang ? `<span>${etat.rang === 1 ? "1er" : etat.rang + "e"} au classement</span>` : ""}</span>
      </span>
      <button class="bk-lien bk-masque-mobile" data-action="deconnexion">Déconnexion</button>`;
  }

  // ---------- Onglets ----------
  function afficherOnglets() {
    const estAdmin = !!(etat.profil && etat.profil.admin);
    $("onglet-admin").hidden = !estAdmin;
    if (etat.onglet === "admin" && !estAdmin && etat.profil) etat.onglet = "matchs";
    document.querySelectorAll("[data-onglet]").forEach((b) => b.setAttribute("aria-selected", b.dataset.onglet === etat.onglet ? "true" : "false"));
    document.querySelectorAll("[data-vue]").forEach((v) => { v.hidden = v.dataset.vue !== etat.onglet; });
  }

  // ---------- Matchs ----------
  function grouperParJour(liste) {
    const groupes = [];
    for (const m of liste) {
      const cle = debutJour(m.debut);
      let g = groupes.find((x) => x.cle === cle);
      if (!g) groupes.push(g = { cle, libelle: libelleJour(m.debut), matchs: [] });
      g.matchs.push(m);
    }
    return groupes;
  }

  function ligneMatch(m) {
    const c = cagnottes(m.id);
    const mien = monPari(m.id);
    const phase = phaseMatch(m);
    const ouvert = parisOuverts(m) && !mien;
    const sel = etat.coupon && etat.coupon.match === m.id ? etat.coupon.choix : null;

    const bouton = (choix) => {
      const classes = ["bk-cote"];
      if (sel === choix) classes.push("bk-cote-choisie");
      if (mien && mien.choix === choix) classes.push("bk-cote-mienne");
      return `<button class="${classes.join(" ")}" ${ouvert ? `data-action="choisir" data-match="${m.id}" data-choix="${choix}"` : "disabled"}
          aria-pressed="${sel === choix}">
          <span class="bk-cote-nom">${logoEquipe(m, choix)}${echap(nomEquipe(m, choix))}</span>
          <span class="bk-cote-val">${ouvert || mien ? coteTexte(cote(m, choix)) : "—"}</span>
        </button>`;
    };

    const quand = phase === "avant"
      ? `<span class="bk-heure">${heure(m.debut)}</span>`
      : `<span class="bk-live">Live</span>`;

    const infos = [];
    if (phase === "live-ouvert" && !mien) {
      const min = Math.max(1, Math.ceil((fermeture(m) - Date.now()) / 60000));
      infos.push(`<span class="bk-urgent">Ferme dans ${min} min</span>`);
    }
    if (phase === "live-ferme") infos.push(`<span>Paris fermés · résultat bientôt</span>`);
    if (mien && mien.encaisse) infos.push(`<span class="bk-mon-pari">Cash out fait : ${nombre(mien.gain)} récupérés sur ${nombre(mien.mise)}</span>`);
    else if (mien) infos.push(`<span class="bk-mon-pari">Ton pari : ${nombre(mien.mise)} sur ${echap(nomEquipe(m, mien.choix))} · gain estimé ${nombre(gain(c, mien.choix, mien.mise, true, cagnotteOfferte(m)))}</span>`);
    infos.push(`<span>${nombre(c.total)} misés · ${c.n} ${c.n > 1 ? "paris" : "pari"}</span>`);
    if (cagnotteOfferte(m)) infos.push(`<span class="bk-offert">+${nombre(cagnotteOfferte(m))} offerts</span>`);
    const cashout = blocCashout(m, mien);

    return `
      <article class="bk-match${phase !== "avant" ? " bk-match-live" : ""}">
        <div class="bk-match-quand">${quand}${m.phase ? `<span class="bk-phase">${echap(m.phase)}</span>` : ""}</div>
        <div class="bk-match-cotes">${bouton("a")}${bouton("b")}</div>
        <div class="bk-match-infos">${infos.join("")}</div>
        ${cashout ? `<div class="bk-match-cashout">${cashout}</div>` : ""}
      </article>`;
  }

  function afficherMatchs() {
    const el = $("liste-matchs");
    if (!etat.ouverts.length) {
      el.innerHTML = `<p class="bk-vide">Pas de match ouvert pour l'instant. Les prochains arrivent bientôt.</p>`;
      return;
    }
    const live = etat.ouverts.filter((m) => phaseMatch(m) !== "avant");
    const avenir = etat.ouverts.filter((m) => phaseMatch(m) === "avant");
    let html = "";
    if (live.length) html += `<div class="bk-groupe"><h2 class="bk-groupe-titre bk-groupe-live">En direct</h2>${live.map(ligneMatch).join("")}</div>`;
    html += grouperParJour(avenir).map((g) =>
      `<div class="bk-groupe"><h2 class="bk-groupe-titre">${g.libelle}</h2>${g.matchs.map(ligneMatch).join("")}</div>`).join("");
    el.innerHTML = html;
  }

  // ---------- Coupon ----------
  function calculCoupon() {
    const cp = etat.coupon;
    const m = cp && etat.ouverts.find((x) => x.id === cp.match);
    const solde = etat.profil ? etat.profil.solde : 0;
    if (!m) return { gain: 0, ok: false, solde };
    const ok = cp.mise >= MISE_MIN && cp.mise <= solde;
    return { gain: ok ? gain(cagnottes(m.id), cp.choix, cp.mise, false, cagnotteOfferte(m)) : 0, ok, solde };
  }

  function aideMise(mise, solde) {
    if (!(mise >= MISE_MIN)) return `Mise minimum : ${MISE_MIN} centimes.`;
    if (mise > solde) return `Solde insuffisant : tu as ${nombre(solde)} centimes.`;
    return `Il te restera ${nombre(solde - mise)} centimes. Le gain final dépend des mises à la fermeture.`;
  }

  function afficherCoupon() {
    const el = $("coupon");
    const cp = etat.coupon;
    const m = cp && etat.ouverts.find((x) => x.id === cp.match);
    el.classList.toggle("bk-coupon-actif", !!m);
    el.classList.toggle("bk-coupon-ouvert", !!m && etat.couponOuvert);

    if (!m) {
      el.innerHTML = `
        <div class="bk-coupon-tete"><h2>Coupon</h2></div>
        <p class="bk-coupon-vide">Clique sur une cote pour préparer ton pari.</p>`;
      return;
    }

    const { gain: g, ok, solde } = calculCoupon();
    let corps;
    if (!etat.session) {
      corps = `<button class="bk-btn bk-btn-twitch bk-btn-large" data-action="connexion">Se connecter avec Twitch pour parier</button>`;
    } else {
      corps = `
        <label class="bk-mise">Mise
          <input type="number" inputmode="numeric" min="${MISE_MIN}" max="${solde}" step="1" value="${cp.mise || ""}" id="coupon-mise">
        </label>
        <div class="bk-raccourcis">
          <button data-action="ajouter" data-valeur="100">+100</button>
          <button data-action="ajouter" data-valeur="500">+500</button>
          <button data-action="ajouter" data-valeur="tout">Tout</button>
        </div>
        <dl class="bk-recap">
          <div><dt>Cote pour ta mise</dt><dd id="coupon-cote">${ok ? coteTexte(g / cp.mise) : coteTexte(cote(m, cp.choix))}</dd></div>
          <div class="bk-recap-gain"><dt>Gain potentiel</dt><dd id="coupon-gain">${ok ? nombre(g) : "—"}</dd></div>
        </dl>
        <p class="bk-coupon-aide" id="coupon-aide">${aideMise(cp.mise, solde)}</p>
        <button class="bk-btn bk-btn-plein bk-btn-large" data-action="parier" id="coupon-valider" ${ok ? "" : "disabled"}>Valider le pari</button>`;
    }

    el.innerHTML = `
      <div class="bk-coupon-tete">
        <h2>Coupon <span class="bk-pastille">1</span></h2>
        <button class="bk-lien bk-coupon-replier" data-action="replier">Replier</button>
      </div>
      <button class="bk-coupon-barre" data-action="deplier">
        <span>${echap(nomEquipe(m, cp.choix))} · cote ${coteTexte(cote(m, cp.choix))}</span>
        <strong>Voir le coupon</strong>
      </button>
      <div class="bk-coupon-corps">
        <div class="bk-selection">
          <div>
            <p class="bk-selection-match">${echap(m.equipe_a)} vs ${echap(m.equipe_b)} · ${libelleJour(m.debut)} ${heure(m.debut)}</p>
            <p class="bk-selection-choix">${echap(nomEquipe(m, cp.choix))}</p>
          </div>
          <button class="bk-retirer" data-action="retirer" aria-label="Retirer ce pari du coupon">×</button>
        </div>
        ${corps}
      </div>`;
  }

  function majCouponSansRedessiner() {
    if (!etat.coupon) return;
    const { gain: g, ok, solde } = calculCoupon();
    const elGain = $("coupon-gain"), aide = $("coupon-aide"), btn = $("coupon-valider"), elCote = $("coupon-cote");
    if (elGain) elGain.textContent = ok ? nombre(g) : "—";
    if (elCote && ok) elCote.textContent = coteTexte(g / etat.coupon.mise);
    if (aide) aide.textContent = aideMise(etat.coupon.mise, solde);
    if (btn) btn.disabled = !ok;
  }

  // ---------- Mes paris ----------
  function afficherMesParis() {
    const el = $("liste-mes-paris");
    if (!etat.session) {
      el.innerHTML = `<p class="bk-vide">Connecte-toi avec Twitch pour voir tes paris.</p>
        <button class="bk-btn bk-btn-twitch" data-action="connexion">Se connecter avec Twitch</button>`;
      return;
    }
    const sortie = `<p class="bk-sortie">Connecté en tant que ${echap(etat.profil ? etat.profil.pseudo : "")} · <button class="bk-lien" data-action="deconnexion">Se déconnecter</button></p>`;
    if (!etat.mesParis.length) { el.innerHTML = `<p class="bk-vide">Tu n'as pas encore parié. Choisis une cote dans l'onglet Matchs.</p>` + sortie; return; }
    el.innerHTML = `<ul class="bk-liste">${etat.mesParis.map((p) => {
      const m = p.matchs || {};
      let statut;
      let cashout = "";
      if (m.statut === "annule") statut = `<span class="bk-statut">Remboursé</span>`;
      else if (p.encaisse) statut = `<span class="bk-statut bk-statut-encaisse">Cash out · ${nombre(p.gain)} récupérés</span>`;
      else if (m.statut === "termine") {
        statut = (p.gain || 0) > 0
          ? `<span class="bk-statut bk-statut-gagne">Gagné +${nombre((p.gain || 0) - p.mise)}</span>`
          : `<span class="bk-statut bk-statut-perdu">Perdu −${nombre(p.mise)}</span>`;
      } else {
        const enCours = etat.ouverts.find((x) => x.id === p.match_id);
        const estime = enCours ? gain(cagnottes(p.match_id), p.choix, p.mise, true, cagnotteOfferte(enCours)) : null;
        statut = `<span class="bk-statut bk-statut-cours">En cours${estime ? " · gain estimé " + nombre(estime) : ""}</span>`;
        if (enCours) cashout = blocCashout(enCours, p);
      }
      return `<li class="bk-ligne">
        <div><p class="bk-ligne-titre">${echap(m.equipe_a)} vs ${echap(m.equipe_b)}</p>
          <p class="bk-ligne-sous">${m.debut ? libelleJour(m.debut) + " " + heure(m.debut) + " · " : ""}${nombre(p.mise)} sur ${echap(nomEquipe(m, p.choix))}</p>
          ${cashout ? `<div class="bk-ligne-cashout">${cashout}</div>` : ""}</div>
        ${statut}
      </li>`;
    }).join("")}</ul>` + sortie;
  }

  // ---------- Résultats ----------
  function afficherResultats() {
    const el = $("liste-resultats");
    if (!etat.resultats.length) { el.innerHTML = `<p class="bk-vide">Aucun résultat pour l'instant.</p>`; return; }
    el.innerHTML = `<ul class="bk-liste">${etat.resultats.map((m) => {
      const c = cagnottes(m.id);
      const annule = m.statut === "annule";
      const nom = (choix) => `<span class="${m.gagnant === choix ? "bk-vainqueur" : ""}">${logoEquipe(m, choix)}${echap(nomEquipe(m, choix))}</span>`;
      return `<li class="bk-ligne">
        <div><p class="bk-ligne-titre">${nom("a")} <span class="bk-vs">vs</span> ${nom("b")}</p>
          <p class="bk-ligne-sous">${libelleJour(m.debut)} · ${annule ? "Match annulé, mises remboursées" : nombre(c.total) + " misés · " + c.n + (c.n > 1 ? " paris" : " pari")}</p></div>
        ${annule ? `<span class="bk-statut">Annulé</span>` : `<span class="bk-statut bk-statut-gagne">${echap(nomEquipe(m, m.gagnant))}</span>`}
      </li>`;
    }).join("")}</ul>`;
  }

  // ---------- Classement ----------
  function afficherClassement() {
    const el = $("liste-classement");
    if (!etat.classement.length) { el.innerHTML = `<li class="bk-vide">Personne n'a encore parié. À toi de jouer !</li>`; return; }
    const moi = etat.session ? etat.session.user.id : null;
    el.innerHTML = etat.classement.map((p, i) => {
      const avatar = imageSure(p.avatar);
      return `<li class="${p.id === moi ? "c-moi" : ""}">
        <span class="c-rang">${i + 1}</span>
        ${avatar ? `<img class="avatar avatar-petit" src="${echap(avatar)}" alt="" loading="lazy">` : `<span class="avatar avatar-petit avatar-vide" aria-hidden="true">${echap((p.pseudo || "?").charAt(0))}</span>`}
        <span class="c-pseudo">${echap(p.pseudo)}</span>
        <span class="c-solde">${nombre(p.solde)}</span>
      </li>`;
    }).join("");
  }

  // ---------- Admin ----------
  function depuis(iso) {
    if (!iso) return "jamais";
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    return `le ${new Date(iso).toLocaleDateString("fr-FR")} à ${heure(iso)}`;
  }

  function afficherSynchro() {
    const el = $("synchro");
    const sy = etat.synchro;
    if (!sy) { el.innerHTML = ""; return; }
    if (sy.absente) {
      el.innerHTML = `<div class="bk-synchro"><h2>Synchro lolesports</h2>
        <p class="bk-discret">Pas encore installée : passe le fichier synchro-lolesports.sql dans Supabase.</p></div>`;
      return;
    }
    const enPanne = sy.derniere_synchro && Date.now() - new Date(sy.derniere_synchro).getTime() > 10 * 60000;
    el.innerHTML = `
      <div class="bk-synchro">
        <div class="bk-synchro-tete">
          <h2>Synchro lolesports</h2>
          <button class="bk-btn bk-btn-ligne bk-btn-petit" data-action="lancer-synchro">Synchroniser maintenant</button>
        </div>
        <p class="bk-synchro-etat${enPanne ? " bk-urgent" : ""}">Dernière synchro ${depuis(sy.derniere_synchro)}${sy.dernier_message ? " · " + echap(sy.dernier_message) : ""}</p>
        <label class="bk-interrupteur"><input type="checkbox" data-synchro="import" ${sy.import_auto ? "checked" : ""}>
          <span>Importer les matchs des Worlds automatiquement</span></label>
        <label class="bk-interrupteur"><input type="checkbox" data-synchro="reglement" ${sy.reglement_auto ? "checked" : ""}>
          <span>Régler les matchs terminés automatiquement</span></label>
      </div>`;
  }

  function afficherAdmin() {
    if (!(etat.profil && etat.profil.admin)) return;
    afficherSynchro();
    const equipes = new Set();
    [...etat.ouverts, ...etat.resultats].forEach((m) => { equipes.add(m.equipe_a); equipes.add(m.equipe_b); });
    $("equipes").innerHTML = [...equipes].sort().map((e) => `<option value="${echap(e)}">`).join("");

    const el = $("admin-liste");
    if (!etat.ouverts.length) { el.innerHTML = `<p class="bk-vide">Aucun match en attente de résultat.</p>`; return; }
    el.innerHTML = etat.ouverts.map((m) => {
      const c = cagnottes(m.id);
      const conf = etat.confirmation && etat.confirmation.match === m.id ? etat.confirmation : null;
      let actions;
      if (conf) {
        const texte = conf.type === "annuler"
          ? "Annuler ce match et rembourser tout le monde ?"
          : `Confirmer la victoire de ${echap(nomEquipe(m, conf.choix))} ?`;
        actions = `<span class="bk-confirmer">${texte}</span>
          <button class="bk-btn bk-btn-plein bk-btn-petit" data-action="confirmer">Oui, confirmer</button>
          <button class="bk-btn bk-btn-ligne bk-btn-petit" data-action="renoncer">Non</button>`;
      } else {
        actions = `
          <button class="bk-btn bk-btn-plein bk-btn-petit" data-action="demander-regler" data-match="${m.id}" data-choix="a">${echap(m.equipe_a)} gagne</button>
          <button class="bk-btn bk-btn-plein bk-btn-petit" data-action="demander-regler" data-match="${m.id}" data-choix="b">${echap(m.equipe_b)} gagne</button>
          <button class="bk-btn bk-btn-ligne bk-btn-petit" data-action="modifier" data-match="${m.id}">Modifier</button>
          <button class="bk-btn bk-btn-ligne bk-btn-petit" data-action="demander-annuler" data-match="${m.id}">Annuler et rembourser</button>`;
      }
      return `<div class="bk-admin-match">
        <p><strong>${echap(m.equipe_a)} vs ${echap(m.equipe_b)}</strong>${m.api_id ? `<span class="bk-tag">lolesports</span>` : ""}
          <span class="bk-discret">${libelleJour(m.debut)} à ${heure(m.debut)} · fermeture +${m.delai_minutes ?? 5} min · ${c.n} ${c.n > 1 ? "paris" : "pari"} · ${nombre(c.total)} misés · ${nombre(cagnotteOfferte(m))} offerts</span></p>
        <div class="bk-admin-actions">${actions}</div>
      </div>`;
    }).join("");
  }

  function afficherTout() {
    afficherCompte();
    afficherOnglets();
    afficherMatchs();
    afficherCoupon();
    afficherMesParis();
    afficherResultats();
    afficherClassement();
    afficherAdmin();
  }

  // ---------- Actions ----------
  async function executer(fn, succes) {
    if (etat.occupe) return;
    etat.occupe = true;
    document.body.classList.add("occupe");
    try {
      await fn();
      if (succes) annoncer(succes, "ok");
      await toutRecharger();
    } catch (e) {
      annoncer(messageErreur(e), "erreur");
      afficherTout();
    } finally {
      etat.occupe = false;
      document.body.classList.remove("occupe");
    }
  }

  const appel = async (nom, args) => {
    const r = await sb.rpc(nom, args);
    if (r.error) throw r.error;
    return r.data;
  };

  function viderFormulaire() {
    $("form-match").reset();
    $("fm-id").value = "";
    $("fm-envoyer").textContent = "Ajouter le match";
    $("fm-annuler").hidden = true;
  }

  function changerOnglet(nom) {
    etat.onglet = nom;
    try { history.replaceState(null, "", nom === "matchs" ? location.pathname : "#" + nom); } catch (e) { /* rien */ }
    afficherOnglets();
    window.scrollTo({ top: 0 });
  }

  document.addEventListener("click", (ev) => {
    const onglet = ev.target.closest("[data-onglet]");
    if (onglet) { changerOnglet(onglet.dataset.onglet); return; }

    const b = ev.target.closest("[data-action]");
    if (!b) return;
    const action = b.dataset.action;
    const id = b.dataset.match ? Number(b.dataset.match) : null;
    const m = id ? etat.ouverts.find((x) => x.id === id) : null;

    switch (action) {
      case "connexion":
        sb.auth.signInWithOAuth({ provider: "twitch", options: { redirectTo: location.origin + location.pathname } })
          .then((r) => { if (r.error) annoncer(messageErreur(r.error), "erreur"); });
        break;
      case "deconnexion":
        sb.auth.signOut();
        break;
      case "bonus":
        executer(() => appel("bonus_du_jour"), "+100 centimes ajoutés !");
        break;
      case "choisir": {
        const memeChoix = etat.coupon && etat.coupon.match === id && etat.coupon.choix === b.dataset.choix;
        if (memeChoix) {
          etat.coupon = null;
        } else {
          etat.coupon = { match: id, choix: b.dataset.choix, mise: etat.coupon ? etat.coupon.mise : 100 };
          etat.couponOuvert = true;
        }
        afficherMatchs();
        afficherCoupon();
        const champ = $("coupon-mise");
        if (champ && window.matchMedia("(min-width: 901px)").matches) champ.focus();
        break;
      }
      case "retirer":
        etat.coupon = null;
        afficherMatchs();
        afficherCoupon();
        break;
      case "deplier":
        etat.couponOuvert = true;
        afficherCoupon();
        break;
      case "replier":
        etat.couponOuvert = false;
        afficherCoupon();
        break;
      case "ajouter": {
        if (!etat.coupon || !etat.profil) return;
        const solde = etat.profil.solde;
        etat.coupon.mise = b.dataset.valeur === "tout" ? solde : Math.min(solde, (etat.coupon.mise || 0) + Number(b.dataset.valeur));
        const champ = $("coupon-mise");
        if (champ) champ.value = etat.coupon.mise;
        majCouponSansRedessiner();
        break;
      }
      case "parier": {
        const cp = etat.coupon;
        const mm = cp && etat.ouverts.find((x) => x.id === cp.match);
        if (!cp || !mm) return;
        const mise = Math.floor(cp.mise || 0);
        executer(async () => {
          await appel("placer_pari", { p_match: cp.match, p_choix: cp.choix, p_mise: mise });
          etat.coupon = null;
        }, `Pari validé : ${nombre(mise)} centimes sur ${nomEquipe(mm, cp.choix)}.`);
        break;
      }
      case "demander-regler":
        etat.confirmation = { type: "regler", match: id, choix: b.dataset.choix };
        afficherAdmin();
        break;
      case "demander-annuler":
        etat.confirmation = { type: "annuler", match: id };
        afficherAdmin();
        break;
      case "cashout-demander":
        etat.cashout = id;
        afficherMatchs();
        afficherMesParis();
        break;
      case "cashout-renoncer":
        etat.cashout = null;
        afficherMatchs();
        afficherMesParis();
        break;
      case "cashout-confirmer": {
        etat.cashout = null;
        const pari = monPari(id);
        const rendu = pari ? montantCashout(pari) : 0;
        executer(() => appel("encaisser_pari", { p_match: id }), `Cash out fait : ${nombre(rendu)} centimes récupérés.`);
        break;
      }
      case "lancer-synchro":
        executer(async () => {
          const msg = await appel("lancer_synchro");
          annoncer(msg || "Synchro lancée.", "info");
        });
        break;
      case "renoncer":
        etat.confirmation = null;
        afficherAdmin();
        break;
      case "confirmer": {
        const c = etat.confirmation;
        etat.confirmation = null;
        if (!c) return;
        const mm = etat.ouverts.find((x) => x.id === c.match);
        if (c.type === "annuler") {
          executer(() => appel("annuler_match", { p_id: c.match }), "Match annulé, tout le monde a été remboursé.");
        } else {
          executer(() => appel("regler_match", { p_id: c.match, p_gagnant: c.choix }),
            `Résultat enregistré : victoire de ${mm ? nomEquipe(mm, c.choix) : "l'équipe"}. Les gains sont versés.`);
        }
        break;
      }
      case "modifier":
        if (!m) return;
        $("fm-id").value = m.id;
        $("fm-a").value = m.equipe_a;
        $("fm-b").value = m.equipe_b;
        $("fm-debut").value = versChampDate(m.debut);
        $("fm-phase").value = m.phase || "";
        $("fm-bonus").value = m.bonus ?? 0;
        $("fm-delai").value = m.delai_minutes ?? 5;
        $("fm-envoyer").textContent = "Enregistrer les modifications";
        $("fm-annuler").hidden = false;
        $("form-match").scrollIntoView({ behavior: "smooth", block: "start" });
        $("fm-a").focus();
        break;
    }
  });

  document.addEventListener("change", (ev) => {
    const inter = ev.target.closest("[data-synchro]");
    if (!inter) return;
    const valeur = inter.checked;
    const args = inter.dataset.synchro === "import"
      ? { p_import: valeur, p_reglement: null }
      : { p_import: null, p_reglement: valeur };
    executer(() => appel("regler_synchro", args),
      inter.dataset.synchro === "import"
        ? (valeur ? "Import automatique activé." : "Import automatique coupé.")
        : (valeur ? "Règlement automatique activé." : "Règlement automatique coupé : valide les résultats à la main."));
  });

  document.addEventListener("input", (ev) => {
    if (ev.target.id !== "coupon-mise" || !etat.coupon) return;
    etat.coupon.mise = Math.max(0, Math.floor(Number(ev.target.value) || 0));
    majCouponSansRedessiner();
  });

  $("form-match").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const idExistant = $("fm-id").value ? Number($("fm-id").value) : null;
    const debut = new Date($("fm-debut").value);
    if (isNaN(debut)) { annoncer("Indique la date et l'heure du match.", "erreur"); return; }
    executer(async () => {
      await appel("enregistrer_match", {
        p_id: idExistant,
        p_equipe_a: $("fm-a").value,
        p_equipe_b: $("fm-b").value,
        p_debut: debut.toISOString(),
        p_phase: $("fm-phase").value,
        p_bonus: Math.max(0, Math.floor(Number($("fm-bonus").value) || 0)),
        p_delai: Math.min(5, Math.max(0, Math.floor(Number($("fm-delai").value) || 0))),
      });
      viderFormulaire();
    }, idExistant ? "Match modifié." : "Match ajouté.");
  });
  $("fm-annuler").addEventListener("click", viderFormulaire);

  // ---------- Démarrage ----------
  const depuisAdresse = location.hash.replace("#", "");
  if (["mes-paris", "resultats", "classement", "admin"].includes(depuisAdresse)) etat.onglet = depuisAdresse;
  afficherOnglets();
  afficherCoupon();

  sb.auth.onAuthStateChange((evenement, session) => {
    const changement = (etat.session && etat.session.user.id) !== (session && session.user.id);
    etat.session = session;
    if (evenement === "INITIAL_SESSION" || changement) setTimeout(toutRecharger, 0);
  });

  // Toutes les 30 s : cotes, compte à rebours et fermeture des paris
  setInterval(() => {
    if (document.hidden || etat.occupe) return;
    chargerMatchs().then(() => {
      afficherMatchs();
      afficherResultats();
      if (document.activeElement && document.activeElement.id === "coupon-mise") majCouponSansRedessiner();
      else afficherCoupon();
      if (!(document.activeElement && document.activeElement.closest("#form-match"))) afficherAdmin();
    }).catch(() => {});
  }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) toutRecharger(); });
})();
