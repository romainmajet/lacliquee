export async function onRequestPost(context) {
  const { env, params, request } = context;
  const code = params.code;
  const body = await request.json().catch(() => null);

  if (!body || !body.personnage_id || !body.prenom || !body.taille) {
    return new Response(JSON.stringify({ error: 'Champs manquants' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const bande = await env.DB.prepare('SELECT id FROM bandes WHERE code = ?')
    .bind(code).first();

  if (!bande) {
    return new Response(JSON.stringify({ error: 'Bande introuvable' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const dejaPris = await env.DB.prepare(
    'SELECT id FROM membres_bande WHERE bande_id = ? AND personnage_id = ? AND statut = ?'
  ).bind(bande.id, body.personnage_id, 'valide').first();

  if (dejaPris) {
    return new Response(JSON.stringify({ error: 'Ce personnage est déjà pris' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await env.DB.prepare(
    'INSERT INTO membres_bande (bande_id, personnage_id, prenom, taille, quantite, statut) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(bande.id, body.personnage_id, body.prenom, body.taille, body.quantite || 1, 'valide').run();

  return new Response(JSON.stringify({ success: true }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
}
