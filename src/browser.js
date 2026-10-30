// Firefox names the extension API `browser`; Chrome names it `chrome` (same calls, and
// both return promises in Manifest V3). Load this first in every page and script so the
// rest of the code can always say `browser`. Plain script, no exports: it also runs as
// the first content script.
globalThis.browser ??= globalThis.chrome;
