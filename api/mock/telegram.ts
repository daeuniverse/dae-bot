import { Telegram } from "telegraf";
import { awesome_sticker } from "../../src/constant";

export class TelegramClient {
  telegram: Telegram;

  constructor() {
    this.telegram = new Telegram(process.env.TELEGRAM_BOT_TOKEN!);
  }

  async sendMsg(msg: string, channels: string[]) {
    Promise.all(
      channels.map((chat) => {
        this.telegram.sendMessage(chat, msg, {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        });
      })
    );
  }
}

export default async (req, res) => {
  const tg = new TelegramClient();
  await tg.sendMsg("hello", [
    process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
  ]);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.json({ result: "ok!" });
};
