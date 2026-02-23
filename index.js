const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const fs = require('fs');
const path = require('path');
const os = require('os');
const fetch = require('node-fetch');

const VERSION_TAG_PATTERN = /^v?[A-Za-z0-9._-]+$/;

function ensureSafeVersionTag(versionTag) {
  if (!VERSION_TAG_PATTERN.test(versionTag)) {
    throw new Error('Invalid versionTag format.');
  }
}

async function downloadFile(url, outputPath, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download release archive (${response.status}).`);
  }

  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(outputPath);
    response.body.pipe(fileStream);
    response.body.on('error', reject);
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });
}

function firstDirectoryIn(parentPath) {
  const items = fs.readdirSync(parentPath, { withFileTypes: true });
  const firstDir = items.find((item) => item.isDirectory());
  return firstDir ? path.join(parentPath, firstDir.name) : null;
}

async function run() {
  try {
    const configPathInput = core.getInput('configJson', { required: true });
    const wranglerPathInput = core.getInput('wranglerToml', { required: true });
    const versionTag = core.getInput('versionTag', { required: true });
    const repoOwner = core.getInput('repoOwner') || 'irensaltali';
    const repoName = core.getInput('repoName') || 'serverlessapigateway';
    const githubToken = process.env.GITHUB_TOKEN;

    if (!githubToken) {
      throw new Error('GITHUB_TOKEN is required.');
    }

    ensureSafeVersionTag(versionTag);

    const configPath = path.resolve(configPathInput);
    const wranglerPath = path.resolve(wranglerPathInput);
    if (!fs.existsSync(configPath) || !fs.existsSync(wranglerPath)) {
      throw new Error('configJson or wranglerToml path does not exist.');
    }

    core.info(`Fetching release ${versionTag} from ${repoOwner}/${repoName}`);
    const octokit = github.getOctokit(githubToken);
    const { data: release } = await octokit.rest.repos.getReleaseByTag({
      owner: repoOwner,
      repo: repoName,
      tag: versionTag,
    });

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sag-action-'));
    const zipPath = path.join(workDir, `release-${versionTag}.zip`);
    const extractDir = path.join(workDir, 'extract');
    fs.mkdirSync(extractDir, { recursive: true });

    await downloadFile(release.zipball_url, zipPath, githubToken);
    await exec.exec('unzip', ['-q', zipPath, '-d', extractDir]);

    const releaseRoot = firstDirectoryIn(extractDir);
    if (!releaseRoot) {
      throw new Error(`No extracted release directory found for ${versionTag}.`);
    }

    const sourceWorkerDir = path.join(releaseRoot, 'worker');
    if (!fs.existsSync(sourceWorkerDir)) {
      throw new Error(`Worker directory is missing in release ${versionTag}.`);
    }

    const destinationWorkerDir = path.resolve('worker');
    fs.rmSync(destinationWorkerDir, { recursive: true, force: true });
    fs.cpSync(sourceWorkerDir, destinationWorkerDir, { recursive: true });

    const destinationWrangler = path.join(destinationWorkerDir, 'wrangler.toml');
    const destinationConfig = path.join(destinationWorkerDir, 'src', 'api-config.json');
    fs.mkdirSync(path.dirname(destinationConfig), { recursive: true });

    fs.copyFileSync(wranglerPath, destinationWrangler);
    fs.copyFileSync(configPath, destinationConfig);

    core.info('Worker is prepared for deployment.');
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();
