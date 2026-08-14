function calculerStatutLivraison(dateConfirmation) {
  if (!dateConfirmation) return null;
  const minutesEcoulees = (Date.now() - new Date(dateConfirmation).getTime()) / 60000;
  if (minutesEcoulees < 2) return 'confirmee';
  if (minutesEcoulees < 4) return 'preparation';
  if (minutesEcoulees < 6) return 'expediee';
  return 'livree';
}

export async function onRequestGet(context) {
  const { env, params } = context;
  const code = params.code;

  const bande = await env.DB.prepare(
    `SELECT b.id, b.code, b.statut_commande, b.date_creation, b.date_confirmation,
            t.id as theme_id, t.nom as theme_nom, t.nb_personnes, t.prix_unitaire
     FROM bandes b JOIN themes t ON t.id = b.theme_id
     WHERE b.code = ?`
  ).bind(code).first();

  if (!bande) {
    return new Response(JSON.stringify({ error: 'Bande introuvable' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const personnages = await env.DB.prepare(
    'SELECT id, nom, ordre FROM personnages WHERE theme_id = ? ORDER BY ordre'
  ).bind(bande.theme_id).all();

  const membres = await env.DB.prepare(
    'SELECT id, personnage_id, prenom, taille, quantite, statut FROM membres_bande WHERE bande_id = ?'
  ).bind(bande.id).all();

  const statut_livraison = bande.statut_commande === 'confirmee'
    ? calculerStatutLivraison(bande.date_confirmation)
    : null;

  return new Response(JSON.stringify({
    ...bande,
    statut_livraison,
    personnages: personnages.results,
    membres: membres.results
  }), { headers: { 'Content-Type': 'application/json' } });
}
