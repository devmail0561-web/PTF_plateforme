import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface IEmailService {
  sendNewDeviceOtp(to: string, otp: string, deviceName: string, userAgent: string | undefined): Promise<void>;
}

export class EmailService implements IEmailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    const host = process.env["SMTP_HOST"];
    const port = parseInt(process.env["SMTP_PORT"] ?? "587");
    const user = process.env["SMTP_USER"];
    const pass = process.env["SMTP_PASS"];
    this.from  = process.env["SMTP_FROM"] ?? "PTF <noreply@ptf.dev>";

    if (!host || !user || !pass) {
      // Dev fallback: Ethereal (nodemailer test account) — logs the preview URL
      this.transporter = nodemailer.createTransport({ host: "localhost", port: 1025 });
    } else {
      this.transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    }
  }

  async sendNewDeviceOtp(
    to:          string,
    otp:         string,
    deviceName:  string,
    userAgent:   string | undefined,
  ): Promise<void> {
    const deviceLabel = deviceName || "Appareil inconnu";
    const agentLabel  = userAgent  ? `\n\nUser-agent : ${userAgent}` : "";

    await this.transporter.sendMail({
      from:    this.from,
      to,
      subject: `[PTF] Vérification du nouvel appareil — code ${otp}`,
      text: [
        `Une connexion depuis un nouvel appareil a été détectée sur votre compte PTF.`,
        ``,
        `Appareil : ${deviceLabel}${agentLabel}`,
        ``,
        `Votre code de vérification : ${otp}`,
        ``,
        `Ce code expire dans 10 minutes.`,
        `Si vous n'êtes pas à l'origine de cette tentative, ignorez ce message —`,
        `la connexion sera refusée automatiquement.`,
        ``,
        `— L'équipe PTF`,
      ].join("\n"),
      html: `
        <p>Une connexion depuis un <strong>nouvel appareil</strong> a été détectée sur votre compte PTF.</p>
        <p><strong>Appareil :</strong> ${escHtml(deviceLabel)}${userAgent ? `<br><strong>User-agent :</strong> ${escHtml(userAgent)}` : ""}</p>
        <p style="font-size:2em;letter-spacing:.2em;font-weight:bold;color:#1a1a2e">${otp}</p>
        <p>Ce code expire dans <strong>10 minutes</strong>.</p>
        <p style="color:#666;font-size:.9em">Si vous n'êtes pas à l'origine de cette tentative, ignorez ce message.</p>
      `,
    });
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
