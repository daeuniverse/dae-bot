import { HandlerModule } from "./common";
import StarCreateHandler from "./events/star.created";
import PullRequestOpenHandler from "./events/pull_request.opened";
import PullRequestCloseHandler from "./events/pull_request.closed";

export interface Configuration {
  app_name: string;
}

export const Handlers: HandlerModule[] = [
  StarCreateHandler,
  PullRequestOpenHandler,
  PullRequestCloseHandler,
];

export const AppConfig: Configuration = {
  app_name: process.env.APP_NAME!,
};
