import kv from "@vercel/kv";
import { v4 as uuidv4 } from "uuid";
import { Probot, Context } from "probot";
import {
  Handler,
  HandlerModule,
  Repository,
  Extension,
  Result,
} from "../common";

export = {
  name: "release.published",
  config_key: "release.published",
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
    release: {
      html_url: context.payload.release.html_url,
      author: context.payload.release.author.login,
      tag: context.payload.release.tag_name,
      prerelease: context.payload.release.prerelease,
      published_at: context.payload.release.published_at,
    },
  };

  app.log.info(
    `received a release.released event: ${JSON.stringify(metadata)}`
  );

  try {
    // 1.1 store release metrics data to kv
    const key = `released.${metadata.repo}.${uuidv4().slice(0, 7)}.${
      metadata.release.tag
    }`;
    await kv.set(key, JSON.stringify(metadata));

    // 1.2 audit event
    const msg = `🌠 ${metadata.repo} published a new release [${metadata.release.tag}](${metadata.release.html_url}); it's been a long journey, thank you all for contributing to and supporting the [@daeuniverse](https://github.com/daeuniverse) community!`;

    app.log.info(msg);

    const {
      TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID,
      TELEGRAM_DAEUNIVERSE_CHANNEL_ID,
    } = process.env;

    await extension.tg.sendMsg(msg, [
      TELEGRAM_DAEUNIVERSE_AUDIT_CHANNEL_ID!,
      TELEGRAM_DAEUNIVERSE_CHANNEL_ID!,
    ]);
  } catch (err) {
    return { result: "Ops something goes wrong.", error: JSON.stringify(err) };
  }

  return { result: "ok!" };
}
