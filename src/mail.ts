// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Resend's HTTP API. Plain text only: no tracking pixels, no rewritten links. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(mail: Mail): Promise<void> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  }
}

/** Development only: the mail goes to the server log instead of a mailbox. */
export class LogMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    console.log(`[mail to ${mail.to}] ${mail.subject}\n${mail.text}`);
  }
}

export function signInMail(options: {
  to: string;
  host: string;
  link: string;
  minutes: number;
  operatorName: string;
  contactEmail: string;
}): Mail {
  return {
    to: options.to,
    subject: `【url.jp.ai】${options.host} の所有者確認`,
    text: [
      `url.jp.ai で、${options.host} の詳しい検査結果を見るための確認メールです。`,
      '',
      `次のリンクを開き、表示されたページの「詳しい結果を見る」を押してください。リンクは ${options.minutes} 分間、1 回だけ使えます。`,
      '',
      options.link,
      '',
      'このメールに心当たりがない場合は、何もせずに削除してください。リンクを開いてボタンを押さない限り、何も表示されません。',
      '',
      '--',
      `url.jp.ai（運営：${options.operatorName}）`,
      `お問い合わせ: ${options.contactEmail}`,
    ].join('\n'),
  };
}
