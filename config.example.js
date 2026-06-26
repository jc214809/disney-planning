// Copy this file to config.js and fill in your credentials.
// Get these from https://console.cloud.google.com:
//   - Enable the Google Sheets API and Google Drive API
//   - Create an API Key (restrict to Sheets API)
//   - Create an OAuth 2.0 Client ID (Web application)
//     Authorized JavaScript origins — add ALL of these:
//       http://localhost:8747          (local dev)
//       https://jc214809.github.io    (GitHub Pages)
//
// For GitHub Pages deployment, set these as repo secrets:
//   GOOGLE_CLIENT_ID  and  GOOGLE_API_KEY
// The deploy workflow writes config.js from those secrets automatically.
const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_API_KEY   = 'YOUR_API_KEY';
