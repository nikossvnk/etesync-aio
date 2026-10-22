// Running: node license-gen.js > licenses.json

const checker = require('license-checker');

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

function filterProperties(pkg) {
  const allowed = ['licenses', 'repository', 'url', 'publisher'];
  Object.keys(pkg).forEach((key) => {
    if (!allowed.includes(key)) {
      delete pkg[key];
    }
  });
  for (const key of ['repository', 'url']) {
    const address = webAddress(pkg[key]);
    if (address) {
      pkg[key] = address;
    } else {
      delete pkg[key];
    }
  }

  return pkg;
}

checker.init({
  start: '.',
}, function (err, packages) {
  const output = {
    dependencies: {},
    devDependencies: {},
  };

  if (err) {
    console.error(err);
    process.exit(1);
  } else {
    Object.keys(packages).forEach((pkg) => {
      const pkgName = pkg.replace(/@[^@]+$/, '');
      if (dependencies[pkgName]) {
        output.dependencies[pkgName] = filterProperties(packages[pkg]);
      }
      if (devDependencies[pkgName]) {
        output.devDependencies[pkgName] = filterProperties(packages[pkg]);
      }
    });

    console.log(JSON.stringify(output, null, 2));
  }
});
