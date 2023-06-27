import { Octokit } from "octokit";
// Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Compare: https://docs.github.com/en/rest/reference/users#get-the-authenticated-user
const main = async () => {
  try {
    const {
      data: { login },
    } = await octokit.rest.users.getAuthenticated();
    console.log("Hello, %s", login);

    // create pull_request_review request
    // https://octokit.github.io/rest.js/v18#pulls-create-review-request
    await octokit.rest.pulls.requestReviewers({
      owner: "daeuniverse",
      repo: "dae",
      pull_number: 162,
      team_reviewers: ["qa"],
    });
  } catch (err: any) {
    console.log(err);
  }
};

main();
