const EXPEDITEUR = 'La Clique <commandes@lacliquee.com>';

function genererHtmlEmail({ prenom, reference, total, lignes }) {
  const lignesHtml = lignes.map(l =>
    `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #333;color:#e8e0d5;">${l.nom_produit || l.nom}${l.taille ? ' (taille ' + l.taille + ')' : ''} × ${l.quantite}</td>
      <td style="padding:8px 0;border-bottom:1px solid #333;color:#e8e0d5;text-align:right;">${(l.sous_total || l.sousTotal).toFixed(2)} €</td>
    </tr>`
  ).join('');

  return `
  <div style="background:#0f0c0a;padding:32px 16px;font-family:Georgia,serif;">
    <div style="max-width:480px;margin:0 auto;background:#17130f;border:1px solid #333;border-radius:12px;padding:28px;">
      <h1 style="color:#e8e0d5;font-size:22px;margin:0 0 4px;">Merci, ${prenom} !</h1>
      <p style="color:#a89b8c;font-size:14px;margin:0 0 20px;">Ta commande a bien été enregistrée.</p>
      <p style="color:#c9a86a;font-size:13px;margin:0 0 20px;">Référence : <strong>${reference}</strong></p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${lignesHtml}
      </table>
      <p style="color:#e8e0d5;font-size:16px;font-weight:bold;text-align:right;margin:0 0 24px;">Total : ${total.toFixed(2)} €</p>
      <p style="color:#a89b8c;font-size:12px;">La Clique — Déguisements Halloween pensés pour deux ou pour toute la bande.</p>
    </div>
  </div>`;
}

export async function envoyerEmailConfirmation(env, { to, prenom, reference, total, lignes }) {
  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY manquante — email non envoyé');
    return { envoye: false, raison: 'clé API manquante' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: EXPEDITEUR,
        to: [to],
        subject: 'Confirmation de ta commande ' + reference,
        html: genererHtmlEmail({ prenom, reference, total, lignes })
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('Échec envoi email Resend:', res.status, errText);
      return { envoye: false, raison: 'erreur API Resend' };
    }

    return { envoye: true };
  } catch (err) {
    console.error('Erreur envoi email:', err);
    return { envoye: false, raison: 'erreur réseau' };
  }
}
