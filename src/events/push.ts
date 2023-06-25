import { Probot, Context } from "probot";
import {
  Handler,
  HandlerModule,
  Repository,
  Extension,
  Result,
} from "../common";

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
  app.log.info(
    `received a push event: ${head_commit}; ref: ${context.payload.ref}; repo: ${repo.name}`
  );

  const daedSyncBranch = "sync-upstream";

  try {
    // case_#1 trigger daed.sync-upstream workflow if new changes are pushed to dae-wing origin/main
    if (
      context.payload.ref == "refs/heads/main" &&
      context.payload.repository.name == "dae-wing"
    ) {
      // 1.1 construct metadata from payload
      const metadata = {
        repo: "daed",
        owner: context.payload.organization?.login as string,
        author: context.payload.sender.login,
        default_branch: context.payload.repository.default_branch,
        html_url: context.payload.repository.html_url,
        head_commit: head_commit,
      };

      // 1.2 trigger daed sync-upstream-source workflow
      // https://octokit.github.io/rest.js/v18#actions-create-workflow-dispatch
      // https://docs.github.com/en/rest/actions/workflows?apiVersion=2022-11-28#create-a-workflow-dispatch-event
      const latestRunUrl = await extension.octokit.actions
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

      // 1.4 audit event
      const msg = `🏗️ a new commit was pushed to dae-wing (${metadata.default_branch}); dispatched ${daedSyncBranch} workflow for daed; url: ${latestRunUrl}`;
      app.log.info(msg);

      await extension.tg.sendMsg(msg, [
        process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
      ]);
    }
  } catch (err) {
    return { result: "Ops something goes wrong.", error: JSON.stringify(err) };
  }

  try {
    // case_#2 create a pull_request when branch sync-upstream is created and pushed to daed (remote)
    if (
      context.payload.before == "0000000000000000000000000000000000000000" &&
      context.payload.repository.name == "daed" &&
      context.payload.ref.split("/")[2] == daedSyncBranch
    ) {
      // 1.1 construct metadata from payload
      const metadata = {
        repo: context.payload.repository.name,
        owner: context.payload.organization?.login as string,
        author: context.payload.sender.login,
        default_branch: context.payload.repository.default_branch,
        head_branch: context.payload.ref.split("/")[2],
      };
      // 1.2 fetch latest sync-upstream workflow run
      // https://octokit.github.io/rest.js/v18#actions-list-workflow-runs
      const latestWorkflowRun = await context.octokit.actions
        .listWorkflowRuns({
          owner: metadata.owner,
          repo: metadata.repo,
          workflow_id: "sync-upstream.yml",
          per_page: 1,
        })
        .then((res) => res.data.workflow_runs[0]);

      // https://github.com/daeuniverse/daed/actions/runs/
      // 1.3 create a pull_request with head (sync-upstream) and base (main) for daed
      // https://octokit.github.io/rest.js/v18#pulls-create
      const msg = `⏳ daed (origin/${metadata.default_branch}) is currently out-of-sync to dae-wing (origin/${metadata.default_branch}); changes are proposed by @daebot in actions - ${latestWorkflowRun.html_url}`;

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
          // https://octokit.github.io/rest.js/v18#issues-add-labels
          context.octokit.issues.addLabels({
            owner: metadata.owner,
            repo: metadata.repo,
            issue_number: res.data.number,
            labels: ["automated-pr"],
          });

          // 1.5 add assignee
          // https://octokit.github.io/rest.js/v18#issues-add-assignees
          context.octokit.issues.addAssignees({
            owner: metadata.owner,
            repo: metadata.repo,
            issue_number: res.data.number,
            assignees: ["daebot"],
          });
        });

      // 1.6 audit event
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
