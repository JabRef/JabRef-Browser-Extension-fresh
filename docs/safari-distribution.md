### Safari Distribution Instructions

This document describes how to build, sign, and distribute the JabRef Browser Extension for Safari.

#### Prerequisites
- A Mac with Xcode installed.
- An Apple Developer account (e.g., `cschwentker@gmail.com` associated with JabRef e.V.).

#### Building the Safari Extension
The Safari extension is built as a macOS app that contains the web extension.

1.  **Generate the Xcode Project**:
    Run the following command in the project root:
    ```bash
    make safari
    ```
    This will create an Xcode project in `dist/safari/JabRef Browser Extension`.

2.  **Open the Project**:
    ```bash
    open "dist/safari/JabRef Browser Extension/JabRef Browser Extension.xcodeproj"
    ```

#### Signing the Extension
To distribute the extension, it must be signed with a valid Apple Developer certificate.

1.  In Xcode, select the "JabRef Browser Extension" project in the Project Navigator.
2.  Select the "JabRef Browser Extension" target.
3.  Go to the **Signing & Capabilities** tab.
4.  Ensure "Automatically manage signing" is checked.
5.  Select the **JabRef e.V.** team. If it's not available, add the account `cschwentker@gmail.com` in Xcode Preferences > Accounts.
6.  Repeat for the "JabRef Browser Extension Extension" target.

#### Distribution via App Store
1.  In Xcode, select **Product > Archive**.
2.  Once the archive is complete, the Organizer window will open.
3.  Select the latest archive and click **Distribute App**.
4.  Follow the prompts to upload to App Store Connect.

#### Local Distribution (Unsigned/Development)
To test the extension locally without a full distribution:
1.  In Safari, go to **Settings > Advanced** and check "Show features for web developers" (or "Show Develop menu in menu bar").
2.  Go to the **Develop** menu and check "Allow Unsigned Extensions".
3.  Build and run the Xcode project (`Cmd+R`).
4.  The JabRef app will open. You can then enable the extension in Safari's Extensions settings.

#### CI/CD
The GitHub Actions workflow is configured to run on `macos-latest` and will generate the Safari Xcode project as a build artifact for every release tag. This artifact can be downloaded and used for manual signing and distribution.
