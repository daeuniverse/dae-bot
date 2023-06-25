import { Buffer } from "buffer";
import { Context, Probot } from "probot";
import { TelegramClient } from "./telegram";
import { Run } from "./runner";

const Encode = (data: string): string =>
  // ensure utf-8 format
  decodeURIComponent(Buffer.from(data, "binary").toString("base64"));

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
  app.on(
    "issue_comment.created",
    async (context: Context<"issue_comment.created">) => {
      const metadata = {
        repo: context.payload.repository.name,
        owner: context.payload.organization?.login as string,
        author: context.payload.sender.login,
        default_branch: context.payload.repository.default_branch,
        issue: {
          number: context.payload.issue.number,
          title: context.payload.issue.title,
          author: context.payload.issue.user.login,
          html_url: context.payload.issue.html_url,
          state: context.payload.issue.state,
        },
        comment: {
          body: context.payload.comment.body,
          user: context.payload.comment.user.login,
          html_url: context.payload.comment.html_url,
          created_at: context.payload.comment.created_at,
        },
      };

      app.log.info(
        `received an issue_comment.created event: ${JSON.stringify(metadata)}`
      );

      // case_#1: dump release changelogs to release branch (e.g. release-v0.1.0)
      // 1.1 patch new changelogs into CHANGELOGS.md with regex
      if (
        ["dae", "daed"].includes(metadata.repo) &&
        metadata.comment.body.startsWith("@daebot") &&
        metadata.comment.body.includes("release-") &&
        metadata.issue.state == "closed" &&
        ["yqlbu", "kunish", "mzz2017"].includes(metadata.comment.user)
      ) {
        const tocPlaceHolder = "<!-- BEGIN NEW TOC ENTRY -->";
        const contentPlaceHolder = "<!-- BEGIN NEW CHANGELOGS -->";
        const releaseDate = metadata.comment.created_at
          .split("T")[0]
          .split("-")
          .join("/");

        const useRegex = (input: string): string => {
          try {
            let rcMatch = /v[0-9]+\.[0-9]+\.[0-9]+rc[0-9]+/;
            let pMatch = /v[0-9]+\.[0-9]+\.[0-9]+p[0-9]+/;
            let rmatch = /v[0-9]+\.[0-9]+\.[0-9]/;
            if (rcMatch.test(input)) {
              return input.match(rcMatch)![0];
            } else if (pMatch.test(input)) {
              return input.match(pMatch)![0];
            } else {
              return input.match(rmatch)![0];
            }
          } catch (err) {
            console.log(err);
            return "";
          }
        };

        const releaseTag = useRegex(metadata.comment.body);
        if (!releaseTag) return;
        const releaseMetadata = {
          tag: releaseTag,
          prerelease: releaseTag.includes("rc"),
          mdRefLink: releaseTag?.split(".").join(""),
          branch: `release-${releaseTag}`,
          date: releaseDate,
        };
        app.log.info(JSON.stringify(releaseMetadata));

        // 1.1 get the latest commit from default_branch (main)
        // https://octokit.github.io/rest.js/v18#git-get-commit
        const headCommit = await context.octokit.repos
          .getCommit({
            repo: metadata.repo,
            owner: metadata.owner,
            ref: metadata.default_branch,
          })
          .then((res) => res.data);

        // 1.1.2 create a release_branch based on the default_branch (main)
        // https://octokit.github.io/rest.js/v18#git-create-ref
        // https://docs.github.com/en/rest/git/refs?apiVersion=2022-11-28#create-a-reference
        await context.octokit.git.createRef({
          owner: metadata.owner,
          repo: metadata.repo,
          ref: `refs/heads/${releaseMetadata.branch}`,
          sha: headCommit.sha,
        });

        // 1.1.2 get current CHANGELOGS.md content
        // https://octokit.github.io/rest.js/v18#repos-get-content
        const originalCopy = await context.octokit.repos
          .getContent({
            owner: metadata.owner,
            repo: metadata.repo,
            path: "CHANGELOGS.md",
            ref: releaseMetadata.branch,
          })
          .then((res: any) => ({
            content: Buffer.from(res.data.content, "base64").toString("utf-8"),
            sha: res.data.sha,
          }));

        // 1.1.3 replace placeHolder with new changelogs for the new release
        var changelogs = originalCopy.content.replace(
          tocPlaceHolder,
          `
${tocPlaceHolder}
- [${releaseMetadata.tag} ${
            releaseMetadata.prerelease ? "(Pre-release)" : "(Latest)"
          }](#${releaseMetadata.mdRefLink}${
            releaseMetadata.prerelease ? "-pre-release" : "-latest"
          })
`.trim()
        );

        changelogs = changelogs.replace(
          contentPlaceHolder,
          `
${contentPlaceHolder}

### ${releaseMetadata.tag} ${
            releaseMetadata.prerelease ? "(Pre-release)" : "(Latest)"
          }

> Release date: ${releaseDate}

${context.payload.issue.body!.split("<!-- BEGIN CHANGELOGS -->")[1]}
`.trim()
        );

        // 1.2 update CHANGELOGS.md in the release_branch
        // https://octokit.github.io/rest.js/v18#repos-create-or-update-file-contents
        // https://stackoverflow.com/a/71130304
        await context.octokit.repos.createOrUpdateFileContents({
          owner: metadata.owner,
          repo: metadata.repo,
          path: "CHANGELOGS.md",
          branch: releaseMetadata.branch,
          sha: originalCopy.sha,
          message: `ci: generate changelogs for ${releaseMetadata.branch}`,
          content: Encode(changelogs),
          committer: {
            name: "daebot",
            email: "dae@v2raya.org",
          },
          author: {
            name: "daebot",
            email: "dae@v2raya.org",
          },
        });

        // 1.3 create a pull_request head_branch (release-v0.1.0) -> base_branch (origin/main)
        // https://octokit.github.io/rest.js/v18#pulls-create
        var msg = `🛸 Auto release process begins! Changelogs and release notes are generated by @daebot automatically. Ref: issue [#${metadata.issue.number}](${metadata.issue.html_url})`;
        const pr = await context.octokit.pulls
          .create({
            owner: metadata.owner,
            repo: metadata.repo,
            head: releaseMetadata.branch,
            base: metadata.default_branch,
            title: `ci(release): draft release ${releaseMetadata.tag}`,
            body: msg,
          })
          .then((res) => res.data);

        // 1.4 add labels
        // https://octokit.github.io/rest.js/v18#issues-add-labels
        await context.octokit.issues.addLabels({
          owner: metadata.owner,
          repo: metadata.repo,
          issue_number: pr.number,
          labels: ["automated-pr", "release"],
        });

        // 1.5 audit event
        msg = msg += `; PR [#${pr.number}](${pr.html_url})`;
        app.log.info(msg);

        const tg = new TelegramClient();
        await tg.sendMsg(msg, [
          process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
        ]);
      }
    }
  );

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
