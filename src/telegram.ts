import { Context } from "probot";
import { Telegram } from "telegraf";
// import { BaseWebhookEvent } from "probot";

export class TelegramClient {
  chat_ids: string[];
  token: string;
  telegram: Telegram;
  context: Context;

  constructor(context: Context) {
    this.token = process.env.TELEGRAM_BOT_TOKEN as string;
    this.chat_ids = [
      process.env.TELEGRAM_GITHUB_CHANNEL_ID as string,
      process.env.TELEGRAM_DAEUNIVERSE_CHANNEL_ID as string,
    ];
    this.telegram = new Telegram(this.token);
    this.context = context;
  }

  async sendMsg(msg: string) {
    this.chat_ids.map((chat: string) => {
      return this.telegram.sendMessage(chat, msg);
    });
  }
}
