import nodemailer from 'nodemailer';

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

const BRAND = { maroon: '#5A242C', cream: '#F7F4EC' };

/** Wraps body HTML in a minimal, inlined-style shell so it renders consistently across mail clients. */
export function renderEmail(preheader: string, bodyHtml: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${BRAND.cream};font-family:Georgia,'Times New Roman',serif;">
    <span style="display:none;font-size:1px;color:${BRAND.cream};">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:${BRAND.maroon};padding:20px 28px;">
                <span style="color:#fff;font-size:18px;letter-spacing:0.02em;">PCM Alumni Network</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;color:#2a2a2a;font-size:15px;line-height:1.55;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendMail(to: string, subject: string, bodyHtml: string, preheader = '') {
  await getTransport().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html: renderEmail(preheader || subject, bodyHtml),
  });
}
