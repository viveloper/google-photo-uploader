const { google } = require('googleapis');
const dotenv = require('dotenv');
const http = require('http');
const url = require('url');
const open = require('open');
const destroyer = require('server-destroy');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

dotenv.config();

// https://github.com/googleapis/google-api-nodejs-client

const rootDir = '/Users/viveloper/Desktop/test';
const logFilePath = './completedFiles.json';

async function main() {
  // auth
  const oAuth2Client = await getAuthenticatedClient();
  const { access_token } = oAuth2Client.credentials;
  const completedFilesMap = loadCompletedFiles();

  dfs(rootDir);

  async function dfs(dir) {
    const fileList = fs.readdirSync(dir);
    // sync upload
    for (let i = 0; i < fileList.length; i++) {
      const fileName = fileList[i];
      const filePath = path.resolve(dir, fileName);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        dfs(filePath);
      } else {
        const ext = path.parse(fileName).ext;
        const mimeType = mime.lookup(fileName);
        if (ext && mimeType && !completedFilesMap[filePath]) {
          try {
            // uploadsFile
            const uploadToken = await uploadFile({
              filePath,
              mimeType,
              accessToken: access_token,
            });
            // createMediaItem
            await createMediaItem({
              uploadToken,
              fileName,
              accessToken: access_token,
            });
            completedFilesMap[filePath] = true;
          } catch (error) {
            console.log(error);
            saveCompletedFiles();
            console.log(`saved ${logFilePath}`);
          }
        } else {
          console.log(`skip file : ${filePath}`);
        }
      }
    }
  }
}

function getAuthenticatedClient() {
  return new Promise((resolve, reject) => {
    const oAuth2Client = new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      process.env.REDIRECT_URL
    );

    const scopes = ['https://www.googleapis.com/auth/photoslibrary'];

    const authorizeUrl = oAuth2Client.generateAuthUrl({
      // 'online' (default) or 'offline' (gets refresh_token)
      access_type: 'offline',

      // If you only need one scope you can pass it as a string
      scope: scopes,
    });

    // Open an http server to accept the oauth callback. In this simple example, the
    // only request to our webserver is to /oauth2callback?code=<code>
    const server = http
      .createServer(async (req, res) => {
        try {
          if (req.url.indexOf('/?code') > -1) {
            // acquire the code from the querystring, and close the web server.
            const qs = new url.URL(req.url, process.env.REDIRECT_URL)
              .searchParams;
            const code = qs.get('code');
            console.log(`Code is ${code}`);
            res.end('Authentication successful! Please return to the console.');
            server.destroy();

            // Now that we have the code, use that to acquire tokens.
            const r = await oAuth2Client.getToken(code);
            // Make sure to set the credentials on the OAuth2 client.
            oAuth2Client.setCredentials(r.tokens);
            console.info('Tokens acquired.');
            resolve(oAuth2Client);
          }
        } catch (e) {
          reject(e);
        }
      })
      .listen(3000, () => {
        // open the browser to the authorize url to start the workflow
        open(authorizeUrl, { wait: false }).then((cp) => cp.unref());
      });
    destroyer(server);
  });
}

async function uploadFile({ filePath, mimeType, accessToken }) {
  const { data: uploadToken } = await axios.post(
    'https://photoslibrary.googleapis.com/v1/uploads',
    fs.createReadStream(filePath),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
        'X-Goog-Upload-Content-Type': mimeType,
        'X-Goog-Upload-Protocol': 'raw',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );
  console.log('uploadFile:', filePath);
  return uploadToken;
}

async function createMediaItem({ uploadToken, fileName, accessToken }) {
  const itemCreationResponse = await axios.post(
    'https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate',
    {
      newMediaItems: [
        {
          description: 'item-description',
          simpleMediaItem: {
            fileName,
            uploadToken,
          },
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  console.log(
    'createMediaItem:',
    fileName,
    itemCreationResponse.data.newMediaItemResults[0].status
  );
}

function saveCompletedFiles() {
  fs.writeFileSync(logFilePath, JSON.stringify(completedFilesMap));
}

function loadCompletedFiles() {
  let completedFilesMap = {};
  if (fs.existsSync(logFilePath)) {
    const dataBuffer = fs.readFileSync(logFilePath);
    completedFilesMap = JSON.parse(dataBuffer.toString());
  }
  return completedFilesMap;
}

main();
