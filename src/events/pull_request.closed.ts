import kv from "@vercel/kv";
import { v4 as uuidv4 } from "uuid";
import { Probot, Context } from "probot";
import {
  Handler,
  HandlerModule,
  Repository,
  Extension,
  Result,
} from "../common";

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

  app.log.info(
    `received a pull_request.closed event: ${JSON.stringify(metadata)}`
  );

  try {
    // case_#1: store pr metrics data to kv when closed
    if (metadata.pull_request.merged) {
      // 1.1 store pr metrics data to kv
      const key = `pr.merged.${metadata.repo}.${uuidv4().slice(0, 7)}.${
        metadata.pull_request.number
      }`;
      await kv.set(key, JSON.stringify(metadata));

      // 1.2 audit event
      const msg = `🚀 PR - [#${metadata.pull_request.number}](${metadata.pull_request.html_url}) in ${metadata.repo} has been merged into ${metadata.default_branch}; good job guys, let's keep it up`;

      app.log.info(msg);

      await extension.tg.sendMsg(msg, [
        process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
      ]);
    }

    // case_#2: create a release tag when release_branch is merged
    if (
      metadata.pull_request.merged &&
      metadata.pull_request.ref.startsWith("release-")
    ) {
      // 1.1 get the latest commit from default_branch (main)
      // https://octokit.github.io/rest.js/v18#git-get-commit
      const headCommit = await extension.octokit.repos
        .getCommit({
          repo: metadata.repo,
          owner: metadata.owner,
          ref: metadata.default_branch,
        })
        .then((res) => res.data);

      // 1.2 create a release tag when release_branch is merged
      // https://octokit.github.io/rest.js/v18#git-create-ref
      // https://docs.github.com/en/rest/git/tags?apiVersion=2022-11-28
      const tag = metadata.pull_request.ref.split("-")[1];
      const prerelease = tag.includes("rc") || tag.includes("p*");
      await extension.octokit.git.createRef({
        owner: metadata.owner,
        repo: metadata.repo,
        ref: `refs/tags/${tag}`,
        sha: headCommit.sha,
      });

      // 1.3 kick off the release build workflow
      // https://octokit.github.io/rest.js/v18#actions-create-workflow-dispatch
      const workflowRunUrl = await extension.octokit.actions
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
          // https://octokit.github.io/rest.js/v18#actions-list-workflow-runs
          extension.octokit.actions
            .listWorkflowRuns({
              owner: metadata.owner,
              repo: metadata.repo,
              workflow_id: prerelease ? "prerelease.yml" : "release.yml",
              per_page: 1,
            })
            .then((res) => res.data.workflow_runs[0].html_url)
        );

      // 1.4 audit event
      const msg = `🌌 PR - [#${metadata.pull_request.number}](${metadata.pull_request.html_url}) associated with ${metadata.pull_request.ref} has been merged; created and pushed a new release tag ${tag}; release build is now kicked off! just chill, we are getting there 💪; workflow run: ${workflowRunUrl}`;

      app.log.info(msg);

      await extension.tg.sendMsg(msg, [
        process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
      ]);
    }
  } catch (err) {
    return { result: "Ops something goes wrong.", error: JSON.stringify(err) };
  }

  return { result: "ok!" };
}
