import { Span } from "@opentelemetry/api";
import { Probot, Context } from "probot";
import { Handler, HandlerModule, Repository, Result } from "../common";
import { tracer } from "../trace";

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

  // instantiate span
  await tracer.startActiveSpan(
    "app.handler.issues.closed.event_logging",
    async (span: Span) => {
      const logs = `received an issues.closed event: ${JSON.stringify(
        metadata
      )}`;
      app.log.info(logs);
      span.addEvent(logs);
      span.end();
    }
  );

  return { result: "ok!" };
}
