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
    return context.octokit.issues.createComment(comment);
  });

  // on receive star event
  app.on("star.created", async (context: Context<"star.created">) => {
    const payload = context.payload.repository;
    const actualStars = await kv.get(`${payload.name}.stars`);
    if (!actualStars) {
      app.log.error("key not exists.");
      return;
    }
    if (payload.stargazers_count > actualStars) {
      await kv.set(`${payload.name}.stars`, payload.stargazers_count);
      const msg = `Repo: ${payload.name} received a new star! Total stars: ${payload.stargazers_count}`;
      app.log.info(msg);

      const tg = new TelegramClient(context as unknown as Context);
      await tg.sendMsg(msg);
    }
  });
};
