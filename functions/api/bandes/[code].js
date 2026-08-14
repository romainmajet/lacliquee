export async function onRequestGet(context) {
  const { env, params } = context;
  const code = params.code;

  const bande = await env.DB.prepare(
    `SELECT b.id, b.code, b.statut_commande, b.date_creation,
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

  return new Response(JSON.stringify({
    ...bande,
    personnages: personnages.results,
    membres: membres.results
  }), { headers: { 'Content-Type': 'application/json' } });
}
