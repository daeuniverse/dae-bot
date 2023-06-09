import { Probot } from "probot";

export default (app: Probot) => {
  app.on("push", async (context) => {
    console.debug(context)
    console.debug(`push event handler received a new commmit: ${context.payload.ref}`);

    if (context.payload.ref === `refs/heads/${context.payload.repository.default_branch}`) {
      console.debug(`commit received from main branch: ${context.payload.ref}`);
    }
  })
};
