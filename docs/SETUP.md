# MagicAppDev setup guide

Follow this on the **Mac mini**, top to bottom, ticking off each step. Allow an afternoon; most of
it is waiting for downloads and for Apple's approval, and you only do it once.

**When you're finished:** your Mac mini stays on at home. From the **Claude app on your phone**,
anywhere, you ask for changes. Claude, running on the Mac, edits the code, builds the iPhone app and
sends it to **TestFlight**. A few minutes later you tap **Update** on your iPhone.

**Have ready:**
- the Mac mini (on the internet);
- your iPhone and its cable;
- your Apple ID (the one on your iPhone);
- your GitHub login;
- a payment card for Apple's developer account ($99/year);
- about **60 GB free** on the Mac.

---

## Mac in 60 seconds

| To… | Press |
|---|---|
| Open any app | **⌘ + Space**, type the name, **Return** |
| Right-click | **Control** + click |
| Copy / paste | **⌘ + C** / **⌘ + V** |
| Screenshot an area | **⌘ + Shift + 4**, drag a box (saved to the Desktop) |
| Quit an app | **⌘ + Q** |

**⌘** is the Command key beside the space bar.

**Terminal** is an app where you paste commands. Grey boxes in this guide are Terminal commands:
copy the whole box, paste it into Terminal, press **Return**, and wait until it finishes. If it asks
for a **password**, type your Mac login password. Nothing appears while you type; that's normal.

---

## Step 1: Update the Mac and keep it awake (10 min)

- [ ] Apple menu (top-left corner) → **System Settings…** → **General → Software Update**:
      install everything and let it restart.
- [ ] **System Settings → Energy**: turn **on**
      - **Prevent automatic sleeping when the display is off**
      - **Wake for network access**
      - **Start up automatically after a power failure**

## Step 2: Start your Apple Developer account (5 min, then up to 2 days' wait)

Do this early, because Apple's approval runs in the background while you do the rest.

- [ ] Open Safari, go to **developer.apple.com/programs/enroll**, and sign in with your Apple ID.
      (Or use the **Apple Developer** app on your iPhone.)
- [ ] Enrol as an **Individual**, verify your identity if asked, and pay the $99.
- [ ] Carry on. You'll get an email when you're approved (usually a few hours, at most two days).

## Step 3: Install Xcode (5 min, plus about an hour of downloading)

- [ ] Open the **App Store** → search **Xcode** (by Apple) → **Get → Install**.
- [ ] When it's done, open **Xcode** → agree to the licence → when asked about platforms, tick
      **iOS** → **Download & Install**, and wait.
- [ ] Open **Terminal** and run:

```
sudo xcode-select -s /Applications/Xcode.app && xcodebuild -runFirstLaunch
```

## Step 4: GitHub (10 min)

**4a. Let Claude use the new repo.**
- [ ] In Safari go to **github.com/settings/installations** → **Configure** next to **Claude** →
      under **Repository access** add **MagicAppDev** (or choose **All repositories**) → **Save**.
      Reload the page to check it saved.
- [ ] Tell Claude it's done. Claude then uploads the card trick into MagicAppDev.

**4b. Turn on the web link** (after Claude says the code is uploaded).
- [ ] **github.com/mrm0biu5/MagicAppDev** → **Settings → Pages** → Source **Deploy from a branch**,
      Branch **main**, folder **/ (root)** → **Save**.
- [ ] A minute later the web version is at **https://mrm0biu5.github.io/MagicAppDev/card-overlay/web/**

**4c. Connect the Mac to GitHub.**
- [ ] In Terminal, install **Homebrew** (the standard Mac tool installer):

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

- [ ] At the end it prints **"Next steps"** with two or three commands. Copy and run those too.
- [ ] Install GitHub's tool, sign in (a browser page opens; click **Authorize**), and download the
      project:

```
brew install gh && gh auth login --web --git-protocol https && gh auth setup-git && mkdir -p ~/Developer && cd ~/Developer && gh repo clone mrm0biu5/MagicAppDev
```

The project is now in your home folder under **Developer → MagicAppDev**.

## Step 5: Connect your iPhone (10 min, once)

