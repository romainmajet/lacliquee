function genererToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const code = params.code;
  const body = await request.json().catch(() => null);

  if (!body || !body.personnage_id || !body.prenom || !body.taille) {
    return new Response(JSON.stringify({ error: 'Champs manquants' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const bande = await env.DB.prepare('SELECT id, statut_commande FROM bandes WHERE code = ?')
    .bind(code).first();

  if (!bande) {
    return new Response(JSON.stringify({ error: 'Bande introuvable' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  if (bande.statut_commande === 'confirmee') {
    return new Response(JSON.stringify({ error: 'La commande a déjà été passée pour cette bande, contacte le créateur si tu veux ajouter un costume.' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const dejaPris = await env.DB.prepare(
    'SELECT id FROM membres_bande WHERE bande_id = ? AND personnage_id = ? AND statut = ?'
  ).bind(bande.id, body.personnage_id, 'valide').first();

  if (dejaPris) {
    return new Response(JSON.stringify({ error: 'Ce personnage est déjà pris' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const token = genererToken();

  const inserted = await env.DB.prepare(
    'INSERT INTO membres_bande (bande_id, personnage_id, prenom, taille, quantite, statut, token) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
  ).bind(bande.id, body.personnage_id, body.prenom, body.taille, body.quantite || 1, 'valide', token).first();

  return new Response(JSON.stringify({ success: true, membre_id: inserted.id, token }), {
    status: 201,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
