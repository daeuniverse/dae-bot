import { HandlerModule } from "./common";
import StarCreateHandler from "./events/star.created";
import ReleaseHandler from "./events/release.released";
import PullRequestOpenHandler from "./events/pull_request.opened";
import PullRequestCloseHandler from "./events/pull_request.closed";
import PullRequestSynchronizeHandler from "./events/pull_request.syncronize";
import IssueCloseHandler from "./events/issues.closed";
import IssueOpenHandler from "./events/issues.opened";

export interface Configuration {
  app_name: string;
}

export const Handlers: HandlerModule[] = [
  StarCreateHandler,
  ReleaseHandler,
  PullRequestOpenHandler,
  PullRequestCloseHandler,
  PullRequestSynchronizeHandler,
  IssueCloseHandler,
  IssueOpenHandler,
];

export const AppConfig: Configuration = {
  app_name: process.env.APP_NAME!,
};
