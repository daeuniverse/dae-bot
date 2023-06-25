import { Context, Probot } from "probot";
import { Run } from "./runner";

export default (app: Probot) => {
  app.log(`${process.env.BOT_NAME} app is loaded successfully!`);

  // on receive push event
  app.on("push", async (context: Context<any>) => {
    const result = await Run(context, app, "push");
    app.log.info(JSON.stringify(result));
  });

  // on receive issue event
  app.on("issues.opened", async (context: Context<any>) => {
    const result = await Run(context, app, "issues.opened");
    app.log.info(JSON.stringify(result));
  });

  // on receive issue_closed event
  app.on("issues.closed", async (context: Context<any>) => {
    const result = await Run(context, app, "issues.closed");
    app.log.info(JSON.stringify(result));
  });

  // on receive issue_comment.created event
  app.on("issue_comment.created", async (context: Context<any>) => {
    const result = await Run(context, app, "issue_comment.created");
    app.log.info(JSON.stringify(result));
  });

  // on receive star event
  app.on("star.created", async (context: any) => {
    const result = await Run(context, app, "star.created");
    app.log.info(JSON.stringify(result));
  });

  // on receive pull_request.opened event
  app.on("pull_request.opened", async (context: Context<any>) => {
    const result = await Run(context, app, "pull_request.opened");
    app.log.info(JSON.stringify(result));
  });

  // on pull_request.synchronize event
  app.on("pull_request.synchronize", async (context: Context<any>) => {
    const result = await Run(context, app, "pull_request.synchronize");
    app.log.info(JSON.stringify(result));
  });

  // on pull_request.closed event
  app.on("pull_request.closed", async (context: Context<any>) => {
    const result = await Run(context, app, "pull_request.closed");
    app.log.info(JSON.stringify(result));
  });

  // on released
  app.on("release.released", async (context: Context<any>) => {
    const result = await Run(context, app, "release.released");
    app.log.info(JSON.stringify(result));
  });
};
