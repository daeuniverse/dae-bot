import kv from "@vercel/kv";
import { Probot, Context } from "probot";
import {
  Handler,
  HandlerModule,
  Repository,
  Extension,
  Result,
} from "../common";

export = {
  name: "star.created",
  config_key: "star.created",
  handler: handler as Handler,
} as HandlerModule;

async function handler(
  context: Context<any>,
  app: Probot,
  repo: Repository,
  extension: Extension
): Promise<Result> {
  app.log.info(`received a star.created event: ${JSON.stringify(repo)}`);

  const actualStars = await kv.get<string>(`${repo.name}.stars`);
  if (!actualStars) {
    return {
      result: "Ops something goes wrong.",
      error: JSON.stringify("key does not exist"),
    };
  }

  const payload = context.payload.repository;

  try {
    if (payload.stargazers_count > Number.parseInt(actualStars)) {
      await kv.set(`${repo.name}.stars`, payload.stargazers_count);
      const msg = `⭐ Repo: ${payload.name} received a new star from [@${context.payload.sender.login}](${context.payload.sender.html_url})! Total stars: ${payload.stargazers_count}`;
      app.log.info(msg);

      // 1.2 audit event
      await extension.tg.sendMsg(msg, [
        process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
      ]);
    }

    return { result: "ok!" };
  } catch (err) {
    return { result: "Ops something goes wrong.", error: JSON.stringify(err) };
  }
}
