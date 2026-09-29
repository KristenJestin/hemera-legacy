# AUR packages

Two packages install Hemera on Arch Linux from its GitHub releases:

| Package | Follows | Installs |
|---|---|---|
| `hemera-bin` | the release of each `vX.Y.Z` tag on `main` | `/opt/hemera`, `/usr/bin/hemera` |
| `hemera-beta-bin` | the newest `beta-<version>` pre-release, one per push to `dev` | `/opt/hemera`, `/usr/bin/hemera` |

Both repackage the release's deb: it already holds the application, its `.desktop` entry and its
icons, and it is unpacked with `bsdtar` without running anything. The AppImage would have to be
executed to be extracted.

The two install to the same place — `/opt/hemera`, `/usr/bin/hemera`, `hemera.desktop` and the
`hemera` icon — and both `provide` and `conflict` with `hemera`, so installing one replaces the
other. They share one data folder (`~/.hemera`) and one Electron profile, so only one of them is
ever installed. The beta's deb names its files `hemera-beta`; `hemera-beta-bin` installs them
under `hemera`, and its launcher keeps the name the deb gives it, "Hemera Beta".

A beta's `pkgver` is its `git describe` without dashes: `beta-0.4.0-3-gabc1234` becomes
`0.4.0.r3.gabc1234`, which pacman orders after `0.4.0` and before `0.4.1`.

## How they are updated

`node tools/aur-publish.ts <package> <tag>` writes the version, `pkgrel=1`, the checksum of the
deb it downloads and the matching `.SRCINFO`. With `--out <folder>` it writes them there instead of
here; with `--push` it commits them to `ssh://aur@aur.archlinux.org/<package>.git`, using the
private key in the `AUR_SSH_KEY` environment variable.

- `release.yml` runs it for `hemera-bin` once the packages are attached to the release;
- `ci.yml` runs it for `hemera-beta-bin` once the beta pre-release is published;
- `aur.yml` builds both, updated to the latest releases, with `makepkg` and `namcap` in an Arch
  Linux container on every pull request that touches them. It publishes nothing.

Without the `AUR_SSH_KEY` secret, the publishing steps print a notice and succeed.

## The first time

1. Create an account on <https://aur.archlinux.org> and give it a new SSH public key made for
   this purpose only (`ssh-keygen -t ed25519 -C hemera-aur -f hemera-aur`).
2. Push each package once, which creates it on the AUR:

   ```sh
   git clone ssh://aur@aur.archlinux.org/hemera-bin.git
   cp packaging/aur/hemera-bin/PKGBUILD packaging/aur/hemera-bin/.SRCINFO hemera-bin/
   cd hemera-bin && git add PKGBUILD .SRCINFO && git commit -m "Initial import" && git push origin HEAD:master
   ```

   and the same for `hemera-beta-bin`.
3. Add the private key as the repository secret `AUR_SSH_KEY`
   (Settings, Secrets and variables, Actions).

From then on, every release and every beta updates its package.

## Changing a PKGBUILD

Edit it here, then write its `.SRCINFO` again with `makepkg --printsrcinfo > .SRCINFO` in its
folder. The next release or beta carries the change to the AUR.
