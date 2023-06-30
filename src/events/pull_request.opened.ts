import { Probot, Context } from "probot";
import {
  Handler,
  HandlerModule,
  Repository,
  Extension,
  Result,
} from "../common";

export = {
  name: "pull_request.opened",
  config_key: "pull_request.opened",
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
    },
  };

  app.log.info(
    `received a pull_request.opened event: ${JSON.stringify(metadata)}`
  );

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
    "fixture",
  ];

  const strictLabels = defaultLables.slice(0, -4);

  // case_#1: automatically assign assignee if not present
  try {
    // 1.1 assign pull_request author to be the default assignee
    // https://octokit.github.io/rest.js/v18#issues-add-assignees
    const author = metadata.pull_request.author.includes("bot")
      ? "daebot"
      : metadata.pull_request.author;
    await extension.octokit.issues.addAssignees({
      owner: metadata.owner,
      repo: metadata.repo,
      issue_number: metadata.pull_request.number,
      assignees: [author],
    });

    // 1.2 audit event
    const msg = `👷 PR - [#${metadata.pull_request.number}: ${metadata.pull_request.title}](${metadata.pull_request.html_url}) is raised in ${metadata.repo}; assign @${author} as the default assignee.`;

    app.log.info(msg);

    await extension.tg.sendMsg(msg, [
      process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
    ]);
  } catch (err: any) {
    return { result: "Ops something goes wrong.", error: err };
  }

  // case_#2: automatically assign label if not present, default label should align with "kind" as part of the pr title
  try {
    // 1.1 automatically add label(s) to pull_request
    // https://octokit.github.io/rest.js/v18#issues-list-labels-on-issue
    const prOpenedLabels = await extension.octokit.issues
      .listLabelsOnIssue({
        owner: metadata.owner,
        repo: metadata.repo,
        issue_number: metadata.pull_request.number,
      })
      .then((res) => res.data);

    if (prOpenedLabels.length == 0) {
      var labels = defaultLables
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
        )}.`;

        // check if "not-yet-tested" is eligible to be added
        if (
          strictLabels.filter((label) =>
            metadata.pull_request.title.startsWith(label)
          ).length > 0
        ) {
          // add "not-yet-tested label"
          labels = [...labels, "not-yet-tested"];

          if (["dae", "daed"].includes(metadata.repo)) {
            // request review from qa team
            // https://octokit.github.io/rest.js/v18#pulls-create-review-request
            await extension.octokit.rest.pulls.requestReviewers({
              owner: metadata.owner,
              repo: metadata.repo,
              pull_number: metadata.pull_request.number,
              team_reviewers: ["qa"],
            });
          }
        }

        // https://octokit.github.io/rest.js/v18#issues-add-labels
        await extension.octokit.issues.addLabels({
          owner: metadata.owner,
          repo: metadata.repo,
          issue_number: metadata.pull_request.number,
          labels: labels,
        });

        // 1.2 audit event
        app.log.info(msg);

        await extension.tg.sendMsg(msg, [
          process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
        ]);
      }
    }
  } catch (err: any) {
    return { result: "Ops something goes wrong.", error: err };
  }

  // case_#3: assign daebot as one of the reviewers
  try {
    if (
      defaultLables.filter((label: string) =>
        metadata.pull_request.title.startsWith(label)
      ).length > 0
    ) {
      // 1.1 assign daebot as one of the reviewers
      // https://octokit.github.io/rest.js/v18#pulls-request-reviewers
      await extension.octokit.pulls.requestReviewers({
        repo: metadata.repo,
        owner: metadata.owner,
        pull_number: metadata.pull_request.number,
        reviewers: ["dae-bot[bot]"],
      });
    }
  } catch (err: any) {
    return { result: "Ops something goes wrong.", error: err };
  }

  return { result: "ok!" };
}
