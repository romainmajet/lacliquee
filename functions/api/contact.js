import { envoyerEmailContact } from '../_lib/email.js';

export async function onRequestPost({ request, env }) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let name, email, message, botField;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(await request.text());
      name = params.get('name');
      email = params.get('email');
      message = params.get('message');
      botField = params.get('bot-field');
    } else {
      const body = await request.json();
      name = body.name;
      email = body.email;
      message = body.message;
      botField = body['bot-field'];
    }

    // Honeypot anti-spam : si ce champ caché est rempli, c'est un bot
    if (botField) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: 'Champs manquants' }), { status: 400 });
    }

    const result = await envoyerEmailContact(env, { name, email, message });

    if (!result.envoye) {
      return new Response(JSON.stringify({ error: 'Échec envoi' }), { status: 502 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
}
