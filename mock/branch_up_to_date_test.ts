import { Octokit } from "octokit";
// Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Compare: https://docs.github.com/en/rest/reference/users#get-the-authenticated-user
const main = async () => {
  try {
    const {
      data: { login },
    } = await octokit.rest.users.getAuthenticated();
    console.log(login);

    // list all open pull_request
    // https://octokit.github.io/rest.js/v18#pulls-list
    const data = await octokit.rest.pulls
      .list({
        owner: "daeuniverse",
        repo: "daed",
        state: "open",
        sort: "updated",
        direction: "desc",
        per_page: 10,
      })
      .then((res) =>
        res.data.map((pr) => ({
          ref: pr.head.ref,
          sha: pr.head.sha,
          title: pr.title,
          author: pr.user!.login,
          number: pr.number,
          updated_at: pr.updated_at,
          html_url: pr.html_url,
        }))
      );
    console.log(data);
  } catch (err: any) {
    console.log(err);
  }
};

main();
