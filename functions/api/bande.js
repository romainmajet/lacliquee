function genererCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);

  if (!body || !body.theme_id) {
    return new Response(JSON.stringify({ error: 'theme_id manquant' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const theme = await env.DB.prepare('SELECT id FROM themes WHERE id = ?')
    .bind(body.theme_id).first();

  if (!theme) {
    return new Response(JSON.stringify({ error: 'Thème introuvable' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let code;
  let unique = false;
  while (!unique) {
    code = genererCode();
    const existing = await env.DB.prepare('SELECT id FROM bandes WHERE code = ?')
      .bind(code).first();
    if (!existing) unique = true;
  }

  await env.DB.prepare(
    'INSERT INTO bandes (code, theme_id) VALUES (?, ?)'
  ).bind(code, body.theme_id).run();

  return new Response(JSON.stringify({ code }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
}
