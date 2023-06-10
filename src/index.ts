import { Context, Probot } from "probot";
import { TelegramClient } from "./telegram";

export default (app: Probot) => {
  app.log("The app is loaded successfully!");

  // on receive push event
  app.on("push", async (context: Context<"push">) => {
    app.log.debug(`received a push event: ${context.payload?.head_commit}`);
  });

  // on receive issue event
  app.on("issues.opened", async (context: Context<"issues.opened">) => {
    app.log.debug(`received an issue event: ${context.payload.issue}`);
    const comment = context.issue({
      body: "Thanks for opening this issue!",
    });
    return context.octokit.issues.createComment(comment);
  });

  // on receive star event
  app.on("star.created", async (context: Context<"star.created">) => {
    app.log.debug(`${context.payload.repository.name} received a new star!`);

    const tg = new TelegramClient(context as unknown as Context);
    tg.sendMsg(`${context.payload.repository.name} received a new star!`);
  });
};
