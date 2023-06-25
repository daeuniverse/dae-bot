import { Context, Probot } from "probot";
import { Run } from "./runner";

export default (app: Probot) => {
  app.log(`${process.env.BOT_NAME} app is loaded successfully!`);

  // on receive a selective range of events
  app.on(
    [
      "push",
      "star.created",
      "issues.opened",
      "issues.closed",
      "issue_comment.created",
      "pull_request.opened",
      "pull_request.synchronize",
      "pull_request.closed",
      "release.released",
    ],
    async (context: Context<any>) => {
      app.log.info(
        JSON.stringify({ event: context.name, action: context.payload.action })
      );
      const full_event = context.payload.action
        ? `${context.name}.${context.payload.action}`
        : context.name;
      const result = await Run(context, app, full_event);
      app.log.info(JSON.stringify(result));
    }
  );
};
