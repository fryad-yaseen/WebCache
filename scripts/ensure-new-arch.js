#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readJson(file) {
  try {
    const contents = fs.readFileSync(file, 'utf8');
    return JSON.parse(contents);
  } catch (err) {
    fail(`Unable to read ${path.relative(root, file)}: ${err.message}`);
  }
}

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function main() {
  const appConfigPath = path.join(root, 'app.json');
  const appConfig = readJson(appConfigPath);
  assert(
    appConfig?.expo?.newArchEnabled === true,
    'Set expo.newArchEnabled=true in app.json to keep the new architecture enabled.',
  );

  const gradlePath = path.join(root, 'android', 'gradle.properties');
  const gradleContents = fs.readFileSync(gradlePath, 'utf8');
  assert(
    /^\s*newArchEnabled\s*=\s*true\s*$/m.test(gradleContents),
    'Make sure android/gradle.properties has newArchEnabled=true.',
  );

  const podPropsPath = path.join(root, 'ios', 'Podfile.properties.json');
  const podProps = readJson(podPropsPath);
  assert(
    podProps?.newArchEnabled === 'true',
    'ios/Podfile.properties.json must contain { "newArchEnabled": "true" }.',
  );

  console.log('✅ New architecture guard passed.');
}

main();
