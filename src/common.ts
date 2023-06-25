import { Probot, ProbotOctokit, Context } from "probot";
import { TelegramClient } from "./telegram";

export { Handler, HandlerModule, Repository, Extension, Result };

interface Handler {
  (
    context: Context<any>,
    app: Probot,
    repo: Repository,
    extension: Extension
  ): Promise<Result>;
}

interface HandlerModule {
  name: string;
  config_key: string;
  handler: Handler;
}

type Extension = {
  octokit: InstanceType<typeof ProbotOctokit>;
  tg: TelegramClient;
};

type Repository = {
  owner: string;
  name: string;
};

type Result = {
  result: string;
  error?: string;
};
