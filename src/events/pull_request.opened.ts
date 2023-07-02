import { Span, SpanStatusCode } from "@opentelemetry/api";
import { Probot, Context } from "probot";
import {
  Handler,
  HandlerModule,
  Repository,
  Extension,
  Result,
} from "../common";
import { defaultLables, strictLabels } from "../constant";
import { tracer } from "../trace";

export = {
  name: "pull_request.opened",
  config_key: "pull_request.opened",
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
  };
  await tracer.startActiveSpan(
    "app.handler.pull_request.opened.event_logging",
    async (span: Span) => {
      const msg = `received a pull_request.opened event: ${JSON.stringify(
        metadata
      )}`;
      app.log.info(msg);
      span.addEvent(msg);
      span.end();
    }
  );

  // case_#1: automatically assign assignee if not present
  await tracer.startActiveSpan(
    "app.handler.pull_request.opened.assign_default_assignee",
    {
      attributes: {
        case: "assign pull_request author to be the default assignee",
      },
    },
    async (span: Span) => {
      try {
        // https://octokit.github.io/rest.js/v18#issues-add-assignees
        const author = metadata.pull_request.author.includes("bot")
          ? "daebot"
          : metadata.pull_request.author;

        // 1.1 assign pull_request author to be the default assignee
        await tracer.startActiveSpan(
          "app.handler.pull_request.opened.assign_default_assignee.add_assignee",
          {
            attributes: {
              functionality: "add default assignee",
            },
          },
          async (span: Span) => {
            await extension.octokit.issues.addAssignees({
              owner: metadata.owner,
              repo: metadata.repo,
              issue_number: metadata.pull_request.number,
              assignees: [author],
            });
            span.addEvent(`add default assignee: ${author}`);
            span.end();
          }
        );

        // 1.2 audit event
        await tracer.startActiveSpan(
          "app.handler.pull_request.opened.assign_default_assignee.audit_event",
          {
            attributes: {
              functionality: "audit event",
            },
          },
          async (span: Span) => {
            const msg = `👷 PR - [#${metadata.pull_request.number}: ${metadata.pull_request.title}](${metadata.pull_request.html_url}) is raised in ${metadata.repo}; assign @${author} as the default assignee.`;

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

  // case_#2: automatically assign label if not present, default label should align with "kind" as part of the pr title
  await tracer.startActiveSpan(
    "app.handler.pull_request.opened.assign_labels",
    {
      attributes: {
        case: "automatically assign label if not present, default label should align with kind as part of the pr title",
        condition: "label.not_present == true",
      },
    },
    async (span: Span) => {
      try {
        // automatically add label(s) to pull_request
        await tracer.startActiveSpan(
          "app.handler.pull_request.opened.assign_labels.add_labels",
          {
            attributes: {
              functionality: "automatically add label(s) to pull_request",
            },
          },
          async (span: Span) => {
            // 1.1 list current assign labels
            const prOpenedLabels = await tracer.startActiveSpan(
              "app.handler.pull_request.opened.assign_labels.list_active_labels",
              {
                attributes: {
                  functionality: "check current assigned labels",
                },
              },
              async (span: Span) => {
                // https://octokit.github.io/rest.js/v18#issues-list-labels-on-issue
                const result = await extension.octokit.issues
                  .listLabelsOnIssue({
                    owner: metadata.owner,
                    repo: metadata.repo,
                    issue_number: metadata.pull_request.number,
                  })
                  .then((res) => res.data);
                span.addEvent(JSON.stringify(result));
                span.end();
                return result;
              }
            );

            await tracer.startActiveSpan(
              "app.handler.pull_request.opened.assign_labels.add_labels",
              {
                attributes: {
                  functionality: "add labels",
                  condition: "prOpenedLabels.length == 0",
                },
              },
              async (span: Span) => {
                if (prOpenedLabels.length == 0) {
                  let labels = defaultLables
                    .filter((label: string) => {
                      const re = /^(?<type>\w+)(\((?<scope>.+)\))?:/;
                      const { type } =
                        metadata.pull_request.title.match(re)?.groups!;
                      return type === label;
                    })
                    .map((item) => {
                      if (item == "feat") item = "feature";
                      if (item == "docs" || item == "doc")
                        item = "documentation";
                      return item;
                    });

                  span.addEvent(
                    `label retrieved from pr.title: ${JSON.stringify(labels)}`
                  );

                  if (labels.length > 0) {
                    // check if "not-yet-tested" is eligible to be added
                    await tracer.startActiveSpan(
                      "app.handler.pull_request.opened.assign_labels.add_labels.not_yet_tested",
                      {
                        attributes: {
                          functionality: "add not-yet-tested label",
                          condition: "strictLabels.included == true",
                        },
                      },
                      async (span: Span) => {
                        if (
                          strictLabels.filter((label) =>
                            metadata.pull_request.title.startsWith(label)
                          ).length > 0
                        ) {
                          // add "not-yet-tested label"
                          labels = [...labels, "not-yet-tested"];

                          span.addEvent(
                            `label not-yet-tested has been added; current labels: ${JSON.stringify(
                              labels
                            )}`
                          );

                          // if (["dae", "daed"].includes(metadata.repo)) {
                          //   // request review from qa team
                          //   await tracer.startActiveSpan(
                          //     "app.handler.pull_request.opened.assign_labels.add_labels.not_yet_tested.request_qa_review",
                          //     {
                          //       attributes: {
                          //         functionality: "request review from qa team",
                          //         condition: "ONLY applicable in [dae,daed]",
                          //       },
                          //     },
                          //     async (span: Span) => {
                          //       // https://octokit.github.io/rest.js/v18#pulls-create-review-request
                          //       await extension.octokit.rest.pulls.requestReviewers(
                          //         {
                          //           owner: metadata.owner,
                          //           repo: metadata.repo,
                          //           pull_number: metadata.pull_request.number,
                          //           team_reviewers: ["qa"],
                          //         }
                          //       );

                          //       span.end();
                          //     }
                          //   );
                          // }
                        }

                        span.end();
                      }
                    );

                    // 1.2 add labels
                    await tracer.startActiveSpan(
                      "app.handler.pull_request.opened.assign_labels.add_labels.add",
                      {
                        attributes: {
                          functionality: "add labels",
                        },
                      },
                      async (span: Span) => {
                        span.addEvent(`labels to be added: ${labels}`);
                        // https://octokit.github.io/rest.js/v18#issues-add-labels
                        await extension.octokit.issues.addLabels({
                          owner: metadata.owner,
                          repo: metadata.repo,
                          issue_number: metadata.pull_request.number,
                          labels: labels,
                        });

                        span.end();
                      }
                    );

                    // 1.3 audit event
                    await tracer.startActiveSpan(
                      "app.handler.pull_request.opened.assign_labels.add_labels.audit_event",
                      {
                        attributes: {
                          functionality: "audit event",
                        },
                      },
                      async (span: Span) => {
                        const msg = `🏷 PR - [#${
                          metadata.pull_request.number
                        }](${metadata.pull_request.html_url}) in ${
                          metadata.repo
                        } is missing labels; added ${JSON.stringify(labels)}.`;

                        app.log.info(msg);

                        await extension.tg.sendMsg(msg, [
                          process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
                        ]);

                        span.end();
                      }
                    );
                  }
                }

                span.end();
              }
            );

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

  // case_#3: assign daebot as one of the reviewers
  if (
    strictLabels.filter((label: string) =>
      metadata.pull_request.title.startsWith(label)
    ).length > 0
  ) {
    await tracer.startActiveSpan(
      "app.handler.pull_request.opened.assign_dae_bot_as_reviewers",
      {
        attributes: {
          case: "assign daebot as one of the reviewers",
        },
      },
      async (span: Span) => {
        try {
          // 1.1 assign daebot as one of the reviewers
          // https://octokit.github.io/rest.js/v18#pulls-request-reviewers
          await extension.octokit.pulls.requestReviewers({
            repo: metadata.repo,
            owner: metadata.owner,
            pull_number: metadata.pull_request.number,
            reviewers: ["dae-bot[bot]"],
          });
        } catch (err: any) {
          app.log(err);
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR });
        }

        span.end();
      }
    );
  }

  return { result: "ok!" };
}
