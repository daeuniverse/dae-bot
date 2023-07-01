import kv from "@vercel/kv";
import { v4 as uuidv4 } from "uuid";
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
  name: "pull_request.closed",
  config_key: "pull_request.closed",
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
      merged: context.payload.pull_request.merged,
    },
  };

  // instantiate span
  await tracer.startActiveSpan(
    "app.handler.pull_request.closed.event_logging",
    async (span: Span) => {
      const logs = `received a pull_request.closed event: ${JSON.stringify(
        metadata
      )}`;
      app.log.info(logs);
      span.addEvent(logs);
      span.end();
    }
  );

  await tracer.startActiveSpan(
    "app.handler.pull_request.merged.metadata",
    { attributes: { metadata: JSON.stringify(metadata) } },
    async (span: Span) => {
      span.end();
    }
  );

  // case_#1: store pr metrics data to kv when closed
  if (metadata.pull_request.merged) {
    await tracer.startActiveSpan(
      "app.handler.pull_request.merged.store_metrics",
      {
        attributes: {
          case: "record pull request merged event",
        },
      },
      async (span: Span) => {
        try {
          // 1.1 store pr metrics data to kv
          await tracer.startActiveSpan(
            "app.handler.pull_request.merged.store_metrics.store_to_kv",
            {
              attributes: {
                functionality: "store pr metrics data to kv",
                condition: "pr.merged == true",
              },
            },
            async (span: Span) => {
              const key = `pr.merged.${metadata.repo}.${uuidv4().slice(0, 7)}.${
                metadata.pull_request.number
              }`;
              await kv.set(key, JSON.stringify(metadata));
              span.end();
            }
          );

          // 1.2 audit event
          await tracer.startActiveSpan(
            "app.handler.pull_request.merged.store_metrics.audit_event",
            { attributes: { functionality: "audit event" } },
            async (span: Span) => {
              const msg = `🚀 PR - [#${metadata.pull_request.number}: ${metadata.pull_request.title}](${metadata.pull_request.html_url}) in ${metadata.repo} has been merged into ${metadata.default_branch}; good job guys, let's keep it up.`;
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

  // case_#2: create a release tag when release_branch is merged
  if (
    metadata.pull_request.merged &&
    metadata.pull_request.ref.startsWith("release-v")
  ) {
    const tag = metadata.pull_request.ref.split("-")[1];
    const prerelease = tag.includes("rc") || tag.includes("p*");

    await tracer.startActiveSpan(
      "app.handler.pull_request.merged.release_automation",
      {
        attributes: {
          case: "create a release tag when release_branch is merged",
          condition: "pr.merged == true && pr.title.startsWith('release-v')",
        },
      },
      async (span: Span) => {
        try {
          // 1.1 get the latest commit from default_branch (main)
          const headCommit = await tracer.startActiveSpan(
            "app.handler.pull_request.merged.release_automation.get_head_commit",
            {
              attributes: {
                functionality:
                  "get the latest commit from default_branch (main)",
                condition: "branch == main",
              },
            },
            async (span: Span) => {
              // https://octokit.github.io/rest.js/v18#git-get-commit
              const result = await extension.octokit.repos
                .getCommit({
                  repo: metadata.repo,
                  owner: metadata.owner,
                  ref: metadata.default_branch,
                })
                .then((res) => res.data);
              span.addEvent(JSON.stringify(result));
              span.end();
              return result;
            }
          );

          // 1.2 create a release tag when release_branch is merged
          await tracer.startActiveSpan(
            "app.handler.pull_request.merged.release_automation.create_release_tag",
            {
              attributes: {
                functionality:
                  "create a release tag when release_branch is merged",
                condition: "release_branch.merged == true",
              },
            },
            async (span: Span) => {
              // https://octokit.github.io/rest.js/v18#git-create-ref
              // https://docs.github.com/en/rest/git/tags?apiVersion=2022-11-28
              await extension.octokit.git.createRef({
                owner: metadata.owner,
                repo: metadata.repo,
                ref: `refs/tags/${tag}`,
                sha: headCommit.sha,
              });
              span.end();
            }
          );

          // 1.3 kick off the release build workflow
          const workflowRunUrl = await tracer.startActiveSpan(
            "app.handler.pull_request.merged.release_automation.trigger_release_build",
            {
              attributes: {
                functionality: "kick off the release build workflow",
              },
            },
            async (span: Span) => {
              // https://octokit.github.io/rest.js/v18#actions-create-workflow-dispatch
              const result = await extension.octokit.actions
                .createWorkflowDispatch({
                  owner: metadata.owner,
                  repo: metadata.repo,
                  workflow_id: prerelease ? "prerelease.yml" : "release.yml",
                  ref: metadata.default_branch,
                  inputs: {
                    tag: tag,
                  },
                })
                .then(() =>
                  // get latest workflow run metadata
                  tracer.startActiveSpan(
                    "app.handler.pull_request.merged.release_automation.trigger_release_build.get_workflow_run",
                    {
                      attributes: {
                        functionality: "get latest workflow run metadata",
                      },
                    },
                    async (span: Span) => {
                      // https://octokit.github.io/rest.js/v18#actions-list-workflow-runs
                      const result = extension.octokit.actions
                        .listWorkflowRuns({
                          owner: metadata.owner,
                          repo: metadata.repo,
                          workflow_id: prerelease
                            ? "prerelease.yml"
                            : "release.yml",
                          per_page: 1,
                        })
                        .then((res) => res.data.workflow_runs[0].html_url);
                      span.addEvent(JSON.stringify(result));
                      span.end();
                      return result;
                    }
                  )
                );
              span.addEvent(JSON.stringify(result));
              span.end();
              return result;
            }
          );

          // 1.4 audit event
          await tracer.startActiveSpan(
            "app.handler.pull_request.release_automation.merged.audit_event",
            { attributes: { functionality: "audit event" } },
            async (span: Span) => {
              const msg = `🌌 PR - [#${metadata.pull_request.number}: ${metadata.pull_request.title}](${metadata.pull_request.html_url}) associated with ${metadata.pull_request.ref} has been merged; created and pushed a new release tag ${tag}; release build is now kicked off! just chill, we are getting there 💪; workflow run: ${workflowRunUrl}.`;
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
