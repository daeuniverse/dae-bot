import { Telegram } from "telegraf";
import { awesome_sticker } from "../../src/constant";

export class TelegramClient {
  chat_ids: string[];
  token: string;
  telegram: Telegram;

  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN as string;
    this.chat_ids = [
      process.env.TELEGRAM_GITHUB_CHANNEL_ID as string,
      // process.env.TELEGRAM_DAEUNIVERSE_CHANNEL_ID as string,
    ];
    this.telegram = new Telegram(this.token);
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

export default async (req, res) => {
  const tg = new TelegramClient();
  await tg.sendMsg("hello");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.json({ result: "ok!" });
};
