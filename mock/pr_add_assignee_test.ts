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

    // add assignees
    // https://octokit.github.io/rest.js/v18#issues-add-assignees
    await octokit.rest.issues.addAssignees({
      owner: "daeuniverse",
      repo: "dae-1",
      issue_number: 3,
      assignees: ["daebot"],
    });
  } catch (err: any) {
    console.log(err);
  }
};

main();
