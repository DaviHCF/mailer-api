// api/send-email.js
import nodemailer from "nodemailer";

const SERVICE_API_KEY = process.env.SERVICE_API_KEY; // obrigatório

function jsonRes(res, status, payload){
  res.status(status).setHeader("Content-Type","application/json").end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return jsonRes(res, 405, { ok:false, error: "method_not_allowed" });

    // simples auth: Bearer SERVICE_API_KEY
    const authHeader = req.headers["authorization"] || "";
    if (!authHeader || authHeader !== `Bearer ${SERVICE_API_KEY}`) {
      return jsonRes(res, 401, { ok:false, error: "unauthorized" });
    }

    const body = req.body || {};
    // Espera: { sendIf: "success" | "always", to, subject, text, html, smtp? }
    const { sendIf="always", to, subject, text, html, smtp } = body;

    if (!to || !subject) return jsonRes(res, 400, { ok:false, error: "missing_fields" });

    // Se quiser condicionar ao resultado de processamento no Lovable:
    if (sendIf === "success" && body.status !== "success") {
      return jsonRes(res, 200, { ok:false, reason: "processing_not_successful" });
    }

    // Se o payload trouxe credenciais SMTP (dinâmico), usa; senão usa env defaults
    const cfg = smtp && smtp.host ? {
      host: smtp.host,
      port: smtp.port || 587,
      secure: !!smtp.secure, // true p/465, false p/587
      auth: { user: smtp.user, pass: smtp.pass },
      // tls: smtp.tlsOptions || undefined
    } : {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: (process.env.SMTP_PORT === "465"),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    };

    // cria transporter dinamicamente
    const transporter = nodemailer.createTransport(cfg);

    // verificação (testa conexão e auth) — se falhar, não envia
    try {
      await transporter.verify();
    } catch (errVerify) {
      return jsonRes(res, 400, { ok:false, error: "smtp_verify_failed", detail: String(errVerify.message || errVerify) });
    }

    // montar destinatário
    const toField = Array.isArray(to) ? to.join(", ") : String(to);

    // montar from: prioridade smtp.from, senão env FROM_ADDRESS, senão auth user
    const fromAddress = (smtp && smtp.from) ? smtp.from : (process.env.FROM_ADDRESS || (cfg.auth && cfg.auth.user));

    const mailOptions = {
      from: fromAddress,
      to: toField,
      subject,
      text: text || undefined,
      html: html || undefined,
      // attachments: [] // se quiser, aceitar base64 attachments no payload e converter aqui
    };

    const info = await transporter.sendMail(mailOptions);

    return jsonRes(res, 200, { ok:true, messageId: info.messageId, response: info.response || null });
  } catch (err) {
    console.error("send-email error", err);
    return jsonRes(res, 500, { ok:false, error: "server_error", detail: String(err.message || err) });
  }
}
