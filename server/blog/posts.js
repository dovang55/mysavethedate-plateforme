// Contenu du blog SEO. Chaque article n'apparaît sur le site (et dans le
// sitemap) qu'à partir de sa publishDate — voir articlesPublies() dans
// server/index.js. Ça permet d'écrire à l'avance sans tout publier d'un
// coup (mauvais signal pour Google, qui préfère une croissance naturelle).
//
// Champs : slug (unique, utilisé dans l'URL /blog/:slug), title, keyword
// (mot-clé ciblé, pour suivi interne), category (mariage | bar-bat-mitsva |
// anniversaire | organisation), publishDate ("AAAA-MM-JJ"), metaDescription
// (~155 caractères), excerpt (résumé affiché sur la liste), contentHtml.

const POSTS = [
  {
    slug: 'idees-faire-part-mariage-digital',
    title: '10 idées de faire-part de mariage digital pour surprendre vos invités',
    keyword: 'faire-part mariage digital',
    category: 'mariage',
    publishDate: '2026-07-08',
    metaDescription: "10 idées concrètes pour un faire-part de mariage digital original : compte à rebours, musique, galerie photo, RSVP en un clic et plus encore.",
    excerpt: "Compte à rebours, musique d'ambiance, galerie photo évolutive... voici comment sortir du faire-part numérique basique.",
    contentHtml: `
<p>Le faire-part de mariage numérique a longtemps été perçu comme une simple version PDF du carton papier. Ce n'est plus le cas : bien pensé, il devient une vraie expérience pour vos invités, du premier clic jusqu'au jour J. Voici 10 idées concrètes pour vous démarquer.</p>

<h2>1. Un compte à rebours vivant</h2>
<p>Plutôt qu'une simple date affichée, un compte à rebours en temps réel (jours, heures, minutes) crée une attente positive à chaque visite de vos invités sur la page.</p>

<h2>2. Une musique qui donne le ton</h2>
<p>Une piste audio qui se lance à l'ouverture — votre chanson de couple, ou un morceau qui correspond à l'ambiance de la soirée — installe l'émotion dès les premières secondes.</p>

<h2>3. Une page par temps fort de la journée</h2>
<p>Cérémonie, cocktail, dîner, soirée dansante : au lieu de tout mélanger, donnez à chaque moment sa propre section avec ses horaires et informations pratiques.</p>

<h2>4. Le RSVP en un clic, sans papier à renvoyer</h2>
<p>Vos invités confirment leur présence (et celle de leurs enfants) directement depuis leur téléphone. Fini les relances téléphoniques et les petits papiers égarés.</p>

<h2>5. Une carte interactive vers le lieu</h2>
<p>Un lien direct vers Waze ou Google Maps évite les appels de dernière minute de proches perdus sur la route.</p>

<h2>6. Une page dédiée aux informations pratiques</h2>
<p>Hébergement, tenue vestimentaire, transport, liste de mariage : regrouper ces infos évite qu'elles se perdent dans un groupe WhatsApp familial.</p>

<h2>7. Un mur photo collaboratif</h2>
<p>Le soir de la fête, vos invités déposent eux-mêmes leurs photos et vidéos sur une galerie commune, consultable immédiatement.</p>

<h2>8. Un livre d'or vidéo</h2>
<p>Un message filmé de quelques secondes laisse une trace bien plus vivante qu'un mot écrit à la va-vite dans un livre d'or papier.</p>

<h2>9. Des couleurs et une typographie qui vous ressemblent</h2>
<p>Un faire-part numérique n'a pas à être générique : palette de couleurs, police d'écriture, ordre des sections peuvent tous être adaptés à votre style.</p>

<h2>10. Un lien facile à partager, pas une pièce jointe</h2>
<p>Un simple lien envoyé par SMS ou WhatsApp, qui s'ouvre instantanément sur mobile, sans téléchargement ni application à installer.</p>

<p>Ces idées ne sont pas des gadgets : chacune répond à un vrai problème rencontré par les mariés (relances RSVP, informations éparpillées, photos perdues sur les téléphones des invités...). C'est exactement ce qu'un faire-part numérique bien conçu doit résoudre.</p>`,
  },
  {
    slug: 'faire-part-mariage-papier-ou-numerique',
    title: 'Faire-part de mariage papier ou numérique : que choisir en 2026 ?',
    keyword: 'faire-part mariage numérique vs papier',
    category: 'mariage',
    publishDate: '2026-07-08',
    metaDescription: "Papier ou numérique ? Comparatif honnête entre le faire-part de mariage traditionnel et digital : coût, délai, écologie, RSVP, et ce qui convient à chaque couple.",
    excerpt: "Un comparatif honnête, sans parti pris, pour choisir en connaissance de cause.",
    contentHtml: `
<p>La question revient à chaque préparatif de mariage : faut-il un vrai carton, un faire-part numérique, ou les deux ? Voici les critères qui font vraiment la différence.</p>

<h2>Le coût</h2>
<p>Un faire-part papier haut de gamme (impression, enveloppe, timbre) coûte facilement 3 à 8€ par foyer invité, avant même de compter les cartons-réponse à renvoyer. Un faire-part numérique a un coût fixe, quel que soit le nombre d'invités.</p>

<h2>Le délai</h2>
<p>Le papier impose des délais d'impression et d'envoi postal, avec le risque qu'un courrier se perde. Le numérique est envoyé et reçu instantanément, où que soit l'invité.</p>

<h2>La gestion des réponses</h2>
<p>C'est souvent le vrai point de bascule : avec un carton-réponse papier, il faut relancer par téléphone les retardataires, ressaisir les réponses à la main dans un tableau. Un RSVP en ligne centralise tout automatiquement, avec le décompte des adultes et enfants déjà calculé.</p>

<h2>L'aspect écologique</h2>
<p>Moins de papier, moins d'impression, pas de transport postal : le numérique a un impact environnemental nettement plus faible, un argument de plus en plus important pour beaucoup de couples.</p>

<h2>Le charme du tangible</h2>
<p>Le papier garde un avantage réel : on peut le garder, l'encadrer, le toucher. Beaucoup de couples choisissent d'ailleurs un format hybride — un joli carton pour les grands-parents et proches âgés, un lien numérique pour le reste des invités.</p>

<h2>Notre avis</h2>
<p>Il n'y a pas de bonne ou mauvaise réponse universelle : tout dépend de votre budget, du profil de vos invités (âge, aisance avec le numérique) et du nombre d'invités à gérer. Pour un mariage de plus de 80 personnes, le gain de temps sur la gestion des réponses penche nettement en faveur du numérique.</p>`,
  },
  {
    slug: 'texte-faire-part-mariage-original',
    title: 'Comment rédiger un texte de faire-part de mariage original',
    keyword: 'texte faire-part mariage',
    category: 'mariage',
    publishDate: '2026-07-08',
    metaDescription: "Des exemples et une méthode simple pour écrire un texte de faire-part de mariage qui vous ressemble, entre ton classique, humoristique ou intime.",
    excerpt: "Une méthode simple pour trouver le ton juste, avec des exemples concrets.",
    contentHtml: `
<p>Le texte du faire-part donne le ton de tout le mariage. Voici une méthode simple pour trouver les mots justes, sans tomber dans la formule toute faite.</p>

<h2>Commencez par choisir un ton</h2>
<p>Classique et élégant, complice et léger, ou carrément drôle : le ton doit correspondre à l'ambiance de votre journée, pas à ce que vous pensez "devoir" écrire.</p>

<h2>Structure de base</h2>
<ul>
<li>Qui se marie (vos deux prénoms, ou vos noms si le ton est plus formel)</li>
<li>L'annonce de l'événement, avec une formule qui vous ressemble</li>
<li>La date et le lieu</li>
<li>Une invitation claire à confirmer sa présence</li>
</ul>

<h2>Exemple classique</h2>
<p><em>"Camille et Antoine ont le plaisir de vous convier à leur mariage, qui sera célébré le 12 septembre 2026 à la Bastide des Oliviers."</em></p>

<h2>Exemple complice</h2>
<p><em>"Après des années à se supporter (avec amour), Camille et Antoine ont décidé de rendre ça officiel. Venez fêter ça avec nous le 12 septembre !"</em></p>

<h2>Exemple pour un mariage religieux</h2>
<p>Pensez à mentionner clairement le lieu de culte et l'horaire de la cérémonie séparément du lieu de réception, pour éviter toute confusion chez vos invités.</p>

<h2>L'erreur à éviter</h2>
<p>Trop d'informations tuent l'information : gardez le texte principal court et clair, et reportez les détails pratiques (tenue, hébergement, transport) dans une section dédiée plutôt que de tout entasser dans le même paragraphe.</p>`,
  },
  {
    slug: 'rsvp-mariage-obtenir-reponses-a-temps',
    title: 'RSVP mariage : comment obtenir des réponses à temps (et sans relancer 50 fois)',
    keyword: 'rsvp mariage en ligne',
    category: 'mariage',
    publishDate: '2026-07-11',
    metaDescription: "Astuces concrètes pour obtenir les réponses RSVP de vos invités de mariage à temps, sans passer des semaines à relancer par téléphone.",
    excerpt: "Les astuces concrètes pour ne plus courir après les réponses de vos invités.",
    contentHtml: `
<p>C'est le casse-tête classique de tout mariage : la moitié des invités répond en 48h, l'autre moitié attend la dernière semaine, ou ne répond jamais. Voici comment limiter les dégâts.</p>

<h2>Fixez une date limite claire, et rappelez-la</h2>
<p>"Merci de répondre avant le 1er août" fonctionne bien mieux qu'une date vague. Affichez-la clairement sur votre faire-part, pas seulement dans un email d'accompagnement qui sera vite oublié.</p>

<h2>Facilitez au maximum la réponse</h2>
<p>Un carton-réponse à remplir, glisser dans une enveloppe et poster est une friction énorme comparé à un formulaire en ligne rempli en 30 secondes depuis un téléphone. Moins il y a d'étapes, plus les réponses arrivent vite.</p>

<h2>Prévoyez une relance automatique</h2>
<p>Une relance groupée par SMS ou message une dizaine de jours avant la date limite, plutôt que des appels individuels, évite d'y passer vos soirées.</p>

<h2>Distinguez présence, allergies et accompagnants dès le départ</h2>
<p>Demander en une seule fois présence, nombre d'adultes, nombre d'enfants et régime alimentaire évite les allers-retours par message pour compléter les informations manquantes.</p>

<h2>Acceptez qu'il y aura toujours des retardataires</h2>
<p>Même avec le meilleur système du monde, 5 à 10% des invités répondront en retard ou pas du tout. Prévoyez une marge dans vos calculs de traiteur plutôt que d'attendre les 100% de réponses pour finaliser les chiffres.</p>`,
  },
  {
    slug: 'save-the-date-c-est-quoi',
    title: "Save the date : c'est quoi, et pourquoi l'envoyer avant le faire-part ?",
    keyword: 'save the date mariage',
    category: 'mariage',
    publishDate: '2026-07-11',
    metaDescription: "Save the date, faire-part : quelle différence, et quand envoyer chacun ? Explications simples pour bien planifier la communication de votre mariage.",
    excerpt: "La différence entre save the date et faire-part, et le bon timing pour chacun.",
    contentHtml: `
<p>Beaucoup de futurs mariés confondent les deux, ou se demandent si le save the date est vraiment nécessaire. Voici comment ça fonctionne.</p>

<h2>Le save the date, une simple annonce</h2>
<p>Le save the date ("réservez la date") n'a qu'un objectif : prévenir vos proches suffisamment tôt pour qu'ils bloquent le jour dans leur agenda. Il ne contient généralement ni lieu précis, ni RSVP, ni informations pratiques.</p>

<h2>Pourquoi l'envoyer</h2>
<p>Si votre mariage tombe un week-end très demandé (été, pont, période de vacances scolaires), ou si beaucoup d'invités doivent prendre des congés ou réserver un billet d'avion, prévenir 6 à 12 mois à l'avance évite les conflits d'agenda.</p>

<h2>Le faire-part, l'invitation complète</h2>
<p>Il arrive plus tard (2 à 4 mois avant, généralement) avec toutes les informations : lieu exact, horaires, tenue, RSVP. C'est le document sur lequel vos invités s'appuient réellement pour organiser leur venue.</p>

<h2>Faut-il vraiment un save the date ?</h2>
<p>Pas systématiquement. Pour un mariage local avec peu de contraintes de déplacement, un faire-part envoyé 3 mois avant suffit largement. Le save the date devient utile surtout pour les mariages à la campagne, à l'étranger, ou avec beaucoup d'invités venant de loin.</p>`,
  },
  {
    slug: 'organiser-bar-mitsva-guide-complet',
    title: 'Organiser une Bar Mitsva : le guide complet étape par étape',
    keyword: 'organiser bar mitsva',
    category: 'bar-bat-mitsva',
    publishDate: '2026-07-08',
    metaDescription: "Guide complet pour organiser une Bar Mitsva : rétroplanning, cérémonie, réception, budget et faire-part. Toutes les étapes expliquées simplement.",
    excerpt: "Le rétroplanning complet, de la réservation de la salle jusqu'au jour J.",
    contentHtml: `
<p>Entre la préparation religieuse et l'organisation de la fête, une Bar Mitsva demande une coordination sur plusieurs mois. Voici les étapes dans l'ordre.</p>

<h2>12 à 18 mois avant : la date et le lieu</h2>
<p>La date de la cérémonie religieuse dépend du calendrier hébraïque et de l'anniversaire des 13 ans de l'enfant — elle se fixe donc tôt, en lien avec la synagogue. Réservez le lieu de réception dès que la date est confirmée.</p>

<h2>8 à 10 mois avant : la préparation religieuse</h2>
<p>L'enfant commence généralement sa préparation (lecture de la Torah, Haftara) avec le rabbin ou un professeur dédié plusieurs mois à l'avance.</p>

<h2>4 à 6 mois avant : le faire-part et les prestataires</h2>
<p>C'est le moment d'envoyer le faire-part, de réserver traiteur, DJ/animation et photographe. Plus tôt vous vous y prenez, plus vous avez le choix des meilleurs prestataires aux dates demandées.</p>

<h2>2 à 3 mois avant : les RSVP et le thème</h2>
<p>Lancez la collecte des confirmations de présence et finalisez le thème de la fête (décoration, animations, cadeaux invités).</p>

<h2>La semaine J</h2>
<p>Prévoyez une répétition de la lecture avec l'enfant, confirmez les derniers chiffres au traiteur, et préparez un mot ou discours si vous comptez en faire un.</p>

<h2>Le jour de la cérémonie</h2>
<p>La matinée est généralement consacrée à l'office à la synagogue (montée à la Torah), suivie d'un Kiddouch, puis de la réception le soir ou le lendemain selon les familles.</p>

<h2>Un conseil simple</h2>
<p>Centralisez tôt les informations pratiques (adresse, horaires, tenue, hébergement pour les invités venant de loin) sur un support unique — cela évite des dizaines de questions individuelles dans les semaines précédant l'événement.</p>`,
  },
  {
    slug: 'difference-bar-mitsva-bat-mitsva',
    title: 'Bar Mitsva ou Bat Mitsva : quelles différences dans la cérémonie ?',
    keyword: 'différence bar mitsva bat mitsva',
    category: 'bar-bat-mitsva',
    publishDate: '2026-07-14',
    metaDescription: "Quelles sont les vraies différences entre une Bar Mitsva et une Bat Mitsva ? Âge, déroulement de la cérémonie, traditions : toutes les explications.",
    excerpt: "Âge, déroulement de cérémonie, traditions : ce qui change réellement.",
    contentHtml: `
<p>Les deux célébrations marquent le passage à la majorité religieuse, mais leur déroulement diffère sur plusieurs points selon les courants du judaïsme.</p>

<h2>L'âge</h2>
<p>La Bar Mitsva concerne les garçons à 13 ans, la Bat Mitsva les filles à 12 ans (parfois 13 ans dans certaines communautés) — une différence liée à l'âge de maturité religieuse traditionnellement reconnu pour chaque sexe.</p>

<h2>La cérémonie religieuse</h2>
<p>Pour la Bar Mitsva, le garçon est appelé à la Torah pour la première fois et procède à la mise des Téfilines. Pour la Bat Mitsva, le déroulement varie fortement selon le courant (orthodoxe, massorti, libéral) : certaines communautés organisent une cérémonie à la synagogue similaire à celle des garçons, d'autres privilégient une cérémonie ou une fête plus centrée sur la famille.</p>

<h2>La fête</h2>
<p>Sur ce plan, les deux célébrations se ressemblent largement aujourd'hui : réception, repas, animations, discours des parents — le format de la fête n'est plus vraiment différencié entre garçons et filles dans la plupart des familles.</p>

<h2>Ce qu'il faut retenir</h2>
<p>Les usages varient beaucoup d'une communauté et d'une synagogue à l'autre : le mieux est toujours d'en discuter directement avec votre rabbin pour connaître les pratiques spécifiques à votre lieu de culte.</p>`,
  },
  {
    slug: 'idees-theme-bat-mitsva',
    title: '10 idées de thème pour une Bat Mitsva réussie',
    keyword: 'thème bat mitsva',
    category: 'bar-bat-mitsva',
    publishDate: '2026-07-14',
    metaDescription: "10 idées de thèmes originaux pour une fête de Bat Mitsva mémorable : décoration, couleurs et animations pour chaque ambiance.",
    excerpt: "Des idées concrètes de décoration et d'animation pour marquer les esprits.",
    contentHtml: `
<p>Le thème donne le fil conducteur de toute la décoration, des animations et parfois même de la tenue des invités. Voici 10 pistes qui fonctionnent bien.</p>

<h2>1. Hollywood / Tapis rouge</h2>
<p>Photocall, tapis rouge, panneaux lumineux avec le prénom : une ambiance glamour très demandée.</p>

<h2>2. Néon et couleurs vives</h2>
<p>Décor fluo, éclairages colorés, DJ et piste de danse mise en avant — parfait pour une soirée dansante.</p>

<h2>3. Élégance pastel</h2>
<p>Palette rose poudré, sauge ou lavande, pour une ambiance plus douce et raffinée.</p>

<h2>4. Voyage / destinations</h2>
<p>Chaque table représente une ville ou un pays, avec une décoration et une playlist assortie.</p>

<h2>5. Paillettes et or</h2>
<p>Un classique intemporel qui fonctionne pour tous les âges de convives.</p>

<h2>6. Sport / passion personnelle</h2>
<p>Reprendre le sport ou le hobby préféré de l'enfant pour une fête qui lui ressemble vraiment.</p>

<h2>7. Rétro / années 80-90</h2>
<p>Décor et musique d'époque, souvent très apprécié par un public multigénérationnel.</p>

<h2>8. Nature et botanique</h2>
<p>Végétaux, tons verts et bois clair pour une ambiance chaleureuse et naturelle.</p>

<h2>9. Cinéma / super-héros</h2>
<p>Idéal si l'enfant a une passion prononcée pour un univers en particulier.</p>

<h2>10. Minimaliste et chic</h2>
<p>Une décoration épurée, blanc et or, qui mise sur la qualité plutôt que sur la quantité d'éléments.</p>

<p>Quel que soit le thème choisi, pensez à le décliner aussi sur le faire-part numérique (couleurs, ambiance) pour donner le ton dès la première ouverture du lien par vos invités.</p>`,
  },
  {
    slug: 'faire-part-bar-mitsva-codes-traditionnels',
    title: 'Faire-part de Bar Mitsva : comment le personnaliser avec les codes traditionnels',
    keyword: 'faire-part bar mitsva',
    category: 'bar-bat-mitsva',
    publishDate: '2026-07-17',
    metaDescription: "Comment intégrer les éléments traditionnels (hébreu, symboles, bénédictions) dans un faire-part de Bar ou Bat Mitsva moderne et digital.",
    excerpt: "Marier tradition et modernité sur un support numérique, sans perdre le sens des symboles.",
    contentHtml: `
<p>Un faire-part de Bar ou Bat Mitsva peut très bien être moderne et digital tout en respectant les codes traditionnels attendus par les familles.</p>

<h2>Le texte en hébreu</h2>
<p>Beaucoup de familles souhaitent une ligne en hébreu (une bénédiction, le nom hébraïque de l'enfant) en complément du texte en français — un bon faire-part digital doit permettre cette double lecture sans que ce soit encombrant visuellement.</p>

<h2>La mention de la Parasha</h2>
<p>Indiquer la Parasha (portion de la Torah) de la semaine où tombe la Bar/Bat Mitsva est un usage apprécié, notamment par les grands-parents et invités plus pratiquants.</p>

<h2>Les informations sur le Shabbat</h2>
<p>Si un Shabbat est organisé autour de l'événement (Shabbat Bar Mitsva), une page dédiée avec les horaires d'offices et les informations pratiques évite bien des questions.</p>

<h2>Les couleurs et symboles</h2>
<p>Étoile de David, Torah stylisée, teintes bleu et or sont des choix visuels classiques, mais rien n'empêche de les associer à une palette plus personnelle et moderne.</p>

<h2>L'équilibre à trouver</h2>
<p>L'essentiel est de ne pas figer le faire-part dans un style unique : un contenu qui respecte les traditions religieuses tout en restant agréable à parcourir sur mobile, avec une navigation simple pour tous les âges d'invités.</p>`,
  },
  {
    slug: 'quand-organiser-bar-mitsva',
    title: 'Combien de temps à l\'avance organiser une Bar Mitsva ?',
    keyword: 'quand organiser bar mitsva',
    category: 'bar-bat-mitsva',
    publishDate: '2026-07-17',
    metaDescription: "Quel rétroplanning pour organiser une Bar Mitsva sereinement ? Nos conseils sur les délais à respecter pour la synagogue, la salle et les prestataires.",
    excerpt: "Le bon timing pour chaque étape, pour éviter le stress de dernière minute.",
    contentHtml: `
<p>Beaucoup de familles sous-estiment les délais nécessaires, en particulier pour la réservation de la synagogue et de la salle. Voici des repères réalistes.</p>

<h2>12 à 18 mois avant</h2>
<p>C'est le moment de fixer la date avec la synagogue (souvent liée au calendrier des offices et à la disponibilité du rabbin), et de réserver le lieu de réception si vous en avez déjà une idée précise.</p>

<h2>8 à 12 mois avant</h2>
<p>Démarrage de la préparation religieuse de l'enfant, et présélection des prestataires clés (traiteur, DJ/animation) — les meilleures dates partent vite, surtout au printemps et en début d'été.</p>

<h2>4 à 6 mois avant</h2>
<p>Envoi du faire-part. C'est aussi le moment de finaliser le thème et la décoration.</p>

<h2>2 mois avant</h2>
<p>Collecte des RSVP, finalisation des chiffres avec le traiteur, dernières retouches de tenue.</p>

<h2>Le mois précédent</h2>
<p>Répétitions de la lecture avec l'enfant, confirmation des derniers détails logistiques (transport, hébergement des invités venant de loin).</p>

<h2>En résumé</h2>
<p>Un an de préparation n'est pas un luxe mais une vraie marge de confort, surtout si beaucoup d'invités doivent se déplacer. En dessous de 6 mois, ça reste faisable, mais avec moins de choix sur les prestataires et les disponibilités de salle.</p>`,
  },
  {
    slug: 'idees-faire-part-anniversaire-original',
    title: 'Idées de faire-part d\'anniversaire originales pour petits et grands',
    keyword: 'faire-part anniversaire original',
    category: 'anniversaire',
    publishDate: '2026-07-08',
    metaDescription: "Des idées de faire-part d'anniversaire originales, pour un enfant comme pour un anniversaire d'adulte marquant (18, 30, 40, 50, 60 ans...).",
    excerpt: "Des idées adaptées à chaque âge, du goûter d'enfant à l'anniversaire surprise d'adulte.",
    contentHtml: `
<p>Un faire-part d'anniversaire n'a pas à être une simple carte générique. Voici comment le rendre mémorable, quel que soit l'âge fêté.</p>

<h2>Pour un anniversaire d'enfant</h2>
<p>Misez sur des couleurs vives, un univers (animaux, super-héros, princesses) et un ton ludique. Un compte à rebours animé donne un vrai effet "waouh" pour les enfants qui consultent le lien avec leurs parents.</p>

<h2>Pour un 18 ans</h2>
<p>Un ton plus libre et personnel, avec une galerie photo qui retrace quelques souvenirs marquants, fonctionne très bien pour cette tranche d'âge très à l'aise avec le digital.</p>

<h2>Pour un 30, 40 ou 50 ans</h2>
<p>Un format qui mélange humour et nostalgie (photos d'enfance, clins d'œil à l'époque de naissance) est très apprécié par les invités qui connaissent la personne depuis longtemps.</p>

<h2>Pour un anniversaire surprise</h2>
<p>Le faire-part numérique est particulièrement adapté : facile à envoyer discrètement, avec un lien qui ne révèle rien tant qu'on ne l'ouvre pas, contrairement à une carte qui peut traîner sur une table.</p>

<h2>Le petit plus qui change tout</h2>
<p>Quel que soit l'âge, une section RSVP simple évite d'avoir à recompter les présents à la dernière minute — utile même pour un anniversaire "informel" entre amis.</p>`,
  },
  {
    slug: 'organiser-anniversaire-surprise',
    title: 'Organiser un anniversaire surprise sans se faire repérer',
    keyword: 'organiser anniversaire surprise',
    category: 'anniversaire',
    publishDate: '2026-07-20',
    metaDescription: "Nos conseils pratiques pour organiser un anniversaire surprise réussi, de l'invitation discrète à la gestion des réponses sans éveiller les soupçons.",
    excerpt: "Les pièges classiques à éviter, et comment garder le secret jusqu'au bout.",
    contentHtml: `
<p>Organiser une surprise demande une coordination discrète, souvent avec de nombreux invités. Voici les erreurs les plus fréquentes, et comment les éviter.</p>

<h2>Ne pas passer par un groupe visible sur le téléphone du concerné</h2>
<p>Un simple groupe WhatsApp mal nommé, vu par erreur sur l'écran de verrouillage, peut suffire à tout gâcher. Un lien d'invitation numérique dédié, envoyé individuellement, limite ce risque.</p>

<h2>Prévoir une fausse occasion pour réunir tout le monde</h2>
<p>Un prétexte simple ("dîner entre amis", "verre après le travail") permet de rassembler la personne au bon endroit sans éveiller les soupçons.</p>

<h2>Centraliser les réponses sans multiplier les échanges</h2>
<p>Plus il y a d'allers-retours par SMS avec chaque invité, plus le risque de fuite augmente. Un lien avec RSVP intégré permet de collecter les confirmations en un seul endroit, sans conversation visible.</p>

<h2>Prévenir clairement de la confidentialité</h2>
<p>Rappelez explicitement à chaque invité que c'est une surprise — une évidence pour vous, mais pas toujours pour un invité distrait qui pourrait en parler devant la mauvaise personne.</p>

<h2>Avoir un plan B</h2>
<p>Prévoyez toujours une explication de secours si la personne pose des questions sur un détail suspect avant le jour J — mieux vaut improviser une couverture que de paniquer.</p>`,
  },
  {
    slug: 'faire-part-anniversaire-numerique-confirmations',
    title: 'Faire-part d\'anniversaire numérique : comment bien gérer les confirmations de présence',
    keyword: 'faire-part anniversaire numérique',
    category: 'anniversaire',
    publishDate: '2026-07-20',
    metaDescription: "Comment bien gérer les confirmations de présence pour un anniversaire grâce à un faire-part numérique : conseils pratiques et erreurs à éviter.",
    excerpt: "Les bonnes pratiques pour ne pas se retrouver à compter les invités la veille au soir.",
    contentHtml: `
<p>Même pour un anniversaire "entre amis", ne pas savoir combien de personnes viendront complique la réservation du lieu et la commande de nourriture. Voici comment mieux gérer ça.</p>

<h2>Posez une seule question claire</h2>
<p>"Serez-vous présent ?" avec un simple oui/non suffit dans la majorité des cas — pas besoin d'un formulaire compliqué pour un anniversaire informel.</p>

<h2>Ajoutez le nombre d'accompagnants si nécessaire</h2>
<p>Si les invités peuvent venir accompagnés, demandez-le directement dans le même formulaire plutôt que de le découvrir le jour J.</p>

<h2>Fixez une date de réponse réaliste</h2>
<p>Comptez au moins une semaine de marge avant l'événement pour finaliser les commandes (traiteur, gâteau, boissons) sereinement.</p>

<h2>Consultez les réponses à tout moment</h2>
<p>Un tableau de bord centralisé, plutôt que des réponses éparpillées entre SMS et messages vocaux, vous fait gagner un temps précieux dans les derniers jours.</p>

<h2>Prévoyez toujours une petite marge</h2>
<p>Même avec le meilleur suivi, il y a presque toujours un absent de dernière minute ou un "plus un" oublié — une marge de 5 à 10% sur vos commandes reste une sécurité utile.</p>`,
  },
  {
    slug: 'pourquoi-invitation-numerique-2026',
    title: 'Pourquoi passer à l\'invitation numérique en 2026 : avantages et limites',
    keyword: 'invitation numérique événement',
    category: 'organisation',
    publishDate: '2026-07-08',
    metaDescription: "Avantages et limites de l'invitation numérique pour un événement : coût, écologie, gestion des réponses. Un tour d'horizon honnête pour décider.",
    excerpt: "Un tour d'horizon honnête, sans survendre, pour décider en connaissance de cause.",
    contentHtml: `
<p>L'invitation numérique s'est largement démocratisée, mais elle ne convient pas à toutes les situations. Voici un état des lieux honnête.</p>

<h2>Les vrais avantages</h2>
<ul>
<li><strong>Coût</strong> : pas de frais d'impression ni d'affranchissement, quel que soit le nombre d'invités.</li>
<li><strong>Rapidité</strong> : envoi et réception instantanés, sans risque de courrier perdu.</li>
<li><strong>Gestion des réponses</strong> : RSVP centralisé, sans ressaisie manuelle.</li>
<li><strong>Mise à jour possible</strong> : une information qui change (horaire, lieu) peut être corrigée après l'envoi, contrairement au papier déjà imprimé.</li>
<li><strong>Impact environnemental réduit</strong> : moins de papier, moins de transport postal.</li>
</ul>

<h2>Les vraies limites</h2>
<ul>
<li>Certains invités, notamment plus âgés, restent moins à l'aise avec un lien numérique qu'avec un carton posé sur le buffet.</li>
<li>Le papier garde une valeur d'objet-souvenir que le digital ne remplace pas totalement.</li>
<li>Une mauvaise connexion internet peut ponctuellement gêner l'accès pour un invité, ce qui n'arrive jamais avec un carton papier.</li>
</ul>

<h2>Le format hybride, une solution pragmatique</h2>
<p>De plus en plus de couples et de familles envoient un carton papier aux invités les plus âgés ou les plus proches, et un lien numérique au reste des invités — le meilleur des deux mondes, sans sur-complexifier l'organisation.</p>`,
  },
  {
    slug: 'gerer-allergies-regimes-invites',
    title: 'Gérer les allergies et régimes spéciaux de vos invités facilement',
    keyword: 'gérer régimes invités événement',
    category: 'organisation',
    publishDate: '2026-07-23',
    metaDescription: "Comment collecter et gérer facilement les allergies, intolérances et régimes spéciaux de vos invités pour un mariage ou un événement sans mauvaise surprise.",
    excerpt: "La méthode simple pour ne rater aucune allergie ni régime alimentaire important.",
    contentHtml: `
<p>Entre les allergies, les intolérances et les régimes alimentaires (végétarien, casher, hallal, sans gluten...), collecter cette information correctement évite bien des complications le jour J.</p>

<h2>Demandez-le au moment du RSVP, pas après</h2>
<p>Intégrer la question directement dans le formulaire de confirmation de présence, plutôt que de la demander séparément par message, garantit que l'information n'est pas oubliée.</p>

<h2>Posez une question ouverte, pas juste des cases à cocher</h2>
<p>Une liste de cases prédéfinies (végétarien, sans gluten...) couvre les cas courants, mais un champ libre permet aussi de signaler une allergie spécifique (fruits à coque, crustacés...) qui ne rentre dans aucune case.</p>

<h2>Transmettez une liste consolidée au traiteur</h2>
<p>Plutôt que de transférer des messages épars, préparez un tableau récapitulatif clair (nom, régime, allergie) à donner directement à votre traiteur au moins deux semaines avant l'événement.</p>

<h2>Recoupez avec les accompagnants</h2>
<p>Pensez à bien associer chaque régime à la bonne personne quand il y a plusieurs convives par foyer — une confusion à ce niveau est l'erreur la plus fréquente.</p>

<h2>Prévoyez une marge de sécurité</h2>
<p>Même avec une collecte rigoureuse, prévoyez toujours quelques options neutres supplémentaires (sans allergènes courants) pour parer aux oublis de dernière minute.</p>`,
  },
  {
    slug: 'prix-faire-part-digital',
    title: 'Combien coûte un faire-part digital par rapport au papier ?',
    keyword: 'prix faire-part digital',
    category: 'organisation',
    publishDate: '2026-07-23',
    metaDescription: "Comparatif de prix entre faire-part papier et faire-part digital : coût réel par invité, frais cachés et ce qui influence vraiment le budget.",
    excerpt: "Un comparatif chiffré pour y voir clair sur le vrai coût de chaque option.",
    contentHtml: `
<p>Le prix est souvent le premier critère de choix. Voici comment comparer honnêtement le coût réel des deux options.</p>

<h2>Le coût du papier</h2>
<p>Un faire-part papier de qualité (impression, enveloppe, éventuel carton-réponse, timbre) revient en moyenne entre 3€ et 8€ par foyer invité. Pour 100 foyers, comptez donc facilement entre 300€ et 800€, avant même les frais de conception graphique si vous passez par un professionnel.</p>

<h2>Le coût du digital</h2>
<p>Un faire-part numérique fonctionne généralement sur un prix fixe, indépendant du nombre d'invités — que vous en ayez 30 ou 400, le tarif ne change pas pour la partie "faire-part et RSVP". C'est souvent là que se trouve la plus grosse économie pour les événements avec beaucoup d'invités.</p>

<h2>Les frais cachés à surveiller</h2>
<p>Côté papier : réimpression en cas d'erreur, retard d'affranchissement, recommandé pour les envois à l'étranger. Côté digital : certaines options avancées (mur photo collaboratif, gros volumes d'invités) peuvent être facturées en supplément selon les plateformes.</p>

<h2>Ce qui influence le plus le budget final</h2>
<p>Plus que le choix papier/digital lui-même, c'est le nombre d'invités qui fait varier le budget total : pour un petit événement de 30 personnes, la différence de coût entre les deux options reste modeste. Pour un grand mariage de 300 invités, l'écart peut représenter plusieurs centaines d'euros.</p>`,
  },
  {
    slug: 'creer-mur-photo-collaboratif-evenement',
    title: 'Comment créer un mur photo collaboratif pour votre événement',
    keyword: 'mur photo collaboratif événement',
    category: 'organisation',
    publishDate: '2026-07-26',
    metaDescription: "Qu'est-ce qu'un mur photo collaboratif et comment le mettre en place facilement pour un mariage, une Bar Mitsva ou un anniversaire ?",
    excerpt: "Le principe, les avantages, et comment l'activer simplement pour votre soirée.",
    contentHtml: `
<p>Le mur photo collaboratif est devenu un incontournable des soirées de mariage et de Bar/Bat Mitsva. Voici comment ça fonctionne concrètement.</p>

<h2>Le principe</h2>
<p>Vos invités scannent un QR code ou ouvrent un lien depuis leur téléphone pendant la soirée, et déposent directement leurs photos et vidéos sur une galerie commune, visible en temps réel par tous.</p>

<h2>Pourquoi c'est mieux qu'un simple hashtag Instagram</h2>
<p>Tous vos invités n'ont pas forcément de compte Instagram, ou ne pensent pas à utiliser le hashtag. Un mur dédié, sans compte à créer, capture beaucoup plus de contenu — y compris de la part des invités les moins à l'aise avec les réseaux sociaux.</p>

<h2>Comment l'activer pour votre soirée</h2>
<p>La plupart des plateformes de faire-part numérique proposent cette option en complément du faire-part principal, activable à partir d'une heure précise (souvent le début de soirée, pour ne pas se déclencher trop tôt).</p>

<h2>Un conseil pour maximiser la participation</h2>
<p>Affichez un QR code bien visible sur les tables et près du bar, et annoncez-le brièvement au micro en début de soirée — beaucoup d'invités ne pensent pas spontanément à chercher le lien sans ce rappel.</p>

<h2>Après la soirée</h2>
<p>Toutes les photos et vidéos restent accessibles et téléchargeables après l'événement — un souvenir collectif souvent plus riche que les seules photos du photographe professionnel.</p>`,
  },
  {
    slug: 'checklist-organisation-evenement-sans-stress',
    title: 'Check-list complète pour organiser un événement sans stress',
    keyword: 'check-list organisation événement',
    category: 'organisation',
    publishDate: '2026-07-26',
    metaDescription: "Check-list complète et réaliste pour organiser un mariage, une Bar Mitsva ou un anniversaire sans rien oublier, mois par mois.",
    excerpt: "Une vue d'ensemble mois par mois, pour ne rien oublier d'important.",
    contentHtml: `
<p>Qu'il s'agisse d'un mariage, d'une Bar Mitsva ou d'un grand anniversaire, la logique de planification reste similaire. Voici une check-list généraliste à adapter à votre événement.</p>

<h2>Longtemps à l'avance (6 à 12 mois)</h2>
<ul>
<li>Fixer la date définitive</li>
<li>Réserver le lieu de réception</li>
<li>Présélectionner les prestataires clés (traiteur, photographe, DJ/animation)</li>
</ul>

<h2>3 à 6 mois avant</h2>
<ul>
<li>Envoyer le faire-part ou l'invitation</li>
<li>Finaliser le thème et la décoration</li>
<li>Confirmer les prestataires retenus</li>
</ul>

<h2>1 à 2 mois avant</h2>
<ul>
<li>Collecter les RSVP et les régimes alimentaires spécifiques</li>
<li>Finaliser les chiffres avec le traiteur</li>
<li>Préparer le déroulé précis de la journée/soirée</li>
</ul>

<h2>La dernière semaine</h2>
<ul>
<li>Confirmer les horaires avec chaque prestataire</li>
<li>Préparer un contact unique le jour J pour gérer les imprévus (pas les mariés/parents eux-mêmes)</li>
<li>Prévoir une marge dans le planning pour absorber les petits retards</li>
</ul>

<h2>Le jour J</h2>
<p>Le plus important : accepter que tout ne se passera pas exactement comme prévu, et faire confiance à la préparation faite en amont. Un événement réussi n'est pas un événement parfait, c'est un événement où vous avez pu profiter du moment.</p>`,
  },
];

module.exports = { POSTS };
