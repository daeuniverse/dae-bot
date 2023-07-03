import kv from "@vercel/kv";
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
  name: "star.created",
  config_key: "star.created",
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
    stargazers_count: context.payload.repository.stargazers_count,
  };

  // instantiate span
  await tracer.startActiveSpan(
    "app.handler.star.created.event_logging",
    async (span: Span) => {
      const logs = `received a star.created event: ${JSON.stringify(metadata)}`;
      app.log.info(logs);
      span.addEvent(logs);
      span.end();
    }
  );

  await tracer.startActiveSpan(
    "app.handler.star.created",
    async (span: Span) => {
      try {
        // 1.1 get current stargazers_count from kv
        const actualStars = await tracer.startActiveSpan(
          "app.handler.star.created.get_current_stargazers_count)",
          async (span: Span) => {
            span.setAttribute(
              "functionality",
              "get current stargazers_count from kv"
            );
            const result = await kv.get<string>(`stars.${repo.name}`);
            span.end();
            return result;
          }
        );
        if (!actualStars) {
          throw Error("key does not exist");
        }

        if (metadata.stargazers_count > Number.parseInt(actualStars)) {
          // 1.2 store current stargazers_count to kv
          await tracer.startActiveSpan(
            "app.handler.star.created.increment_stargazers_count",
            {
              attributes: {
                functionality: "store current stargazers_count to kv",
              },
            },
            async (span: Span) => {
              await kv.set(`stars.${repo.name}`, metadata.stargazers_count);
              span.addEvent(`count: ${metadata.stargazers_count}`);
              span.end();
            }
          );

          // 1.3 audit event
          await tracer.startActiveSpan(
            "app.handler.star.created.audit_event",
            { attributes: { functionality: "audit event" } },
            async (span: Span) => {
              const msg = `⭐ Repo: ${metadata.repo} received a new star from [@${context.payload.sender.login}](${context.payload.sender.html_url})! Total stars: ${metadata.stargazers_count}`;
              app.log.info(msg);
              await extension.tg.sendMsg(msg, [
                process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
              ]);
              span.addEvent(msg);
              span.end();
            }
          );
        }
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
