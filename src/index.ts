import run from "./runner";
import { Span } from "@opentelemetry/api";
import { Context, Probot } from "probot";
import { otel, tracer } from "./trace";

export default (app: Probot) => {
  app.log(`${process.env.BOT_NAME} app is loaded successfully!`);

  // instantiate tracing
  otel.start();

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
      "pull_request.labeled",
      "release.published",
    ],
    async (context: Context<any>) => {
      await tracer.startActiveSpan(
        `app.event.${context.name}`,
        {
          attributes: {
            "context.event": context.name,
            "context.action": context.payload.action,
            "context.payload": JSON.stringify(context.payload),
            "request.id": context.id,
          },
        },
        async (span: Span) => {
          app.log.info(
            JSON.stringify({
              event: context.name,
              action: context.payload.action,
            })
          );

          const full_event = context.payload.action
            ? `${context.name}.${context.payload.action}`
            : context.name;
          span.setAttribute("context.full_event", full_event);

          const result = await run(context, app, full_event);
          result.error ? app.log.error(result) : app.log.info(result);
          span.end();
        }
      );
    }
  );
};
