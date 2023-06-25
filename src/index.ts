import { Context, Probot } from "probot";
import { TelegramClient } from "./telegram";
import { Run } from "./runner";

export default (app: Probot) => {
  app.log(`${process.env.BOT_NAME} app is loaded successfully!`);

  // on receive push event
  app.log;
  app.on("push", async (context: Context<"push">) => {
    const head_commit = JSON.stringify(context.payload?.head_commit);
    app.log.info(`received a push event: ${head_commit}`);

    app.log.info(context.payload.ref);
    app.log.info(context.payload.repository.name);

    // case_#1 trigger daed.sync-upstream workflow if new changes are pushed to dae-wing origin/main
    const daedSyncBranch = "sync-upstream";
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
      const latestRunUrl = await context.octokit.actions
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
          context.octokit.actions
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

      const tg = new TelegramClient();
      await tg.sendMsg(msg, [
        process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
      ]);
    }

    // case_#3 create a pull_request when branch sync-upstream is created and pushed to daed (remote)
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

      const tg = new TelegramClient();
      await tg.sendMsg(msg, [
        process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
      ]);
    }
  });

  // on receive issue event
  app.on("issues.opened", async (context: Context<any>) => {
    const result = await Run(context, app, "issues.opened");
    app.log.info(JSON.stringify(result));
  });

  // on receive issue_closed event
  app.on("issues.closed", async (context: Context<any>) => {
    const result = await Run(context, app, "issues.closed");
    app.log.info(JSON.stringify(result));
  });

  // on receive issue_comment.created event
  app.on("issue_comment.created", async (context: Context<any>) => {
    const result = await Run(context, app, "issue_comment.created");
    app.log.info(JSON.stringify(result));
  });

  // on receive star event
  app.on("star.created", async (context: any) => {
    const result = await Run(context, app, "star.created");
    app.log.info(JSON.stringify(result));
  });

  // on receive pull_request.opened event
  app.on("pull_request.opened", async (context: Context<any>) => {
    const result = await Run(context, app, "pull_request.opened");
    app.log.info(JSON.stringify(result));
  });

  // on pull_request.synchronize event
  app.on("pull_request.synchronize", async (context: Context<any>) => {
    const result = await Run(context, app, "pull_request.synchronize");
    app.log.info(JSON.stringify(result));
  });

  // on pull_request.closed event
  app.on("pull_request.closed", async (context: Context<any>) => {
    const result = await Run(context, app, "pull_request.closed");
    app.log.info(JSON.stringify(result));
  });

  // on released
  app.on("release.released", async (context: Context<any>) => {
    const result = await Run(context, app, "release.released");
    app.log.info(JSON.stringify(result));
  });
};
