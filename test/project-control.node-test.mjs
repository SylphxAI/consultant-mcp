import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const readText = (path) => readFileSync(path, 'utf8')

test('project manifest is the vendor-neutral GroundAtlas control file', () => {
  const manifest = readJson('project.manifest.json')

  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.project.id, 'consultant-mcp')
  assert.equal(manifest.project.repository, 'https://github.com/SylphxAI/consultant-mcp')
  assert.equal(manifest.project.visibility, 'open-source')
  assert.equal(manifest.project.lifecycle, 'active')
  assert.equal(manifest.adoption.status, 'adopted')
  assert.equal(manifest.truth.agentAdapter, 'AGENTS.md')
  assert.ok(manifest.truth.specs.includes('docs/specs/project-control-gate.md'))
  assert.ok(
    manifest.surfaces.some(
      (surface) =>
        surface.path === '.doctrine/project.json' &&
        surface.description.includes('not the vendor-neutral GroundAtlas default')
    )
  )
})

test('Doctrine adapter remains Sylphx-specific and package publication boundary is explicit', () => {
  const doctrine = readJson('.doctrine/project.json')

  assert.equal(doctrine.project.repo, 'SylphxAI/consultant-mcp')
  assert.equal(doctrine.adoption.status, 'adopted')
  assert.ok(
    doctrine.boundaries.publicSurfaces.some(
      (surface) => surface.type === 'manifest' && surface.location === 'project.manifest.json'
    )
  )
  assert.equal(doctrine.delivery.ciModel, 'adr29-admission-with-groundatlas-and-protected-npm-release')
  assert.ok(doctrine.delivery.productionProof.includes('GroundAtlas package dogfood'))
  assert.ok(doctrine.delivery.productionProof.includes('protected release workflow evidence'))
  assert.ok(doctrine.delivery.packageRelease.releaseIntent.includes('Changesets'))
  assert.ok(doctrine.delivery.packageRelease.publisher.includes('SylphxAI/.github'))
  assert.ok(!doctrine.adoption.gaps.some((gap) => gap.id === 'package-publish-workflow-missing'))
})

test('CI verifies the package and dogfoods the released GroundAtlas package/action', () => {
  const workflow = readText('.github/workflows/ci.yml')

  assert.ok(workflow.includes('npm ci'))
  assert.ok(workflow.includes('npm run verify'))
  assert.ok(workflow.includes('npm run test:project-control'))
  assert.ok(workflow.includes('uses: SylphxAI/groundatlas@v0.1.2'))
  assert.ok(workflow.includes('package-spec: groundatlas@0.1.2'))
  assert.ok(workflow.includes('require-atlas: "true"'))
  assert.ok(workflow.includes('strict: "true"'))
  assert.ok(workflow.includes('project.manifest.json'))
  assert.ok(workflow.includes('.doctrine/project.json'))
})

test('package scripts expose reproducible local gates and protected publication metadata', () => {
  const pkg = readJson('package.json')

  assert.equal(pkg.scripts.verify, 'npm run typecheck && npm test && npm run build && npm run pack:beta')
  assert.equal(pkg.scripts['test:project-control'], 'node --test test/project-control.node-test.mjs')
  assert.equal(
    pkg.scripts['groundatlas:fleet'],
    'npm exec --yes --package groundatlas@0.1.2 -- ga fleet . --out .groundatlas-pilot --require-atlas --strict --json'
  )
  assert.equal(pkg.scripts['changeset:publish'], undefined)
  assert.match(pkg.packageManager, /^npm@/)
  assert.equal(pkg.publishConfig.access, 'public')
  assert.equal(pkg.publishConfig.provenance, true)
  assert.equal(readJson('package-lock.json').packages[''].version, pkg.version)
  assert.equal(existsSync('CHANGELOG.md'), true)
  assert.equal(existsSync('.github/workflows/release.yml'), true)
  assert.equal(existsSync('.changeset/config.json'), true)
})

test('release workflow uses protected Sylphx npm publication path', () => {
  const workflow = readText('.github/workflows/release.yml')

  assert.ok(workflow.includes('push:'))
  assert.ok(workflow.includes('branches: [main]'))
  assert.ok(workflow.includes('id-token: write'))
  assert.ok(workflow.includes('uses: SylphxAI/.github/.github/workflows/release.yml@main'))
  assert.ok(workflow.includes('build: bun run typecheck && bun test src && bun run build && bun pm pack --dry-run'))
  assert.ok(workflow.includes('bunx --bun --package groundatlas@0.1.2 ga update --out .groundatlas-pilot'))
  assert.ok(workflow.includes('bunx --bun --package groundatlas@0.1.2 ga audit --out .groundatlas-pilot'))
  assert.ok(workflow.includes('bunx --bun --package groundatlas@0.1.2 ga fleet . --out .groundatlas-pilot --require-atlas --strict --json'))
  assert.ok(workflow.includes('secrets: inherit'))
})
