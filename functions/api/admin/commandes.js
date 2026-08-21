function verifierSecret(request, env) {
  const secret = request.headers.get('X-Admin-Secret');
  return secret && env.ADMIN_SECRET && secret === env.ADMIN_SECRET;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!verifierSecret(request, env)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const result = await env.DB.prepare(
    `SELECT reference, email, nom, total, date_creation, statut_livraison
     FROM commandes
     WHERE statut = 'payee' AND type = 'panier'
     ORDER BY date_creation DESC
     LIMIT 100`
  ).all();

  return new Response(JSON.stringify({ commandes: result.results || [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!verifierSecret(request, env)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Requête invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const reference = String(body.reference || '').trim();
  const statut = String(body.statut_livraison || '').trim();
  const valeursAutorisees = ['preparation', 'expediee', 'livree'];

  if (!reference || !valeursAutorisees.includes(statut)) {
    return new Response(JSON.stringify({ error: 'Référence ou statut invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  await env.DB.prepare(
    'UPDATE commandes SET statut_livraison = ? WHERE reference = ? AND statut = \'payee\''
  ).bind(statut, reference).run();

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
