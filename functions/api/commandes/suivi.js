export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const reference = String(url.searchParams.get('ref') || '').trim().slice(0, 50);
  const email = String(url.searchParams.get('email') || '').trim().toLowerCase().slice(0, 200);

  if (!reference || !email) {
    return new Response(JSON.stringify({ error: 'Référence et e-mail requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const commande = await env.DB.prepare(
    'SELECT reference, statut, statut_livraison, total, date_creation FROM commandes WHERE reference = ? AND LOWER(email) = ?'
  ).bind(reference, email).first();

  if (!commande) {
    return new Response(JSON.stringify({ error: "Commande introuvable — vérifie la référence et l'e-mail." }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  return new Response(JSON.stringify(commande), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
