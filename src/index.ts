import { Context, Probot } from "probot";
import { TelegramClient } from "./telegram";
import * as Duration from "iso8601-duration";
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
      context.payload.ref == "refs/heads/main" &&
      context.payload.repository.name == "dae-wing"
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
          ref: metadata.default_branch,
          inputs: {
            "wing-head": metadata.default_branch,
            "pr-base-branch": metadata.default_branch,
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

  app.on(
    "pull_request.opened",
    async (context: Context<"pull_request.opened">) => {
      var metadata = {
        repo: context.payload.repository.name,
        owner: context.payload.organization?.login as string,
        default_branch: context.payload.repository.default_branch,
        html_url: context.payload.repository.html_url,
        pull_request: {
          ref: context.payload.pull_request.head.ref,
          title: context.payload.pull_request.title,
          author: context.payload.pull_request.user.login,
          number: context.payload.pull_request.number,
          updated_at: context.payload.pull_request.updated_at,
          html_url: context.payload.pull_request.html_url,
        },
      };

      app.log.info(
        `received a pull_request.synchronize event: ${JSON.stringify(metadata)}`
      );

      var msg = "";

      // case_#1: automatically assign label if not present, default label should align with "kind" as part of the pr title

      // 1.1 automatically add label(s) to pull_request
      // https://octokit.github.io/rest.js/v18#issues-add-labels
      const defaultLables = [
        "fix",
        "feat",
        "feature",
        "patch",
        "ci",
        "optimize",
        "chore",
      ];
      var labels = defaultLables
        .filter((label: string) => metadata.pull_request.title.includes(label))
        .map((item) => {
          if (item == "feat") item = "feature";
          return item;
        });

      if (labels.length > 0) {
        msg = `🏷 PR - [#${metadata.pull_request.number}](${
          metadata.pull_request.html_url
        }) in ${metadata.repo} is missing labels; added ${JSON.stringify(
          labels
        )}`;

        await context.octokit.issues.addLabels({
          owner: metadata.owner,
          repo: metadata.repo,
          issue_number: metadata.pull_request.number,
          labels: labels,
        });

        // 1.2 audit event
        app.log.info(msg);

        const tg = new TelegramClient(context as unknown as Context);
        await tg.sendMsg(msg, [
          process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
        ]);
      }

      // case_#2: automatically assign assignee if not present
      // 1.1 assign pull_request author to be the default assignee
      await context.octokit.issues.addAssignees({
        owner: metadata.owner,
        repo: metadata.repo,
        issue_number: metadata.pull_request.number,
        assignees: [metadata.pull_request.author],
      });

      msg = `👷 PR - [#${metadata.pull_request.number}](${metadata.pull_request.html_url}) in ${metadata.repo} is missing assignees; assign @${metadata.pull_request.author} as the default assignee`;

      app.log.info(msg);

      // 1.2 audit event
      const tg = new TelegramClient(context as unknown as Context);
      await tg.sendMsg(msg, [
        process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
      ]);
    }
  );

  // on pull_request.synchronize event
  app.on(
    "pull_request.synchronize",
    async (context: Context<"pull_request.synchronize">) => {
      var metadata = {
        repo: context.payload.repository.name,
        owner: context.payload.organization?.login as string,
        default_branch: context.payload.repository.default_branch,
        html_url: context.payload.repository.html_url,
        pull_request: {
          ref: context.payload.pull_request.head.ref,
          author: context.payload.pull_request.user.login,
          number: context.payload.pull_request.number,
          updated_at: context.payload.pull_request.updated_at,
          html_url: context.payload.pull_request.html_url,
        },
      };

      app.log.info(
        `received a pull_request.synchronize event: ${JSON.stringify(metadata)}`
      );

      var msg = "";

      // TODO:
      // case_#1: check assignee is present, if not set as pr author

      // case_#3: check if pr_branch is up-to-date, if not, merge remote HEAD branch to the pr branch
      // https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/keeping-your-pull-request-in-sync-with-the-base-branch

      // 1.1 get timestamps of the head commit from both the merge_base_branch and pr_branch
      var commits = await Promise.all([
        // 1.1.1 check if merge_base_branch and pr_branch are diverged
        // https://octokit.github.io/rest.js/v18#repos-compare-commits
        context.octokit.repos.compareCommits({
          owner: metadata.owner,
          repo: metadata.repo,
          head: metadata.pull_request.ref,
          base: metadata.default_branch,
        }),
        // 1.1.2 get timestamp from head commit of the pr_branch
        // https://octokit.github.io/rest.js/v18#git-get-commit
        context.octokit.repos.getCommit({
          repo: metadata.repo,
          owner: metadata.owner,
          ref: metadata.pull_request.ref,
        }),
      ]);

      var [commits_diff, pr_commit] = commits;
      var status = commits_diff.data.status;
      var mbCommitterDate = commits_diff.data.merge_base_commit.commit.committer
        ?.date as string;
      var prCommitterDate = pr_commit.data.commit.committer?.date as string;
      var lastPRCommiter = pr_commit.data.commit.committer?.name as string;

      // 1.2 compare timestamp, if mergeBaseDateAgeTimeout > pr_branch_date && status == diverged; then merge remote HEAD branch to the pr branch
      const maxDiff = Duration.parse(process.env.PR_MAX_AGE as string);

      var mergeBaseDateAgeTimeout = Duration.end(
        maxDiff,
        new Date(mbCommitterDate)
      );
      var prBranchDate = new Date(prCommitterDate);
      var exceedAgeTimeout =
        mergeBaseDateAgeTimeout > prBranchDate && status == "ahead";

      app.log.info(
        JSON.stringify({
          status,
          exceedAgeTimeout,
          lastPRCommiter,
          mergeBaseDateAgeTimeout,
          prBranchDate,
        })
      );

      if (
        !exceedAgeTimeout &&
        lastPRCommiter != "GitHub" &&
        status == "diverged"
      ) {
        msg = `🚗 PR [#${metadata.pull_request.number}](${metadata.pull_request.html_url}) is currently out-of-sync in ${metadata.repo}; automatically merge origin/${metadata.default_branch} to keep it up-to-date; url: ${metadata.pull_request.html_url}`;

        // 1.3 write a comment to pr_branch if it is out-of-sync
        // https://octokit.github.io/rest.js/v18#pulls-create-review-comment
        await context.octokit.issues.createComment({
          owner: metadata.owner,
          repo: metadata.repo,
          issue_number: metadata.pull_request.number,
          body: `❌ Your branch is currently out-of-sync to ${metadata.default_branch}. No worry, I will fix it for you.`,
        });

        // 1.4 merge head branch into pr_branch
        // https://octokit.github.io/rest.js/v18#repos-merge
        await context.octokit.repos.merge({
          owner: metadata.owner,
          repo: metadata.repo,
          base: metadata.pull_request.ref,
          head: metadata.default_branch,
        });

        // 1.5 audit event
        app.log.info(msg);

        const tg = new TelegramClient(context as unknown as Context);
        await tg.sendMsg(msg, [
          process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
        ]);
      }
    }
  );
};
