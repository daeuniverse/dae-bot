import { Span, SpanStatusCode } from "@opentelemetry/api";
import { Probot, Context } from "probot";
import {
  Handler,
  HandlerModule,
  Repository,
  Extension,
  Result,
} from "../common";
import { tracer } from "../trace";

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

  // instantiate span
  await tracer.startActiveSpan(
    "app.handler.issues.opened.event_logging",
    async (span: Span) => {
      const logs = `received an issues.opened event: ${JSON.stringify(
        metadata
      )}`;
      app.log.info(logs);
      span.addEvent(logs);
      span.end();
    }
  );

  await tracer.startActiveSpan(
    "app.handler.issues.opened.send_greeting",
    { attributes: { functionality: "write greeting msg as comment" } },
    async (span: Span) => {
      try {
        const comment = context.issue({
          body: "Thanks for opening this issue!",
        });
        await extension.octokit.issues.createComment(comment);
      } catch (err: any) {
        app.log.error(err);
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR });
      }

      span.end();
    }
  );

  return { result: "ok!" };
}
