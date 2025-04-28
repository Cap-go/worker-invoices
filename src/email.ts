import { Resend } from 'resend';

export const sendEmail = async (c: any, from: string, to: string, subject: string, html: string, attachments: any[] = []) => {
    const resend = new Resend(c.env.RESEND_API_KEY);

    await resend.emails.send({
      from,
      to,
      subject,
      html,
      attachments,
    });
}
