/* =========================================================
   CONTENU DE LA PAGE KAWAZE
   C'est le seul fichier à modifier pour mettre le site à jour.
   Garde bien les guillemets "..." et les virgules entre les éléments.
   ========================================================= */

const KAWAZE = {

  // Ton nom de chaîne Twitch (ce qu'il y a après twitch.tv/)
  chaineTwitch: "kawaze",

  // Tes réseaux : supprime une ligne si tu n'as pas le réseau
  reseaux: [
    { nom: "Twitch",  lien: "https://www.twitch.tv/kawaze" },
    { nom: "YouTube", lien: "https://www.youtube.com/@kawaze" },
    { nom: "TikTok",  lien: "https://www.tiktok.com/@kawaze" },
    { nom: "Discord", lien: "https://discord.gg/ton-invitation" },
  ],

  // ---------- PLANNING ----------
  // Date de la dernière mise à jour (affichée sous le planning)
  planningMisAJour: "20 octobre 2026",

  // Un jour sans stream = liste vide : []
  // Plusieurs streams dans la journée = plusieurs { } séparés par une virgule
  planning: {
    lundi:    [],
    mardi:    [{ heure: "20:30", jeu: "Centimes Drop : record à battre" }],
    mercredi: [{ heure: "18:00", jeu: "Discussion & jeux de la commu" }],
    jeudi:    [],
    vendredi: [{ heure: "21:00", jeu: "Soirée horreur" }],
    samedi:   [{ heure: "15:00", jeu: "Minecraft" }, { heure: "21:00", jeu: "Jeux avec les viewers" }],
    dimanche: [],
  },

  // ---------- JEU EN VEDETTE ----------
  jeuVedette: {
    nom: "Centimes Drop",
    description: "Attrape un maximum de centimes avant qu'ils touchent le sol. Une partie dure une minute, le record se bat en live.",
    lien: "https://kawaze.github.io/centimes-drop/",   // l'adresse de ton jeu
    image: "",   // ex : "images/centimes-drop.png" (laisse vide pour l'animation de pièces)
  },

  // ---------- PROCHAINS JEUX ----------
  // etat : par exemple "En développement", "Bientôt", "Idée"
  prochainsJeux: [
    { nom: "Projet secret n°2", etat: "En développement", description: "Révélé en live quand il sera jouable." },
    { nom: "À toi de voter",    etat: "Idée",             description: "Les idées de la commu sur Discord décident du suivant." },
  ],

  // ---------- NEWS ----------
  // La plus récente en premier. "lien" est facultatif.
  news: [
    { date: "20 oct. 2026", titre: "Le site est en ligne", texte: "Planning, live et Centimes Drop au même endroit." },
    { date: "12 oct. 2026", titre: "Nouveau record sur Centimes Drop", texte: "La barre est placée haut. Qui fait mieux ?" },
    { date: "1 oct. 2026",  titre: "Nouveau planning", texte: "Un stream de plus le samedi après-midi.", lien: "" },
  ],
};
