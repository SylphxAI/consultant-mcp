# Release Runbook

`@sylphx/consultant-mcp` publishes through `.github/workflows/release.yml`, a protected GitHub Actions workflow that uses the organization `NPM_TOKEN`, GitHub-hosted OIDC, and `npm publish --provenance`. Do not publish this package manually from a laptop.

## Source of truth

- Package metadata and public contract: `package.json`
- Release intent: `.changeset/*.md`
- Release automation: `.github/workflows/release.yml`
- CI/package gate: `.github/workflows/ci.yml`
- Project-control manifest: `project.manifest.json`
- Doctrine adapter: `.doctrine/project.json`

## Normal release path

1. Add a Changesets release-intent file that describes the package change.
2. Merge the implementation PR after CI, project-control tests, and GroundAtlas dogfood pass.
3. Let `.github/workflows/release.yml` create or update the Changesets version PR, or publish an already-versioned bootstrap release.
4. Merge the version PR only after its CI and release workflow gates pass.
5. Verify the publish from npm and GitHub release readback.

The release workflow runs on GitHub-hosted runners because npm provenance currently rejects self-hosted GitHub Actions provenance bundles. PR/main CI still runs on the normal Sylphx runner pool.

## Required publish proof

After a publish, capture all of the following before calling the package released:

```bash
npm view @sylphx/consultant-mcp version dist-tags time gitHead dist.integrity --json
gh release view v$(npm view @sylphx/consultant-mcp version) --repo SylphxAI/consultant-mcp --json tagName,publishedAt,url,assets
gh run list --repo SylphxAI/consultant-mcp --workflow Release --limit 5 --json databaseId,event,headSha,status,conclusion,url,createdAt,updatedAt
```

Also smoke the package entry point without provider credentials:

```bash
tmp=$(mktemp -d)
npm install --prefix "$tmp" @sylphx/consultant-mcp@$(npm view @sylphx/consultant-mcp version)
CONSULTANT_MOCK=true timeout 5s "$tmp/node_modules/.bin/sylphx-consultant-mcp" || test $? -eq 124
rm -rf "$tmp"
```

A timeout exit code is acceptable for the stdio MCP server smoke because a healthy server waits for MCP input.

## Bad release recovery

Published npm versions are immutable public contracts. If a bad version reaches npm:

1. Do not delete history or rewrite tags.
2. Open a forward-fix PR with a new Changesets patch or prerelease version.
3. If the published package is dangerous, deprecate the affected version with a clear replacement version after the fix is available.
4. Record the release workflow run, npm readback, and recovery PR in the issue or ADR that owns the incident.
