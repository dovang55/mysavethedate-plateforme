// Sujets planifiés mais pas encore rédigés (voir posts.js pour les articles
// déjà écrits). Source unique pour le calendrier éditorial jusqu'à 80
// articles au total — affiché dans l'admin (/api/admin/blog) pour suivre
// l'avancement, et sert de liste de travail pour les prochaines rédactions.
const ARTICLES_A_REDIGER = [
  // Mariage (20)
  { title: 'Comment choisir la date de son mariage', keyword: 'choisir date mariage', category: 'mariage' },
  { title: 'Budget mariage : comment répartir ses dépenses intelligemment', keyword: 'budget mariage', category: 'mariage' },
  { title: 'Mariage civil, religieux, laïque : comprendre les différences', keyword: 'types de mariage', category: 'mariage' },
  { title: 'Comment organiser un mariage avec un petit budget', keyword: 'mariage petit budget', category: 'mariage' },
  { title: 'Liste de mariage : les meilleures options en 2026', keyword: 'liste de mariage', category: 'mariage' },
  { title: 'Comment choisir son témoin de mariage', keyword: 'choisir témoin mariage', category: 'mariage' },
  { title: "Discours de mariage : comment l'écrire sans stress", keyword: 'discours de mariage', category: 'mariage' },
  { title: "Mariage à l'étranger : ce qu'il faut anticiper pour vos invités", keyword: 'mariage à l\'étranger', category: 'mariage' },
  { title: 'Comment gérer un mariage mixte (deux cultures, deux religions)', keyword: 'mariage mixte organisation', category: 'mariage' },
  { title: 'Plan de table : comment éviter les conflits', keyword: 'plan de table mariage', category: 'mariage' },
  { title: 'Mariage en hiver : bonnes idées et pièges à éviter', keyword: 'mariage en hiver', category: 'mariage' },
  { title: 'Combien de temps prévoir entre les fiançailles et le mariage', keyword: 'délai fiançailles mariage', category: 'mariage' },
  { title: "Enterrement de vie de jeune fille/garçon : bien s'organiser", keyword: 'enterrement vie de jeune fille', category: 'mariage' },
  { title: 'DJ ou groupe live pour un mariage : comment choisir', keyword: 'dj mariage', category: 'mariage' },
  { title: 'Photographe de mariage : les questions à poser avant de signer', keyword: 'photographe mariage', category: 'mariage' },
  { title: 'Mariage en extérieur : anticiper la météo', keyword: 'mariage en extérieur météo', category: 'mariage' },
  { title: 'Comment annoncer un changement de date ou de lieu à ses invités', keyword: 'changement date mariage invités', category: 'mariage' },
  { title: 'Cadeaux invités de mariage : bonnes idées et budget', keyword: 'cadeaux invités mariage', category: 'mariage' },
  { title: "Mariage : les erreurs d'organisation les plus fréquentes", keyword: 'erreurs organisation mariage', category: 'mariage' },
  { title: "Combien d'invités en moyenne pour un mariage en France", keyword: 'nombre invités mariage moyenne', category: 'mariage' },

  // Bar / Bat Mitsva (20)
  { title: "Le rôle des parents dans la préparation d'une Bar Mitsva", keyword: 'rôle parents bar mitsva', category: 'bar-bat-mitsva' },
  { title: 'Discours des parents pour une Bar/Bat Mitsva : exemples et conseils', keyword: 'discours parents bar mitsva', category: 'bar-bat-mitsva' },
  { title: 'Comment choisir le lieu de réception pour une Bar Mitsva', keyword: 'lieu réception bar mitsva', category: 'bar-bat-mitsva' },
  { title: 'Cadeaux pour une Bar Mitsva : que faut-il offrir ?', keyword: 'cadeau bar mitsva', category: 'bar-bat-mitsva' },
  { title: 'Bar Mitsva : quel budget prévoir en 2026', keyword: 'budget bar mitsva', category: 'bar-bat-mitsva' },
  { title: 'Organiser une Bat Mitsva collective : avantages et inconvénients', keyword: 'bat mitsva collective', category: 'bar-bat-mitsva' },
  { title: 'Tenue vestimentaire pour une Bar/Bat Mitsva : ce qu\'il faut savoir', keyword: 'tenue bar mitsva', category: 'bar-bat-mitsva' },
  { title: 'Comment intégrer les grands-parents dans la préparation', keyword: 'grands-parents bar mitsva', category: 'bar-bat-mitsva' },
  { title: "Bar Mitsva en Israël : ce qu'il faut anticiper", keyword: 'bar mitsva israël', category: 'bar-bat-mitsva' },
  { title: 'Musique et animation pour une Bar/Bat Mitsva réussie', keyword: 'animation bar mitsva', category: 'bar-bat-mitsva' },
  { title: 'Comment gérer les invités non-juifs à une Bar Mitsva', keyword: 'invités non juifs bar mitsva', category: 'bar-bat-mitsva' },
  { title: 'Combien d\'invités inviter à une Bar Mitsva', keyword: 'nombre invités bar mitsva', category: 'bar-bat-mitsva' },
  { title: 'Bar Mitsva : les traditions selon les origines (séfarade, ashkénaze)', keyword: 'traditions bar mitsva séfarade ashkénaze', category: 'bar-bat-mitsva' },
  { title: 'Photographe et vidéaste pour une Bar Mitsva : nos conseils', keyword: 'photographe bar mitsva', category: 'bar-bat-mitsva' },
  { title: 'Aider son enfant à gérer le trac avant la lecture de la Torah', keyword: 'trac lecture torah bar mitsva', category: 'bar-bat-mitsva' },
  { title: 'Bat Mitsva moderne : les nouvelles tendances', keyword: 'bat mitsva tendances', category: 'bar-bat-mitsva' },
  { title: 'Shabbat Bar Mitsva : comment bien l\'organiser', keyword: 'shabbat bar mitsva organisation', category: 'bar-bat-mitsva' },
  { title: 'Décoration de salle pour une Bar Mitsva : idées par budget', keyword: 'décoration salle bar mitsva', category: 'bar-bat-mitsva' },
  { title: 'Bar Mitsva : check-list du jour J', keyword: 'check-list bar mitsva', category: 'bar-bat-mitsva' },
  { title: 'Différences entre une Bar Mitsva en France et en Israël', keyword: 'bar mitsva france israël différences', category: 'bar-bat-mitsva' },

  // Anniversaire (12)
  { title: 'Idées de gâteau d\'anniversaire selon le thème de la fête', keyword: 'gâteau anniversaire thème', category: 'anniversaire' },
  { title: 'Anniversaire d\'enfant : comment gérer les invitations à l\'école', keyword: 'invitation anniversaire école', category: 'anniversaire' },
  { title: 'Organiser un anniversaire à petit budget', keyword: 'anniversaire petit budget', category: 'anniversaire' },
  { title: 'Anniversaire 18 ans : idées originales pour une soirée mémorable', keyword: 'idées anniversaire 18 ans', category: 'anniversaire' },
  { title: 'Anniversaire de mariage (noces) : comment le fêter selon les années', keyword: 'anniversaire de mariage noces', category: 'anniversaire' },
  { title: 'Animations pour un anniversaire d\'enfant : nos idées préférées', keyword: 'animation anniversaire enfant', category: 'anniversaire' },
  { title: 'Anniversaire surprise à distance : comment faire avec des invités éloignés', keyword: 'anniversaire surprise à distance', category: 'anniversaire' },
  { title: "Combien de temps à l'avance organiser un anniversaire", keyword: 'délai organisation anniversaire', category: 'anniversaire' },
  { title: "Anniversaire d'adulte : combien d'invités en moyenne", keyword: 'nombre invités anniversaire adulte', category: 'anniversaire' },
  { title: 'Idées de lieux originaux pour fêter un anniversaire', keyword: 'lieu original anniversaire', category: 'anniversaire' },
  { title: 'Anniversaire à thème pour adulte : nos meilleures idées', keyword: 'anniversaire à thème adulte', category: 'anniversaire' },
  { title: "Cadeaux d'anniversaire collectifs : comment s'organiser entre invités", keyword: 'cagnotte cadeau anniversaire', category: 'anniversaire' },

  // Organisation & RSVP (10)
  { title: 'Comment relancer poliment un invité qui ne répond pas', keyword: 'relancer invité rsvp', category: 'organisation' },
  { title: 'RSVP : quelles informations demander (et lesquelles éviter)', keyword: 'informations rsvp demander', category: 'organisation' },
  { title: 'Comment gérer un événement avec des invités de tous âges', keyword: 'événement invités tous âges', category: 'organisation' },
  { title: 'Applications et outils pour organiser un événement en 2026', keyword: 'outils organisation événement', category: 'organisation' },
  { title: "Comment répartir les tâches d'organisation entre plusieurs personnes", keyword: 'répartir tâches organisation événement', category: 'organisation' },
  { title: 'Événement en extérieur : le plan B en cas de mauvais temps', keyword: 'plan b météo événement', category: 'organisation' },
  { title: 'Comment choisir entre plusieurs devis de prestataires', keyword: 'comparer devis prestataires événement', category: 'organisation' },
  { title: "Musique d'ambiance : composer une playlist qui plaît à tous", keyword: 'playlist événement', category: 'organisation' },
  { title: 'Comment gérer les enfants présents à un événement adulte', keyword: 'enfants événement adulte', category: 'organisation' },
  { title: "Après l'événement : comment remercier ses invités simplement", keyword: 'remercier invités après événement', category: 'organisation' },
];

module.exports = { ARTICLES_A_REDIGER };
