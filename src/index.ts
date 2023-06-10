import { Probot } from "probot";
import { TelegramClient } from "./telegram"

export default (app: Probot) => {
  // on receive push event
  app.on("push", async (context) => {
    console.debug(context)
    app.log.debug(`received a push event: ${context.payload?.head_commit}`)
  })

  // on receive issue event
  app.on("issues.reopened", async (context) => {
    const comment = context.issue({
      "body": "Thanks for opening this issue!",
    });
  return context.octokit.issues.createComment(comment);
  })

  // on receive star event
  app.on("star.created", async (context) => {
    console.debug(context)
    app.log.debug(`received a new star!`)

    var tg = new TelegramClient(context)
    tg.sendMsg(
      `${context.payload.repository.name} received a new star!`
    )
  });
};
