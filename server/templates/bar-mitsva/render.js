// Convertit une couleur hexadécimale ("#2563eb") en rgba() utilisable dans
// un gradient CSS avec une opacité donnée.
function hexVersRgba(hex, alpha) {
  const h = (hex || '#000000').replace('#', '');
  const complet = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const nombre = parseInt(complet, 16) || 0;
  const r = (nombre >> 16) & 255, g = (nombre >> 8) & 255, b = nombre & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Construit le CSS de l'arrière-plan : un dégradé décoratif (par défaut,
// qui suit désormais les couleurs réelles du thème plutôt que des teintes
// bleues figées) ou un simple fond uni, selon le choix du client.
function construireFondCSS(t) {
  const bg = t.background || { type: 'degrade', angle: 155 };
  if (bg.type === 'uni') return t.colors.creamWarm;
  return `radial-gradient(ellipse 70% 50% at 18% 22%, ${hexVersRgba(t.colors.creamDeep, .85)}, transparent 65%),
    radial-gradient(ellipse 60% 50% at 82% 18%, ${hexVersRgba(t.colors.gold, .08)}, transparent 65%),
    radial-gradient(ellipse 55% 45% at 25% 80%, ${hexVersRgba(t.colors.gold, .06)}, transparent 65%),
    linear-gradient(${bg.angle ?? 155}deg, ${t.colors.creamWarm} 0%, ${t.colors.creamDeep} 55%, ${t.colors.cream} 100%)`;
}

// Construit l'URL Google Fonts à partir des polices réellement choisies
// (au lieu d'une liste figée) : sans ça, choisir une police dans l'éditeur
// n'avait aucun effet, la police n'étant jamais chargée dans la page.
function construireUrlPolices(t) {
  const familles = [...new Set([t.fonts?.heading, t.fonts?.body, t.fonts?.ui, t.fonts?.hebrew].filter(Boolean))];
  const params = familles.map(f => `family=${f.replace(/ /g, '+')}:wght@300;400;500;600;700;800`).join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

// Génère le HTML complet d'un site à partir de son config JSON
module.exports = function renderSite(cfg, siteId) {
  const c = cfg;
  const t = c.theme;
  const s = c.sections;
  const id = c.identity;

  // Pages actives (pour l'ordre du deck et la musique). L'ordre des pages du
  // milieu peut être personnalisé par le client (config.pageOrder) ; hero et
  // footer restent toujours en premier/dernier.
  const SECTIONS_CONNUES = ['fairepart','hommage','shabbat','infos','video','rsvp'];
  const customPages = Array.isArray(c.customPages) ? c.customPages : [];
  const customIds = customPages.map(p => p.id);
  let ordreMilieu = Array.isArray(c.pageOrder) ? c.pageOrder.filter(k => SECTIONS_CONNUES.includes(k) || customIds.includes(k)) : [];
  SECTIONS_CONNUES.forEach(k => { if (!ordreMilieu.includes(k)) ordreMilieu.push(k); });
  customIds.forEach(k => { if (!ordreMilieu.includes(k)) ordreMilieu.push(k); });
  const pageDefs = ['hero', ...ordreMilieu, 'footer'];
  const activePages = pageDefs.filter(k => {
    if (k === 'hero' || k === 'footer') return true;
    if (SECTIONS_CONNUES.includes(k)) return s[k]?.enabled !== false;
    const pagePerso = customPages.find(p => p.id === k);
    return pagePerso ? pagePerso.enabled !== false : false;
  });

  // Mapping musique : page index → track index
  const pageTrackMap = {};
  activePages.forEach((p, i) => {
    (c.music || []).forEach((track, ti) => {
      if (!track.url) return;
      if (track.pages && track.pages.includes(pageDefs.indexOf(p))) {
        pageTrackMap[i] = ti;
      }
    });
  });

  const targetISO = `${c.target?.date || '2026-01-01'}T${c.target?.time || '00:00'}:00${c.target?.timezone || '+02:00'}`;

  function photoSlot(url, label, style='') {
    if (url) return `<img src="${url}" alt="${label}" style="width:100%;max-width:520px;margin:48px auto;display:block;border:1px solid rgba(168,134,90,.3);${style}">`;
    return `<div class="photo-slot" style="${style}"><div>
      <svg class="ph-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="5" width="18" height="14" rx="1"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-6 6-3-3-4 4"/></svg>
      <div class="ph-label">${label}</div>
    </div></div>`;
  }

  function evRows(events, dark=false) {
    return (events||[]).map(ev => `
      <div class="ev-row">
        <span class="ev-label">${ev.label}</span>
        <span class="ev-value">${ev.value}${ev.valueItalic ? ` <em>${ev.valueItalic}</em>` : ''}</span>
        ${ev.valueHe ? `<span class="ev-value-he" style="direction:ltr">${ev.valueHe}</span>` : ''}
        ${ev.address ? `<span class="ev-value" style="font-size:18px;color:var(--ink-soft)">${ev.address}</span>` : ''}
        ${ev.wazeUrl ? `<a class="waze-btn${dark?' waze-dark':''}" href="${ev.wazeUrl}" target="_blank">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 12c0 4.97-4.03 9-9 9-1.05 0-2.06-.18-3-.51L4 22l1.51-5C4.55 16.06 4 13.61 4 12 4 7.03 8.03 3 12.5 3 17.47 3 21 7.03 21 12z"/></svg>
          <span>Voir l'itinéraire Waze</span>
        </a>` : ''}
      </div>`).join('');
  }

  const musicTracks = (c.music||[]).filter(m => m.url);
  const hasTracks = musicTracks.length > 0;

  // Chaque section du milieu (entre le hero et le footer), indexée par nom,
  // pour pouvoir les réassembler dans l'ordre choisi par le client
  // (ordreMilieu, calculé plus haut à partir de c.pageOrder).
  const sectionsHTML = {

    fairepart: s.fairepart?.enabled === false ? '' : `
<!-- FAIRE-PART -->
<section class="parchment" id="faire-part">
  <div class="parchment-card fade-in">
    <span class="corner-tr"></span><span class="corner-bl"></span>
    <p class="blessing">${s.fairepart.blessing}</p>
    <div class="seudat-block">
      <div class="seudat-tag">${s.fairepart.ceremonyTag}</div>
      <h2 class="seudat-name">${s.fairepart.ceremonyName}</h2>
      ${s.fairepart.ceremonyHe ? `<div class="seudat-he">${s.fairepart.ceremonyHe}</div>` : ''}
    </div>
    <div class="ornament"><span class="line"></span><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L14 10L22 12L14 14L12 22L10 14L2 12L10 10Z"/></svg><span class="line"></span></div>
    <p class="invite-lead"><strong>${s.fairepart.familyLine}</strong></p>
    ${s.fairepart.inviteHe ? `<div class="invite-he">${s.fairepart.inviteHe}</div>` : ''}
    <p class="invite-sub">${s.fairepart.inviteSub}</p>
    ${photoSlot(s.fairepart.photo, 'Photo de '+id.firstName)}
    <div class="event-details">${evRows(s.fairepart.events)}</div>
    <p class="followup">— ${s.fairepart.followup} —</p>
  </div>
</section>`,

    hommage: s.hommage?.enabled === false ? '' : `
<!-- HOMMAGE -->
<section class="hommage">
  <div class="container">
    <div class="hommage-card fade-in">
      <div class="hommage-tag">Hommage</div>
      <h2 class="hommage-title">${s.hommage.title}</h2>
      ${photoSlot(s.hommage.photo, 'Photo', 'max-width:420px')}
      <p class="hommage-text">${s.hommage.text.replace(/\n/g,'<br>')}</p>
      <p class="hommage-amen">— Amen —</p>
    </div>
  </div>
</section>`,

    shabbat: s.shabbat?.enabled === false ? '' : `
<!-- SHABBAT -->
<section class="shabbat" id="shabbat" data-theme="dark">
  <div class="container">
    <div class="fade-in">
      <div class="shabbat-tag">${s.shabbat.tag}</div>
      <h2 class="shabbat-title">Parasha <em>${s.shabbat.parasha}</em></h2>
      ${s.shabbat.parashaHe ? `<div class="shabbat-he">${s.shabbat.parashaHe}</div>` : ''}
      <p class="shabbat-intro">${s.shabbat.intro}</p>
      <div class="torah-illus">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="10" y="14" width="4" height="36" rx="1" fill="currentColor"/>
          <rect x="50" y="14" width="4" height="36" rx="1" fill="currentColor"/>
          <path d="M22 26L42 26 M22 32L42 32 M22 38L42 38"/>
          <circle cx="12" cy="14" r="3" fill="currentColor"/><circle cx="52" cy="14" r="3" fill="currentColor"/>
          <circle cx="12" cy="50" r="3" fill="currentColor"/><circle cx="52" cy="50" r="3" fill="currentColor"/>
        </svg>
      </div>
      ${s.shabbat.photo ? `<img src="${s.shabbat.photo}" alt="" style="max-width:520px;margin:0 auto 48px;aspect-ratio:4/3;object-fit:cover;border:1px solid rgba(201,168,124,.25)">` : ''}
      <div class="shabbat-details">${evRows(s.shabbat.events, true)}</div>
      <p class="shabbat-followup">— ${s.shabbat.followup} —</p>
    </div>
  </div>
</section>`,

    infos: s.infos?.enabled === false ? '' : `
<!-- INFOS -->
<section id="infos">
  <div class="container">
    <div class="info-card fade-in">
      <span class="corner-tl"></span><span class="corner-br"></span>
      <div class="info-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M3 9h18"/></svg></div>
      <h3 class="info-title">${s.infos.title}</h3>
      <p class="info-subtitle">${s.infos.subtitle}</p>
      <p class="info-body">${s.infos.body}</p>
      <a class="info-cta" href="${s.infos.ctaUrl}" target="_blank"><span>${s.infos.ctaText}</span><span style="font-size:14px">→</span></a>
    </div>
  </div>
</section>`,

    video: s.video?.enabled === false ? '' : `
<!-- VIDEO -->
<section id="video" style="background:linear-gradient(180deg,transparent,rgba(201,168,124,.06))">
  <div class="container">
    <div class="video-card fade-in">
      <div class="video-illus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M21 7l-4 3 4 3z" fill="currentColor"/></svg></div>
      <h3 class="video-title">${s.video.title} <em>${id.firstName}</em> !</h3>
      <p class="video-text">${s.video.text.replace(/\n/g,'<br>')}</p>
      <a class="video-cta" href="/upload">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 4v16M4 12h16"/></svg>
        <span>Envoyer ma vidéo</span>
      </a>
    </div>
  </div>
</section>`,

    rsvp: s.rsvp?.enabled === false ? '' : `
<!-- RSVP -->
<section class="rsvp-section" id="rsvp">
  <div class="container">
    <div class="rsvp-head fade-in">
      <div class="rsvp-tag">Formulaire de réponse</div>
      <h2 class="rsvp-title">Merci de <em>répondre</em></h2>
      <p class="rsvp-sub">avant le ${s.rsvp.deadline}</p>
    </div>
    <form class="rsvp-form fade-in" id="rsvpForm" onsubmit="return submitRsvp(event)">
      <div class="rsvp-fields">
        <div class="field-row">
          <div class="field"><label>Nom <span class="req">*</span></label><input type="text" id="rNom" required></div>
          <div class="field"><label>Prénom <span class="req">*</span></label><input type="text" id="rPrenom" required></div>
        </div>
        ${(s.rsvp.events||[]).map((ev,i) => `
        <div class="form-divider"></div>
        <h3 class="form-sub-title">${ev.name.replace(' & ','&amp;&nbsp;')}</h3>
        <p class="form-sub-date">${ev.date}</p>
        <div class="field"><label>Votre présence</label>
          <div class="pres-group">
            <label><input type="radio" name="pres-${ev.id}" value="oui" ${i===0?'required':''}><span class="check"></span>Je serai présent(e)</label>
            <label><input type="radio" name="pres-${ev.id}" value="non"><span class="check"></span>Je ne serai pas présent(e)</label>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Adultes</label><div class="stepper" data-stepper><button type="button" data-step="-1">−</button><input type="number" min="0" max="20" value="${i===0?1:0}" name="adults-${ev.id}"><button type="button" data-step="+1">+</button></div></div>
          <div class="field"><label>Enfants</label><div class="stepper" data-stepper><button type="button" data-step="-1">−</button><input type="number" min="0" max="20" value="0" name="children-${ev.id}"><button type="button" data-step="+1">+</button></div></div>
        </div>`).join('')}
        <div class="form-divider"></div>
        <div class="field"><label>Un petit message</label><textarea placeholder="Ex. Mazal Tov…" id="rMsg"></textarea></div>
        <button type="submit" class="submit-btn"><span>Envoyer ma réponse</span><span>→</span></button>
      </div>
      <div class="rsvp-success">
        <h3>Merci infiniment</h3>
        <p>Votre réponse a bien été enregistrée.<br>${id.firstName} a hâte de vous y voir.</p>
      </div>
    </form>
  </div>
</section>`,

  };

  // Pages personnalisées créées librement par le client : même habillage
  // visuel que la page "Hommage" (titre + texte + photo), pour rester
  // cohérent avec le reste du faire-part sans ajouter de nouveau design.
  const customSectionsHTML = {};
  customPages.forEach(p => {
    if (p.enabled === false) { customSectionsHTML[p.id] = ''; return; }
    customSectionsHTML[p.id] = `
<!-- PAGE PERSONNALISÉE : ${p.title||''} -->
<section class="hommage">
  <div class="container">
    <div class="hommage-card fade-in">
      <div class="hommage-tag">${p.tag||'Page'}</div>
      <h2 class="hommage-title">${p.title||''}</h2>
      ${photoSlot(p.photo, 'Photo', 'max-width:420px')}
      <p class="hommage-text">${(p.text||'').replace(/\n/g,'<br>')}</p>
    </div>
  </div>
</section>`;
  });

  const sectionsMilieuHTML = ordreMilieu.map(k => sectionsHTML[k] || customSectionsHTML[k] || '').join('');

  return `<!doctype html>
<html lang="${c.meta?.lang||'fr'}">
<head>
<meta charset="utf-8">
<title>${c.meta?.title||id.firstName+' '+id.lastName}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${construireUrlPolices(t)}" rel="stylesheet">
<style>
  :root{
    --cream:${t.colors.cream};
    --cream-warm:${t.colors.creamWarm};
    --cream-deep:${t.colors.creamDeep};
    --paper:${t.colors.paper};
    --gold:${t.colors.gold};
    --gold-bright:${t.colors.goldBright};
    --gold-deep:${t.colors.goldDeep};
    --bronze:${t.colors.bronze};
    --ink:${t.colors.ink};
    --ink-soft:${t.colors.inkSoft};
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{background:var(--cream-warm);color:var(--ink);font-family:'${t.fonts.ui}',sans-serif;font-weight:400;-webkit-font-smoothing:antialiased;overflow:hidden}
  img{display:block;max-width:100%}
  a{color:inherit;text-decoration:none}

  .deck{display:flex;width:100vw;height:100vh;transition:transform .8s cubic-bezier(.76,0,.24,1)}
  .deck > section,.deck > footer{flex:0 0 100vw;width:100vw;height:100vh;overflow-y:auto;overflow-x:hidden;display:flex;padding:72px 24px;scrollbar-width:thin;scrollbar-color:rgba(37,99,235,.4) transparent}
  .deck > section::-webkit-scrollbar,.deck > footer::-webkit-scrollbar{width:6px}
  .deck > section::-webkit-scrollbar-thumb,.deck > footer::-webkit-scrollbar-thumb{background:rgba(37,99,235,.3);border-radius:3px}
  .deck > section > *,.deck > footer > *{margin:auto;width:100%}

  .nav-arrow{position:fixed;top:50%;transform:translateY(-50%);z-index:70;width:54px;height:54px;border-radius:50%;border:2px solid rgba(37,99,235,.25);background:rgba(255,255,255,.88);backdrop-filter:blur(8px);display:grid;place-items:center;cursor:pointer;transition:all .3s;color:var(--ink)}
  .nav-arrow:hover{border-color:var(--gold-deep);background:#fff;color:var(--gold-deep);transform:translateY(-50%) scale(1.06)}
  .nav-arrow svg{width:22px;height:22px;stroke-width:2.5}
  .nav-arrow.prev{left:20px}.nav-arrow.next{right:20px}
  .nav-arrow[disabled]{opacity:0;pointer-events:none}
  .nav-arrow.on-dark{border-color:rgba(255,255,255,.3);background:rgba(13,31,60,.55);color:#fff}
  .nav-arrow.on-dark:hover{border-color:#fff;background:rgba(13,31,60,.85)}

  .pager{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:70;display:flex;align-items:center;gap:11px}
  .pager .dot{width:7px;height:7px;border-radius:50%;border:none;padding:0;background:rgba(37,99,235,.22);cursor:pointer;transition:all .3s}
  .pager .dot:hover{background:rgba(37,99,235,.5)}
  .pager .dot.active{background:var(--gold-deep);transform:scale(1.55)}
  .pager.on-dark .dot{background:rgba(255,255,255,.3)}
  .pager.on-dark .dot.active{background:#fff}

  @media(max-width:760px){
    .nav-arrow{width:34px;height:34px;background:rgba(255,255,255,.75)}
    .nav-arrow svg{width:15px;height:15px}
    .nav-arrow.prev{left:6px}.nav-arrow.next{right:6px}
    .deck > section,.deck > footer{padding:64px 16px 80px}
  }

  .bg-gradient{position:fixed;inset:0;z-index:-2;pointer-events:none;background:
    ${construireFondCSS(t)}}

  .bsd{position:fixed;top:20px;right:24px;z-index:55;font-family:'${t.fonts.hebrew}',serif;font-size:14px;font-weight:600;letter-spacing:.04em;color:var(--bronze);opacity:.85;direction:rtl;pointer-events:none}

  .hero{min-height:100vh;display:grid;place-items:center;padding:80px 24px;text-align:center;position:relative}
  .hero-inner{max-width:900px;position:relative;z-index:2}
  .hero-eyebrow{font-family:'${t.fonts.heading}',sans-serif;font-size:10px;font-weight:700;letter-spacing:.7em;text-transform:uppercase;color:var(--bronze);margin-bottom:36px}
  .hero-eyebrow::before,.hero-eyebrow::after{content:'';display:inline-block;width:40px;height:2px;background:var(--gold-deep);vertical-align:middle;margin:0 16px}
  .hero-logo{width:min(360px,52vw);margin:0 auto 40px;filter:drop-shadow(0 20px 40px rgba(30,64,175,.15))}
  .hero-title{font-family:'${t.fonts.heading}',sans-serif;font-size:clamp(44px,8vw,100px);line-height:.92;letter-spacing:-.02em;color:var(--ink);font-weight:800;margin-bottom:8px;text-transform:uppercase}
  .hero-name{font-family:'${t.fonts.heading}',sans-serif;font-weight:800;font-size:clamp(44px,8vw,100px);line-height:.92;color:var(--gold-deep);margin-bottom:56px;text-transform:uppercase;letter-spacing:-.02em}

  .countdown-line{display:flex;justify-content:center;align-items:flex-start;gap:0;margin-bottom:14px;flex-wrap:nowrap}
  .cd-unit{display:flex;flex-direction:column;align-items:center;min-width:0}
  .cd-num{font-family:'${t.fonts.heading}',sans-serif;font-size:clamp(32px,7vw,72px);line-height:1;color:var(--ink);font-weight:800;font-variant-numeric:tabular-nums}
  .cd-sep{font-family:'${t.fonts.heading}',sans-serif;font-size:clamp(28px,6vw,64px);color:var(--gold-deep);line-height:1;padding:0 clamp(6px,2vw,18px);align-self:flex-start;font-weight:800}
  .cd-labels{display:flex;justify-content:center;gap:0;font-family:'${t.fonts.heading}',sans-serif;font-size:9px;font-weight:700;letter-spacing:.5em;text-transform:uppercase;color:var(--bronze);margin-bottom:48px}
  .cd-labels span{flex:1;text-align:center;max-width:120px}
  .cd-labels .gap{width:clamp(20px,5vw,46px);max-width:none;flex:0 0 auto}

  .btn-primary{display:inline-flex;align-items:center;gap:14px;padding:18px 44px;background:var(--ink);color:#fff;font-family:'${t.fonts.heading}',sans-serif;font-size:10px;font-weight:700;letter-spacing:.45em;text-transform:uppercase;border:none;cursor:pointer;transition:all .3s;text-decoration:none}
  .btn-primary:hover{background:var(--gold-deep);transform:translateY(-2px)}

  section{padding:120px 24px;position:relative}
  .container{max-width:920px;margin:0 auto}

  .parchment{position:relative;padding:140px 24px}
  .parchment-card{max-width:780px;margin:0 auto;background:var(--paper);position:relative;padding:80px 60px 70px;border:none;border-top:4px solid var(--gold-deep);box-shadow:0 40px 100px rgba(13,31,60,.09);text-align:center}
  .parchment-card::before{display:none}
  .parchment-card::after{display:none}
  .parchment-card .corner-tr{display:none}
  .parchment-card .corner-bl{display:none}

  .blessing{font-family:'${t.fonts.body}',sans-serif;font-size:16px;font-weight:500;color:var(--gold-deep);letter-spacing:.04em;margin-bottom:48px}
  .seudat-block{margin-bottom:48px}
  .seudat-tag{font-family:'${t.fonts.heading}',sans-serif;font-size:9px;font-weight:700;letter-spacing:.6em;text-transform:uppercase;color:var(--bronze);margin-bottom:14px}
  .seudat-name{font-family:'${t.fonts.heading}',sans-serif;font-size:clamp(26px,4vw,44px);color:var(--ink);font-weight:800;letter-spacing:-.01em;line-height:1.1;text-transform:uppercase}
  .seudat-name em{font-family:'${t.fonts.body}',sans-serif;font-style:italic;color:var(--gold-deep);font-weight:400;text-transform:none}
  .seudat-he{font-family:'${t.fonts.hebrew}',serif;font-size:32px;color:var(--gold-deep);margin-top:8px;direction:rtl;font-weight:500}
  .ornament{display:flex;align-items:center;justify-content:center;gap:14px;margin:36px 0}
  .ornament .line{width:80px;height:2px;background:var(--gold-deep)}
  .ornament svg{width:18px;height:18px;color:var(--gold-deep)}
  .invite-lead{font-family:'${t.fonts.body}',sans-serif;font-size:clamp(17px,2.4vw,23px);color:var(--ink);line-height:1.65;font-weight:600;margin-bottom:14px}
  .invite-lead strong{font-weight:800;font-family:'${t.fonts.heading}',sans-serif;color:var(--ink);letter-spacing:.01em;text-transform:uppercase}
  .invite-he{font-family:'${t.fonts.hebrew}',serif;font-size:22px;color:var(--gold-deep);direction:rtl;margin:18px 0;font-weight:500}
  .invite-sub{font-family:'${t.fonts.body}',sans-serif;font-size:clamp(15px,1.8vw,18px);color:var(--ink-soft);line-height:1.75;max-width:560px;margin:24px auto 0;font-weight:400}
  .photo-slot{aspect-ratio:4/3;max-width:520px;margin:48px auto;background:linear-gradient(135deg,rgba(37,99,235,.07),rgba(30,64,175,.03));background-color:var(--cream-deep);border:2px dashed rgba(37,99,235,.18);display:grid;place-items:center;text-align:center;color:var(--bronze);position:relative;overflow:hidden}
  .photo-slot::before{content:'';position:absolute;top:14px;left:14px;right:14px;bottom:14px;border:1px dashed rgba(37,99,235,.12)}
  .ph-label{font-family:'${t.fonts.heading}',sans-serif;font-size:9px;font-weight:700;letter-spacing:.4em;text-transform:uppercase;position:relative;z-index:2}
  .ph-icon{width:36px;height:36px;margin:0 auto 14px;opacity:.4;position:relative;z-index:2}

  .event-details{margin:36px 0}
  .ev-row{display:flex;flex-direction:column;gap:6px;margin-bottom:20px}
  .ev-label{font-family:'${t.fonts.heading}',sans-serif;font-size:9px;font-weight:700;letter-spacing:.6em;text-transform:uppercase;color:var(--bronze)}
  .ev-value{font-family:'${t.fonts.body}',sans-serif;font-size:20px;color:var(--ink);font-weight:600}
  .ev-value em{font-style:italic;color:var(--gold-deep);font-weight:400}
  .ev-value-he{font-family:'${t.fonts.hebrew}',serif;font-size:18px;color:var(--gold-deep);direction:rtl;margin-top:4px;font-weight:500}
  .waze-btn{display:inline-flex;align-items:center;gap:12px;padding:14px 26px;border:2px solid var(--ink);background:transparent;color:var(--ink);font-family:'${t.fonts.heading}',sans-serif;font-size:9px;font-weight:700;letter-spacing:.4em;text-transform:uppercase;cursor:pointer;transition:all .25s;text-decoration:none;margin-top:14px}
  .waze-btn:hover{background:var(--ink);color:#fff}
  .waze-btn svg{width:16px;height:16px}
  .waze-dark{border-color:rgba(255,255,255,.5);color:#fff}
  .waze-dark:hover{background:rgba(255,255,255,.15);border-color:#fff}
  .followup{font-family:'${t.fonts.body}',sans-serif;font-size:16px;font-weight:500;color:var(--ink-soft);margin-top:36px;line-height:1.55}

  .hommage-card{max-width:760px;margin:0 auto;text-align:center}
  .hommage-tag{font-family:'${t.fonts.heading}',sans-serif;font-size:9px;font-weight:700;letter-spacing:.6em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:24px}
  .hommage-tag::before,.hommage-tag::after{content:'';display:inline-block;width:30px;height:2px;background:var(--gold-deep);vertical-align:middle;margin:0 14px}
  .hommage-title{font-family:'${t.fonts.heading}',sans-serif;font-size:clamp(26px,5vw,52px);color:var(--ink);font-weight:800;margin-bottom:36px;line-height:1.1;text-transform:uppercase;letter-spacing:-.01em}
  .hommage-title em{font-family:'${t.fonts.body}',sans-serif;font-style:italic;color:var(--gold-deep);font-weight:400;text-transform:none}
  .hommage-text{font-family:'${t.fonts.body}',sans-serif;font-size:clamp(17px,2.2vw,22px);line-height:1.7;color:var(--ink);font-weight:400}
  .hommage-text strong{font-weight:700;font-family:'${t.fonts.heading}',sans-serif;color:var(--gold-deep)}
  .hommage-amen{margin-top:36px;font-family:'${t.fonts.heading}',sans-serif;font-size:10px;font-weight:700;letter-spacing:.6em;text-transform:uppercase;color:var(--gold-deep)}

  .shabbat{background:#0d1f3c;color:#fff;position:relative;overflow:hidden}
  .shabbat::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 60% 50% at 50% 30%,rgba(37,99,235,.28),transparent 70%),radial-gradient(ellipse 50% 50% at 30% 80%,rgba(59,130,246,.12),transparent 70%);pointer-events:none}
  .shabbat .container{position:relative;z-index:2;text-align:center}
  .shabbat-tag{font-family:'${t.fonts.heading}',sans-serif;font-size:9px;font-weight:700;letter-spacing:.65em;text-transform:uppercase;color:#93c5fd;margin-bottom:24px}
  .shabbat-tag::before,.shabbat-tag::after{content:'';display:inline-block;width:30px;height:2px;background:rgba(147,197,253,.5);vertical-align:middle;margin:0 16px}
  .shabbat-title{font-family:'${t.fonts.heading}',sans-serif;font-size:clamp(32px,6vw,68px);color:#fff;font-weight:800;line-height:1.05;letter-spacing:-.02em;text-transform:uppercase}
  .shabbat-title em{font-family:'${t.fonts.body}',sans-serif;font-style:italic;color:#93c5fd;font-weight:400;text-transform:none}
  .shabbat-he{font-family:'${t.fonts.hebrew}',serif;font-size:clamp(26px,4.5vw,48px);color:#93c5fd;direction:rtl;margin-top:14px;font-weight:500}
  .shabbat-intro{max-width:620px;margin:32px auto 48px;font-family:'${t.fonts.body}',sans-serif;font-size:clamp(16px,2vw,20px);line-height:1.65;color:rgba(255,255,255,.8);font-weight:400}
  .torah-illus{width:120px;height:120px;margin:0 auto 36px;border-radius:50%;background:radial-gradient(ellipse at 30% 30%,rgba(59,130,246,.3),rgba(37,99,235,.1));border:2px solid rgba(59,130,246,.4);display:grid;place-items:center}
  .torah-illus svg{width:60px;height:60px;color:#93c5fd}
  .shabbat-details{display:grid;gap:24px;max-width:520px;margin:0 auto}
  .shabbat-details .ev-label{color:#93c5fd}
  .shabbat-details .ev-value{color:#fff}
  .shabbat-details .ev-value em{color:#bfdbfe}
  .shabbat-followup{margin-top:36px;font-family:'${t.fonts.body}',sans-serif;font-size:16px;color:rgba(255,255,255,.65);line-height:1.55;font-weight:400}

  .info-card{max-width:760px;margin:0 auto;background:rgba(255,255,255,.75);border:none;border-top:4px solid var(--gold-deep);box-shadow:0 30px 80px rgba(13,31,60,.08);padding:60px 48px;position:relative;text-align:center}
  .info-card .corner-tl{display:none}
  .info-card .corner-br{display:none}
  .info-icon{width:56px;height:56px;margin:0 auto 24px;border-radius:50%;background:var(--cream-deep);display:grid;place-items:center;color:var(--gold-deep)}
  .info-title{font-family:'${t.fonts.heading}',sans-serif;font-size:clamp(20px,3vw,32px);color:var(--ink);font-weight:800;margin-bottom:8px;letter-spacing:-.01em;text-transform:uppercase}
  .info-subtitle{font-family:'${t.fonts.body}',sans-serif;font-size:16px;color:var(--gold-deep);margin-bottom:24px;font-weight:600}
  .info-body{font-family:'${t.fonts.body}',sans-serif;font-size:17px;color:var(--ink-soft);line-height:1.7;font-weight:400;margin-bottom:32px}
  .info-cta{display:inline-flex;align-items:center;gap:12px;padding:16px 32px;background:var(--gold-deep);color:#fff;font-family:'${t.fonts.heading}',sans-serif;font-size:9px;font-weight:700;letter-spacing:.45em;text-transform:uppercase;transition:all .25s;text-decoration:none}
  .info-cta:hover{background:var(--ink)}

  .video-card{max-width:760px;margin:0 auto;text-align:center}
  .video-illus{width:140px;height:140px;margin:0 auto 32px;position:relative;display:grid;place-items:center}
  .video-illus::before{content:'';position:absolute;inset:0;border-radius:50%;border:2px solid var(--gold-deep);animation:ring 3s ease-in-out infinite}
  .video-illus::after{content:'';position:absolute;inset:14px;border-radius:50%;border:1px solid var(--gold);opacity:.5}
  @keyframes ring{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.08);opacity:1}}
  .video-illus svg{width:50px;height:50px;color:var(--gold-deep);position:relative;z-index:2;stroke-width:2}
  .video-title{font-family:'${t.fonts.heading}',sans-serif;font-size:clamp(26px,4.5vw,48px);color:var(--ink);font-weight:800;margin-bottom:16px;letter-spacing:-.01em;line-height:1.1;text-transform:uppercase}
  .video-title em{font-family:'${t.fonts.body}',sans-serif;font-style:italic;color:var(--gold-deep);font-weight:400;text-transform:none}
  .video-text{font-family:'${t.fonts.body}',sans-serif;font-size:clamp(16px,2vw,20px);color:var(--ink-soft);line-height:1.7;max-width:560px;margin:0 auto 32px;font-weight:400}
  .video-cta{display:inline-flex;align-items:center;gap:12px;padding:18px 32px;background:var(--ink);color:#fff;font-family:'${t.fonts.heading}',sans-serif;font-size:9px;font-weight:700;letter-spacing:.45em;text-transform:uppercase;cursor:pointer;border:none;transition:all .25s;text-decoration:none}
  .video-cta:hover{background:var(--gold-deep)}

  .rsvp-section{background:linear-gradient(180deg,rgba(37,99,235,.04),transparent)}
  .rsvp-head{text-align:center;margin-bottom:48px}
  .rsvp-tag{font-family:'${t.fonts.heading}',sans-serif;font-size:9px;font-weight:700;letter-spacing:.65em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:14px}
  .rsvp-tag::before,.rsvp-tag::after{content:'';display:inline-block;width:24px;height:2px;background:var(--gold-deep);vertical-align:middle;margin:0 14px}
  .rsvp-title{font-family:'${t.fonts.heading}',sans-serif;font-size:clamp(32px,5vw,56px);color:var(--ink);font-weight:800;letter-spacing:-.02em;line-height:1;text-transform:uppercase}
  .rsvp-title em{font-family:'${t.fonts.body}',sans-serif;font-style:italic;color:var(--gold-deep);font-weight:400;text-transform:none}
  .rsvp-sub{margin-top:14px;font-family:'${t.fonts.body}',sans-serif;font-size:16px;color:var(--ink-soft);font-weight:500}
  .rsvp-form{max-width:720px;margin:0 auto;background:var(--paper);border:none;border-top:4px solid var(--gold-deep);box-shadow:0 30px 80px rgba(13,31,60,.08);padding:56px 48px;position:relative}
  .rsvp-form::before{display:none}
  .rsvp-form::after{display:none}
  .form-sub-title{font-family:'${t.fonts.heading}',sans-serif;font-size:clamp(17px,2.5vw,26px);color:var(--ink);font-weight:800;letter-spacing:-.01em;text-align:center;margin:36px 0 6px;line-height:1.2;text-transform:uppercase}
  .form-sub-title em{font-family:'${t.fonts.body}',sans-serif;font-style:italic;color:var(--gold-deep);font-weight:400;text-transform:none}
  .form-sub-date{text-align:center;font-family:'${t.fonts.body}',sans-serif;font-size:14px;color:var(--gold-deep);margin-bottom:24px;font-weight:600}
  .form-divider{height:2px;background:linear-gradient(90deg,transparent,var(--gold-deep),transparent);margin:48px 0 24px}
  .field{margin-bottom:24px}
  .field label{display:block;font-family:'${t.fonts.heading}',sans-serif;font-size:9px;font-weight:700;letter-spacing:.45em;text-transform:uppercase;color:var(--bronze);margin-bottom:10px}
  .field label .req{color:var(--gold-deep);margin-left:6px}
  .field input[type=text],.field textarea{width:100%;background:transparent;border:none;border-bottom:2px solid rgba(37,99,235,.25);padding:10px 0;font-family:'${t.fonts.body}',sans-serif;font-size:17px;color:var(--ink);outline:none;transition:border-color .2s;font-weight:500}
  .field input[type=text]:focus,.field textarea:focus{border-bottom-color:var(--gold-deep)}
  .field textarea{resize:vertical;min-height:80px;border:1px solid rgba(37,99,235,.2);padding:14px}
  .field-row{display:grid;grid-template-columns:1fr 1fr;gap:24px}
  .pres-group{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .pres-group label{padding:18px 14px;border:2px solid rgba(37,99,235,.18);text-align:center;cursor:pointer;font-family:'${t.fonts.heading}',sans-serif;font-size:9px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:10px;color:var(--ink-soft);margin-bottom:0}
  .pres-group label:hover{border-color:var(--gold-deep);color:var(--ink)}
  .pres-group input{display:none}
  .pres-group label:has(input:checked){background:var(--ink);color:#fff;border-color:var(--ink)}
  .pres-group .check{width:14px;height:14px;border-radius:50%;border:2px solid currentColor;display:inline-block;position:relative;flex-shrink:0}
  .pres-group label:has(input:checked) .check::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:6px;height:6px;border-radius:50%;background:currentColor}
  .stepper{display:flex;align-items:center;border:2px solid rgba(37,99,235,.2);max-width:170px}
  .stepper button{width:42px;height:42px;background:transparent;border:none;font-family:'${t.fonts.heading}',sans-serif;font-size:20px;font-weight:700;color:var(--ink);cursor:pointer;transition:background .2s}
  .stepper button:hover{background:rgba(37,99,235,.07)}
  .stepper input{flex:1;text-align:center;background:transparent;border:none;font-family:'${t.fonts.heading}',sans-serif;font-size:22px;font-weight:800;color:var(--ink);outline:none}
  .submit-btn{width:100%;padding:20px;background:var(--ink);color:#fff;border:none;font-family:'${t.fonts.heading}',sans-serif;font-weight:700;letter-spacing:.5em;font-size:10px;text-transform:uppercase;cursor:pointer;margin-top:36px;transition:background .25s;display:inline-flex;justify-content:center;align-items:center;gap:14px}
  .submit-btn:hover{background:var(--gold-deep)}
  .rsvp-success{display:none;text-align:center;padding:40px 0}
  .rsvp-success h3{font-family:'${t.fonts.heading}',sans-serif;font-size:32px;font-weight:800;color:var(--gold-deep);margin-bottom:14px;text-transform:uppercase}
  .rsvp-success p{font-family:'${t.fonts.body}',sans-serif;font-size:18px;color:var(--ink-soft);font-weight:400}
  .show .rsvp-fields{display:none}
  .show .rsvp-success{display:block}

  footer{padding:80px 24px 56px;text-align:center}
  .footer-logo{width:140px;margin:0 auto 18px}
  .footer-name{font-family:'${t.fonts.heading}',sans-serif;font-size:18px;font-weight:800;letter-spacing:.08em;color:var(--ink);margin-bottom:8px;text-transform:uppercase}
  .footer-date{font-family:'${t.fonts.body}',sans-serif;color:var(--ink-soft);font-size:15px;margin-bottom:24px;font-weight:500}
  .footer-rule{width:40px;height:2px;background:var(--gold-deep);margin:18px auto}
  .footer-credit{font-family:'${t.fonts.heading}',sans-serif;font-size:8px;font-weight:700;letter-spacing:.65em;text-transform:uppercase;color:var(--bronze)}

  .fade-in{opacity:0;transform:translateY(30px);transition:opacity 1.1s ease,transform 1.1s ease}
  .fade-in.in{opacity:1;transform:translateY(0)}

  @media(max-width:760px){
    section{padding:80px 18px}
    .parchment{padding:80px 16px}
    .parchment-card{padding:54px 28px 48px}
    .field-row{grid-template-columns:1fr}
    .pres-group{grid-template-columns:1fr}
    .stepper{max-width:none}
    .info-card{padding:40px 24px}
    .rsvp-form{padding:40px 22px}
  }
</style>
</head>
<body>

<div class="bg-gradient"></div>
${id.bsd ? '<div class="bsd">בס"ד</div>' : ''}

<button class="nav-arrow prev" id="navPrev" aria-label="Précédent">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 5l-7 7 7 7"/></svg>
</button>
<button class="nav-arrow next" id="navNext" aria-label="Suivant">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 5l7 7-7 7"/></svg>
</button>
<div class="pager" id="pager"></div>

<div class="deck" id="deck">

<!-- HERO -->
<section class="hero">
  <div class="hero-inner">
    <div class="hero-eyebrow">${s.hero.eyebrow||id.eventType}</div>
    ${id.logo ? `<img class="hero-logo" src="${id.logo}" alt="">` : ''}
    <h1 class="hero-title">${id.firstName}</h1>
    <div class="hero-name">${id.lastName}</div>
    ${s.hero.showCountdown ? `
    <div class="countdown-line" id="cd">
      <div class="cd-unit"><div class="cd-num" id="cdD">000</div></div>
      <div class="cd-sep">:</div>
      <div class="cd-unit"><div class="cd-num" id="cdH">00</div></div>
      <div class="cd-sep">:</div>
      <div class="cd-unit"><div class="cd-num" id="cdM">00</div></div>
      <div class="cd-sep">:</div>
      <div class="cd-unit"><div class="cd-num" id="cdS">00</div></div>
    </div>
    <div class="cd-labels">
      <span>Jours</span><span class="gap"></span>
      <span>Heures</span><span class="gap"></span>
      <span>Minutes</span><span class="gap"></span>
      <span>Secondes</span>
    </div>` : ''}
    <button type="button" class="btn-primary" onclick="deck.next()">
      <span>${s.hero.ctaText}</span><span>→</span>
    </button>
  </div>
</section>

${sectionsMilieuHTML}

<!-- FOOTER -->
<footer>
  <div class="footer-inner">
    ${id.logo ? `<img class="footer-logo" src="${id.logo}" alt="">` : ''}
    <div class="footer-name">${id.firstName} ${id.lastName}</div>
    <div class="footer-date">${(s.fairepart?.events||[]).find(e=>e.label==='Date')?.value||''}</div>
    <div class="footer-rule"></div>
    <div class="footer-credit">${s.footer?.credit||''}</div>
    <div class="footer-rule"></div>
    <div style="font-family:'${t.fonts.body}',serif;font-style:italic;font-size:14px;color:var(--ink-soft);margin-bottom:6px">Création &amp; développement</div>
    <a href="${s.footer?.createdByUrl||'#'}" target="_blank" style="font-family:'${t.fonts.heading}',serif;font-size:13px;letter-spacing:.35em;text-transform:uppercase;color:var(--gold-deep);text-decoration:none">${s.footer?.createdBy||'Dovan Guez'}</a>
  </div>
</footer>

</div>

<script>
const SITE_ID = '${siteId}';
const PAGE_TRACK = ${JSON.stringify(pageTrackMap)};
const MUSIC_TRACKS = ${JSON.stringify(musicTracks.map(m=>({url:m.url,startAt:m.startAt||0,loopFrom:m.loopFrom||0})))};

// Audio
const audios = MUSIC_TRACKS.map(m => {
  const a = new Audio(m.url); a.volume = 0; return a;
});
if (audios[0]) { audios[0].loop = false; audios[0].currentTime = MUSIC_TRACKS[0]?.startAt||0; }
const loopHandlers = MUSIC_TRACKS.map((m,i) => () => {
  if(currentTrack===i){ audios[i].currentTime=m.loopFrom||0; audios[i].play().catch(()=>{}); }
});
audios.forEach((a,i) => a.addEventListener('ended', loopHandlers[i]));
if (audios[1]) audios[1].currentTime = MUSIC_TRACKS[1]?.startAt||0;
if (audios[2]) audios[2].currentTime = MUSIC_TRACKS[2]?.startAt||0;

let currentTrack=-1, audioReady=false;
const FADE_MS=1000, TARGET_VOL=0.75;
let fadeTimers=audios.map(()=>null);
function clearFade(i){if(fadeTimers[i]){clearInterval(fadeTimers[i]);fadeTimers[i]=null;}}
function fadeTo(i,vol,cb){clearFade(i);const a=audios[i];if(!a)return;const start=a.volume,diff=vol-start,STEPS=40,dt=FADE_MS/STEPS;let step=0;fadeTimers[i]=setInterval(()=>{step++;a.volume=Math.min(1,Math.max(0,start+diff*(step/STEPS)));if(step>=STEPS){clearFade(i);a.volume=vol;if(cb)cb();}},dt);}
function switchTrack(n){if(!audioReady||n===currentTrack)return;if(currentTrack>=0){const old=currentTrack;fadeTo(old,0,()=>{audios[old]?.pause();});}if(audios[n]){if(audios[n].paused)audios[n].play().catch(()=>{});fadeTo(n,TARGET_VOL);}currentTrack=n;}
function startAudio(){if(audioReady)return;audioReady=true;document.removeEventListener('click',startAudio);document.removeEventListener('touchend',startAudio);const ti=PAGE_TRACK[idx]??0;if(audios[ti]){currentTrack=-1;audios[ti].play().then(()=>{fadeTo(ti,TARGET_VOL);currentTrack=ti;}).catch(()=>{});}}
document.addEventListener('click',startAudio,{once:true});
document.addEventListener('touchend',startAudio,{once:true});

// Countdown
${s.hero.showCountdown ? `
const target=new Date('${targetISO}').getTime();
function tick(){let diff=Math.max(0,target-Date.now());const d=Math.floor(diff/86400000);diff-=d*86400000;const h=Math.floor(diff/3600000);diff-=h*3600000;const m=Math.floor(diff/60000);diff-=m*60000;const s=Math.floor(diff/1000);document.getElementById('cdD').textContent=String(d).padStart(3,'0');document.getElementById('cdH').textContent=String(h).padStart(2,'0');document.getElementById('cdM').textContent=String(m).padStart(2,'0');document.getElementById('cdS').textContent=String(s).padStart(2,'0');}
tick();setInterval(tick,1000);` : ''}

// Deck navigation
const deckEl=document.getElementById('deck');
const pages=[...deckEl.children];
const prevBtn=document.getElementById('navPrev');
const nextBtn=document.getElementById('navNext');
const pager=document.getElementById('pager');
let idx=0;
pages.forEach((_,i)=>{const d=document.createElement('button');d.className='dot';d.setAttribute('aria-label','Page '+(i+1));d.addEventListener('click',()=>go(i));pager.appendChild(d);});
const dots=[...pager.children];
function go(n){idx=Math.max(0,Math.min(pages.length-1,n));deckEl.style.transform='translateX('+(-idx*100)+'vw)';const page=pages[idx];page.scrollTop=0;page.querySelectorAll('.fade-in').forEach(el=>el.classList.add('in'));dots.forEach((d,i)=>d.classList.toggle('active',i===idx));prevBtn.disabled=idx===0;nextBtn.disabled=idx===pages.length-1||idx===0;const dark=page.dataset.theme==='dark';prevBtn.classList.toggle('on-dark',dark);nextBtn.classList.toggle('on-dark',dark);pager.classList.toggle('on-dark',dark);switchTrack(PAGE_TRACK[idx]??0);}
const deck={next:()=>go(idx+1),prev:()=>go(idx-1),go};window.deck=deck;
prevBtn.addEventListener('click',()=>deck.prev());
nextBtn.addEventListener('click',()=>deck.next());
document.addEventListener('keydown',e=>{const t=e.target.tagName;if(t==='INPUT'||t==='TEXTAREA'||e.target.isContentEditable)return;if(e.key==='ArrowRight'||e.key==='PageDown'){e.preventDefault();deck.next();}else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();deck.prev();}});
let sx=0,sy=0;
deckEl.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});
deckEl.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx;const dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.4){dx<0?deck.next():deck.prev();}},{passive:true});
if(window.location.hash==='#rsvp'){go(${activePages.indexOf('rsvp')});history.replaceState(null,'',window.location.pathname);}else{go(0);}

// Steppers
document.querySelectorAll('[data-stepper]').forEach(st=>{const input=st.querySelector('input');st.querySelectorAll('button').forEach(b=>{b.addEventListener('click',()=>{const step=parseInt(b.dataset.step,10);let v=Math.max(parseInt(input.min||'0'),Math.min(parseInt(input.max||'99'),parseInt(input.value||'0')+step));input.value=v;});});});

// RSVP
function submitRsvp(e){
  e.preventDefault();
  const form=document.getElementById('rsvpForm');
  const btn=form.querySelector('.submit-btn');
  const body={nom:document.getElementById('rNom').value.trim(),prenom:document.getElementById('rPrenom').value.trim(),message:document.getElementById('rMsg').value.trim(),site_id:'${siteId}'};
  ${(s.rsvp?.events||[]).map(ev=>`body['pres_${ev.id}']=(form.querySelector('input[name=pres-${ev.id}]:checked')||{}).value||'non';body['adults_${ev.id}']=form.querySelector('input[name=adults-${ev.id}]')?.value||0;body['children_${ev.id}']=form.querySelector('input[name=children-${ev.id}]')?.value||0;`).join('\n  ')}
  btn.disabled=true;btn.querySelector('span').textContent='Envoi en cours…';
  fetch('/api/rsvp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  .then(r=>r.json()).then(res=>{if(res.success){form.classList.add('show');form.closest('section')?.scrollTo({top:0,behavior:'smooth'});}else{btn.disabled=false;btn.querySelector('span').textContent='Envoyer ma réponse';alert('Erreur : '+(res.error||'réessayez'));}})
  .catch(()=>{btn.disabled=false;btn.querySelector('span').textContent='Envoyer ma réponse';alert('Erreur réseau.');});
  return false;
}
</script>
</body>
</html>`;
};
