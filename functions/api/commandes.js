function genererReference() {
  return 'LC-' + Math.floor(100000 + Math.random() * 899999);
}

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

  const nom = String(body.nom || '').trim().slice(0, 200);
  const email = String(body.email || '').trim().slice(0, 200);
  const adresse = String(body.adresse || '').trim().slice(0, 300);
  const ville = String(body.ville || '').trim().slice(0, 100);
  const codePostal = String(body.codePostal || '').trim().slice(0, 20);
  const items = Array.isArray(body.items) ? body.items : [];

  if (!nom || !email || !adresse || !ville || !codePostal) {
    return new Response(JSON.stringify({ error: 'Coordonnées incomplètes' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  if (items.length === 0) {
    return new Response(JSON.stringify({ error: 'Panier vide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  // --- Revérification serveur des prix et du stock (jamais confiance au client) ---
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
          : 'Il ne reste que ' + stockDisponible + ' exemplaire(s) de ' + produit.nom
      });
      continue;
    }

    const sousTotal = Math.round(produit.prix * quantite * 100) / 100;
    total += sousTotal;

    lignes.push({
      produit_id: produit.id,
      nom_produit: produit.nom,
      prix_unitaire: produit.prix,
      taille: taille || null,
      quantite,
      sous_total: sousTotal
    });
  }

  if (erreurs.length > 0) {
    return new Response(JSON.stringify({ valide: false, erreurs }), {
      status: 409,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  total = Math.round(total * 100) / 100;

  // --- Enregistrement réel de la commande ---
  let reference = genererReference();
  let commandeId;
  try {
    const inserted = await env.DB.prepare(
      `INSERT INTO commandes (reference, type, email, nom, adresse, ville, code_postal, total, date_creation)
       VALUES (?, 'panier', ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    ).bind(reference, email, nom, adresse, ville, codePostal, total, new Date().toISOString()).first();
    commandeId = inserted.id;
  } catch (err) {
    // collision improbable sur la référence : on retente une fois
    reference = genererReference();
    const inserted = await env.DB.prepare(
      `INSERT INTO commandes (reference, type, email, nom, adresse, ville, code_postal, total, date_creation)
       VALUES (?, 'panier', ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    ).bind(reference, email, nom, adresse, ville, codePostal, total, new Date().toISOString()).first();
    commandeId = inserted.id;
  }

  const statements = [];
  for (const l of lignes) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO lignes_commande (commande_id, produit_id, nom_produit, prix_unitaire, taille, quantite, sous_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(commandeId, l.produit_id, l.nom_produit, l.prix_unitaire, l.taille, l.quantite, l.sous_total)
    );
    statements.push(
      env.DB.prepare(
        `UPDATE stocks SET quantite = quantite - ? WHERE produit_id = ? AND taille = ?`
      ).bind(l.quantite, l.produit_id, l.taille || '')
    );
  }
  await env.DB.batch(statements);

  return new Response(JSON.stringify({
    valide: true,
    reference,
    total,
    lignes
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
