// Rendu du blog SEO (liste + articles). Design volontairement proche des
// pages légales (public/legal/legal.css) : contenu éditorial, pas besoin du
// moteur de rendu des faire-part (server/templates/bar-mitsva/render.js).

const CATEGORIES = {
  mariage: 'Mariage',
  'bar-bat-mitsva': 'Bar / Bat Mitsva',
  anniversaire: 'Anniversaire',
  organisation: 'Organisation & RSVP',
};

function styleCommun(){
  return `
*{box-sizing:border-box}
body{margin:0;font-family:'Inter',sans-serif;color:#0d1f3c;background:#f0f5ff;line-height:1.7}
a{color:#2563eb}
.page{max-width:760px;margin:0 auto;padding:48px 24px 80px}
.logo{display:inline-block;font-family:'Montserrat',sans-serif;font-weight:800;font-size:16px;letter-spacing:.06em;text-transform:uppercase;color:#0d1f3c;text-decoration:none;margin-bottom:10px}
.logo em{color:#2563eb;font-style:normal;font-weight:400}
.nav{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid rgba(13,31,60,.1)}
.nav a{font-size:13px;font-weight:600;color:rgba(13,31,60,.55);text-decoration:none}
.nav a:hover,.nav a.active{color:#2563eb}
h1{font-family:'Montserrat',sans-serif;font-weight:800;font-size:30px;margin:0 0 10px;line-height:1.25}
h2{font-family:'Montserrat',sans-serif;font-weight:700;font-size:19px;margin:34px 0 12px;color:#1e3a8a}
h3{font-family:'Montserrat',sans-serif;font-weight:700;font-size:16px;margin:26px 0 10px;color:#1e3a8a}
p,li{font-size:15px;color:#1e293b}
ul,ol{padding-left:22px;margin:0 0 16px}
.badge{display:inline-block;background:#e8f0fe;color:#1d4ed8;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:4px 10px;border-radius:999px;margin-bottom:14px}
.meta{font-size:12px;color:rgba(13,31,60,.45);margin-bottom:24px}
.cta{background:#0d1f3c;color:#fff;padding:28px 32px;border-radius:8px;text-align:center;margin:40px 0}
.cta p{color:#fff;margin:0 0 16px;font-size:15px}
.cta a{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:13px 28px;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;border-radius:4px}
.cta a:hover{background:#3b82f6}
.related{margin-top:40px;padding-top:24px;border-top:1px solid rgba(13,31,60,.1)}
.related h2{margin-top:0}
.related-item{display:block;padding:14px 0;border-bottom:1px solid rgba(13,31,60,.08);text-decoration:none}
.related-item:last-child{border-bottom:none}
.related-title{font-weight:700;color:#0d1f3c;font-size:14px}
.related-cat{font-size:11px;color:#2563eb;text-transform:uppercase;letter-spacing:.05em;font-weight:700}
.article-card{display:block;padding:22px 0;border-bottom:1px solid rgba(13,31,60,.08);text-decoration:none}
.article-card:hover .article-title{color:#2563eb}
.article-title{font-family:'Montserrat',sans-serif;font-weight:800;font-size:18px;color:#0d1f3c;margin:6px 0 6px}
.article-excerpt{font-size:14px;color:#475569}
.empty{font-style:italic;color:rgba(13,31,60,.5);padding:30px 0}
`;
}

function tete(titre, description, urlCanonique){
  return `<meta charset="utf-8">
<title>${titre}</title>
<meta name="description" content="${description}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="canonical" href="${urlCanonique}">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<meta property="og:type" content="article">
<meta property="og:title" content="${titre}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${urlCanonique}">
<style>${styleCommun()}</style>`;
}

function nav(actif){
  return `<nav class="nav">
    <a href="/" ${actif==='accueil'?'class="active"':''}>Accueil</a>
    <a href="/blog" ${actif==='blog'?'class="active"':''}>Blog</a>
  </nav>`;
}

function formaterDate(iso){
  try { return new Date(iso+'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' }); }
  catch(e){ return iso; }
}

function renderPostPage(post, articlesLies){
  const url = `https://mysavethedate.com/blog/${post.slug}`;
  const liensRelies = (articlesLies||[]).map(p => `
    <a class="related-item" href="/blog/${p.slug}">
      <div class="related-cat">${CATEGORIES[p.category]||p.category}</div>
      <div class="related-title">${p.title}</div>
    </a>`).join('');

  return `<!doctype html>
<html lang="fr">
<head>
${tete(post.title + ' — Blog MySaveTheDate', post.metaDescription, url)}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": ${JSON.stringify(post.title)},
  "description": ${JSON.stringify(post.metaDescription)},
  "datePublished": "${post.publishDate}",
  "author": { "@type": "Organization", "name": "MySaveTheDate" },
  "publisher": { "@type": "Organization", "name": "MySaveTheDate" }
}
</script>
</head>
<body>
<div class="page">
  <a href="/" class="logo">MySaveThe<em>Date</em></a>
  ${nav('blog')}
  <span class="badge">${CATEGORIES[post.category]||post.category}</span>
  <h1>${post.title}</h1>
  <div class="meta">Publié le ${formaterDate(post.publishDate)}</div>
  ${post.contentHtml}
  <div class="cta">
    <p>Envie de créer votre propre faire-part numérique ?</p>
    <a href="/">Essayer MySaveTheDate</a>
  </div>
  ${liensRelies ? `<div class="related"><h2>À lire aussi</h2>${liensRelies}</div>` : ''}
</div>
</body>
</html>`;
}

function renderIndexPage(posts){
  const items = posts.map(p => `
    <a class="article-card" href="/blog/${p.slug}">
      <span class="badge">${CATEGORIES[p.category]||p.category}</span>
      <div class="article-title">${p.title}</div>
      <div class="article-excerpt">${p.excerpt}</div>
    </a>`).join('');

  return `<!doctype html>
<html lang="fr">
<head>
${tete('Blog MySaveTheDate — Conseils mariage, Bar/Bat Mitsva & anniversaire', "Idées, conseils et guides pratiques pour organiser votre mariage, Bar/Bat Mitsva ou anniversaire, et réussir votre faire-part numérique.", 'https://mysavethedate.com/blog')}
</head>
<body>
<div class="page">
  <a href="/" class="logo">MySaveThe<em>Date</em></a>
  ${nav('blog')}
  <h1>Le blog MySaveTheDate</h1>
  <p style="color:#1e3a8a;margin-bottom:20px">Conseils et idées pour organiser votre événement et réussir votre faire-part.</p>
  ${items || '<p class="empty">Les premiers articles arrivent très bientôt.</p>'}
</div>
</body>
</html>`;
}

module.exports = { renderPostPage, renderIndexPage, CATEGORIES };