- [ ] Plug the iPhone into the Mac and unlock it. Tap **Trust** and enter your passcode.
- [ ] In Xcode: **Window → Devices and Simulators** → select your iPhone → wait while it prepares →
      tick **Connect via network**.
- [ ] On the iPhone: **Settings → Privacy & Security → Developer Mode → On**. It restarts; tap
      **Turn On**.

## Step 6: Add your developer account to Xcode (2 min, after Apple's approval email)

- [ ] **Xcode → Settings…** (⌘ + ,) → **Accounts** → **+** → **Apple Account** → sign in.
- [ ] Your name appears with a team that is **not** "(Personal Team)". That's your paid account.

**Quick test (optional, 5 min):**
- [ ] **File → New → Project… → iOS → App**. Name it `HelloTest`, pick your **Team**,
      Organization Identifier `com.yourname`, Interface **SwiftUI** → **Create**.
- [ ] At the top of the window choose **your iPhone** → press **▶**. "Hello, world!" on the phone means
      it all works. (If the phone says "Untrusted Developer": **Settings → General → VPN & Device
      Management** → your name → **Trust**, then ▶ again.)

## Step 7: Claude Code on the Mac, controlled from your phone (10 min)

- [ ] In Safari go to **claude.ai/download**, install the **Claude** desktop app, open it and sign in
      with the **same Claude account** as your phone.
- [ ] In the Claude app: **Settings → Claude Code → Remote Control** → add the folder
      **Developer → MagicAppDev** (in your home folder).
- [ ] Make Claude open by itself after a restart: **System Settings → General → Login Items &
      Extensions** → under **Open at Login** click **+** → choose **Claude**.
- [ ] On your **phone**: Claude app → **Code**. You should see the Mac mini and **MagicAppDev**.
      Start a session there and say hello.

## Step 8: Let Claude send builds to TestFlight (10 min)

- [ ] In Safari go to **appstoreconnect.apple.com** → **Users and Access** → **Integrations** →
      **App Store Connect API** → **Generate API Key**. Name it `Claude on Mac mini`, access
      **App Manager** → **Generate**.
- [ ] **Download** the key file (`AuthKey_….p8`). You can only download it **once**. Write down the
      **Key ID** and the **Issuer ID** shown on the page.
- [ ] Move the key into place (Terminal):

```
mkdir -p ~/.appstoreconnect/private_keys && mv ~/Downloads/AuthKey_*.p8 ~/.appstoreconnect/private_keys/
```

- [ ] In a Claude session on the Mac, give Claude the **Key ID** and **Issuer ID** only. Never paste
      the key file's contents into any chat.
- [ ] On your iPhone, install **TestFlight** from the App Store.

**You're set up.** 🎉

---

## Everyday use (from your phone)

1. Claude app → **Code** → the **Mac mini / MagicAppDev** session (or start a new one).
2. Ask, e.g. *"make the fake card a little darker and send a TestFlight build"*.
3. Claude changes the code on the Mac, builds it, fixes its own errors, saves to GitHub and uploads.
4. Open **TestFlight** on your iPhone → **Update**.

When you're home on the same Wi-Fi, Claude can also install straight onto the iPhone, which is
quicker for experiments.

**Sharing with your friend:** App Store Connect → your app → **TestFlight → External Testing** →
make a group → turn on the **public link** and send it to them. Apple reviews the first build
(usually about a day); after that, updates reach them straight away.

## If something goes wrong

| Problem | Fix |
|---|---|
| Phone can't see the Mac in Claude → Code | Mac asleep or Claude app closed: Step 1 Energy settings, Step 7 Login Items |
| GitHub won't let Claude upload | Step 4a: check MagicAppDev is in Claude's repository access, and that it saved |
| "No account for team" / signing errors | Step 6: paid account added in Xcode → Settings → Accounts |
| "Untrusted Developer" on the iPhone | Settings → General → VPN & Device Management → Trust |
| "Developer Mode disabled" | Step 5, last tick |
| iPhone missing in Xcode | Unlock it, re-plug once, tap Trust; Window → Devices and Simulators |
| Lost the `.p8` key | Revoke it in App Store Connect and repeat Step 8 |
| Anything else | Screenshot it (⌘ + Shift + 4) and send it to Claude |
