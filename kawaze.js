// Construit la page Kawaze à partir de contenu-kawaze.js.
// Pas besoin de toucher à ce fichier pour mettre le site à jour.

(function () {
  const c = KAWAZE;
  const $ = (id) => document.getElementById(id);
  const echap = (t) => String(t ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const ORDRE = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  // ---- Lecteur Twitch ----
  const hote = location.hostname;
  if (hote) {
    $("lecteur").innerHTML =
      `<iframe src="https://player.twitch.tv/?channel=${encodeURIComponent(c.chaineTwitch)}&parent=${encodeURIComponent(hote)}&muted=true"
        allowfullscreen title="Live Twitch de Kawaze"></iframe>`;
  } else {
    $("lecteur").innerHTML =
      `<div class="lecteur-local">Le lecteur Twitch s'affichera une fois le site en ligne sur GitHub.</div>`;
  }
  $("lien-twitch").href = "https://www.twitch.tv/" + encodeURIComponent(c.chaineTwitch);

  // ---- Réseaux ----
  $("reseaux").innerHTML = (c.reseaux || [])
    .map((r) => `<li><a href="${echap(r.lien)}" target="_blank" rel="noopener">${echap(r.nom)}</a></li>`)
    .join("");

  // ---- Prochain live (calculé depuis le planning) ----
  const maintenant = new Date();
  const minutesMaintenant = maintenant.getHours() * 60 + maintenant.getMinutes();
  const enMinutes = (h) => { const [hh, mm] = h.split(":").map(Number); return hh * 60 + (mm || 0); };

  let prochain = null;
  for (let decalage = 0; decalage < 8 && !prochain; decalage++) {
    const nomJour = JOURS[(maintenant.getDay() + decalage) % 7];
    const creneaux = [...(c.planning[nomJour] || [])].sort((a, b) => enMinutes(a.heure) - enMinutes(b.heure));
    for (const cr of creneaux) {
      if (decalage === 0 && enMinutes(cr.heure) + 120 < minutesMaintenant) continue; // live terminé
      prochain = { ...cr, decalage, nomJour };
      break;
    }
  }
  if (prochain) {
    const quand =
      prochain.decalage === 0 ? (enMinutes(prochain.heure) <= minutesMaintenant ? "En ce moment" : "Ce soir") :
      prochain.decalage === 1 ? "Demain" : majuscule(prochain.nomJour);
    $("prochain-quand").textContent = `${quand} · ${prochain.heure.replace(":", "h")}`;
    $("prochain-quoi").textContent = prochain.jeu;
  } else {
    $("prochain-quand").textContent = "Pas de live prévu";
  }

  // ---- Planning ----
  const aujourdhui = JOURS[maintenant.getDay()];
  $("semaine").innerHTML = ORDRE.map((jour) => {
    const creneaux = c.planning[jour] || [];
    const contenu = creneaux.length
      ? creneaux.map((cr) => `<p class="creneau"><strong>${echap(cr.heure.replace(":", "h"))}</strong><span>${echap(cr.jeu)}</span></p>`).join("")
      : `<p class="repos">Pas de live</p>`;
    return `<div class="jour${jour === aujourdhui ? " aujourdhui" : ""}">
      <p class="jour-nom">${majuscule(jour)}</p>${contenu}</div>`;
  }).join("");
  if (c.planningMisAJour) $("planning-maj").textContent = "Mis à jour le " + c.planningMisAJour;

  // ---- Jeu en vedette ----
  const j = c.jeuVedette;
  $("jeu-nom").textContent = j.nom;
  $("jeu-description").textContent = j.description;
  $("jeu-lien").href = j.lien;
  $("jeu-lien").textContent = "Jouer à " + j.nom;
  $("jeu-visuel").innerHTML = j.image
    ? `<img src="${echap(j.image)}" alt="Aperçu de ${echap(j.nom)}">`
    : `<div class="pieces" aria-hidden="true">${"<span></span>".repeat(7)}</div>`;

  // ---- Prochains jeux ----
  $("a-venir").innerHTML = (c.prochainsJeux || []).map((p) => `
    <article class="jeu-teaser">
      <span class="etat">${echap(p.etat)}</span>
      <h3>${echap(p.nom)}</h3>
      <p>${echap(p.description)}</p>
    </article>`).join("");

  // ---- News ----
  $("liste-news").innerHTML = (c.news || []).map((n) => {
    const titre = n.lien ? `<a href="${echap(n.lien)}">${echap(n.titre)}</a>` : echap(n.titre);
    return `<li class="news"><time>${echap(n.date)}</time>
      <div><h3>${titre}</h3><p>${echap(n.texte)}</p></div></li>`;
  }).join("");
})();
