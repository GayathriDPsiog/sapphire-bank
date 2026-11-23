// Settings for Sapphire Bank's OWN backend (registration, KYC, admin, limits, loans).
// Transfers still use the central Worker (cloudflare-config.js), which is NOT changed by these pages.

// Where the Sapphire backend runs. Local development: http://localhost:4000 (npm start in sapphire-backend).
// For a hosted backend later, set VITE_SAPPHIRE_API_URL at build time instead of editing this file.
export const sapphireApiUrl = (import.meta.env.VITE_SAPPHIRE_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

// Firebase Web API key of the sapphire-bank project. It is public by design: it only identifies the
// project. Security comes from Firebase Authentication and the backend's checks, not from hiding this key.
export const firebaseWebApiKey = 'AIzaSyDqXzt604c4_VKMBs6vyj4_gN2fXgshj-c';
