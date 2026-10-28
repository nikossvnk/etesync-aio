// Running: node license-gen.js > licenses.json

const fs = require('fs');
const path = require('path');

const packageJson = require('./package.json');

const dependencies = packageJson.dependencies;
const devDependencies = packageJson.devDependencies;

// A web address, from what a package says (the About screen opens it): "github.com/..." gets its
// https, and anything else that isn't https (e.g. an email address) is left out
function webAddress(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const address = /^github\.com\//.test(value) ? `https://${value}` : value;
  return /^https:\/\/[^\s"<>]+$/.test(address) ? address : undefined;
}

// The repository's web address, from the ways package.json can give it ("user/repo",
// "github:user/repo", or a git address)
function repositoryOf(repository) {
  const value = (typeof repository === 'object' && repository) ? repository.url : repository;
  if (typeof value !== 'string') {
    return undefined;
  }
  const shorthand = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(value);
  const address = shorthand ? `https://github.com/${shorthand[1]}` : value
    .replace(/^git\+/, '')
    .replace(/^(?:ssh:\/\/)?git@github\.com[:/]/, 'https://github.com/')
    .replace(/^git:\/\/github\.com\//, 'https://github.com/')
    .replace(/^https:\/\/www\.github\.com\//, 'https://github.com/');
  return webAddress(address.replace(/\.git$/, ''));
}

// The author's name and web address ("Name <email> (url)", or an object)
function authorOf(author) {
  if (typeof author === 'string') {
    const match = /^([^<(]*?)\s*(?:<[^>]*>)?\s*(?:\(([^)]*)\))?\s*$/.exec(author);
    return match ? { name: match[1] || undefined, url: match[2] } : {};
  }
  return (typeof author === 'object' && author) ? author : {};
}

// What the About screen shows of a package
function infoOf(name) {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'node_modules', name, 'package.json'), 'utf8'));
  const license = (typeof pkg.license === 'object' && pkg.license) ? pkg.license.type : pkg.license;
  const author = authorOf(pkg.author);
  const info = {
    licenses: license || 'UNKNOWN',
    repository: repositoryOf(pkg.repository),
    publisher: author.name,
    url: webAddress(author.url),
  };
  Object.keys(info).forEach((key) => {
    if (info[key] === undefined) {
      delete info[key];
    }
  });
  return info;
}

function infosOf(names) {
  const output = {};
  Object.keys(names).sort().forEach((name) => {
    output[name] = infoOf(name);
  });
  return output;
}

console.log(JSON.stringify({
  dependencies: infosOf(dependencies),
  devDependencies: infosOf(devDependencies),
}, null, 2));
