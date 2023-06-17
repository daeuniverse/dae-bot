import { Context, Probot } from "probot";
import { TelegramClient } from "./telegram";
import kv from "@vercel/kv";

export default (app: Probot) => {
  app.log("The app is loaded successfully!");

  // on receive push event
  app.on("push", async (context: Context<"push">) => {
    var head_commit = JSON.stringify(context.payload?.head_commit);
    app.log.info(`received a push event: ${head_commit}`);

    app.log.info(context.payload.ref);
    app.log.info(context.payload.repository.name);

    // on daed.sync-upstream event
    if (
      context.payload.ref == "refs/heads/test-webhook" &&
      ["dae", "dae-wing"].includes(context.payload.repository.name)
    ) {
      // 1.1 construct metadata from payload
      var metadata = {
        repo: context.payload.repository.name,
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
          repo: "daed",
          workflow_id: "sync-upstream-source.yml",
          ref: "main",
          inputs: {
            "wing-head": "HEAD",
            "wing-sync-message": "chore: upgrade dae-wing",
          },
        })
        .then(() => {
          return context.octokit.actions
            .listWorkflowRuns({
              owner: metadata.owner,
              repo: "daed",
              workflow_id: "sync-upstream-source.yml",
              per_page: 1,
            })
            .then((res) => res.data.workflow_runs[0].html_url);
        });

      // 1.3 get latest workflow run metadata
      // https://octokit.github.io/rest.js/v18#actions-list-workflow-runs
      // https://docs.github.com/en/rest/actions/workflows?apiVersion=2022-11-28#create-a-workflow-dispatch-event

      // 1.4 audit event
      const msg = `🏗️ a new commit was pushed to ${metadata.repo} (${metadata.default_branch}); dispatched sync-upstream-source workflow for daed; url: ${latestRunUrl}`;
      app.log.info(msg);

      const tg = new TelegramClient(context as unknown as Context);
      await tg.sendMsg(msg, [
        process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
      ]);
    }
  });

  // on receive issue event
  app.on("issues.opened", async (context: Context<"issues.opened">) => {
    app.log.info(`received an issue event: ${context.payload.issue}`);
    const comment = context.issue({
      body: "Thanks for opening this issue!",
    });
    await context.octokit.issues.createComment(comment);
  });

  // on receive star event
  app.on("star.created", async (context: Context<"star.created">) => {
    const payload = context.payload.repository;
    const actualStars = await kv.get(`${payload.name}.stars`);
    if (!actualStars) {
      app.log.error("key does not exist");
      return;
    }
    if (payload.stargazers_count > actualStars) {
      await kv.set(`${payload.name}.stars`, payload.stargazers_count);
      const msg = `⭐ Repo: ${payload.name} received a new star from [@${context.payload.sender.login}](${context.payload.sender.html_url})! Total stars: ${payload.stargazers_count}`;
      app.log.info(msg);

      const tg = new TelegramClient(context as unknown as Context);
      await tg.sendMsg(msg, [
        process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
      ]);
    }
  });
};
