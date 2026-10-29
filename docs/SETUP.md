# MagicAppDev setup guide

Follow this on the **Mac mini**, top to bottom, ticking off each step. Allow a couple of hours;
most of it is waiting for downloads, and you only do it once.

**When you're finished:** your Mac mini stays on at home. From the **Claude app on your phone** you
ask for changes. Claude, running on the Mac, edits the code, builds the iPhone app and installs it
on your iPhone. It's all **free**: you only need your normal Apple ID. (A paid developer account
adds a few extras later; see the end of this guide.)

**Have ready:**
- the Mac mini (on the internet);
- your iPhone and its cable;
- your Apple ID (the one on your iPhone);
- your GitHub login;
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

## Step 2: Install Xcode (5 min, plus about an hour of downloading)

Xcode is Apple's free tool for making iPhone apps.

- [ ] Open the **App Store** → search **Xcode** (by Apple) → **Get → Install**.
- [ ] When it's done, open **Xcode** → agree to the licence → when asked about platforms, tick
      **iOS** → **Download & Install**, and wait.
- [ ] Open **Terminal** and run:

```
sudo xcode-select -s /Applications/Xcode.app && xcodebuild -runFirstLaunch
```

## Step 3: Sign in to Xcode with your Apple ID (free) (2 min)

- [ ] **Xcode → Settings…** (⌘ + ,) → **Accounts** → **+** (bottom left) → **Apple Account** →
      sign in with your normal Apple ID.
- [ ] Your name appears with **"(Personal Team)"**. That's your free developer identity.

## Step 4: GitHub (10 min)

**4a. Let Claude use the repo.**
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
      tick **Connect via network**. From now on the Mac can install apps on the iPhone over Wi-Fi,
      whenever both are on your home network.
- [ ] On the iPhone: **Settings → Privacy & Security → Developer Mode → On**. It restarts; tap
      **Turn On**.

## Step 6: Test it with a "Hello World" app (5 min)

- [ ] In Xcode: **File → New → Project… → iOS → App** → **Next**.
- [ ] Product Name `HelloTest`; Team **your name (Personal Team)**; Organization Identifier something
      unique like `com.yourname` (no spaces); Interface **SwiftUI** → **Next** → **Create**.
- [ ] At the top of the window choose **your iPhone** (not a simulator) → press **▶**.
- [ ] **The first time only**, the iPhone refuses to open it ("Untrusted Developer"). On the iPhone:
      **Settings → General → VPN & Device Management** → your Apple ID → **Trust**. Then press **▶**
      in Xcode again.
- [ ] "Hello, world!" on your iPhone means everything works. 🎉

## Step 7: Claude Code on the Mac, controlled from your phone (10 min)

- [ ] In Safari go to **claude.ai/download**, install the **Claude** desktop app, open it and sign in
      with the **same Claude account** as your phone.
- [ ] In the Claude app: **Settings → Claude Code → Remote Control** → add the folder
      **Developer → MagicAppDev** (in your home folder).
- [ ] Make Claude open by itself after a restart: **System Settings → General → Login Items &
      Extensions** → under **Open at Login** click **+** → choose **Claude**.
- [ ] On your **phone**: Claude app → **Code**. You should see the Mac mini and **MagicAppDev**.
      Start a session there and say hello.

**You're set up.** 🎉

---

## Everyday use (free account)

1. Claude app on your phone → **Code** → the **Mac mini / MagicAppDev** session.
2. Ask, e.g. *"make the fake card a little darker and put it on my iPhone"*.
3. Claude changes the code on the Mac, builds it, fixes its own errors, and saves to GitHub.
4. **If your iPhone is on your home Wi-Fi,** Claude installs the new version straight onto it.
   **If you're out,** the change is saved and installs as soon as you're home. Ask *"install the
   latest on my iPhone"*.
5. For quick checks on the move, the **web versions** (like the card trick's link) update anywhere
   with no install.

**Free-account limits, and what to do:**

| Limit | What it means |
|---|---|
| Apps stop opening after **7 days** | Ask Claude to reinstall (phone on home Wi-Fi), or press ▶ in Xcode |
| Up to **3 of your own apps** on the phone at once | Delete one you're not using to make room |
| No TestFlight | Can't install while away from home, or send the app to a friend; see below |
| A few advanced features (push notifications, iCloud) | Not needed for the tricks; camera, motion and Photos all work |

---

## Later (optional): the paid Apple Developer account, $99/year

Upgrade when you want to **install new builds while you're out** or **give the app to a friend**.
Nothing you've built needs redoing.

1. **Enrol:** in Safari go to **developer.apple.com/programs/enroll** (or use the **Apple Developer**
   app on your iPhone), sign in, enrol as an **Individual**, and pay. Approval takes a few hours to
   two days.
2. **Switch Xcode to it:** **Xcode → Settings → Accounts** shows a new team that is **not**
   "(Personal Team)". Tell Claude *"switch the apps to my paid team"*.
3. **Let Claude upload to TestFlight:**
   - Go to **appstoreconnect.apple.com** → **Users and Access → Integrations → App Store Connect
     API** → **Generate API Key**. Name it `Claude on Mac mini`, access **App Manager**.
   - **Download** the key file (`AuthKey_….p8`); you can only download it **once**. Write down the
     **Key ID** and **Issuer ID**.
   - Move the key into place (Terminal):

     ```
     mkdir -p ~/.appstoreconnect/private_keys && mv ~/Downloads/AuthKey_*.p8 ~/.appstoreconnect/private_keys/
     ```
   - Give Claude the **Key ID** and **Issuer ID** only. Never paste the key file's contents into a chat.
4. **On your iPhone:** install **TestFlight** from the App Store. New builds now arrive wherever you
   are; tap **Update**. Apps no longer expire after 7 days.
5. **For your friend:** App Store Connect → your app → **TestFlight → External Testing** → make a
   group → turn on the **public link** and send it. Apple reviews the first build (about a day).

---

## If something goes wrong

| Problem | Fix |
|---|---|
| Phone can't see the Mac in Claude → Code | Mac asleep or Claude app closed: Step 1 Energy settings, Step 7 Login Items |
| GitHub won't let Claude upload | Step 4a: check MagicAppDev is in Claude's repository access, and that it saved |
| Claude can't install on the iPhone | Phone and Mac must be on the same Wi-Fi, iPhone unlocked; or plug in the cable once |
| App won't open after a week | Free 7-day limit: ask Claude to reinstall, or press ▶ in Xcode |
| "Untrusted Developer" on the iPhone | Settings → General → VPN & Device Management → Trust |
| "Developer Mode disabled" | Step 5, last tick |
| "Failed to register bundle identifier" | Use a more unique Organization Identifier, e.g. `com.yourname.magic` |
| iPhone missing in Xcode | Unlock it, re-plug once, tap Trust; Window → Devices and Simulators |
| Anything else | Screenshot it (⌘ + Shift + 4) and send it to Claude |
