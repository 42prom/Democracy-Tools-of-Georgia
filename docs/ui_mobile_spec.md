# Mobile UI Specification

## Design Values

- **Theme**: Dark Mode, Facebook Blue Accents (#1877F2), Soft Cards.
- **Typography**: Inter or Roboto.

## Screen 1: Enrollment (No Footer)

- **Step 1.1**: Intro
  - H1: "Verify Identity"
  - Body: "Scan your passport to enable voting."
  - Button: `Start Verification` (Bottom, Full Width).
- **Step 1.2**: NFC Scan
  - Animation: Phone holding card.
  - Status: "Ready to Scan" -> "Reading Chip..." -> "Success!".
  - Error State: "Scan failed. Ensure NFC is on." [Retry].
- **Step 1.3**: Liveness
  - Camera View: Oval frame.
  - Text Overlay: "Move closer", "Smile".
  - Success: Green Checkmark Animation.

## Screen 2: Dashboard (Main Tab)

- **Top Bar**: "Democratic Tools", Profile Icon.
- **Feed**:
  - `PollCard`:
    - Title: "Renovation of Vake Park"
    - Tags: "Tbilisi", "Referendum"
    - Button: `Vote Now` (Primary).
- **Empty State**: "You have no active polls."

## Screen 3: Voting Flow

- **Step 3.1**: Details & Options
  - List of Radio Buttons (Options).
  - Button: `Review Vote` (Disabled until selection).
- **Step 3.2**: Confirm
  - Summary: "You are voting for: Option A".
  - Button: `Confirm & Sign` (Trigger Biometric Prompt).
- **Step 3.3**: Re-Auth Modal
  - "Verify it's you".
  - (FaceID / TouchID system prompt OR In-App Liveness if strict mode).
- **Step 3.4**: Receipt
  - "Vote Submitted!"
  - "Transaction Hash: 0x123...".
  - Button: `Back to Home`.

## Screen 4: Wallet

- **Components**:
  - Balance Card: "0.00 DTG".
  - Actions: [ Send ] [ Receive ] [ Scan ].
  - History List.

