export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Requête invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return new Response(JSON.stringify({ error: 'Panier vide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const lignes = [];
  const erreurs = [];
  let total = 0;

  for (const item of items) {
    const id = String(item.id || '').slice(0, 100);
    const taille = String(item.taille || '').slice(0, 20);
    const quantite = Math.max(1, Math.min(20, Math.floor(Number(item.quantite) || 1)));

    const produit = await env.DB.prepare(
      'SELECT id, nom, prix, actif FROM produits WHERE id = ?'
    ).bind(id).first();

    if (!produit || !produit.actif) {
      erreurs.push({ id, message: 'Produit indisponible' });
      continue;
    }

    const stockRow = await env.DB.prepare(
      'SELECT quantite FROM stocks WHERE produit_id = ? AND taille = ?'
    ).bind(id, taille || '').first();

    const stockDisponible = stockRow ? stockRow.quantite : 0;

    if (stockDisponible < quantite) {
      erreurs.push({
        id,
        message: stockDisponible === 0
          ? produit.nom + (taille ? ' (taille ' + taille + ')' : '') + ' n\'est plus en stock'
          : 'Il ne reste que ' + stockDisponible + ' exemplaire(s) de ' + produit.nom + (taille ? ' en taille ' + taille : '')
      });
      continue;
    }

    const sousTotal = Math.round(produit.prix * quantite * 100) / 100;
    total += sousTotal;

    lignes.push({
      id: produit.id,
      nom: produit.nom,
      prixUnitaire: produit.prix,
      taille: taille || null,
      quantite,
      sousTotal
    });
  }

  return new Response(JSON.stringify({
    valide: erreurs.length === 0,
    total: Math.round(total * 100) / 100,
    lignes,
    erreurs
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
