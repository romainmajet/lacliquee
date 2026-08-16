function genererReference() {
  return 'LC-' + Math.floor(100000 + Math.random() * 899999);
}

function calculerFraisLivraison(totalProduits) {
  return totalProduits >= 60 ? 0 : 4.90;
}

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const code = params.code;

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

  if (!nom || !email || !adresse || !ville || !codePostal) {
    return new Response(JSON.stringify({ error: 'Coordonnées incomplètes' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const bande = await env.DB.prepare(
    `SELECT b.id, b.statut_commande, t.nom as theme_nom, t.prix_unitaire
     FROM bandes b JOIN themes t ON t.id = b.theme_id
     WHERE b.code = ?`
  ).bind(code).first();

  if (!bande) {
    return new Response(JSON.stringify({ error: 'Bande introuvable' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  if (bande.statut_commande === 'confirmee') {
    return new Response(JSON.stringify({ error: 'Commande déjà passée' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const membresValides = await env.DB.prepare(
    `SELECT mb.prenom, mb.taille, mb.quantite, p.nom as personnage_nom
     FROM membres_bande mb JOIN personnages p ON p.id = mb.personnage_id
     WHERE mb.bande_id = ? AND mb.statut = 'valide'`
  ).bind(bande.id).all();

  const membres = membresValides.results || [];
  if (membres.length === 0) {
    return new Response(JSON.stringify({ error: 'Personne n\'a encore validé de personnage dans cette bande' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  let totalProduits = 0;
  const lignes = membres.map(m => {
    const qte = m.quantite || 1;
    const sousTotal = Math.round(bande.prix_unitaire * qte * 100) / 100;
    totalProduits += sousTotal;
    return {
      nom_produit: bande.theme_nom + ' — ' + m.personnage_nom + ' (' + m.prenom + ')',
      prix_unitaire: bande.prix_unitaire,
      taille: m.taille,
      quantite: qte,
      sous_total: sousTotal
    };
  });
  totalProduits = Math.round(totalProduits * 100) / 100;
  const fraisLivraison = calculerFraisLivraison(totalProduits);
  const total = Math.round((totalProduits + fraisLivraison) * 100) / 100;

  let reference = genererReference();
  let commandeId;
  try {
    const inserted = await env.DB.prepare(
      `INSERT INTO commandes (reference, type, bande_id, email, nom, adresse, ville, code_postal, total, frais_livraison, statut, date_creation)
       VALUES (?, 'bande', ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente_paiement', ?)
       RETURNING id`
    ).bind(reference, bande.id, email, nom, adresse, ville, codePostal, total, fraisLivraison, new Date().toISOString()).first();
    commandeId = inserted.id;
  } catch (err) {
    reference = genererReference();
    const inserted = await env.DB.prepare(
      `INSERT INTO commandes (reference, type, bande_id, email, nom, adresse, ville, code_postal, total, frais_livraison, statut, date_creation)
       VALUES (?, 'bande', ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente_paiement', ?)
       RETURNING id`
    ).bind(reference, bande.id, email, nom, adresse, ville, codePostal, total, fraisLivraison, new Date().toISOString()).first();
    commandeId = inserted.id;
  }

  const statements = lignes.map(l =>
    env.DB.prepare(
      `INSERT INTO lignes_commande (commande_id, produit_id, nom_produit, prix_unitaire, taille, quantite, sous_total)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`
    ).bind(commandeId, l.nom_produit, l.prix_unitaire, l.taille, l.quantite, l.sous_total)
  );
  await env.DB.batch(statements);

  // La bande est verrouillée dès maintenant (empêche modifications et double-commande),
  // même si le paiement n'est pas encore confirmé — comme avant.
  await env.DB.prepare(
    'UPDATE bandes SET statut_commande = ?, date_confirmation = ?, commande_id = ? WHERE id = ?'
  ).bind('confirmee', new Date().toISOString(), commandeId, bande.id).run();

  // --- Création de la session de paiement Stripe ---
  const origin = new URL(request.url).origin;
  const params2 = new URLSearchParams();
  params2.append('mode', 'payment');
  params2.append('customer_email', email);
  params2.append('client_reference_id', reference);
  params2.append('success_url', origin + '/?commande=succes&ref=' + encodeURIComponent(reference) + '#/bande/' + encodeURIComponent(code));
  params2.append('cancel_url', origin + '/?commande=annulee#/bande/' + encodeURIComponent(code));
  params2.append('metadata[commande_id]', String(commandeId));
  params2.append('metadata[reference]', reference);
  params2.append('metadata[bande_id]', String(bande.id));

  lignes.forEach((l, i) => {
    params2.append(`line_items[${i}][price_data][currency]`, 'eur');
    params2.append(`line_items[${i}][price_data][product_data][name]`, l.nom_produit + (l.taille ? ' (taille ' + l.taille + ')' : ''));
    params2.append(`line_items[${i}][price_data][unit_amount]`, String(Math.round(l.prix_unitaire * 100)));
    params2.append(`line_items[${i}][quantity]`, String(l.quantite));
  });

  if (fraisLivraison > 0) {
    const i = lignes.length;
    params2.append(`line_items[${i}][price_data][currency]`, 'eur');
    params2.append(`line_items[${i}][price_data][product_data][name]`, 'Livraison');
    params2.append(`line_items[${i}][price_data][unit_amount]`, String(Math.round(fraisLivraison * 100)));
    params2.append(`line_items[${i}][quantity]`, '1');
  }

  let stripeRes, stripeData;
  try {
    stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params2.toString()
    });
    stripeData = await stripeRes.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Impossible de contacter le service de paiement' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  if (!stripeRes.ok || !stripeData.url) {
    console.error('Erreur Stripe:', stripeData.error || stripeData);
    return new Response(JSON.stringify({ error: 'Impossible de créer le paiement' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  await env.DB.prepare(
    'UPDATE commandes SET stripe_session_id = ? WHERE id = ?'
  ).bind(stripeData.id, commandeId).run();

  return new Response(JSON.stringify({
    success: true,
    reference,
    total,
    url: stripeData.url
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
