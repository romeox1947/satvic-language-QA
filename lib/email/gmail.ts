import nodemailer from 'nodemailer';

type JobEmail = {
  to: string;
  outcome: 'started' | 'completed' | 'failed';
  projectName: string;
  sourceLanguage: string;
  targetLanguage: string;
  detail: string;
  appUrl?: string;
};

type Json = Record<string, any>;

export async function sendGmailJobEmail(input: JobEmail) {
  const from = process.env.GMAIL_USER?.trim().toLowerCase();
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
  const to = input.to.trim();
  if (!from || !appPassword || !to) {
    console.warn('[email] Notification skipped: configure GMAIL_USER, GMAIL_APP_PASSWORD, and a recipient email.');
    return { sent: false };
  }

  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => entities[char]);
  const title = input.outcome === 'started' ? 'Dubbing job started' : input.outcome === 'completed' ? 'Dubbing and QA completed' : 'Dubbing or QA failed';
  const appUrl = input.appUrl?.trim().replace(/\/+$/, '');
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: from, pass: appPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    const result = await transporter.sendMail({
      from: `Satvic Studio <${from}>`,
      to,
      subject: `[Satvic Studio] ${title}: ${input.projectName}`,
      text: `${title}\nProject: ${input.projectName}\nLanguages: ${input.sourceLanguage} to ${input.targetLanguage}\n\n${input.detail}${appUrl ? `\n\nOpen Satvic Studio: ${appUrl}` : ''}`,
      html: `<h2>${title}</h2><p><strong>Project:</strong> ${escapeHtml(input.projectName)}</p><p><strong>Languages:</strong> ${escapeHtml(input.sourceLanguage)} &rarr; ${escapeHtml(input.targetLanguage)}</p><p>${escapeHtml(input.detail)}</p>${appUrl ? `<p><a href="${escapeHtml(appUrl)}">Open Satvic Studio</a></p>` : ''}`,
    });
    console.info(`[email] Gmail accepted notification: ${result.messageId || 'message ID unavailable'}`);
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error as Json);
    console.warn(`[email] Gmail notification failed: ${message}`);
    return { sent: false };
  } finally {
    transporter.close();
  }
}
