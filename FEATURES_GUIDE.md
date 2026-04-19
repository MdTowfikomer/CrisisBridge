# 🛡️ CrisisBridge: Tactical Features Guide

This document explains the high-leverage safety features implemented in the CrisisBridge platform.

---

## 📡 1. Smart Broadcast (Location-Aware Alerts)
**Purpose**: Allows administrators to send mass instructions to specific groups of guests based on their real-time physical location.

- **Semantic Targeting**: Send alerts to specific hotel sections (e.g., "North Wing", "Lobby").
- **Radial Targeting**: Draw a circle on the map (x, y, radius) to alert guests in a specific danger zone.
- **Guest Takeover**: Receivers experience a full-screen high-contrast takeover. The map and other features are locked until the instruction is acknowledged, ensuring life-saving information is seen.

---

## 🌍 2. Multi-Language AI (Inclusive Triage)
**Purpose**: Ensures that every guest receives help in their native tongue, regardless of the hotel's primary language.

- **Zero-Friction Localization**: The system automatically detects the guest's browser language.
- **Linguistic Intelligence**: Uses Google Gemini to translate triage instructions (e.g., "Help is on the way. Apply pressure to the wound") into the guest's language in real-time.
- **Inclusive Design**: Reduces cognitive load during panic by eliminating language barriers.

---

## 📄 3. Integrity Snapshot (Verified PDF Reports)
**Purpose**: Provides hotel management with a professional, unalterable record of incidents for insurance, legal, and regulatory compliance.

- **Formal Reporting**: Generates a professional PDF containing incident time, location, guest description, and resolution details.
- **Audit Ledger**: Includes the full "Tamper-Resistant" SHA-256 hash chain of every event (Triggered -> Triage -> Acknowledged -> Resolved).
- **One-Click Download**: Available to administrators directly from the Tactical Focus HUD after an incident is closed.

---

## 🔐 4. High-Integrity Safety Net (Reliability)
**Purpose**: System-wide hardening to ensure CrisisBridge works when it matters most.

- **State Survival**: Incident timers and states now persist in Firebase RTDB, surviving server reboots.
- **Retry Logic**: Emergency email escalations automatically retry with exponential backoff if the mail server is temporarily unreachable.
- **Write Throttling**: Intelligent coordinate syncing reduces battery drain and bandwidth costs for guests in distress.

---
**Status**: All core strategic features are **IMPLEMENTED** and **VERIFIED**. 🛡️🚀🏨
