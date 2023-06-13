import { Context, Probot } from "probot";
import { TelegramClient } from "./telegram";
import kv from "@vercel/kv";

export default (app: Probot) => {
  app.log("The app is loaded successfully!");

  // on receive push event
  app.on("push", async (context: Context<"push">) => {
    var head_commit = JSON.stringify(context.payload?.head_commit);
    app.log.info(`received a push event: ${head_commit}`);
  });

  // on receive issue event
  app.on("issues.opened", async (context: Context<"issues.opened">) => {
    app.log.info(`received an issue event: ${context.payload.issue}`);
    const comment = context.issue({
      body: "Thanks for opening this issue!",
    });
    const msg = `${JSON.stringify({
      event: "issues.opened",
      sender: context.payload.sender,
    })}`;
    const tg = new TelegramClient(context as unknown as Context);
    await tg.sendMsg(msg, [
      process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
    ]);
    return await context.octokit.issues.createComment(comment);
  });

  // on receive star event
  app.on("star.created", async (context: Context<"star.created">) => {
    const payload = context.payload.repository;
    const actualStars = await kv.get(`${payload.name}.stars`);
    if (!actualStars) {
      app.log.error("key does not exist");
      return;
    }
    if (payload.stargazers_count > actualStars) {
      await kv.set(`${payload.name}.stars`, payload.stargazers_count);
      const msg = `${JSON.stringify({
        event: "star.created",
        repo: payload.name,
        total_stars: payload.stargazers_count,
        sender: context.payload.sender,
      })}`;
      app.log.info(msg);

      const tg = new TelegramClient(context as unknown as Context);
      await tg.sendMsg(msg, [
        process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
      ]);
    }
  });
};
