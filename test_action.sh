#!/bin/bash

# Stop on the first sign of trouble
set -e

# Set the GitHub token and other necessary environment variables
echo "Setting up environment variables..."
export GITHUB_TOKEN=TOKEN
# Replace these paths and values with your actual file paths and values
export INPUT_CONFIGJSON=./test/api-config.json
export INPUT_WRANGLERTOML=./test/wrangler.toml
export INPUT_VERSIONTAG=v1.0.0

# Add any other environment variable setup here

# Install dependencies
echo "Installing dependencies..."
npm install

# Run the action script
echo "Running the GitHub Action script..."
node index.js

echo "Script execution completed!"
