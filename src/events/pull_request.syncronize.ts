import * as Duration from "iso8601-duration";
import { Probot, Context } from "probot";
import {
  Handler,
  HandlerModule,
  Repository,
  Extension,
  Result,
} from "../common";

export = {
  name: "pull_request.synchronize",
  config_key: "pull_request.synchronize",
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
    `received a pull_request.synchronize event: ${JSON.stringify(metadata)}`
  );

  try {
    // case_#1: check if pr_branch is up-to-date, if not, merge remote HEAD branch to the pr branch
    // https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/keeping-your-pull-request-in-sync-with-the-base-branch

    // 1.1 get timestamps of the head commit from both the merge_base_branch and pr_branch
    const commits = await Promise.all([
      // 1.1.1 check if merge_base_branch and pr_branch are diverged
      // https://octokit.github.io/rest.js/v18#repos-compare-commits
      extension.octokit.repos.compareCommits({
        owner: metadata.owner,
        repo: metadata.repo,
        head: metadata.pull_request.ref,
        base: metadata.default_branch,
      }),
      // 1.1.2 get timestamp from head commit of the pr_branch
      // https://octokit.github.io/rest.js/v18#git-get-commit
      extension.octokit.repos.getCommit({
        repo: metadata.repo,
        owner: metadata.owner,
        ref: metadata.pull_request.ref,
      }),
    ]);

    const [commits_diff, pr_commit] = commits;
    const status = commits_diff.data.status;
    const mbCommitterDate = commits_diff.data.merge_base_commit.commit.committer
      ?.date as string;
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
      const msg = `🚗 PR [#${metadata.pull_request.number}: ${metadata.pull_request.title}](${metadata.pull_request.html_url}) is currently out-of-sync in ${metadata.repo}; automatically merge origin/${metadata.default_branch} to keep it up-to-date; url: ${metadata.pull_request.html_url}`;

      // 1.3 write a comment to pr_branch if it is out-of-sync
      // https://octokit.github.io/rest.js/v18#pulls-create-review-comment
      await extension.octokit.issues.createComment({
        owner: metadata.owner,
        repo: metadata.repo,
        issue_number: metadata.pull_request.number,
        body: `❌ Your branch is currently out-of-sync to ${metadata.default_branch}. No worry, I will fix it for you.`,
      });

      // 1.4 merge head branch into pr_branch
      // https://octokit.github.io/rest.js/v18#repos-merge
      await extension.octokit.repos.merge({
        owner: metadata.owner,
        repo: metadata.repo,
        base: metadata.pull_request.ref,
        head: metadata.default_branch,
      });

      // 1.5 audit event
      app.log.info(msg);

      await extension.tg.sendMsg(msg, [
        process.env.TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
      ]);
    }
  } catch (err: any) {
    return { result: "Ops something goes wrong.", error: err };
  }

  return { result: "ok!" };
}
