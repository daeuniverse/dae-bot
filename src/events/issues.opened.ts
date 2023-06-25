import { Probot, Context } from "probot";
import {
  Handler,
  HandlerModule,
  Repository,
  Extension,
  Result,
} from "../common";

export = {
  name: "issues.opened",
  config_key: "issues.opened",
  handler: handler as Handler,
} as HandlerModule;

async function handler(
  context: Context<any>,
  app: Probot,
  repo: Repository,
  extension: Extension
): Promise<Result> {
  const metadata = {
    repo: repo.name,
    owner: repo.owner,
    author: context.payload.sender.login,
    default_branch: context.payload.repository.default_branch,
    issue: {
      number: context.payload.issue.number,
      title: context.payload.issue.title,
      author: context.payload.issue.user.login,
      html_url: context.payload.issue.html_url,
    },
  };

  app.log.info(`received an issues.opened event: ${JSON.stringify(metadata)}`);
  try {
    const comment = context.issue({
      body: "Thanks for opening this issue!",
    });
    await extension.octokit.issues.createComment(comment);
  } catch (err) {
    return { result: "Ops something goes wrong.", error: JSON.stringify(err) };
  }

  return { result: "ok!" };
}
