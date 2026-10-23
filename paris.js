// Page Paris : connexion Twitch, paris en centimes, classement et espace admin.
// Les règles (solde, heure limite, admins) sont vérifiées dans la base Supabase.

(function () {
  const $ = (id) => document.getElementById(id);
  const echap = (t) => String(t ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const nombre = (n) => Number(n || 0).toLocaleString("fr-FR");
  const imageSure = (u) => /^https:\/\//i.test(String(u || "")) ? String(u) : "";

  const config = window.PARIS_CONFIG || {};
  if (!config.url || !config.cle || !window.supabase) {
    const msg = `<p class="repos">Les paris ne sont pas encore ouverts. Reviens bientôt !</p>`;
    $("carte-joueur").innerHTML = msg;
    $("liste-matchs").innerHTML = msg;
    $("liste-resultats").innerHTML = "";
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
    classement: [],
    selection: {},      // { [matchId]: { choix, mise } }
    confirmation: null, // action admin en attente de confirmation
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

  // ---------- Calculs ----------
  function cagnottes(matchId) {
    let a = 0, b = 0, n = 0;
    for (const p of etat.paris) {
      if (p.match_id !== matchId) continue;
      if (p.choix === "a") a += p.mise; else b += p.mise;
      n++;
    }
    return { a, b, total: a + b, n };
  }
  const monPari = (matchId) =>
    etat.session ? etat.paris.find((p) => p.match_id === matchId && p.joueur === etat.session.user.id) : null;
  // Même calcul que la base : mise + part des perdants + part de la cagnotte offerte
  // (la part de cagnotte offerte peut au plus doubler la mise).
  function gainEstime(c, choix, mise, dejaCompte, bonus) {
    const camp = (choix === "a" ? c.a : c.b) + (dejaCompte ? 0 : mise);
    const autre = choix === "a" ? c.b : c.a;
    if (camp <= 0) return mise;
    return mise + Math.floor((mise * autre) / camp) + Math.min(mise, Math.floor((mise * (bonus || 0)) / camp));
  }
  const nomEquipe = (m, choix) => (choix === "a" ? m.equipe_a : m.equipe_b);
  function texteGain(m, choix, mise) {
    if (!(mise >= 10)) return "Mise minimum : 10 centimes";
    const c = cagnottes(m.id);
    if ((choix === "a" ? c.b : c.a) === 0 && !m.bonus) return "Personne n'a encore misé en face : pour l'instant, tu récupérerais juste ta mise.";
    return `Si ${nomEquipe(m, choix)} gagne : ${nombre(gainEstime(c, choix, mise, false, m.bonus))} centimes`;
  }
  const commence = (m) => new Date(m.debut).getTime() <= Date.now();
  const bonusDispo = () => {
    if (!etat.profil) return false;
    const aujourdhui = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    return !etat.profil.dernier_bonus || etat.profil.dernier_bonus < aujourdhui;
  };

  // ---------- Chargement ----------
  async function chargerMatchs() {
    const [ouverts, finis] = await Promise.all([
      sb.from("matchs").select("*").eq("statut", "ouvert").order("debut", { ascending: true }),
      sb.from("matchs").select("*").neq("statut", "ouvert").order("debut", { ascending: false }).limit(20),
    ]);
    if (ouverts.error) throw ouverts.error;
    if (finis.error) throw finis.error;
    etat.ouverts = ouverts.data || [];
    etat.resultats = finis.data || [];

    const ids = [...etat.ouverts, ...etat.resultats].map((m) => m.id);
    if (ids.length) {
      const r = await sb.from("paris").select("match_id, joueur, choix, mise, gain").in("match_id", ids);
      if (r.error) throw r.error;
      etat.paris = r.data || [];
    } else {
      etat.paris = [];
    }
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
      await Promise.all([chargerMatchs(), chargerClassement()]);
    } catch (e) {
      annoncer(messageErreur(e), "erreur");
    }
    afficherTout();
  }

  // ---------- Affichage : carte joueur ----------
  function afficherJoueur() {
    const el = $("carte-joueur");
    if (!etat.session) {
      el.innerHTML = `
        <p class="carte-joueur-titre">Prêt à parier ?</p>
        <p class="carte-joueur-texte">Connecte-toi avec Twitch et reçois 1 000 centimes pour commencer.</p>
        <button class="bouton bouton-twitch-connexion" data-action="connexion">Se connecter avec Twitch</button>`;
      return;
    }
    const p = etat.profil;
    if (!p) { el.innerHTML = `<p class="repos">Chargement de ton profil…</p>`; return; }
    const avatar = imageSure(p.avatar);
    el.innerHTML = `
      <div class="joueur-identite">
        ${avatar ? `<img class="avatar" src="${echap(avatar)}" alt="">` : `<span class="avatar avatar-vide" aria-hidden="true">${echap(p.pseudo.charAt(0))}</span>`}
        <div>
          <p class="joueur-pseudo">${echap(p.pseudo)}</p>
          ${etat.rang ? `<p class="joueur-rang">${etat.rang === 1 ? "1er" : etat.rang + "e"} du classement</p>` : ""}
        </div>
      </div>
      <p class="solde"><span class="piece" aria-hidden="true"></span><strong>${nombre(p.solde)}</strong> centimes</p>
      ${bonusDispo()
        ? `<button class="bouton bouton-jouer" data-action="bonus">Récupérer mes 100 centimes du jour</button>`
        : `<p class="joueur-bonus-pris">Bonus du jour récupéré. Prochain demain.</p>`}
      <button class="lien-discret" data-action="deconnexion">Se déconnecter</button>`;
  }

  // ---------- Affichage : matchs à venir ----------
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

  function barre(c, m) {
    const pa = c.total ? Math.round((c.a / c.total) * 100) : 50;
    return `
      <div class="cagnotte" aria-label="Répartition des mises">
        <div class="cagnotte-barre"><span style="width:${pa}%"></span></div>
        <div class="cagnotte-legende">
          ${c.total
            ? `<span>${nombre(c.a)} (${pa} %)</span><span>${c.n} ${c.n > 1 ? "paris" : "pari"}</span><span>${nombre(c.b)} (${100 - pa} %)</span>`
            : `<span>Aucune mise pour l'instant</span>`}
        </div>
      </div>`;
  }

  function carteMatch(m) {
    const c = cagnottes(m.id);
    const mien = monPari(m.id);
    const ferme = commence(m);
    const sel = etat.selection[m.id];
    const equipe = (choix) => {
      const nom = nomEquipe(m, choix);
      const classes = ["equipe"];
      if (mien && mien.choix === choix) classes.push("equipe-mienne");
      if (!mien && sel && sel.choix === choix) classes.push("equipe-choisie");
      const actif = !ferme && !mien && etat.session;
      return `<button class="${classes.join(" ")}" ${actif ? `data-action="choisir" data-match="${m.id}" data-choix="${choix}"` : "disabled"}
        aria-pressed="${sel && sel.choix === choix ? "true" : "false"}">${echap(nom)}</button>`;
    };

    let bas = "";
    if (mien) {
      bas = `<p class="mon-pari">Ton pari : <strong>${nombre(mien.mise)}</strong> sur ${echap(nomEquipe(m, mien.choix))}.
        Gain estimé : <strong>${nombre(gainEstime(c, mien.choix, mien.mise, true, m.bonus))}</strong></p>`;
    } else if (ferme) {
      bas = `<p class="repos">Match commencé, paris fermés. Résultat bientôt.</p>`;
    } else if (!etat.session) {
      bas = `<p class="repos">Connecte-toi avec Twitch pour parier.</p>`;
    } else if (sel) {
      const solde = etat.profil ? etat.profil.solde : 0;
      const mise = Math.max(0, Math.min(sel.mise || 0, solde));
      bas = `
        <div class="form-pari">
          <label class="mise">Mise
            <input type="number" inputmode="numeric" min="10" max="${solde}" step="1" value="${mise || ""}"
              data-champ="mise" data-match="${m.id}">
          </label>
          <div class="raccourcis">
            <button data-action="ajouter" data-match="${m.id}" data-valeur="100">+100</button>
            <button data-action="ajouter" data-match="${m.id}" data-valeur="500">+500</button>
            <button data-action="ajouter" data-match="${m.id}" data-valeur="tout">Tout</button>
          </div>
          <p class="gain-estime" data-gain="${m.id}">${echap(texteGain(m, sel.choix, mise))}</p>
          <button class="bouton bouton-jouer" data-action="parier" data-match="${m.id}">Parier sur ${echap(nomEquipe(m, sel.choix))}</button>
        </div>`;
    } else {
      bas = `<p class="repos">Choisis une équipe pour parier.</p>`;
    }

    return `
      <article class="match${ferme ? " match-ferme" : ""}">
        <p class="match-info"><strong>${heure(m.debut)}</strong>${m.phase ? ` <span>${echap(m.phase)}</span>` : ""}${m.bonus ? ` <span class="offert">+${nombre(m.bonus)} offerts</span>` : ""}</p>
        <div class="match-equipes">${equipe("a")}<span class="vs">vs</span>${equipe("b")}</div>
        ${barre(c, m)}
        ${bas}
      </article>`;
  }

  function afficherMatchs() {
    const el = $("liste-matchs");
    if (!etat.ouverts.length) {
      el.innerHTML = `<p class="repos">Pas de match ouvert pour l'instant. Les prochains arrivent bientôt.</p>`;
      return;
    }
    el.innerHTML = grouperParJour(etat.ouverts).map((g) => `
      <div class="jour-matchs">
        <h3 class="jour-titre">${g.libelle}</h3>
        <div class="grille-matchs">${g.matchs.map(carteMatch).join("")}</div>
      </div>`).join("");
  }

  // ---------- Affichage : résultats ----------
  function afficherResultats() {
    const el = $("liste-resultats");
    if (!etat.resultats.length) { el.innerHTML = `<p class="repos">Aucun résultat pour l'instant.</p>`; return; }
    el.innerHTML = `<ul class="resultats">${etat.resultats.map((m) => {
      const c = cagnottes(m.id);
      const mien = monPari(m.id);
      const annule = m.statut === "annule";
      const nom = (choix) => `<span class="${m.gagnant === choix ? "vainqueur" : ""}">${echap(nomEquipe(m, choix))}</span>`;
      let perso = "";
      if (mien) {
        const net = (mien.gain || 0) - mien.mise;
        perso = annule ? `<span class="bilan">Remboursé</span>`
          : `<span class="bilan ${net >= 0 ? "bilan-plus" : "bilan-moins"}">${net >= 0 ? "+" : "−"}${nombre(Math.abs(net))}</span>`;
      }
      return `<li class="resultat">
        <span class="resultat-date">${libelleJour(m.debut)}</span>
        <span class="resultat-match">${nom("a")} <span class="vs">vs</span> ${nom("b")}</span>
        <span class="resultat-detail">${annule ? "Annulé" : nombre(c.total) + " centimes en jeu"}</span>
        ${perso}
      </li>`;
    }).join("")}</ul>`;
  }

  // ---------- Affichage : classement ----------
  function afficherClassement() {
    const el = $("liste-classement");
    if (!etat.classement.length) { el.innerHTML = `<li class="repos">Personne n'a encore parié. À toi de jouer !</li>`; return; }
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

  // ---------- Affichage : admin ----------
  function afficherAdmin() {
    const estAdmin = !!(etat.profil && etat.profil.admin);
    $("admin").hidden = !estAdmin;
    if (!estAdmin) return;

    const equipes = new Set();
    [...etat.ouverts, ...etat.resultats].forEach((m) => { equipes.add(m.equipe_a); equipes.add(m.equipe_b); });
    $("equipes").innerHTML = [...equipes].sort().map((e) => `<option value="${echap(e)}">`).join("");

    const el = $("admin-liste");
    if (!etat.ouverts.length) { el.innerHTML = `<p class="repos">Aucun match en attente de résultat.</p>`; return; }
    el.innerHTML = etat.ouverts.map((m) => {
      const c = cagnottes(m.id);
      const conf = etat.confirmation && etat.confirmation.match === m.id ? etat.confirmation : null;
      let actions;
      if (conf) {
        const texte = conf.type === "annuler"
          ? "Annuler ce match et rembourser tout le monde ?"
          : `Confirmer la victoire de ${echap(nomEquipe(m, conf.choix))} ?`;
        actions = `<span class="confirmer-texte">${texte}</span>
          <button class="bouton bouton-jouer bouton-petit" data-action="confirmer">Oui, confirmer</button>
          <button class="bouton bouton-discret bouton-petit" data-action="renoncer">Non</button>`;
      } else {
        actions = `
          <button class="bouton bouton-jouer bouton-petit" data-action="demander-regler" data-match="${m.id}" data-choix="a">${echap(m.equipe_a)} gagne</button>
          <button class="bouton bouton-jouer bouton-petit" data-action="demander-regler" data-match="${m.id}" data-choix="b">${echap(m.equipe_b)} gagne</button>
          <button class="bouton bouton-discret bouton-petit" data-action="modifier" data-match="${m.id}">Modifier</button>
          <button class="bouton bouton-discret bouton-petit" data-action="demander-annuler" data-match="${m.id}">Annuler et rembourser</button>`;
      }
      return `<div class="admin-match">
        <p><strong>${echap(m.equipe_a)} vs ${echap(m.equipe_b)}</strong>
          <span class="admin-meta">${libelleJour(m.debut)} à ${heure(m.debut)} · ${c.n} ${c.n > 1 ? "paris" : "pari"} · ${nombre(c.total)} centimes misés · ${nombre(m.bonus || 0)} offerts</span></p>
        <div class="admin-actions">${actions}</div>
      </div>`;
    }).join("");
  }

  function afficherTout() {
    afficherJoueur();
    afficherAdmin();
    afficherMatchs();
    afficherResultats();
    afficherClassement();
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

  document.addEventListener("click", (ev) => {
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
        const ancien = etat.selection[id];
        etat.selection[id] = { choix: b.dataset.choix, mise: ancien ? ancien.mise : 100 };
        afficherMatchs();
        const champ = document.querySelector(`[data-champ="mise"][data-match="${id}"]`);
        if (champ) champ.focus();
        break;
      }
      case "ajouter": {
        const sel = etat.selection[id];
        if (!sel || !etat.profil) return;
        sel.mise = b.dataset.valeur === "tout" ? etat.profil.solde : (sel.mise || 0) + Number(b.dataset.valeur);
        sel.mise = Math.min(sel.mise, etat.profil.solde);
        afficherMatchs();
        break;
      }
      case "parier": {
        const sel = etat.selection[id];
        if (!sel || !m) return;
        const mise = Math.floor(sel.mise || 0);
        executer(async () => {
          await appel("placer_pari", { p_match: id, p_choix: sel.choix, p_mise: mise });
          delete etat.selection[id];
        }, `Pari enregistré : ${nombre(mise)} centimes sur ${nomEquipe(m, sel.choix)}.`);
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
        $("fm-envoyer").textContent = "Enregistrer les modifications";
        $("fm-annuler").hidden = false;
        $("form-match").scrollIntoView({ behavior: "smooth", block: "start" });
        $("fm-a").focus();
        break;
    }
  });

  // Saisie de la mise : on met à jour le gain estimé sans tout redessiner
  document.addEventListener("input", (ev) => {
    const champ = ev.target.closest('[data-champ="mise"]');
    if (!champ) return;
    const id = Number(champ.dataset.match);
    const sel = etat.selection[id];
    const m = etat.ouverts.find((x) => x.id === id);
    if (!sel || !m) return;
    sel.mise = Math.max(0, Math.floor(Number(champ.value) || 0));
    const g = document.querySelector(`[data-gain="${id}"]`);
    if (g) {
      g.textContent = texteGain(m, sel.choix, sel.mise);
    }
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
      });
      viderFormulaire();
    }, idExistant ? "Match modifié." : "Match ajouté.");
  });
  $("fm-annuler").addEventListener("click", viderFormulaire);

  // ---------- Démarrage ----------
  sb.auth.onAuthStateChange((evenement, session) => {
    const changement = (etat.session && etat.session.user.id) !== (session && session.user.id);
    etat.session = session;
    if (evenement === "INITIAL_SESSION" || changement) {
      setTimeout(toutRecharger, 0);
    }
  });

  // Les paris se ferment à l'heure : on rafraîchit régulièrement
  setInterval(() => {
    if (document.hidden || etat.occupe) return;
    if (document.activeElement && document.activeElement.closest(".form-pari, .form-match")) return;
    chargerMatchs().then(() => { afficherMatchs(); afficherResultats(); afficherAdmin(); }).catch(() => {});
  }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) toutRecharger(); });
})();
