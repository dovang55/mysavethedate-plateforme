module.exports = {
  meta: {
    title: "Bar Mitzvah · Prénom Nom",
    lang: "fr",
    favicon: ""
  },
  identity: {
    firstName: "Prénom",
    lastName: "Nom",
    hebrewName: "",
    eventType: "bar-mitsva",   // bar-mitsva | bat-mitsva | mariage | anniversaire
    logo: "",
    bsd: true                  // affiche בס"ד
  },
  theme: {
    preset: "bleu-blanc",
    colors: {
      cream:      "#f0f5ff",
      creamWarm:  "#e8f0fe",
      creamDeep:  "#dbeafe",
      paper:      "#ffffff",
      gold:       "#2563eb",
      goldBright: "#3b82f6",
      goldDeep:   "#1d4ed8",
      bronze:     "#1e3a8a",
      ink:        "#0d1f3c",
      inkSoft:    "#475569"
    },
    fonts: {
      heading: "Montserrat",
      body:    "Inter",
      ui:      "Inter",
      hebrew:  "Frank Ruhl Libre"
    },
    // Arrière-plan : "degrade" (radial doux + dégradé linéaire) ou "uni"
    // (une seule couleur). L'angle ne s'applique qu'au dégradé.
    background: {
      type: "degrade",
      angle: 155
    }
  },
  sections: {
    hero: {
      enabled:       true,
      eyebrow:       "Bar Mitsva",
      showCountdown: true,
      ctaText:       "Voir le faire-part"
    },
    fairepart: {
      enabled:       true,
      blessing:      "Avec la protection divine sur le Am Israël, amen…",
      blessingHe:    "",
      ceremonyTag:   "Cérémonie",
      ceremonyName:  "Mise des Téfilines",
      ceremonyHe:    "הוֹדוּ לַה' כִּי-טוֹב, כִּי לְעוֹלָם חַסְדּוֹ",
      familyLine:    "Les parents ont le plaisir de vous convier",
      inviteHe:      "",
      inviteSub:     "Entouré de sa famille et de ses amis, nous serons heureux de célébrer avec vous cette étape importante.",
      photo:         "",
      events: [
        { label: "Date",  value: "Le Jeudi 05 novembre 2026", valueHe: "25 Hechvan 5787" },
        { label: "Heure", value: "L'office débutera à 8h30" },
        { label: "Lieu",  value: "Nom du lieu", address: "Adresse complète", wazeUrl: "" }
      ],
      followup:      "L'office sera suivi d'une réception"
    },
    hommage: {
      enabled: true,
      title:   "Dans les pas de nos Patriarches",
      text:    "Nos Sages nous enseignent que nos Patriarches ne nous ont jamais quittés, car nous, leurs descendants, perpétuent leur héritage chaque jour.",
      photo:   ""
    },
    shabbat: {
      enabled:    true,
      tag:        "Shabbat Bar Mitsva",
      parasha:    "Hayé Sarah",
      parashaHe:  "חַיֵּי שָׂרָה",
      intro:      "Nous avons la joie de vous inviter à nous rejoindre pour la lecture de la Parasha.",
      photo:      "",
      events: [
        { label: "Date", value: "Le Samedi", valueItalic: "" },
        { label: "Lieu", value: "Synagogue", address: "", wazeUrl: "" }
      ],
      followup:   "L'office sera suivi d'un Kiddouch et d'une séouda"
    },
    infos: {
      enabled:  true,
      title:    "Informations complémentaires",
      subtitle: "Demande de VISA",
      body:     "Depuis le 1er Août 2024, il est obligatoire pour les touristes souhaitant se rendre en Israel de remplir le formulaire ETA suivant :",
      ctaText:  "Faire une demande de visa — Site officiel",
      ctaUrl:   "https://israel-eta.piba.gov.il/"
    },
    video: {
      enabled: true,
      title:   "Une vidéo pour",
      text:    "Laissez un souvenir mémorable.\nEnvoyez-nous une vidéo surprise !\nDiffusion planifiée pendant la réception."
    },
    rsvp: {
      enabled:  true,
      deadline: "1er octobre 2026",
      events: [
        { id: "mishte",  name: "Mise des Téfilines & Réception", date: "Jeudi 05 novembre 2026 · 8h30" },
        { id: "shabbat", name: "Shabbat Bar Mitsva",            date: "Samedi 10 octobre 2026" }
      ]
    },
    footer: {
      credit: "Bar Mitzvah · MMXXVI",
      createdBy: "Dovan Guez",
      createdByUrl: "https://guezdovan.com"
    }
  },
  // "general" : une seule piste pour tout le site. "parpage" : une piste
  // différente possible par page (voir music[].pages, qui référence alors
  // les clés de page : hero, fairepart, hommage, shabbat, infos, video,
  // rsvp, footer, ou l'id d'une page personnalisée).
  musicMode: "general",
  music: [
    { url: "", startAt: 0, loopFrom: 0, pages: [], label: "Piste principale" }
  ],
  target: {
    date:     "2026-11-05",
    time:     "08:30",
    timezone: "+02:00"
  },

  // Ordre des sections entre le hero et le footer. Modifiable librement
  // depuis l'éditeur (espace client) : les sections désactivées restent
  // simplement absentes du rendu, sans qu'il soit nécessaire d'y toucher.
  // Peut aussi contenir des identifiants de customPages (ci-dessous).
  pageOrder: ["fairepart", "hommage", "shabbat", "infos", "video", "rsvp"],

  // Pages créées librement par le client depuis l'éditeur (titre + texte +
  // photo). Chaque page a un id unique référencé dans pageOrder.
  customPages: []
};
