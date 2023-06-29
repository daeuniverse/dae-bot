import { Telegram } from "telegraf";

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
