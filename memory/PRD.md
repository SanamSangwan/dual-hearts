# OurSpace - Product Requirements

## Overview
A private mobile app for two people (a couple) to exchange lightweight romantic gestures and creatively try new outfits with AI.

## Users
Exactly two users per couple. Each user has an account (email/password, JWT auth). Two users become "paired" via a 6-character pair code.

## Core Features

### 1. Auth
- Register with email + password (+ optional display name).
- Login (OAuth2 password flow: form-encoded).
- JWT tokens stored via expo-secure-store on mobile, localStorage on web.
- `GET /api/auth/me` returns user + partner (if paired).

### 2. Couple Pairing
- `POST /api/couple/create` - generates a 6-char code, seats the user in a new couple.
- `POST /api/couple/join` - joins existing couple by code (max 2 members).
- `POST /api/couple/leave` - unpairs.

### 3. Gestures (Kiss / Heart / Miss)
- `POST /api/gestures` with type in {kiss, heart, miss} (+ optional message).
- Sent only when the user is paired; each gesture is stored on the shared couple timeline.
- `GET /api/gestures` returns most-recent 100 gestures for the couple.
- `GET /api/gestures/stats` returns aggregate counts by type.
- Home screen has three massive tactile buttons + floating emoji micro-animations + haptics.
- Timeline shows chat-bubble style feed (aligned by sender), with timestamps.

### 4. AI Wardrobe Studio
- User uploads a photo of themselves (gallery or camera) and provides an outfit prompt.
- `POST /api/wardrobe/generate` calls Gemini `gemini-3.1-flash-image-preview` (Nano Banana) via emergentintegrations with the Emergent Universal Key, edits the photo (identity preserved, only outfit changes).
- Result is stored per-user in `wardrobe_looks` collection as base64.
- `GET /api/wardrobe/looks` lists history; `DELETE /api/wardrobe/looks/{id}` removes an entry.
- History strip with long-press to delete + preset prompt chips.

## Non-Functional
- Palette: blush/coral/cream (Tactile Playful Light). No pure white.
- 8pt spacing scale, pill/lg radii, shadow tier 2 on primary CTAs.
- Reanimated micro-animations, expo-haptics feedback per gesture type.
- SafeAreaView, KeyboardAvoidingView, testIDs on all interactive elements.

## Tech
- Backend: FastAPI, Motor (MongoDB async), bcrypt, PyJWT, emergentintegrations.
- Frontend: Expo 54 + expo-router, expo-image, expo-image-picker, expo-secure-store, react-native-reanimated, expo-haptics, expo-linear-gradient.

## Not in MVP
- Push notifications (would require deployed build).
- Voice / photo attachments on gestures.
- Multi-couple / family accounts.
