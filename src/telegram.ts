import { Context } from "probot";
import { Telegram } from "telegraf";

export class TelegramClient {
  telegram: Telegram;
  context: Context;

  constructor(context: Context) {
    this.telegram = new Telegram(process.env.TELEGRAM_BOT_TOKEN!);
    this.context = context;
  }

  sendMsg(msg: string, channels: string[]) {
    return Promise.all(
      channels.map((chat) => {
        this.telegram.sendMessage(chat, msg, {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        });
      })
    );
  }
}
