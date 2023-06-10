import { Telegram } from 'telegraf';
// import { BaseWebhookEvent } from "probot";

export class TelegramClient {
  chat_id: string;
  token: string;
  telegram: Telegram;
  context: any;

  constructor(context: any) {
    this.token = process.env.TELEGRAM_BOT_TOKEN as string
    this.chat_id = process.env.TELEGRAM_CHANNEL_ID as string;
    this.telegram = new Telegram(this.token);
    this.context = context;
  };

  sendMsg(msg: string) {
    return this.telegram.sendMessage(
      this.chat_id,
      msg
    )
  }
}
