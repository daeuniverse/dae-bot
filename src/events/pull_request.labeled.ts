import { Span, SpanStatusCode } from "@opentelemetry/api";
import { Probot, Context } from "probot";
import {
  Handler,
  HandlerModule,
  Repository,
  Extension,
  Result,
} from "../common";
import { defaultLables } from "../constant";
import { tracer } from "../trace";

export = {
  name: "pull_request.labeled",
  config_key: "pull_request.labeled",
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
    default_branch: context.payload.repository.default_branch,
    html_url: context.payload.repository.html_url,
    pull_request: {
      ref: context.payload.pull_request.head.ref,
      sha: context.payload.pull_request.head.sha,
      title: context.payload.pull_request.title,
      author: context.payload.pull_request.user.login,
      number: context.payload.pull_request.number,
      updated_at: context.payload.pull_request.updated_at,
      html_url: context.payload.pull_request.html_url,
    },
    label: {
      name: context.payload.label.name,
    },
  };

  // instantiate span
  await tracer.startActiveSpan(
    "app.handler.pull_request.labeled.event_logging",
    async (span: Span) => {
      const logs = `received a pull_request.labeled event: ${JSON.stringify(
        metadata
      )}`;
      app.log.info(logs);
      span.addEvent(logs);
      span.end();
    }
  );

  // case_#1: when pr is attached to "tested" label, write a ready-to-merge comment
  if (
    defaultLables.filter((label: string) =>
      metadata.pull_request.title.startsWith(label)
    ).length > 0 &&
    metadata.label.name == "tested"
  ) {
    await tracer.startActiveSpan(
      "app.handler.pull_request.labeled.ready_to_merge",
      {
        attributes: {
          case: "when pr is attached to 'tested' label, write a ready-to-merge comment",
        },
      },
      async (span: Span) => {
        try {
          // 1.1 submit a pr review
          await tracer.startActiveSpan(
            "app.handler.pull_request.labeled.ready_to_merge.submit_pr_review",
            {
              attributes: {
                functionality: "submit a pr review",
              },
            },
            async (span: Span) => {
              // https://octokit.github.io/rest.js/v18#pulls-create-review
              // https://docs.github.com/en/rest/pulls/reviews?apiVersion=2022-11-28#create-a-review-for-a-pull-request
              await extension.octokit.pulls.createReview({
                repo: metadata.repo,
                owner: metadata.owner,
                pull_number: metadata.pull_request.number,
                body: "🧪 Since the PR has been fully tested, please consider merging it.",
                commit_id: metadata.pull_request.sha,
                event: "APPROVE",
              });

              span.end();
            }
          );

          // 1.2 audit event
          await tracer.startActiveSpan(
            "app.handler.pull_request.labeled.ready_to_merge.audit_event",
            {
              attributes: {
                functionality: "audit event",
              },
            },
            async (span: Span) => {
              const msg = `🧪 PR - [#${metadata.pull_request.number}: ${metadata.pull_request.title}](${metadata.pull_request.html_url}) in ${metadata.repo} has been fully tested; please consider merging it as soon as possible.`;

              app.log.info(msg);
              span.addEvent(msg);
              await extension.tg.sendMsg(msg, [
                process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
              ]);

              span.end();
            }
          );
        } catch (err: any) {
          app.log.error(err);
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR });
        }

        span.end();
      }
    );
  }

  return { result: "ok!" };
}
