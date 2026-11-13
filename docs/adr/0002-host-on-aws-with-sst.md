# Host on AWS with SST behind CloudFront

The app is served at `3d20.app` from a private S3 bucket behind CloudFront, defined with SST's `StaticSite` in `sst.config.ts` and deployed by GitHub Actions on every push to `main`. `.app` is on the browser HSTS preload list, so the site must be served over HTTPS, and plain S3 website hosting can't do that; CloudFront with an ACM certificate is the cheapest way to get it. We picked SST over a hand-written CloudFormation template because one `StaticSite` component covers the bucket, distribution, us-east-1 certificate, Route 53 records, www redirect and cache headers that we would otherwise have to wire up ourselves.

## Consequences

- SST changes infrastructure on every deploy, so the GitHub Actions role has AdministratorAccess. It can only be assumed by workflows running on `main` of `Notandi/dice`, so whoever can merge to `main` can change the AWS account.
- SST keeps its state in a bucket and an SSM passphrase in eu-west-1. Deleting either breaks future deploys.
- The `production` stage is protected and retained, so `sst remove` won't take the live site down.
