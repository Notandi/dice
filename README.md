# Dice

3D dice roller for tabletop RPGs, built with three.js and Rapier physics.

**Play it:** https://3d20.app

## Development

```sh
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run build      # typecheck + production build into dist/
```

Every push to `main` is tested and deployed to https://3d20.app (SST on AWS, see ADR 0002) by `.github/workflows/deploy.yml`, which then runs `npm run smoke` against the live site.
