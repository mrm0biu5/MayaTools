# Mac mini setup: build iPhone apps, driven from your phone

The goal: your **Mac mini stays on at home** with Xcode and **Claude Code**. From the **Claude app on
your phone**, wherever you are, you ask for changes. Claude, running on the Mac, edits the code,
builds the iPhone app, and sends it to **TestFlight**, so a minute later the new version is on your
iPhone (and your friend's).

You don't need to know anything about Macs or app development. Set aside an afternoon. Most of it
is waiting for downloads and for Apple to approve the developer account, and you only do it once.
Do the parts in order.

**You'll need:**
- the Mac mini, on Wi-Fi or ethernet;
- your iPhone and its cable;
- your Apple ID (the one on your iPhone is fine);
- a payment card (Apple Developer Program, $99/year);
- your GitHub login;
- about **60 GB free** on the Mac.

---

## Part 1: Mac basics (2 minutes)

| You want to… | Do this |
|---|---|
| Open any app | **⌘ Command + Space**, type its name, press **Return** ("Spotlight") |
| Right-click | Hold **Control** and click |
| Switch apps / quit an app | **⌘ + Tab** / **⌘ + Q** |
| Screenshot part of the screen | **⌘ + Shift + 4**, then drag a box (lands on the Desktop) |
| Copy / paste | **⌘ + C** / **⌘ + V** |

**Terminal** (⌘ + Space, type `Terminal`) is a window where you paste commands and press **Return**.
Whenever this guide shows a grey box of text, that's a command for Terminal. When Terminal asks for
a **password**, it means your Mac login password. Nothing shows as you type it; that's normal.

## Part 2: Keep the Mac awake and online

So Claude can work on it while you're out:

1. Apple menu (top-left) → **System Settings…** → **General → Software Update**: install everything
   and let it restart.
2. **System Settings → Energy** and turn on:
   - **Prevent automatic sleeping when the display is off**
   - **Wake for network access**
   - **Start up automatically after a power failure**
3. The screen can go dark and the Mac can lock. That's fine; it keeps working.

## Part 3: Install Xcode (Apple's free app-building tool)

1. Open the **App Store**, search **Xcode** (by Apple), click **Get → Install**. It's 10–15 GB, so it
   can take an hour.
2. Open **Xcode**, agree to the licence, and when asked which platforms you want, make sure **iOS**
   is ticked → **Download & Install**. Wait for it.
3. In Terminal, paste this so the command-line tools use this Xcode (enter your Mac password):

   ```
   sudo xcode-select -s /Applications/Xcode.app && xcodebuild -runFirstLaunch
   ```

## Part 4: Paid Apple Developer account ($99/year)

This gives you TestFlight (install builds from anywhere, and share with your friend), and apps
that don't expire after 7 days.

1. On the iPhone, install the **Apple Developer** app from the App Store (the easiest way to enrol),
   or go to **developer.apple.com/programs/enroll** on the Mac.
2. Sign in with your Apple ID → **Enroll now** → enrol as an **Individual**. You may be asked to
   verify your identity with photo ID. Pay the $99.
3. Approval usually takes **a few hours to two days**; you'll get an email. Carry on with the next
   parts meanwhile.
4. Once approved: **Xcode → Settings… (⌘ + ,) → Accounts → +** → **Apple Account**, and sign in.
   Your name appears with a team that is **not** "(Personal Team)". That's the paid one.

## Part 5: GitHub on the Mac

So Claude on the Mac can fetch and save code to your GitHub repos.

1. Install **Homebrew** (the standard Mac tool installer). Paste this, press Return, and follow
   what it prints. At the end it shows two or three lines starting `echo` or `eval`: copy and run
   those too.

   ```
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
2. Install GitHub's command-line tool and sign in (a browser window opens; approve it):

   ```
   brew install gh && gh auth login --web --git-protocol https && gh auth setup-git
   ```
3. Make a folder for your projects and download the magic apps repo into it:

   ```
   mkdir -p ~/Developer && cd ~/Developer && gh repo clone mrm0biu5/magicAppDev
   ```

   (Use `~/Developer` rather than Documents. Documents may sync to iCloud, which doesn't mix well
   with code.)

## Part 6: Connect your iPhone (once, with the cable)

1. Plug the iPhone into the Mac and unlock it. Tap **Trust** and enter your passcode.
2. In Xcode: **Window → Devices and Simulators**. Wait while it "prepares" the iPhone.
3. Tick **Connect via network**, so later the Mac can reach the iPhone over Wi-Fi when you're home.
4. On the iPhone: **Settings → Privacy & Security → Developer Mode → On**. It restarts; tap
   **Turn On** afterwards.
5. Quick test: **File → New → Project… → iOS → App**, name it `HelloTest`, choose your **Team**,
   Organization Identifier like `com.yourname`, Interface **SwiftUI**. Pick your iPhone at the top
   of the window and press **▶**. "Hello, world!" on the phone means it all works.
   (If the iPhone says "Untrusted Developer": **Settings → General → VPN & Device Management** → your
   name → **Trust**, then ▶ again.)

## Part 7: Claude Code on the Mac, controlled from your phone

1. On the Mac, download and install the **Claude desktop app** from **claude.ai/download**, and sign
   in with the same Claude account you use on your phone.
2. In the Claude desktop app, open **Settings → Claude Code → Remote Control** and add the folder
   **~/Developer/magicAppDev**. (A folder can be used from your phone if it's the top folder of a git
   repo, which this is.)
3. Leave the Claude desktop app running. Make it start by itself after a restart:
   **System Settings → General → Login Items & Extensions** → under *Open at Login* click **+** and
   add **Claude**.
4. On your phone, open the **Claude app → Code**. Your Mac mini and the magicAppDev folder show up
   there; start a session on it and type what you want.

**Alternative (Terminal instead of the desktop app):** install Claude Code with
`curl -fsSL https://claude.ai/install.sh | bash`, then run `cd ~/Developer/magicAppDev && claude
remote-control`. It serves that folder until you close the Terminal window.

## Part 8: Let Claude send builds to TestFlight

Do this after Apple has approved your developer account (Part 4).

1. Go to **appstoreconnect.apple.com** and sign in.
2. **Users and Access → Integrations → App Store Connect API** → **Generate API Key**.
   Name it `Claude on Mac mini`, access **App Manager** → **Generate**.
3. **Download** the key file (`AuthKey_XXXXXXXXXX.p8`). Apple only lets you download it **once**.
   Also note the **Key ID** and the **Issuer ID** shown on that page.
4. Put the key where the build tools look for it (Terminal):

   ```
   mkdir -p ~/.appstoreconnect/private_keys && mv ~/Downloads/AuthKey_*.p8 ~/.appstoreconnect/private_keys/
   ```
5. In your first Claude session on the Mac, tell it the **Key ID** and **Issuer ID** (not the key
   file's contents). Claude sets up the build-and-upload script that uses them.
   The key file stays on the Mac; never paste its contents into a chat.
6. On your iPhone, install **TestFlight** from the App Store. After the first upload you'll get an
   invitation; from then on new builds appear in TestFlight automatically.
7. To give your friend the app: App Store Connect → your app → **TestFlight → External Testing** →
   create a group and turn on a **public link**. The first build needs Apple's quick beta review
   (usually about a day); after that, updates go straight through.

## Day-to-day, from your phone

1. Open the **Claude app → Code**, pick the Mac mini / magicAppDev session (or start a new one).
2. Ask for a change, e.g. *"make the fake card a bit darker and push a TestFlight build"*.
3. Claude edits the code on the Mac, builds it, fixes its own build errors, saves the change to
   GitHub, and uploads to TestFlight.
4. A few minutes later, **TestFlight** on your iPhone shows the new build. Tap **Update**.

When you're home with the iPhone on the same Wi-Fi as the Mac, Claude can also install builds
straight onto the phone without TestFlight, which is quicker for rapid experiments.

## Common hiccups

| Problem | Fix |
|---|---|
| Phone can't see the Mac | Mac asleep or Claude desktop app closed: check Part 2 and Part 7.3 |
| "No account for team…" / signing errors | Xcode → Settings → Accounts: make sure the paid team is there (Part 4.4) |
| "Untrusted Developer" on iPhone | Settings → General → VPN & Device Management → Trust |
| "Developer Mode disabled" | Part 6.4 |
| iPhone missing in Xcode | Unlock it, re-plug once, tap Trust; check Window → Devices and Simulators |
| TestFlight build "Missing Compliance" | In App Store Connect, answer the encryption question (the app uses none beyond standard HTTPS). Claude can set this in the project so it's never asked again |
| Lost the `.p8` key file | Revoke it in App Store Connect and generate a new one (Part 8) |
