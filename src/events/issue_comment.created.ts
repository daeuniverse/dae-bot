import { Probot, Context } from "probot";
import {
  Handler,
  HandlerModule,
  Repository,
  Extension,
  Result,
} from "../common";
import { Buffer } from "buffer";

const Encode = (data: string): string =>
  // ensure utf-8 format
  decodeURIComponent(Buffer.from(data, "utf-8").toString("base64"));

export = {
  name: "issue_comment.created",
  config_key: "issue_comment.created",
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

  try {
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

      // 1.1.3 get current CHANGELOGS.md content
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

      // 1.1.4 replace placeHolder with new changelogs for the new release
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

${context.payload.issue.body.split("<!-- BEGIN CHANGELOGS -->")[1]}
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
      let msg = `🛸 Auto release process for ${metadata.repo} begins! Changelogs and release notes are generated by @daebot automatically. Ref: issue [#${metadata.issue.number}: ${metadata.issue.title}](${metadata.issue.html_url})`;
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
        labels: ["automated-pr", "release:auto"],
      });

      // 1.5 audit event
      msg = msg += `; PR [#${pr.number}: ${pr.title}](${pr.html_url})`;
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
