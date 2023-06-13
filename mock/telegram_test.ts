import { Telegram } from "telegraf";
// import { awesome_sticker } from "../src/constant";
import dotenv from "dotenv";

class TelegramClient {
  token: string;
  telegram: Telegram;

  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN as string;
    this.telegram = new Telegram(this.token);
  }

  async sendMsg(msg: string, channels: string[]) {
    var promises = channels.map((chat: string) => {
      return new Promise((resolve, reject) => {
        try {
          resolve(this.telegram.sendMessage(chat, msg));
        } catch (err) {
          console.log(err);
          reject(err);
        }
      });
    });

    await Promise.all(promises);
  }
}

const main = async () => {
  dotenv.config({ path: ".env" });
  const tg = new TelegramClient();
  await tg.sendMsg("nihao!", [
    process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
  ]);
};

main();
