export async function onRequestGet(context) {
  const { env } = context;
  const themes = await env.DB.prepare(
    'SELECT id, slug, nom, nb_personnes, prix_unitaire, description FROM themes ORDER BY id'
  ).all();

  return new Response(JSON.stringify(themes.results), {
    headers: { 'Content-Type': 'application/json' }
  });
}
