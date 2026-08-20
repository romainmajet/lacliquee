export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Requête invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!emailValide) {
    return new Response(JSON.stringify({ error: 'Adresse e-mail invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  try {
    await env.DB.prepare(
      'INSERT INTO newsletter (email, date_creation) VALUES (?, ?)'
    ).bind(email, new Date().toISOString()).run();
  } catch (err) {
    // déjà inscrit (email en double) : on répond quand même succès, pas la peine d'inquiéter la personne
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
