import { Telegram } from "telegraf";
import dotenv from "dotenv";

class TelegramClient {
  telegram: Telegram;

  constructor() {
    this.telegram = new Telegram(process.env.TELEGRAM_BOT_TOKEN!);
  }

  async sendMsg(msg: string, channels: string[]) {
    return await Promise.all(
      channels.map((chat) =>
        this.telegram.sendMessage(chat, msg, {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        })
      )
    );
  }
}

const main = async () => {
  dotenv.config({ path: ".env" });
  const tg = new TelegramClient();
  const response = await tg.sendMsg("nihao!", [
    process.env.TELEGRAM_INFRA_DEV_CHANNEL_ID as string,
  ]);
  console.log(response);
};

main();
