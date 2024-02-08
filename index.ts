import * as core from '@actions/core';
import { exec } from '@actions/exec';
import fs from 'fs';
import { promisify } from 'util';
import { Octokit } from "@octokit/core";

const writeFile = promisify(fs.writeFile);

// If "node-fetch" is used, ensure to import it dynamically or adjust according to its type definitions
const fetch = (...args: [input: RequestInfo, init?: RequestInit | undefined]) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function downloadFile(url: string, path: string, token: string): Promise<void> {
  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  const fileStream = fs.createWriteStream(path);
  return new Promise((resolve, reject) => {
    response.body.pipe(fileStream);
    response.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
}

async function run(): Promise<void> {
  try {
    const configPath = core.getInput('configJson', { required: true });
    const wranglerPath = core.getInput('wranglerToml', { required: true });
    const versionTag = core.getInput('versionTag', { required: true });

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    const { data: release } = await octokit.request('GET /repos/{owner}/{repo}/releases/tags/{tag}', {
      owner: 'other-repo-owner',
      repo: 'other-repo-name',
      tag: versionTag
    });

    if (!release.assets || release.assets.length === 0) {
      throw new Error(`No assets found for release ${versionTag}`);
    }

    const asset = release.assets[0];
    const assetPath = `./temp-${asset.name}`;

    await downloadFile(asset.browser_download_url, assetPath, process.env.GITHUB_TOKEN!);

    await writeFile('./wrangler.toml', fs.readFileSync(wranglerPath));
    await writeFile('./src/api-config.json', fs.readFileSync(configPath));

    await exec('wrangler publish --env production');

    fs.unlinkSync(assetPath);

    console.log('Deployment successful!');
  } catch (error) {
    core.setFailed(`Deployment failed: ${error instanceof Error ? error.message : error}`);
  }
}

run();
