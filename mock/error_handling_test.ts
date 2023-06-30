import { Octokit } from "octokit";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import opentelemetry, { Span, SpanStatusCode } from "@opentelemetry/api";
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "basic-tracer",
  }),
});
const defaultSpanProcessor = new SimpleSpanProcessor(
  new OTLPTraceExporter({
    url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
  })
);

provider.addSpanProcessor(defaultSpanProcessor);
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
/**
 * Initialize the OpenTelemetry APIs to use the BasicTracerProvider bindings.
 *
 * This registers the tracer provider with the OpenTelemetry API as the global
 * tracer provider. This means when you call API methods like
 * `opentelemetry.trace.getTracer`, they will use this tracer provider. If you
 * do not register a global tracer provider, instrumentation which calls these
 * methods will receive no-op implementations.
 */
provider.register();

export const handler = async () => {
  const tracer = opentelemetry.trace.getTracer("basic-tracer");
  await tracer.startActiveSpan(
    "app.test.error_handling",
    async (span: Span) => {
      try {
        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const result = await octokit.rest.pulls.listReviews({
          owner: "daeuniverse",
          repo: "da",
          pull_number: 162,
        });
        span.addEvent(JSON.stringify(result));
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err: any) {
        console.log(err);
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR });
      }

      span.end();
    }
  );
};

handler();
