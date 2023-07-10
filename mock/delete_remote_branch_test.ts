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

    // delete an existing remote branch
    // https://octokit.github.io/rest.js/v18#git-delete-ref
    // https://docs.github.com/en/rest/git#delete-a-reference
    await octokit.rest.git.deleteRef({
      owner: "daeuniverse",
      repo: "daed-1",
      ref: `heads/sync-upstream`,
    });
  } catch (err: any) {
    console.log(err);
  }
};

main();
