// Construit la page Kawaze à partir des fichiers du dossier "contenu".
// Le contenu se modifie depuis le panneau admin (Pages CMS) : pas besoin de toucher à ce fichier.

(async function () {
  const $ = (id) => document.getElementById(id);
  const echap = (t) => String(t ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const lienSur = (u) => /^(https?:\/\/|\/|[\w-]+\/)/i.test(String(u || "").trim()) ? String(u).trim() : "#";
  const chemin = (u) => String(u || "").replace(/^\/+/, "");
  const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  const charger = async (nom, defaut) => {
    try {
      const r = await fetch(`contenu/${nom}.json`, { cache: "no-cache" });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) {
      console.warn(`Impossible de lire contenu/${nom}.json`, e);
      return defaut;
    }
  };

  const [reglages, planning, news, liens, jeux] = await Promise.all([
    charger("reglages", {}),
    charger("planning", []),
    charger("news", []),
    charger("liens", []),
    charger("jeux", {}),
  ]);

  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const ORDRE = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const enMinutes = (h) => { const [hh, mm] = String(h || "0:0").split(":").map(Number); return (hh || 0) * 60 + (mm || 0); };
  const heureFr = (h) => String(h || "").replace(":", "h");

  // ---- Lecteur Twitch ----
  const chaine = reglages.chaineTwitch || "kawaze";
  const hote = location.hostname;
  if (hote && hote !== "localhost" && hote !== "127.0.0.1") {
    $("lecteur").innerHTML =
      `<iframe src="https://player.twitch.tv/?channel=${encodeURIComponent(chaine)}&parent=${encodeURIComponent(hote)}&muted=true"
        allowfullscreen title="Live Twitch de Kawaze"></iframe>`;
  } else {
    $("lecteur").innerHTML =
      `<div class="lecteur-local">Le lecteur Twitch s'affichera une fois le site en ligne sur GitHub.</div>`;
  }
  $("lien-twitch").href = "https://www.twitch.tv/" + encodeURIComponent(chaine);

  // ---- Réseaux ----
  $("reseaux").innerHTML = (reglages.reseaux || [])
    .map((r) => `<li><a href="${echap(lienSur(r.lien))}" target="_blank" rel="noopener">${echap(r.nom)}</a></li>`)
    .join("");

  // ---- Planning regroupé par jour ----
  const parJour = {};
  for (const cr of planning || []) {
    const j = String(cr.jour || "").toLowerCase();
    (parJour[j] = parJour[j] || []).push(cr);
  }
  for (const j in parJour) parJour[j].sort((a, b) => enMinutes(a.heure) - enMinutes(b.heure));

  // ---- Prochain live ----
  const maintenant = new Date();
  const minutesMaintenant = maintenant.getHours() * 60 + maintenant.getMinutes();
  let prochain = null;
  for (let decalage = 0; decalage < 8 && !prochain; decalage++) {
    const nomJour = JOURS[(maintenant.getDay() + decalage) % 7];
    for (const cr of parJour[nomJour] || []) {
      if (decalage === 0 && enMinutes(cr.heure) + 120 < minutesMaintenant) continue; // live terminé
      prochain = { ...cr, decalage, nomJour };
      break;
    }
  }
  if (prochain) {
    const quand =
      prochain.decalage === 0 ? (enMinutes(prochain.heure) <= minutesMaintenant ? "En ce moment" : "Aujourd'hui") :
      prochain.decalage === 1 ? "Demain" : majuscule(prochain.nomJour);
    $("prochain-quand").textContent = `${quand} · ${heureFr(prochain.heure)}`;
    $("prochain-quoi").textContent = prochain.titre;
  } else {
    $("prochain-quand").textContent = "Pas de live prévu";
  }

  const aujourdhui = JOURS[maintenant.getDay()];
  $("semaine").innerHTML = ORDRE.map((jour) => {
    const creneaux = parJour[jour] || [];
    const contenu = creneaux.length
      ? creneaux.map((cr) => `<p class="creneau"><strong>${echap(heureFr(cr.heure))}</strong><span>${echap(cr.titre)}</span></p>`).join("")
      : `<p class="repos">Pas de live</p>`;
    return `<div class="jour${jour === aujourdhui ? " aujourdhui" : ""}">
      <p class="jour-nom">${majuscule(jour)}</p>${contenu}</div>`;
  }).join("");

  // ---- Jeu en vedette ----
  const v = jeux.vedette || {};
  $("jeu-nom").textContent = v.nom || "";
  $("jeu-description").textContent = v.description || "";
  $("jeu-lien").href = lienSur(v.lien);
  $("jeu-lien").textContent = v.nom ? "Jouer à " + v.nom : "Jouer";
  $("jeu-visuel").innerHTML = v.image
    ? `<img src="${echap(chemin(v.image))}" alt="Aperçu de ${echap(v.nom)}">`
    : `<div class="pieces" aria-hidden="true">${"<span></span>".repeat(7)}</div>`;

  // ---- Prochains jeux ----
  $("a-venir").innerHTML = (jeux.prochains || []).map((p) => `
    <article class="jeu-teaser">
      ${p.etat ? `<span class="etat">${echap(p.etat)}</span>` : ""}
      <h3>${echap(p.nom)}</h3>
      <p>${echap(p.description)}</p>
    </article>`).join("");

  // ---- Clips & liens ----
  const idYoutube = (u) => {
    const m = String(u || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([\w-]{11})/);
    return m ? m[1] : null;
  };
  const listeLiens = liens || [];
  $("clips").hidden = listeLiens.length === 0;
  $("grille-liens").innerHTML = listeLiens.map((l) => {
    const yt = idYoutube(l.lien);
    const vignette = l.image
      ? `<img src="${echap(chemin(l.image))}" alt="" loading="lazy">`
      : yt
        ? `<img src="https://i.ytimg.com/vi/${yt}/hqdefault.jpg" alt="" loading="lazy">`
        : `<span class="vignette-vide" aria-hidden="true">▶</span>`;
    return `<a class="carte-lien" href="${echap(lienSur(l.lien))}" target="_blank" rel="noopener">
      <div class="vignette">${vignette}</div>
      <div class="carte-lien-texte">
        ${l.type ? `<span class="carte-lien-type">${echap(l.type)}</span>` : ""}
        <h3>${echap(l.titre)}</h3>
      </div>
    </a>`;
  }).join("");

  // ---- News (triées de la plus récente à la plus ancienne) ----
  const dateFr = (d) => {
    const x = new Date(String(d) + (String(d).length === 10 ? "T12:00:00" : ""));
    return isNaN(x) ? echap(d) : x.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  };
  const listeNews = [...(news || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  $("liste-news").innerHTML = listeNews.length
    ? listeNews.map((n) => {
        const titre = n.lien ? `<a href="${echap(lienSur(n.lien))}">${echap(n.titre)}</a>` : echap(n.titre);
        return `<li class="news"><time datetime="${echap(n.date)}">${dateFr(n.date)}</time>
          <div><h3>${titre}</h3><p>${echap(n.texte)}</p></div></li>`;
      }).join("")
    : `<li class="repos">Pas encore d'actu.</li>`;
})();
