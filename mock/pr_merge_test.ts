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
    // https://octokit.github.io/rest.js/v18#pulls-merge
    await octokit.rest.pulls.merge({
      repo: "dae-wing",
      owner: "daeuniverse",
      pull_number: 64,
      merge_method: "squash",
    });
  } catch (err: any) {
    console.log(err);
  }
};

main();
