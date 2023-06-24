import kv from "@vercel/kv";
import { Buffer } from "buffer";
import * as Duration from "iso8601-duration";
import { Context, Probot } from "probot";
import { v4 as uuidv4 } from "uuid";
import { TelegramClient } from "./telegram";

const Encode = (data: string): string =>
  // ensure utf-8 format
  decodeURIComponent(Buffer.from(data, "binary").toString("base64"));

export default (app: Probot) => {
  app.log("The app is loaded successfully!");

  // on receive push event
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

      const tg = new TelegramClient(context as unknown as Context);
      await tg.sendMsg(msg, [
        process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
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

  // on receive issue_closed event
  app.on("issues.closed", async (context: Context<"issues.closed">) => {
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
      },
    };

    app.log.info(
      `received an issues.closed event: ${JSON.stringify(metadata)}`
    );
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

        const tg = new TelegramClient(context as unknown as Context);
        await tg.sendMsg(msg, [
          process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
        ]);
      }
    }
  );

  // on receive star event
  app.on("star.created", async (context: Context<"star.created">) => {
    const payload = context.payload.repository;
    const actualStars = await kv.get<string>(`${payload.name}.stars`);
    if (!actualStars) {
      app.log.error("key does not exist");
      return;
    }

    if (payload.stargazers_count > Number.parseInt(actualStars)) {
      await kv.set(`${payload.name}.stars`, payload.stargazers_count);
      const msg = `⭐ Repo: ${payload.name} received a new star from [@${context.payload.sender.login}](${context.payload.sender.html_url})! Total stars: ${payload.stargazers_count}`;
      app.log.info(msg);

      const tg = new TelegramClient(context as unknown as Context);
      await tg.sendMsg(msg, [
        process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
      ]);
    }
  });

  // on receive pull_request.opened event
  app.on(
    "pull_request.opened",
    async (context: Context<"pull_request.opened">) => {
      const metadata = {
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
        `received a pull_request.opened event: ${JSON.stringify(metadata)}`
      );

      // case_#1: automatically assign assignee if not present
      // 1.1 assign pull_request author to be the default assignee
      // https://octokit.github.io/rest.js/v18#issues-add-assignees
      const author = metadata.pull_request.author.includes("bot")
        ? "daebot"
        : metadata.pull_request.author;
      await context.octokit.issues.addAssignees({
        owner: metadata.owner,
        repo: metadata.repo,
        issue_number: metadata.pull_request.number,
        assignees: [author],
      });

      // 1.2 audit event
      const msg = `👷 PR - [#${metadata.pull_request.number}](${metadata.pull_request.html_url}) is raised in ${metadata.repo}; assign @${author} as the default assignee`;

      app.log.info(msg);

      const tg = new TelegramClient(context as unknown as Context);
      await tg.sendMsg(msg, [
        process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
      ]);

      // case_#2: automatically assign label if not present, default label should align with "kind" as part of the pr title

      // 1.1 automatically add label(s) to pull_request
      const defaultLables = [
        "fix",
        "feat",
        "feature",
        "patch",
        "ci",
        "optimize",
        "chore",
        "refactor",
        "style",
        "doc",
        "docs",
      ];

      // https://octokit.github.io/rest.js/v18#issues-list-labels-on-issue
      const prOpenedLabels = await context.octokit.issues
        .listLabelsOnIssue({
          owner: metadata.owner,
          repo: metadata.repo,
          issue_number: metadata.pull_request.number,
        })
        .then((res) => res.data);

      if (prOpenedLabels.length == 0) {
        const labels = defaultLables
          .filter((label: string) =>
            metadata.pull_request.title.startsWith(label)
          )
          .map((item) => {
            if (item == "feat") item = "feature";
            if (item == "docs" || item == "doc") item = "documentation";
            return item;
          });

        if (labels.length > 0) {
          const msg = `🏷 PR - [#${metadata.pull_request.number}](${
            metadata.pull_request.html_url
          }) in ${metadata.repo} is missing labels; added ${JSON.stringify(
            labels
          )}`;

          // https://octokit.github.io/rest.js/v18#issues-add-labels
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
      }
    }
  );

  // on pull_request.synchronize event
  app.on(
    "pull_request.synchronize",
    async (context: Context<"pull_request.synchronize">) => {
      const metadata = {
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

      // case_#3: check if pr_branch is up-to-date, if not, merge remote HEAD branch to the pr branch
      // https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/keeping-your-pull-request-in-sync-with-the-base-branch

      // 1.1 get timestamps of the head commit from both the merge_base_branch and pr_branch
      const commits = await Promise.all([
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

      const [commits_diff, pr_commit] = commits;
      const status = commits_diff.data.status;
      const mbCommitterDate = commits_diff.data.merge_base_commit.commit
        .committer?.date as string;
      const prCommitterDate = pr_commit.data.commit.committer?.date as string;
      const lastPRCommiter = pr_commit.data.commit.committer?.name as string;

      // 1.2 compare timestamp, if mergeBaseDateAgeTimeout > pr_branch_date && status == diverged; then merge remote HEAD branch to the pr branch
      const maxDiff = Duration.parse(process.env.PR_MAX_AGE as string);

      const mergeBaseDateAgeTimeout = Duration.end(
        maxDiff,
        new Date(mbCommitterDate)
      );
      const prBranchDate = new Date(prCommitterDate);
      const exceedAgeTimeout =
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
        const msg = `🚗 PR [#${metadata.pull_request.number}](${metadata.pull_request.html_url}) is currently out-of-sync in ${metadata.repo}; automatically merge origin/${metadata.default_branch} to keep it up-to-date; url: ${metadata.pull_request.html_url}`;

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

  // on pull_request.merged event
  app.on(
    "pull_request.closed",
    async (context: Context<"pull_request.closed">) => {
      const metadata = {
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
          merged: context.payload.pull_request.merged,
        },
      };

      app.log.info(
        `received a pull_request.closed event: ${JSON.stringify(metadata)}`
      );

      if (metadata.pull_request.merged) {
        // 1.1 store pr metrics data to kv
        const key = `pr.merged.${metadata.repo}.${uuidv4().slice(0, 7)}.${
          metadata.pull_request.number
        }`;
        await kv.set(key, JSON.stringify(metadata));

        // 1.2 audit event
        const msg = `🚀 PR - [#${metadata.pull_request.number}](${metadata.pull_request.html_url}) in ${metadata.repo} has been merged into ${metadata.default_branch}; good job guys, let's keep it up`;

        app.log.info(msg);

        const tg = new TelegramClient(context as unknown as Context);
        await tg.sendMsg(msg, [
          process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
        ]);
      }

      // case_#2: create a release tag when release_branch is merged
      if (
        metadata.pull_request.merged &&
        metadata.pull_request.ref.startsWith("release-")
      ) {
        // 1.1 get the latest commit from default_branch (main)
        // https://octokit.github.io/rest.js/v18#git-get-commit
        const headCommit = await context.octokit.repos
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
        await context.octokit.git.createRef({
          owner: metadata.owner,
          repo: metadata.repo,
          ref: `refs/tags/${tag}`,
          sha: headCommit.sha,
        });

        // 1.3 kick off the release build workflow
        // https://octokit.github.io/rest.js/v18#actions-create-workflow-dispatch
        const workflowRunUrl = await context.octokit.actions
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
            context.octokit.actions
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

        const tg = new TelegramClient(context as unknown as Context);
        await tg.sendMsg(msg, [
          process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID as string,
        ]);
      }
    }
  );

  // on released
  app.on("release.released", async (context: Context<"release.released">) => {
    const metadata = {
      repo: context.payload.repository.name,
      owner: context.payload.organization?.login,
      default_branch: context.payload.repository.default_branch,
      release: {
        html_url: context.payload.release.html_url,
        author: context.payload.release.author.login,
        tag: context.payload.release.tag_name,
        prerelease: context.payload.release.prerelease,
        published_at: context.payload.release.published_at,
      },
    };

    app.log.info(
      `received a release.released event: ${JSON.stringify(metadata)}`
    );

    // 1.1 store release metrics data to kv
    const key = `released.${metadata.repo}.${uuidv4().slice(0, 7)}.${
      metadata.release.tag
    }`;
    await kv.set(key, JSON.stringify(metadata));

    // 1.2 audit event
    const msg = `🌠 ${metadata.repo} published a new release [${metadata.release.tag}](${metadata.release.html_url}); it's been a long journey, thank you all for contributing to and supporting the [@daeuniverse](https://github.com/daeuniverse) community!`;

    app.log.info(msg);

    const tg = new TelegramClient(context as unknown as Context);
    const {
      TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID,
      TELEGRAM_DAEUNIVERSE_CHANNEL_ID,
    } = process.env;

    await tg.sendMsg(msg, [
      TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID || "",
      TELEGRAM_DAEUNIVERSE_CHANNEL_ID || "",
    ]);
  });
};
