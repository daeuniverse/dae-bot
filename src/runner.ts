import { Repository } from "./common";
import { Handlers } from "./config";
import { Context, Probot } from "probot";
import { TelegramClient } from "./telegram";

export const Run = async (
  context: Context<any>,
  app: Probot,
  event: string
) => {
  const module = Handlers.filter((item) => item.config_key == event)[0];
  const extension = {
    octokit: context.octokit,
    tg: new TelegramClient(),
  };

  const repo: Repository = {
    name: context.payload.repository.name,
    owner: context.payload.organization?.login as string,
  };

  return await module.handler(context, app, repo, extension);
};
