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

## Dashboard WebGL bundle (server/web, built into `static/app.js`)

All MIT licensed; their license texts are kept in the bundle's npm packages and summarised here.

| Component | License | Source |
|---|---|---|
| React, React DOM | MIT | https://github.com/facebook/react |
| three.js | MIT | https://github.com/mrdoob/three.js |
| @react-three/fiber | MIT | https://github.com/pmndrs/react-three-fiber |
| @shadergradient/react | MIT | https://github.com/ruucm/shadergradient |
| liquid-logo shader (adapted in `server/web/src/Intro.jsx`) | MIT, Copyright (c) 2025 Alan Ang | https://github.com/collidingScopes/liquid-logo |

Everything is bundled and served by portmap itself; the browser makes no outside requests.
