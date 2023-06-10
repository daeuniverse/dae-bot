import { Telegram } from "telegraf";

export class TelegramClient {
  chat_ids: string[];
  token: string;
  telegram: Telegram;

  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN as string;
    this.chat_ids = [process.env.TELEGRAM_GITHUB_CHANNEL_ID as string];
    this.telegram = new Telegram(this.token);
  }

  async sendMsg(msg: string) {
    this.chat_ids.map((chat: string) => {
      return this.telegram.sendMessage(chat, msg);
    });
  }
}

export default async (req, res) => {
  const tg = new TelegramClient();
  await tg.sendMsg("health: ok!");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.json({ result: "ok!" });
};
