# Wixpert

Race from one Wikipedia article to another. Play solo or in a lobby with friends, against the clock or for the fewest clicks, at the same time or whenever suits.

Runs in any modern browser. Hosted on Firebase Hosting with Firebase Authentication and Cloud Firestore.

## Development

```sh
npm install
cp .env.example .env
npm run dev
```

Fill `.env` with the Firebase web app config from the Firebase console.

## Build and deploy

```sh
npm run build
firebase deploy
```
