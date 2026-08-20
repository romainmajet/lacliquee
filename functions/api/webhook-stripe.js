import { envoyerEmailConfirmation } from '../_lib/email.js';

// --- Vérifie que la notification vient bien de Stripe (et pas d'un imposteur) ---
async function verifierSignatureStripe(payload, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map(p => {
      const idx = p.indexOf('=');
      return [p.slice(0, idx), p.slice(idx + 1)];
    })
  );
  const timestamp = parts.t;
  const signatureAttendue = parts.v1;
  if (!timestamp || !signatureAttendue) return false;

  // Rejette les notifications trop anciennes (plus de 5 minutes) : protection anti-rejeu
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;

  const signedPayload = timestamp + '.' + payload;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const signatureCalculee = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  if (signatureCalculee.length !== signatureAttendue.length) return false;
  let diff = 0;
  for (let i = 0; i < signatureCalculee.length; i++) {
    diff |= signatureCalculee.charCodeAt(i) ^ signatureAttendue.charCodeAt(i);
  }
  return diff === 0;
}

async function gererPaiementConfirme(env, session) {
  const commandeId = session.metadata && session.metadata.commande_id;
  if (!commandeId) return;

  const commande = await env.DB.prepare(
    'SELECT id, statut, email, nom, reference, total FROM commandes WHERE id = ?'
  ).bind(commandeId).first();

  // Idempotence : si déjà marquée payée (Stripe peut renvoyer la même notification plusieurs fois), on ne refait rien
  if (!commande || commande.statut === 'payee') return;

  await env.DB.prepare(
    'UPDATE commandes SET statut = ? WHERE id = ?'
  ).bind('payee', commandeId).run();

  const lignes = await env.DB.prepare(
    'SELECT nom_produit, prix_unitaire, taille, quantite, sous_total FROM lignes_commande WHERE commande_id = ?'
  ).bind(commandeId).all();

  const resultatEmail = await envoyerEmailConfirmation(env, {
    to: commande.email,
    prenom: commande.nom,
    reference: commande.reference,
    total: commande.total,
    lignes: lignes.results || []
  });
  if (!resultatEmail.envoye) {
    console.error('[webhook-stripe] Email de confirmation non envoyé:', resultatEmail.raison);
  }
}

async function gererPaiementExpire(env, session) {
  const commandeId = session.metadata && session.metadata.commande_id;
  const bandeId = session.metadata && session.metadata.bande_id;
  if (!commandeId) return;

  const commande = await env.DB.prepare(
    'SELECT id, statut FROM commandes WHERE id = ?'
  ).bind(commandeId).first();

  // Idempotence : n'annule/ne restocke qu'une seule fois
  if (!commande || commande.statut !== 'en_attente_paiement') return;

  const lignes = await env.DB.prepare(
    'SELECT produit_id, taille, quantite FROM lignes_commande WHERE commande_id = ?'
  ).bind(commandeId).all();

  const statements = [
    env.DB.prepare('UPDATE commandes SET statut = ? WHERE id = ?').bind('expiree', commandeId)
  ];
  for (const l of (lignes.results || [])) {
    if (!l.produit_id) continue; // lignes de commande de bande : rien à restocker
    statements.push(
      env.DB.prepare(
        'UPDATE stocks SET quantite = quantite + ? WHERE produit_id = ? AND taille = ?'
      ).bind(l.quantite, l.produit_id, l.taille || '')
    );
  }
  // Le paiement d'une bande a expiré sans être réglé : on la déverrouille pour que
  // le créateur puisse relancer le paiement au lieu de rester bloqué pour toujours.
  if (bandeId) {
    statements.push(
      env.DB.prepare(
        "UPDATE bandes SET statut_commande = NULL, commande_id = NULL WHERE id = ? AND statut_commande = 'confirmee'"
      ).bind(bandeId)
    );
  }
  await env.DB.batch(statements);
}

export async function onRequestPost(context) {
  const { env, request } = context;

  const rawBody = await request.text();
  const signatureHeader = request.headers.get('Stripe-Signature');

  let signatureValide = false;
  try {
    signatureValide = await verifierSignatureStripe(rawBody, signatureHeader, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook-stripe] Erreur pendant la vérification de signature:', err.message, err.stack);
    return new Response('Erreur de vérification', { status: 500 });
  }

  if (!signatureValide) {
    return new Response('Signature invalide', { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return new Response('JSON invalide', { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await gererPaiementConfirme(env, event.data.object);
    }
    if (event.type === 'checkout.session.expired') {
      await gererPaiementExpire(env, event.data.object);
    }
  } catch (err) {
    // On journalise l'erreur complète (visible dans Cloudflare > Observability > Logs)
    // au lieu de laisser planter silencieusement — et on répond 500 pour que Stripe réessaie plus tard.
    console.error('[webhook-stripe] Erreur pendant le traitement de', event.type, ':', err.message, err.stack);
    return new Response('Erreur interne : ' + err.message, { status: 500 });
  }

  return new Response('ok', { status: 200 });
}
