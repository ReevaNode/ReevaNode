import axios from "axios";

const API_BASE = process.env.AUTH_API_BASE; 

export async function fetchPersonalization(idToken) {
  if (!idToken) {
    throw new Error("No idToken provided");
  }

  try {
    const resp = await axios.get(`${API_BASE}/personalization`, {
      headers: {
        Authorization: `Bearer ${idToken}`
      }
    });

    return resp.data;
  } catch (err) {
    console.error("[fetchPersonalization] error", err?.response?.data || err.message);
    throw err;
  }
}
