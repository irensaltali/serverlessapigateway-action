const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const fs = require('fs');
const fetch = require('node-fetch');
const {promisify} = require('util');
const writeFile = promisify(fs.writeFile);

async function downloadFile(url, path) {
  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${process.env.GITHUB_TOKEN}`
    }
  });
  const fileStream = fs.createWriteStream(path);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
}

async function run() {
  try {
    const configPath = core.getInput('configJson', { required: true });
    const wranglerPath = core.getInput('wranglerToml', { required: true });
    const versionTag = core.getInput('versionTag', { required: true });
    const repoOwner = 'irensaltali';
    const repoName = 'serverlessapigateway';

    // Initialize GitHub client
    console.log('Initializing GitHub client');
    const octokit = github.getOctokit(process.env.GITHUB_TOKEN);

    // Fetch the release by tag
    console.log(`Fetching release ${versionTag}`);
    const {data: release} = await octokit.rest.repos.getReleaseByTag({
      owner: repoOwner,
      repo: repoName,
      tag: versionTag
    });

    // Assume there's only one asset and it's the one we want
    const asset = release.assets[0];
    if (!asset) {
      throw new Error(`No assets found for release ${versionTag}`);
    }

    // Download the asset
    console.log(`Downloading asset ${asset.name}`);
    const assetPath = `./temp-${asset.name}`;
    await downloadFile(asset.browser_download_url, assetPath);

    // Prepare wrangler and config.json files
    console.log('Preparing wrangler and config.json files');
    await writeFile('./wrangler.toml', fs.readFileSync(wranglerPath));
    await writeFile('./src/api-config.json', fs.readFileSync(configPath));

    // Deploy using Wrangler
    // You might need to adjust the command depending on your exact deployment requirements
    console.log('Deploying to Cloudflare Workers');
    await exec.exec(`wrangler publish`);

    // Clean up downloaded files if necessary
    fs.unlinkSync(assetPath);

    console.log('Deployment successful!');
  } catch (error) {
    core.setFailed(`Deployment failed: ${error}`);
  }
}

run();
