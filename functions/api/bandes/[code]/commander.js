import { envoyerEmailConfirmation } from '../../../_lib/email.js';

function genererReference() {
  return 'LC-' + Math.floor(100000 + Math.random() * 899999);
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

  let total = 0;
  const lignes = membres.map(m => {
    const qte = m.quantite || 1;
    const sousTotal = Math.round(bande.prix_unitaire * qte * 100) / 100;
    total += sousTotal;
    return {
      nom_produit: bande.theme_nom + ' — ' + m.personnage_nom + ' (' + m.prenom + ')',
      prix_unitaire: bande.prix_unitaire,
      taille: m.taille,
      quantite: qte,
      sous_total: sousTotal
    };
  });
  total = Math.round(total * 100) / 100;

  let reference = genererReference();
  let commandeId;
  try {
    const inserted = await env.DB.prepare(
      `INSERT INTO commandes (reference, type, bande_id, email, nom, adresse, ville, code_postal, total, date_creation)
       VALUES (?, 'bande', ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    ).bind(reference, bande.id, email, nom, adresse, ville, codePostal, total, new Date().toISOString()).first();
    commandeId = inserted.id;
  } catch (err) {
    reference = genererReference();
    const inserted = await env.DB.prepare(
      `INSERT INTO commandes (reference, type, bande_id, email, nom, adresse, ville, code_postal, total, date_creation)
       VALUES (?, 'bande', ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    ).bind(reference, bande.id, email, nom, adresse, ville, codePostal, total, new Date().toISOString()).first();
    commandeId = inserted.id;
  }

  const statements = lignes.map(l =>
    env.DB.prepare(
      `INSERT INTO lignes_commande (commande_id, produit_id, nom_produit, prix_unitaire, taille, quantite, sous_total)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`
    ).bind(commandeId, l.nom_produit, l.prix_unitaire, l.taille, l.quantite, l.sous_total)
  );
  await env.DB.batch(statements);

  await env.DB.prepare(
    'UPDATE bandes SET statut_commande = ?, date_confirmation = ?, commande_id = ? WHERE id = ?'
  ).bind('confirmee', new Date().toISOString(), commandeId, bande.id).run();

  const resultatEmail = await envoyerEmailConfirmation(env, { to: email, prenom: nom, reference, total, lignes });
  if (!resultatEmail.envoye) {
    console.error('Email de confirmation non envoyé:', resultatEmail.raison);
  }

  return new Response(JSON.stringify({
    success: true,
    reference,
    total
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
