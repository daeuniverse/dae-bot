import { Context } from "probot";
import { Telegram } from "telegraf";
import { awesome_sticker } from "./constant";

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
    var promises = this.chat_ids.map((chat: string) => {
      return new Promise((resolve, reject) => {
        try {
          resolve(
            this.telegram
              .sendMessage(chat, msg)
              .then(() => this.telegram.sendSticker(chat, awesome_sticker))
          );
        } catch (err) {
          console.log(err);
          reject(err);
        }
      });
    });

    await Promise.all(promises);
  }
}
