import { PRODUITS_SEO } from '../_lib/produits-seo.js';

function fmtPrice(n) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export async function onRequestGet(context) {
  const { params, request } = context;
  const slug = String(params.slug || '');
  const origin = new URL(request.url).origin;
  const produit = PRODUITS_SEO[slug];

  if (!produit) {
    return new Response(page404(origin), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  const titre = produit.name + ' — La Clique';
  const desc = produit.description.length > 155 ? produit.description.slice(0, 152) + '…' : produit.description;
  const url = origin + '/produit/' + slug;
  const appUrl = origin + '/#/produit/' + slug;
  const imageUrl = produit.image ? origin + produit.image : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: produit.name,
    description: produit.description,
    category: produit.category,
    ...(imageUrl ? { image: imageUrl } : {}),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'EUR',
      price: produit.price,
      availability: 'https://schema.org/InStock',
      url: url
    }
  };

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(titre)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product">
<meta property="og:title" content="${escapeHtml(titre)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${url}">
${imageUrl ? `<meta property="og:image" content="${imageUrl}">` : ''}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23131110'/%3E%3Ctext x='32' y='44' font-family='Georgia,serif' font-size='36' font-weight='700' font-style='italic' fill='%23b6905c' text-anchor='middle'%3EC%3C/text%3E%3C/svg%3E">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;1,9..144,500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  :root{--bg:#131110;--bg-card:#211c19;--line:#332c27;--oxblood:#8a2332;--gold:#b6905c;--bone:#efe7da;--bone-dim:#a89c8c;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--bg);color:var(--bone);font-family:'Inter',sans-serif;line-height:1.6;}
  .wrap{max-width:720px;margin:0 auto;padding:48px 24px 80px;}
  a.logo{font-family:'Fraunces',serif;font-size:22px;font-weight:600;color:var(--bone);text-decoration:none;display:inline-block;margin-bottom:40px;}
  a.logo span{color:var(--oxblood);font-style:italic;}
  .cat{font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--gold);margin-bottom:10px;}
  h1{font-family:'Fraunces',serif;font-size:clamp(28px,5vw,40px);font-weight:500;margin-bottom:16px;}
  .price-row{display:flex;align-items:baseline;gap:12px;margin-bottom:28px;}
  .price{font-size:24px;font-weight:600;}
  .old-price{font-size:16px;color:var(--bone-dim);text-decoration:line-through;}
  img.product-photo{width:100%;border-radius:16px;margin-bottom:28px;display:block;border:1px solid var(--line);}
  p.desc{color:var(--bone-dim);font-size:16px;margin-bottom:36px;}
  a.cta{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(155deg,#b23349,#8a2332 70%);color:var(--bone);font-weight:600;font-size:15px;padding:15px 28px;border-radius:100px;text-decoration:none;}
  a.back{display:block;margin-top:32px;color:var(--bone-dim);font-size:13.5px;text-decoration:underline;}
</style>
</head>
<body>
  <div class="wrap">
    <a class="logo" href="${origin}/">La <span>Clique</span></a>
    <div class="cat">${escapeHtml(produit.category)}</div>
    <h1>${escapeHtml(produit.name)}</h1>
    <div class="price-row">
      <span class="price">${fmtPrice(produit.price)}</span>
      ${produit.oldPrice ? `<span class="old-price">${fmtPrice(produit.oldPrice)}</span>` : ''}
    </div>
    ${imageUrl ? `<img class="product-photo" src="${imageUrl}" alt="${escapeHtml(produit.name)}">` : ''}
    <p class="desc">${escapeHtml(produit.description)}</p>
    <a class="cta" href="${appUrl}">Voir la fiche complète et commander →</a>
    <a class="back" href="${origin}/">← Retour à la boutique</a>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function page404(origin) {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Produit introuvable — La Clique</title>
<meta name="robots" content="noindex">
<style>body{background:#131110;color:#efe7da;font-family:sans-serif;text-align:center;padding:100px 24px;}a{color:#b6905c;}</style>
</head><body><h1>Produit introuvable</h1><p><a href="${origin}/">Retour à la boutique</a></p></body></html>`;
}
