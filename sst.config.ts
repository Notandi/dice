/// <reference path="./.sst/platform/config.d.ts" />

// Hosting for https://3d20.app (ADR 0002). Only the `production` stage
// gets the domain; local development stays plain `npm run dev`.
const PRODUCTION_STAGE = "production";

// The OIDC subject GitHub issues to workflows on `main` of Notandi/dice. The
// repo uses GitHub's immutable subject format (owner and repo IDs next to
// their names; see `gh api repos/Notandi/dice/actions/oidc/customization/sub`),
// so a renamed or recreated repo with the same name can't assume the role.
const GITHUB_MAIN_SUBJECT =
  "repo:Notandi@14007361/dice@1447579793:ref:refs/heads/main";

// AWS-managed "Managed-SecurityHeadersPolicy": HSTS, nosniff, frame options
// and referrer policy. It sets no CSP, so the WebAssembly physics still loads.
const SECURITY_HEADERS_POLICY_ID = "67f7725c-6f97-4210-82d7-5512b31e9d03";

export default $config({
  app(input) {
    const production = input?.stage === PRODUCTION_STAGE;
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
    const production = $app.stage === PRODUCTION_STAGE;

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

    if (!production) return { url: site.url };

    // The role GitHub Actions assumes to run this deploy on every push to
    // `main` (.github/workflows/deploy.yml). It reuses the account's existing
    // GitHub OIDC provider, which other projects' deploys also rely on.
    const github = aws.iam.getOpenIdConnectProviderOutput({
      url: "https://token.actions.githubusercontent.com",
    });
    const deployRole = new aws.iam.Role("GithubDeployRole", {
      name: "dice-github-deploy",
      assumeRolePolicy: github.arn.apply((providerArn) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Federated: providerArn },
              Action: "sts:AssumeRoleWithWebIdentity",
              Condition: {
                StringEquals: {
                  "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                  "token.actions.githubusercontent.com:sub": GITHUB_MAIN_SUBJECT,
                },
              },
            },
          ],
        }),
      ),
      managedPolicyArns: ["arn:aws:iam::aws:policy/AdministratorAccess"],
    });

    return { url: site.url, deployRoleArn: deployRole.arn };
  },
});
