/// <reference path="./.sst/platform/config.d.ts" />

// Hosting for https://3d20.app (ADR 0002). Only the `production` stage
// gets the domain; local development stays plain `npm run dev`.
export default $config({
  app(input) {
    const production = input?.stage === "production";
    return {
      name: "dice",
      home: "aws",
      removal: production ? "retain" : "remove",
      protect: production,
      providers: {
        aws: { region: "eu-west-1" },
      },
    };
  },
  async run() {
    const production = $app.stage === "production";

    // Applies to the site's distribution and to the one SST creates for the
    // www redirect. SST sets redirect-to-https and A + AAAA alias records,
    // but leaves IPv6 off and has no price class or response headers option.
    $transform(aws.cloudfront.Distribution, (args) => {
      args.priceClass = "PriceClass_100";
      args.isIpv6Enabled = true;
      args.defaultCacheBehavior = $resolve(args.defaultCacheBehavior).apply(
        (behavior) => ({
          ...behavior,
          responseHeadersPolicyId: SECURITY_HEADERS_POLICY_ID,
        }),
      );
    });

    const site = new sst.aws.StaticSite("Site", {
      build: {
        command: "npm run build",
        output: "dist",
      },
      domain: production
        ? { name: "3d20.app", redirects: ["www.3d20.app"] }
        : undefined,
    });

    return { url: site.url };
  },
});

// AWS-managed "Managed-SecurityHeadersPolicy": HSTS, nosniff, frame options
// and referrer policy. It sets no CSP, so the WebAssembly physics still loads.
const SECURITY_HEADERS_POLICY_ID = "67f7725c-6f97-4210-82d7-5512b31e9d03";
