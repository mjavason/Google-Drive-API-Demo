import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import 'express-async-errors';
import morgan from 'morgan';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { setupSwagger } from './swagger.config';

//#region App Setup
const app = express();

dotenv.config({ path: './.env' });
const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(morgan('dev'));
setupSwagger(app, BASE_URL);

//#endregion App Setup

//#region Code here
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Generate a URL for the user to authenticate
export const getAuthUrl = (): string => {
  const scopes = ['https://www.googleapis.com/auth/drive'];
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });
};

// Get OAuth2 client with tokens
export const getOAuth2Client = (code: string): Promise<OAuth2Client> => {
  return new Promise((resolve, reject) => {
    oauth2Client.getToken(code, (err, tokens) => {
      if (err) {
        return reject(err);
      }
      oauth2Client.setCredentials(tokens!);
      resolve(oauth2Client);
    });
  });
};

export const listFiles = async (auth: OAuth2Client) => {
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.list({
    pageSize: 10,
    fields: 'nextPageToken, files(id, name)',
  });

  return res.data.files || [];
};

// Home Route - Redirect to Google Authentication
app.get('/', (req, res) => {
  const authUrl = getAuthUrl();
  res.redirect(authUrl);
});

// OAuth2 callback route
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Missing authentication code');
  }

  try {
    const authClient = await getOAuth2Client(code as string);
    const files = await listFiles(authClient);
    res.status(200).json({ files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

//#endregion Code here

//#region Server Setup

/**
 * @swagger
 * /api:
 *   get:
 *     summary: Call a demo external API (httpbin.org)
 *     description: Returns an object containing demo content
 *     tags: [Default]
 *     responses:
 *       '200':
 *         description: Successful.
 *       '400':
 *         description: Bad request.
 */
app.get('/api', async (req: Request, res: Response) => {
  try {
    const result = await axios.get('https://httpbin.org');
    return res.send({
      message: 'Demo API called (httpbin.org)',
      data: result.status,
    });
  } catch (error: any) {
    console.error('Error calling external API:', error.message);
    return res.status(500).send({ error: 'Failed to call external API' });
  }
});

/**
 * @swagger
 * /:
 *   get:
 *     summary: API Health check
 *     description: Returns an object containing demo content
 *     tags: [Default]
 *     responses:
 *       '200':
 *         description: Successful.
 *       '400':
 *         description: Bad request.
 */
app.get('/', (req: Request, res: Response) => {
  return res.send({ message: 'API is Live!' });
});

/**
 * @swagger
 * /obviously/this/route/cant/exist:
 *   get:
 *     summary: API 404 Response
 *     description: Returns a non-crashing result when you try to run a route that doesn't exist
 *     tags: [Default]
 *     responses:
 *       '404':
 *         description: Route not found
 */
app.use((req: Request, res: Response) => {
  return res
    .status(404)
    .json({ success: false, message: 'API route does not exist' });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // throw Error('This is a sample error');
  console.log(`${'\x1b[31m'}`); // start color red
  console.log(`${err.message}`);
  console.log(`${'\x1b][0m]'}`); //stop color

  return res
    .status(500)
    .send({ success: false, status: 500, message: err.message });
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
});

// (for render services) Keep the API awake by pinging it periodically
// setInterval(pingSelf(BASE_URL), 600000);

//#endregion Server setup
