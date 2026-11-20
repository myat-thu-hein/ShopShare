import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { formatTHB } from '@shopsense/shared';
import { ENV, type Env } from '../config/env';

interface OrderEmailData {
  to: string;
  name: string;
  orders: {
    number: string;
    total: number;
    items: { title: string; quantity: number; unitPrice: number; variantLabel: string | null }[];
  }[];
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Sends transactional email via Resend (RESEND_API_KEY) or any SMTP server (SMTP_HOST).
 * With neither configured, emails are printed to the API log so the flow is still visible.
 * Email failures never break checkout.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly smtp: Transporter | null;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.smtp = env.SMTP_HOST
      ? nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === 465,
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        })
      : null;
  }

  get transport(): 'resend' | 'smtp' | 'log' {
    return this.env.RESEND_API_KEY ? 'resend' : this.smtp ? 'smtp' : 'log';
  }

  async send(to: string, subject: string, html: string, text: string): Promise<void> {
    try {
      if (this.env.RESEND_API_KEY) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${this.env.RESEND_API_KEY}` },
          body: JSON.stringify({ from: this.env.EMAIL_FROM, to, subject, html, text }),
        });
        if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      } else if (this.smtp) {
        await this.smtp.sendMail({ from: this.env.EMAIL_FROM, to, subject, html, text });
      } else {
        this.logger.log(`📧 [email:log] To: ${to} | ${subject}\n${text}`);
      }
    } catch (e) {
      this.logger.error(`Email to ${to} failed: ${(e as Error).message}`);
    }
  }

  async orderConfirmation(data: OrderEmailData) {
    const grand = data.orders.reduce((s, o) => s + o.total, 0);
    const rows = data.orders
      .flatMap((o) =>
        o.items.map(
          (i) =>
            `<tr><td style="padding:6px 0">${esc(i.title)}${i.variantLabel ? ` <span style="color:#6b7280">(${esc(i.variantLabel)})</span>` : ''} × ${i.quantity}</td><td style="text-align:right">${formatTHB(i.unitPrice * i.quantity)}</td></tr>`,
        ),
      )
      .join('');
    const numbers = data.orders.map((o) => o.number).join(', ');
    const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;padding:24px">
      <div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:28px">
        <h1 style="margin:0 0 4px;font-size:22px">Thanks for your order, ${esc(data.name.split(' ')[0])}!</h1>
        <p style="color:#6b7280;margin:0 0 20px">Order ${esc(numbers)} is confirmed and paid.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
          <tr><td style="padding-top:12px;border-top:1px solid #e5e7eb"><strong>Total</strong></td>
          <td style="padding-top:12px;border-top:1px solid #e5e7eb;text-align:right"><strong>${formatTHB(grand)}</strong></td></tr>
        </table>
        <p style="margin-top:24px"><a href="${this.env.WEB_URL}/orders" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">View your orders</a></p>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">ShopShare — a portfolio demo. No real goods will be shipped.</p>
      </div></body></html>`;
    const text = `Thanks for your order! ${numbers} is paid.\n${data.orders
      .flatMap((o) =>
        o.items.map((i) => `- ${i.title} x${i.quantity}: ${formatTHB(i.unitPrice * i.quantity)}`),
      )
      .join('\n')}\nTotal: ${formatTHB(grand)}\n${this.env.WEB_URL}/orders`;
    await this.send(data.to, `Order confirmed — ${numbers}`, html, text);
  }

  async orderShipped(to: string, name: string, orderNumber: string, tracking: string | null) {
    const text = `Hi ${name}, your order ${orderNumber} has shipped.${tracking ? ` Tracking number: ${tracking}.` : ''} ${this.env.WEB_URL}/orders`;
    const html = `<p>Hi ${esc(name)},</p><p>Your order <strong>${esc(orderNumber)}</strong> is on its way.${tracking ? ` Tracking number: <strong>${esc(tracking)}</strong>.` : ''}</p><p><a href="${this.env.WEB_URL}/orders">Track your order</a></p>`;
    await this.send(to, `Your order ${orderNumber} has shipped`, html, text);
  }
}

@Global()
@Module({ providers: [EmailService], exports: [EmailService] })
export class EmailModule {}
