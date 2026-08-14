export async function onRequestPost(context) {
  const { env, params } = context;
  const code = params.code;

  const bande = await env.DB.prepare('SELECT id, statut_commande FROM bandes WHERE code = ?')
    .bind(code).first();

  if (!bande) {
    return new Response(JSON.stringify({ error: 'Bande introuvable' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (bande.statut_commande === 'confirmee') {
    return new Response(JSON.stringify({ error: 'Commande déjà passée' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await env.DB.prepare('UPDATE bandes SET statut_commande = ? WHERE id = ?')
    .bind('confirmee', bande.id).run();

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
