import { Probot, Context } from "probot";
import { Handler, HandlerModule, Repository, Result } from "../common";

export = {
  name: "issues.closed",
  config_key: "issues.closed",
  handler: handler as Handler,
} as HandlerModule;

async function handler(
  context: Context<any>,
  app: Probot,
  repo: Repository
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

  app.log.info(`received an issues.closed event: ${JSON.stringify(metadata)}`);
  try {
  } catch (err) {
    return { result: "Ops something goes wrong.", error: JSON.stringify(err) };
  }

  return { result: "ok!" };
}
