const { google } = require('googleapis');
const dotenv = require('dotenv');
const http = require('http');
const url = require('url');
const open = require('open');
const destroyer = require('server-destroy');
const axios = require('axios');
const fs = require('fs');

dotenv.config();

// https://github.com/googleapis/google-api-nodejs-client

async function main() {
  const oAuth2Client = await getAuthenticatedClient();
  const { access_token } = oAuth2Client.credentials;
  console.log(access_token);

  const { data: uploadToken } = await axios.post(
    'https://photoslibrary.googleapis.com/v1/uploads',
    fs.createReadStream(
      '/Users/viveloper/Desktop/projects/google-photo-uploader/score.png'
    ),
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/octet-stream',
        'X-Goog-Upload-Content-Type': 'image/png',
        'X-Goog-Upload-Protocol': 'raw',
      },
    }
  );

  const itemCreationResponse = await axios.post(
    'https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate',
    {
      newMediaItems: [
        {
          description: 'item-description',
          simpleMediaItem: {
            fileName: 'score.png',
            uploadToken,
          },
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  console.log(itemCreationResponse.data.newMediaItemResults[0].status);
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

main();
