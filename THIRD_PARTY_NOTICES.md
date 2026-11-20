# Third-party notices

portmap's own code is MIT licensed (see [LICENSE](LICENSE)). It bundles or builds on:

| Component | Where | License |
|---|---|---|
| Cormorant Garamond font | `server/static/fonts/cormorant-garamond.woff2` | SIL Open Font License 1.1, [full text](server/static/fonts/OFL-CormorantGaramond.txt) |
| Roboto Mono font | `server/static/fonts/roboto-mono.woff2` | SIL Open Font License 1.1, [full text](server/static/fonts/OFL-RobotoMono.txt) |
| Python 3.12 (container base image) | `python:3.12-alpine` | Python Software Foundation License |
| Alpine Linux (container base image) | `python:3.12-alpine` | Various open source licenses (mostly MIT, GPL-2.0, BSD); see the packages in the image |

The fonts are redistributed unmodified (latin subset in WOFF2 format) under the terms of the SIL OFL 1.1. Their reserved font names belong to their authors.

The container images contain the unmodified upstream base image. Each package's license and source are available from the Alpine Linux and Python projects.

The globe logo (`docs/logo.png` and the icons in `server/static/`) was provided by the project author and is distributed with the project under the same MIT license.

No other third-party code is used: the server and agent depend only on the Python standard library.
