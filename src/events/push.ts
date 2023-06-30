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
  name: "push",
  config_key: "push",
  handler: handler as Handler,
} as HandlerModule;

async function handler(
  context: Context<any>,
  app: Probot,
  repo: Repository,
  extension: Extension
): Promise<Result> {
  const head_commit = JSON.stringify(context.payload?.head_commit);
  const daedSyncBranch = "sync-upstream";

  // instantiate span
  await tracer.startActiveSpan(
    "app.handler.push.event_logging",
    async (span: Span) => {
      const logs = `received a push event: ${head_commit}; ref: ${context.payload.ref}; repo: ${repo.name}`;
      app.log.info(logs);
      span.addEvent(logs);
      span.end();
    }
  );

  // case_#1 trigger daed.sync-upstream workflow if new changes are pushed to dae-wing origin/main
  if (
    context.payload.ref == "refs/heads/main" &&
    context.payload.repository.name == "dae-wing"
  ) {
    return await tracer.startActiveSpan(
      "app.handler.push.daed_sync_upstream",
      {
        attributes: {
          case: "trigger daed.sync-upstream workflow if new changes are pushed to dae-wing origin/main",
        },
      },
      async (span: Span) => {
        try {
          // 1.1 construct metadata from payload
          const metadata = {
            repo: "daed",
            owner: context.payload.organization?.login as string,
            author: context.payload.sender.login,
            default_branch: context.payload.repository.default_branch,
            html_url: context.payload.repository.html_url,
            head_commit: head_commit,
          };

          await tracer.startActiveSpan(
            "app.handler.push.daed_sync_upstream.metadata",
            async (span: Span) => {
              span.setAttribute("metadata", JSON.stringify(metadata));
              span.end();
            }
          );

          // 1.2 trigger daed sync-upstream-source workflow
          const latestRunUrl = await tracer.startActiveSpan(
            "app.handler.push.daed_sync_upstream.trigger_workflow",
            {
              attributes: {
                functionality: "trigger daed sync-upstream-source workflow",
              },
            },
            async (span: Span) => {
              // https://octokit.github.io/rest.js/v18#actions-create-workflow-dispatch
              // https://docs.github.com/en/rest/actions/workflows?apiVersion=2022-11-28#create-a-workflow-dispatch-event
              const result = await extension.octokit.actions
                .createWorkflowDispatch({
                  owner: metadata.owner,
                  repo: metadata.repo,
                  workflow_id: "sync-upstream.yml",
                  ref: metadata.default_branch,
                  inputs: {
                    "wing-head": metadata.default_branch,
                    "wing-sync-message": "chore(sync): upgrade dae-wing",
                    "pr-branch": daedSyncBranch,
                  },
                })
                .then(() =>
                  // 1.3 get latest workflow run metadata
                  // https://octokit.github.io/rest.js/v18#actions-list-workflow-runs
                  extension.octokit.actions
                    .listWorkflowRuns({
                      owner: metadata.owner,
                      repo: metadata.repo,
                      workflow_id: "sync-upstream.yml",
                      per_page: 1,
                    })
                    .then((res) => res.data.workflow_runs[0].html_url)
                );
              span.end();
              return result;
            }
          );

          // 1.4 audit event
          await tracer.startActiveSpan(
            "app.handler.push.daed-sync-upstream.audit_event",
            { attributes: { functionality: "audit event" } },
            async (span: Span) => {
              const msg = `🏗️ a new commit was pushed to dae-wing (${metadata.default_branch}); dispatched ${daedSyncBranch} workflow for daed; url: ${latestRunUrl}`;
              app.log.info(msg);
              await extension.tg.sendMsg(msg, [
                process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
              ]);
              span.addEvent(msg);
              span.end();
            }
          );
        } catch (err: any) {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR });
          return {
            result: "Ops something goes wrong.",
            error: err,
          };
        }

        span.end();
        return { result: "ok!" };
      }
    );
  }

  // case_#2 create a pull_request when branch sync-upstream is created and pushed to daed (remote)
  if (
    context.payload.before == "0000000000000000000000000000000000000000" &&
    context.payload.repository.name == "daed" &&
    context.payload.ref.split("/")[2] == daedSyncBranch
  ) {
    return await tracer.startActiveSpan(
      "app.handler.push.daed_sync_upstream",
      async (span: Span) => {
        span.setAttributes({
          case: "create a pull_request when branch sync-upstream is created and pushed to daed (remote)",
        });
        try {
          // 1.1 construct metadata from payload
          const metadata = {
            repo: context.payload.repository.name,
            owner: context.payload.organization?.login as string,
            author: context.payload.sender.login,
            default_branch: context.payload.repository.default_branch,
            head_branch: context.payload.ref.split("/")[2],
          };

          await tracer.startActiveSpan(
            "app.handler.push.daed_sync_upstream.metadata",
            async (span: Span) => {
              span.setAttributes({
                metadata: JSON.stringify(metadata),
                case: "create a pull_request when branch sync-upstream is created and pushed to daed (remote)",
              });
              span.end();
            }
          );

          // 1.2 fetch latest sync-upstream workflow run
          const latestWorkflowRun = await tracer.startActiveSpan(
            "app.handler.push.daed_sync_upstream.fetch_latest_workflow_run",
            {
              attributes: {
                functionality: "fetch latest sync-upstream workflow run",
              },
            },
            async (span: Span) => {
              // https://octokit.github.io/rest.js/v18#actions-list-workflow-runs
              const result = await context.octokit.actions
                .listWorkflowRuns({
                  owner: metadata.owner,
                  repo: metadata.repo,
                  workflow_id: "sync-upstream.yml",
                  per_page: 1,
                })
                .then((res) => res.data.workflow_runs[0].html_url);
              span.end();
              return result;
            }
          );

          // 1.3 create a pull_request with head (sync-upstream) and base (main) for daed
          const msg = `⏳ daed (origin/${metadata.default_branch}) is currently out-of-sync to dae-wing (origin/${metadata.default_branch}); changes are proposed by @daebot in actions - ${latestWorkflowRun}`;
          await tracer.startActiveSpan(
            "app.handler.push.daed_sync_upstream.create_pull_request",
            {
              attributes: {
                functionality:
                  "create a pull_request with head (sync-upstream) and base (main) for daed",
              },
            },
            async (span: Span) => {
              // https://octokit.github.io/rest.js/v18#pulls-create
              await context.octokit.pulls
                .create({
                  owner: metadata.owner,
                  repo: metadata.repo,
                  head: metadata.head_branch,
                  base: metadata.default_branch,
                  title: "chore(sync): keep upstream source up-to-date",
                  body: msg,
                })
                .then((res) => {
                  // 1.4 add labels
                  tracer.startActiveSpan(
                    "app.handler.push.daed_sync_upstream.create_pull_request.add_labels",
                    {
                      attributes: {
                        functionality: "add labels",
                      },
                    },
                    async (span: Span) => {
                      // https://octokit.github.io/rest.js/v18#issues-add-labels
                      context.octokit.issues.addLabels({
                        owner: metadata.owner,
                        repo: metadata.repo,
                        issue_number: res.data.number,
                        labels: ["automated-pr", "chore"],
                      });
                      span.end();
                    }
                  );

                  // 1.5 add assignee
                  tracer.startActiveSpan(
                    "app.handler.push.daed_sync_upstream.create_pull_request.add_assignee",
                    {
                      attributes: {
                        functionality: "add assignee",
                      },
                    },
                    async (span: Span) => {
                      // https://octokit.github.io/rest.js/v18#issues-add-assignees
                      context.octokit.issues.addAssignees({
                        owner: metadata.owner,
                        repo: metadata.repo,
                        issue_number: res.data.number,
                        assignees: ["daebot"],
                      });
                      span.end();
                    }
                  );
                });
              span.end();
            }
          );

          // 1.6 audit event
          await tracer.startActiveSpan(
            "app.handler.push.daed-sync-upstream.audit_event",
            { attributes: { functionality: "audit event" } },
            async (span: Span) => {
              app.log.info(msg);
              await extension.tg.sendMsg(msg, [
                process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
              ]);
              span.addEvent(msg);
              span.end();
            }
          );
        } catch (err: any) {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR });
          return { result: "Ops something goes wrong.", error: err };
        }

        span.end();
        return { result: "ok!" };
      }
    );
  }

  // fallback
  return { result: "ok!" };
}
