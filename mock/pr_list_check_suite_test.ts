import * as fs from "fs";
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
    const data = await octokit.rest.checks.listForRef({
      repo: "daed-1",
      owner: "daeuniverse",
      ref: "sync-upstream",
    }).then(res => res.data);
    fs.writeFile(
      "checks.list_check_suites.json",
      JSON.stringify(data),
      (err) => {
        if (err) {
          return console.error(err);
        }
        console.log("File created!");
      }
    );
  } catch (err: any) {
    console.log(err);
  }
};

main();
