# Setting up your Mac mini to build the iPhone app

You don't need to know anything about Macs or app development for this. It takes about an hour,
most of it waiting for downloads. You only do it once.

**You'll need:** the Mac mini (connected to the internet), your iPhone, the iPhone's charging cable
(plus an adapter if the Mac's ports don't match), your Apple ID (the one on your iPhone is fine), and
about **50 GB of free space** on the Mac.

---

## 0. Mac basics (two minutes)

| You want to… | Do this |
|---|---|
| Find and open any app | Press **⌘ Command + Space**, type its name, press **Return** (this is "Spotlight") |
| Right-click | Hold **Control** and click (or click with two fingers on a trackpad) |
| Switch between apps | **⌘ + Tab** |
| Quit an app | **⌘ + Q** |
| Take a screenshot of part of the screen | **⌘ + Shift + 4**, then drag a box; it lands on the Desktop |
| Copy / paste | **⌘ + C** / **⌘ + V** |

The **⌘** key is "Command", next to the space bar.

## 1. Update macOS

1. Click the **Apple logo** (top-left of the screen) → **System Settings…**
2. **General** → **Software Update**. Install anything offered and let the Mac restart.

Xcode (Apple's tool for making apps) only installs on a recent macOS, so do this first.

## 2. Install Xcode (free)

1. Open the **App Store** (⌘ + Space, type `App Store`).
2. Search for **Xcode** (by Apple), click **Get**, then **Install**. Sign in with your Apple ID if asked.
3. Wait. It's large (10–15 GB): anything from 20 minutes to over an hour.
4. Open **Xcode** (⌘ + Space, type `Xcode`). Agree to the licence and enter your Mac password if asked.
5. It asks which platforms you want: make sure **iOS** is ticked and click **Download & Install**.
   That adds the iPhone tools (another few GB). Let it finish.

## 3. Add your Apple ID to Xcode

1. In Xcode's menu bar: **Xcode → Settings…** (or press **⌘ + ,**).
2. Click **Accounts**, then the **+** at the bottom left → **Apple Account** → **Continue**, and sign in.
3. You'll see your name with **"(Personal Team)"**. That's your free developer identity.

## 4. Get the project onto the Mac

1. Open **Terminal** (⌘ + Space, type `Terminal`). It's a window where you type commands.
2. Copy and paste this line and press **Return**:

   ```
   cd ~/Documents && git clone https://github.com/mrm0biu5/MayaTools.git
   ```

   If a box pops up offering to install "command line developer tools", click **Install**, wait for
   it to finish, then run the line again.
3. The project is now in your **Documents** folder, in **MayaTools**.

Whenever I tell you I've made changes, get them with:

```
cd ~/Documents/MayaTools && git pull
```

## 5. Get your iPhone ready

1. Plug the iPhone into the Mac with the cable and unlock it.
2. On the iPhone, tap **Trust** when it asks "Trust This Computer?", then enter your passcode.
3. In Xcode: menu **Window → Devices and Simulators**. Your iPhone should appear on the left. The first
   time, Xcode spends a few minutes "preparing" it; leave it connected.
4. Turn on **Developer Mode** on the iPhone: **Settings → Privacy & Security → Developer Mode** (it's
   near the bottom; it only appears after the iPhone has been connected to Xcode). Switch it on. The
   iPhone restarts; after it does, tap **Turn On** and enter your passcode.

## 6. Test everything with a "Hello World" app

This proves the whole chain works before we try the real one.

1. In Xcode: **File → New → Project…**
2. Choose **iOS** at the top, then **App** → **Next**.
3. Fill in:
   - **Product Name:** `HelloTest`
   - **Team:** your name (Personal Team)
   - **Organization Identifier:** something unique, like `com.yourname` (no spaces)
   - **Interface:** SwiftUI, **Language:** Swift. Leave the rest as it is.
4. **Next**, choose where to save it (Desktop is fine) → **Create**.
5. At the top of the Xcode window, in the middle, there's a device picker. Click it and choose
   **your iPhone** (not a simulator).
6. Press the **▶ (Run)** button at the top left, or **⌘ + R**.
7. **The first time only**, the iPhone refuses to open it ("Untrusted Developer"). On the iPhone go to
   **Settings → General → VPN & Device Management**, tap your Apple ID under *Developer App*, and tap
   **Trust**. Then press **▶** in Xcode again.
8. You should see "Hello, world!" on your iPhone. 🎉 You're set up.

**Optional, no cable:** in **Window → Devices and Simulators**, select your iPhone and tick
**Connect via network**. After that, Xcode can install onto the iPhone over Wi-Fi.

## 7. Running our card app (once I've built it)

1. Get the latest code: `cd ~/Documents/MayaTools && git pull` (in Terminal).
2. In Finder, open **Documents → MayaTools → ios** and double-click the project file I tell you about
   (it ends in `.xcodeproj`).
3. In Xcode, click the project's name at the top of the left-hand list, then the **Signing &
   Capabilities** tab:
   - **Team:** choose your name (Personal Team).
   - **Bundle Identifier:** if Xcode complains, change the start to your own, e.g.
     `com.yourname.cardtrick`.
4. Pick your iPhone at the top and press **▶**. Allow camera access on the iPhone when asked.

## 8. When something goes wrong, send me…

- **Build errors** show as red marks in Xcode. Press **⌘ + 5** to see the list. Either take a
  screenshot (⌘ + Shift + 4) or right-click an error → **Copy**, and paste it to me.
- **The app runs but misbehaves:** a screenshot or screen recording from the iPhone, and what you did.

The first build of a new app usually needs a round or two of fixes. That's normal.

## Free account vs paid ($99/year)

| | Free (Personal Team) | Apple Developer Program, $99/year |
|---|---|---|
| Run on your own iPhone | ✅ | ✅ |
| How long the app keeps working | **7 days**, then press ▶ again to reinstall | 1 year |
| Send it to your friend | ❌ (they'd need their iPhone plugged into your Mac) | ✅ via **TestFlight** (a link they install from) |
| Cost | Free | $99/year; sign up at developer.apple.com/programs (approval takes a day or two) |

Start free. Upgrade only when you want your friend to have it on their own phone.

## Common hiccups

| Message | Fix |
|---|---|
| "Failed to register bundle identifier" | Change the **Bundle Identifier** to something more unique (step 7.3) |
| "Untrusted Developer" on the iPhone | Step 6.7 |
| "Developer Mode disabled" | Step 5.4 |
| iPhone missing from the device picker | Unlock it, re-plug the cable, tap **Trust**; check **Window → Devices and Simulators** |
| "Preparing iPhone…" / "Copying shared cache" | Just wait; it can take a few minutes the first time |
| The app stopped opening after a week | The free 7 days ran out: plug in and press ▶ again |
