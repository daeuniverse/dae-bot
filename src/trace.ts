import opentelemetry from "@opentelemetry/api";
import * as sdk from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
// import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
// import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
// import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

const otel = new sdk.NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    // optional - collection of custom headers to be sent with each request, empty by default
    headers: {},
  }),
  // metricReader: new PeriodicExportingMetricReader({
  //   exporter: new OTLPMetricExporter({
  //     url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
  //     // an optional object containing custom headers to be sent with each request
  //     headers: {},
  //   }),
  //   exportIntervalMillis: 30 * 1000, // 30s
  // }),
  // Optionally register automatic instrumentation libraries
  // instrumentations: [getNodeAutoInstrumentations()],
  instrumentations: [],
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.APP_NAME,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: "vercel",
    [SemanticResourceAttributes.SERVICE_VERSION]: "0.1.0",
    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: "TBD",
    "service.framework": "probot",
    "metadata.organization": "daeuniverse",
    "metadata.owner": "daeuniverse",
    "metadata.repo": "dae-bot",
  }),
});

const tracer = opentelemetry.trace.getTracer(process.env.APP_NAME || "dae-bot");

export { otel, tracer };
