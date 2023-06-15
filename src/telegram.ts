import { Context } from "probot";
import { Telegram } from "telegraf";

export class TelegramClient {
  token: string;
  telegram: Telegram;
  context: Context;

  constructor(context: Context) {
    this.token = process.env.TELEGRAM_BOT_TOKEN as string;
    this.telegram = new Telegram(this.token);
    this.context = context;
  }

  async sendMsg(msg: string, channels: string[]) {
    var promises = channels.map((chat: string) => {
      return new Promise((resolve, reject) => {
        try {
          resolve(
            this.telegram.sendMessage(chat, msg, {
              parse_mode: "Markdown",
              disable_web_page_preview: true,
            })
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
