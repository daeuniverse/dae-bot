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
  const syncBranch = "sync-upstream";
  // set syncSource [dae|dae-wing] based on the source commit [dae-wing|daed], respectively
  const syncSource =
    context.payload.repository.name == "dae-wing" ? "dae" : "dae-wing";
  // set syncTarget [dae-wing|daed] based on the source commit [dae|dae-wing], respectively
  const syncTarget =
    context.payload.repository.name == "dae" ? "dae-wing" : "daed";

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

  // case_#1 trigger sync_target.sync-upstream workflow if new changes are pushed to [dae|dae-wing] origin/main
  if (
    context.payload.ref == "refs/heads/main" &&
    ["dae", "dae-wing"].includes(context.payload.repository.name)
  ) {
    await tracer.startActiveSpan(
      `app.handler.push.${syncTarget}_sync_upstream.trigger_workflow`,
      {
        attributes: {
          case: `trigger ${syncTarget}.sync-upstream workflow if new changes are pushed to ${repo.name} origin/main`,
        },
      },
      async (span: Span) => {
        try {
          // 1.1 construct metadata from payload
          const metadata = {
            repo: repo.name,
            owner: repo.owner,
            author: context.payload.sender.login,
            default_branch: context.payload.repository.default_branch,
            html_url: context.payload.repository.html_url,
            head_commit: head_commit,
          };

          await tracer.startActiveSpan(
            `app.handler.push.${syncTarget}_sync_upstream.trigger_workflow.metadata`,
            {
              attributes: {
                metadata: JSON.stringify(metadata),
                syncTarget,
              },
            },
            async (span: Span) => {
              span.end();
            }
          );

          // 1.2 trigger sync_target sync-upstream-source workflow
          const latestRunUrl = await tracer.startActiveSpan(
            `app.handler.push.${syncTarget}_sync_upstream.trigger_workflow.trigger`,
            {
              attributes: {
                functionality: `trigger ${syncTarget} sync-upstream-source workflow`,
              },
            },
            async (span: Span) => {
              // https://octokit.github.io/rest.js/v18#actions-create-workflow-dispatch
              // https://docs.github.com/en/rest/actions/workflows?apiVersion=2022-11-28#create-a-workflow-dispatch-event
              const result = await extension.octokit.actions
                .createWorkflowDispatch({
                  repo: syncTarget,
                  owner: metadata.owner,
                  workflow_id: "sync-upstream.yml",
                  ref: metadata.default_branch,
                })
                .then(() =>
                  // 1.3 get latest workflow run metadata
                  // https://octokit.github.io/rest.js/v18#actions-list-workflow-runs
                  extension.octokit.actions
                    .listWorkflowRuns({
                      owner: syncTarget,
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
            `app.handler.push.${syncTarget}_sync_upstream.trigger_workflow.audit_event`,
            { attributes: { functionality: "audit event" } },
            async (span: Span) => {
              const msg = `🏗️ a new commit was pushed to ${repo.name} (${metadata.default_branch}); dispatched ${syncBranch} workflow for ${syncTarget}; url: ${latestRunUrl}`;
              app.log.info(msg);
              await extension.tg.sendMsg(msg, [
                process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
              ]);
              span.addEvent(msg);
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

  // case_#2 create a pull_request when branch sync-upstream is created and pushed to syncTarget (remote)
  if (
    context.payload.before == "0000000000000000000000000000000000000000" &&
    ["dae-wing", "daed"].includes(context.payload.repository.name) &&
    context.payload.ref.split("/")[2] == syncBranch
  ) {
    await tracer.startActiveSpan(
      `app.handler.push.${syncTarget}_sync_upstream.create_pr`,
      {
        attributes: {
          case: `create a pull_request when branch sync-upstream is created and pushed to ${syncTarget} (remote)`,
        },
      },
      async (span: Span) => {
        try {
          // 1.1 construct metadata from payload
          const metadata = {
            repo: repo.name,
            owner: repo.owner,
            author: context.payload.sender.login,
            default_branch: context.payload.repository.default_branch,
            head_branch: context.payload.ref.split("/")[2],
          };

          await tracer.startActiveSpan(
            `app.handler.push.${repo.name}_sync_upstream.create_pr.metadata`,
            {
              attributes: {
                metadata: JSON.stringify(metadata),
                syncTarget,
              },
            },
            async (span: Span) => {
              span.end();
            }
          );

          // 1.2 fetch latest sync-upstream workflow run
          const latestWorkflowRun = await tracer.startActiveSpan(
            `app.handler.push.${repo.name}_sync_upstream.create_pr.fetch_latest_workflow_run`,
            {
              attributes: {
                functionality: "fetch latest ${syncBranch} workflow run",
              },
            },
            async (span: Span) => {
              // https://octokit.github.io/rest.js/v18#actions-list-workflow-runs
              const result = await extension.octokit.actions
                .listWorkflowRuns({
                  repo: metadata.repo,
                  owner: metadata.owner,
                  workflow_id: "sync-upstream.yml",
                  per_page: 1,
                })
                .then((res) => res.data.workflow_runs[0].html_url);
              span.end();
              return result;
            }
          );

          // 1.3 create a pull_request with head (sync-upstream) and base (main) for daed
          const msg = `⏳ ${repo.name} (origin/${metadata.default_branch}) is currently out-of-sync to ${syncSource} (origin/${metadata.default_branch}); changes are proposed by @daebot in actions - ${latestWorkflowRun}`;
          const pr = await tracer.startActiveSpan(
            `app.handler.push.${repo.name}_sync_upstream.create_pr.create`,
            {
              attributes: {
                functionality: `create a pull_request with head (${syncBranch}) and base (${metadata.default_branch}) for ${repo.name}`,
              },
            },
            async (span: Span) => {
              // https://octokit.github.io/rest.js/v18#pulls-create
              return await extension.octokit.pulls
                .create({
                  repo: metadata.repo,
                  owner: metadata.owner,
                  head: metadata.head_branch,
                  base: metadata.default_branch,
                  title: "chore(sync): keep upstream source up-to-date",
                  body: msg,
                })
                .then((res) => {
                  // 1.3.1 add labels
                  tracer.startActiveSpan(
                    `app.handler.push.${repo.name}_sync_upstream.create_pr.pr.add_labels`,
                    {
                      attributes: {
                        functionality: "add labels",
                      },
                    },
                    async (span: Span) => {
                      // https://octokit.github.io/rest.js/v18#issues-add-labels
                      await extension.octokit.issues.addLabels({
                        repo: metadata.repo,
                        owner: metadata.owner,
                        issue_number: res.data.number,
                        labels: ["automated-pr", "chore"],
                      });

                      span.end();
                    }
                  );

                  // 1.3.2 add assignee
                  tracer.startActiveSpan(
                    `app.handler.push.${repo.name}_sync_upstream.create_pr.pr.add_assignee`,
                    {
                      attributes: {
                        functionality: "add assignee",
                      },
                    },
                    async (span: Span) => {
                      // https://octokit.github.io/rest.js/v18#issues-add-assignees
                      await extension.octokit.issues.addAssignees({
                        owner: metadata.owner,
                        repo: metadata.repo,
                        issue_number: res.data.number,
                        assignees: ["daebot"],
                      });

                      span.end();
                    }
                  );

                  return {
                    title: res.data.title,
                    author: res.data.user?.login,
                    number: res.data.number,
                    updated_at: res.data.updated_at,
                    html_url: res.data.html_url,
                    sha: res.data.head.sha,
                  };
                });

              span.end();
            }
          );

          // 1.4 automatically merge pull_request
          await tracer.startActiveSpan(
            `app.handler.push.${repo.name}_sync_upstream.create_pr.auto_merge_pr`,
            {
              attributes: { functionality: "automatically merge pull_request" },
            },
            async (span: Span) => {
              // https://octokit.github.io/rest.js/v18#pulls-merge
              await extension.octokit.pulls.merge({
                repo: metadata.repo,
                owner: metadata.owner,
                pull_number: pr.number,
                merge_method: "squash",
              });
              const msg = "🛫 All good, merge to main.";
              app.log.info(msg);
              span.addEvent(msg);
              await extension.tg.sendMsg(msg, [
                process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
              ]);

              span.end();
            }
          );

          // 1.5 audit event
          await tracer.startActiveSpan(
            `app.handler.push.${repo.name}_sync_upstream.create_pr.audit_event`,
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
          app.log.error(err);
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR });
        }

        span.end();
      }
    );
  }

  // fallback
  return { result: "ok!" };
}
