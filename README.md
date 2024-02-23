### Disclaimer

Fingerprinting is a huge topic and there are different scenarios and threat models which may apply to you or not. Before reading further, please consider [this note](https://github.com/uBlockOrigin/uBlock-issues/issues/1121#issuecomment-647131828) from uBlock Origin's author.

-------------------------------------------------------------------------------

This method allows centralized customization and asynchronous updates (in separate qubes) of:

- Tor Browser (supplied through Whonix Workstation)
- uBlock Origin (uBO) extension + filter lists (user configurable)

All updates and configuration take place *outside* the qube in which the browser runs, so you can use disposables (traditional or [RAM-based](https://forum.qubes-os.org/t/really-disposable-ram-based-qubes/21532/)) for web browsing without having to update anything through the browser itself.

Tested and working with:

- Qubes OS 4.2.0
- Whonix 17
- Tor Browser 3.0.10
- uBlock Origin 1.56

-------------------------------------------------------------------------------
## Step 0:

Distrust me.

Before doing anything, recommended by anyone on the Internet, please check and understand what each instruction means and the content of each file. I have tried to keep the code readable.

-------------------------------------------------------------------------------

## Why is this necessary?

To conform to the upstream, when Whonix Workstation starts Tor Browser (TB), it either copies the whole `/var/cache/tb-binary` directory (AppVMs), or bind-mounts it (DispVMs) to `$HOME`. For good and bad, this makes it very difficult to apply any customization without introducing undesired browser profile persistence and breaking the default way browser updates propagate, as documented on Whonix's website.

That pretty much limits the one to one of the 2 options:

- use default setup
- inevitably introduce additional problems alongside customizations

The current method allows to customize TB without profile persistence and without breaking updates. It does not touch that part at all.

## How this whole thing works

Firefox (and derivatives) support 3 ways to customize things outside of user profile:

- [user.js](https://kb.mozillazine.org/User.js_file)
- [policies.json](https://support.mozilla.org/en-US/kb/customizing-firefox-using-policiesjson)
- [AutoConfig](https://support.mozilla.org/en-US/kb/customizing-firefox-using-autoconfig)

This method uses all of them, because each method has its own limitations and only the combination of all three turned out to work for the specifics of Qubes OS, Whonix and Firefox/Tor Browser.

Based on the details, explained below:

- Custom configuration files are copied where necessary before the browser starts (before the copying/bind-mounting, mentioned above).
- During the browser start process, the browser reads the custom config and creates a **new** browser profile with it.

This happens on every browser start, so the config is persistent but the profile is not. It essentially automates what one would do to customize a newly created browser profile, i.e. data is replaced by a procedure.

-------------------------------------------------------------------------------
## In `dom0`:

Create the following qubes:

- `ubo`: used for updating uBO and its filter lists (AppVM)
- `tb-dvm`: disposable template storing Tor Browser + configuration

```
qvm-create --template whonix-workstation-17 --label=purple ubo
qvm-clone whonix-workstation-17-dvm tb-dvm
```

If you are planning to run the browser in [RAM-based disposables](https://forum.qubes-os.org/t/really-disposable-ram-based-qubes/21532/), you can also disable networking in `tb-dvm`:

```
qvm-prefs tb-dvm netvm ''
```

You will also need a helper qube, where you will download the source code and apply your own customizations. Let's call it `dev` for simplicity.

-------------------------------------------------------------------------------
## In `dev`:

```
git clone https://github.com/emanruse/quBO
cd tb-ubo
tree -ap
```

Look at the output of `tree -ap`. This will give you an idea of the structure. Each qube is in a separate directory.

The purpose of each file is shortly explained below.

### `ram-drive-setup`

A short boot-time script configuring directories to use RAM instead of disk.


### `rc.local`

Runs `ram-drive-setup` and `tb-customize` at boot.


### `tb-customize`

- Removes NoScript (not needed with uBlock Origin).
- Copies the customizations to their proper places.
- Starts and stops a simple HTTP server.
- Handles centralized AutoConfig.

#### Why HTTP server:

Firefox extensions have no access to local file system (through `file://` URI scheme). This can be modified through `about:config` but such an approach is [risky](https://www.whonix.org/wiki/Tor_Browser/Advanced_Users#Local_Connections_Exception_Threat_Analysis), that's why this simple server is started when the qube boots and automatically stopped after uBO downloads the filter list (stored locally). It practically runs just a few seconds alongside the browser. The server runs on `127.0.0.100` (not `127.0.0.1`) to avoid using the IP address of the Tor SOCKS proxy.

#### Why AutoConfig:

Another challenge is that there is no easy way to change `about:config` preferences programatically, yet this is necessary in order to re-disable access to the local IP address on which the local server is running. It is not a big issue, if that remains enabled, as the server is killed anyway, but I think it is cleaner to restore the default.

So, this is a trick which uses the possibility to apply a [centralized configuration](https://support.mozilla.org/en-US/kb/customizing-firefox-using-autoconfig#w_centralized-management) (which, unlike filter lists, can fortunately be accessed via `file://`). The specific thing is that Firefox checks this config based on a time period. The minimum is 1 minute, that's why it is recommended to wait for 1 minute before you enable JavaScript in the browser (if that is necessary at all) to avoid the potential risk, mentioned above.

Why not use AutoConfig only, but also `user.js`? - Because `user.js` settings are applied instantly (what we want in general) and AutoConfig provides a delayed configuration (which kicks in *after* uBO reads filters) (what we also need).


### `tb-notify.desktop`

Starts automatically `tb-notify` after user login.

This is used because `tb-customize` cannot display desktop notifications, as `/rw/config/rc.local` runs before xorg starts. So, `tb-customize` logs the messages and `tb-notify` displays them. This is not strictly necessary for the functionality of the browser + uBO config but I thought it would be good to inform the user what is actually happening behind the scenes.


### `tb-notify`

Displays desktop notifications.


### `autoconfig.js`, `firefox.cfg`, `browser-cfg.js`

Files of the AutoConfig.


### `extension-preferences.json`

Enables uBlock Origin in private browsing mode.


### `policies.json`

The main browser and extension configuration file. See the [official documentation](https://support.mozilla.org/en-US/kb/customizing-firefox-using-policiesjson) to customize it your way.

**Warning**: uBO's settings in this example policy are very restrictive. Everything is blocked by default, except the main document ([nightmare mode](https://github.com/gorhill/uBlock/wiki/Blocking-mode:-nightmare-mode) with additional inline CSS and base64 image blocking). This practically results in a text-only browser. You can relax the settings to your liking - temporarily for some site(s) while browsing, or persistently through the policy.

**Personal opinion**: This is a very usable mode for reading text on the web. The [reader view](https://support.mozilla.org/en-US/kb/firefox-reader-view-clutter-free-web-pages) allows one to quickly toggle a cleaner view (as long as the particular website is made properly) and will also display images. That uses browser's built-in CSS, so potential CSS-based fingerprinting by websites is avoided. Additionally it is super traffic savvy.


### `user.js`

Used for browser preferences which cannot be controlled through `policies.json`. [More info](https://mozilla.github.io/policy-templates/#preferences).


### `tor-curl`

`curl` through Tor with HTTP headers and TLS ciphers used by Tor Browser.


### `tor-download`

Download a file using `tor-curl`. Uses [ETags](https://en.wikipedia.org/wiki/HTTP_ETag) to download the file only if changed on the remote server.


### `ubo-update`

Updates:

- uBlock Origin extension
- uBlock `assets.json` (containing URLs of all filter lists)
- filter lists

It also records a log in `~/ubo/ubo-assets/ubo-update.log`, so even if this runs non-interactively, you can always check what happened during last run.

**Note:** It may happen that certain files are not downloaded successfully during a session. The script takes care not to overwrite existing, successfully downloaded, files with new partial content. So, if a download fails (e.g. temporarily network issue) - the previous version remains. This prevents broken/incorrect filter lists or extension. On next update, all files are retried.


### `ublock-assets.conf`

A simple text file. If it does not exist or its size is zero, all filter lists will be downloaded. Each line contains the name of one filter list that must exist in `assets.json`, otherwise it will be skipped. The easiest way to get all valid names is to run `ubo-update` once and check directory `ubo-assets/filters`.

Filter lists that are not in `ublock-assets.conf` or in `assets.json` are considered abandoned and the updater deletes them automatically. This prevents expired content in the combined filter list.

-------------------------------------------------------------------------------

To avoid duplication of common files use bind mount:

```
mkdir ubo/rw/config
sudo mount --bind tb-dvm/rw/config ubo/rw/config
```

Then copy the files to their respective qubes:

```
qvm-copy-to-vm tb-dvm tb-dvm/rw
qvm-copy-to-vm ubo ubo/rw
```

-------------------------------------------------------------------------------
## In `tb-dvm` and `ubo`:

```
cd ~/QubesIncoming/dev
sudo chown -R root:root rw
# Next line, in tb-dvm only:
sudo find rw -regextype posix-egrep -regex '.*(tb-binary|home/user)$' -exec chown -R 1000:1000 "{}" \;
sudo cp -a rw /
sudo rm -rf /home/user/QubesIncoming
sudo poweroff
```

-------------------------------------------------------------------------------
## In `ubo` (optional):

To see how updating works and optionally configure your `ubo-assets.conf`, it is good to run at least once `ubo-update` manually in `ubo`. After that, you can automate the process, e.g. through a cron job.

-------------------------------------------------------------------------------
## In `dom0`:

This will run the `ubo-update` script for the first time, which will download the latest version of uBO and filter lists, then copy them to `tb-dvm` and shutdown both qubes.

```
ubo-sync
```

If you automate, an RPC policy allowing file copy from `ubo` to `tb-dvm` might come handy:

```
# /etc/qubes/policy.d/30-default.policy
qubes.Filecopy           *    ubo     tb-dvm    allow
```

-------------------------------------------------------------------------------

After all that, simply run your browser in a disposable or RAM-based qube based on `tb-dvm`. You will see 2 notifications. The first one will show up as soon as the HTTP server is terminated. It means that uBO has pulled the combined filter list. As soon as its icon turns from yellow to read (it takes a few seconds), you will know it has completed its internal filter optimizations, so you can start browsing. A minute later you will see a second notification, informing that the AutoConfig has been applied and you can enable JavaScript (in case you need it at all). [FWIW, with the provided config, JS is disabled both through `about:config` and uBO]

**N.B.** Although updates are asynchronous, it is [not recommended](https://www.whonix.org/wiki/Multiple_Whonix-Workstation#Safety_Precautions) to use `ubo` and your browsing qubes simultaneously.
