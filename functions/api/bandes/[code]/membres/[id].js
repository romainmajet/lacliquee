async function verifierAccesEtBande(env, code, membreId, token) {
  const bande = await env.DB.prepare('SELECT id, statut_commande FROM bandes WHERE code = ?')
    .bind(code).first();
  if (!bande) return { erreur: 'Bande introuvable', statut: 404 };

  if (bande.statut_commande === 'confirmee') {
    return { erreur: 'La commande a déjà été passée, impossible de modifier ta participation. Contacte le créateur.', statut: 409 };
  }

  const membre = await env.DB.prepare(
    'SELECT id, bande_id, personnage_id, token FROM membres_bande WHERE id = ? AND bande_id = ?'
  ).bind(membreId, bande.id).first();

  if (!membre) return { erreur: 'Participation introuvable', statut: 404 };
  if (!token || membre.token !== token) return { erreur: "Tu n'es pas autorisé à modifier cette participation", statut: 403 };

  return { bande, membre };
}

export async function onRequestPatch(context) {
  const { env, params, request } = context;
  const code = params.code;
  const membreId = params.id;
  const body = await request.json().catch(() => null);

  if (!body || !body.token) {
    return new Response(JSON.stringify({ error: 'Jeton manquant' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const check = await verifierAccesEtBande(env, code, membreId, body.token);
  if (check.erreur) {
    return new Response(JSON.stringify({ error: check.erreur }), {
      status: check.statut,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const nouvellePersonnage = body.personnage_id || check.membre.personnage_id;
  const nouvelleTaille = body.taille || null;

  if (!nouvelleTaille) {
    return new Response(JSON.stringify({ error: 'Taille manquante' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  if (nouvellePersonnage !== check.membre.personnage_id) {
    const dejaPris = await env.DB.prepare(
      'SELECT id FROM membres_bande WHERE bande_id = ? AND personnage_id = ? AND statut = ? AND id != ?'
    ).bind(check.bande.id, nouvellePersonnage, 'valide', membreId).first();
    if (dejaPris) {
      return new Response(JSON.stringify({ error: 'Ce personnage est déjà pris' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }

  await env.DB.prepare(
    'UPDATE membres_bande SET personnage_id = ?, taille = ?, date_maj = ? WHERE id = ?'
  ).bind(nouvellePersonnage, nouvelleTaille, new Date().toISOString(), membreId).run();

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestDelete(context) {
  const { env, params, request } = context;
  const code = params.code;
  const membreId = params.id;
  const body = await request.json().catch(() => null);

  if (!body || !body.token) {
    return new Response(JSON.stringify({ error: 'Jeton manquant' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const check = await verifierAccesEtBande(env, code, membreId, body.token);
  if (check.erreur) {
    return new Response(JSON.stringify({ error: check.erreur }), {
      status: check.statut,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  await env.DB.prepare('DELETE FROM membres_bande WHERE id = ?').bind(membreId).run();

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
