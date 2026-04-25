/**
 * OAuth2 認証処理
 * Google Calendar API へのアクセスに必要な認証情報の管理
 */
import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import open from 'open';
import { google } from 'googleapis';

// If modifying these scopes, delete token.json.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
];

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
export async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
export async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
export async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }

  client = await authenticateWithConsent();
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

async function authenticateWithConsent() {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;

  if (!key?.redirect_uris?.length) {
    throw new Error('credentials.json does not define redirect_uris.');
  }

  const redirectUrl = new URL(key.redirect_uris[0] || 'http://localhost');
  if (redirectUrl.hostname !== 'localhost') {
    throw new Error("The OAuth redirect URI must point to localhost.");
  }

  const client = new google.auth.OAuth2(
    key.client_id,
    key.client_secret
  );

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost:3000');
        if (url.pathname !== redirectUrl.pathname) {
          res.end('Invalid callback URL');
          return;
        }

        if (url.searchParams.has('error')) {
          res.end('Authorization rejected.');
          reject(new Error(url.searchParams.get('error')));
          return;
        }

        if (!url.searchParams.has('code')) {
          res.end('No authentication code provided.');
          reject(new Error('Cannot read authentication code.'));
          return;
        }

        const code = url.searchParams.get('code');
        const { tokens } = await client.getToken({
          code,
          redirect_uri: redirectUrl.toString(),
        });
        client.credentials = tokens;
        res.end('Authentication successful! Please return to the console.');
        resolve(client);
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });

    let listenPort = 3000;
    if (keys.installed) {
      listenPort = 0;
    } else if (redirectUrl.port !== '') {
      listenPort = Number(redirectUrl.port);
    }

    server.listen(listenPort, () => {
      const address = server.address();
      if (typeof address === 'object' && address?.port) {
        redirectUrl.port = String(address.port);
      }

      const authorizeUrl = client.generateAuthUrl({
        redirect_uri: redirectUrl.toString(),
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: true,
        scope: SCOPES.join(' '),
      });

      open(authorizeUrl, { wait: false }).then(cp => cp.unref());
    });
  });
}
