// Files left out of the packaged extension. test/ holds real Canvas data;
// .amo.env holds signing credentials. Neither may ever be packaged.
export default {
  ignoreFiles: [
    'test', 'package.json', 'package-lock.json', 'web-ext-config.mjs', '*.md',
    '.amo.env', 'web-ext-artifacts', 'node_modules',
  ],
};
