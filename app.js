const express = require("express");
const axios = require("axios");
const qs = require("qs");
const cors = require("cors");
const path = require("path");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(cors());
//app.use(express.static(path.join(__dirname, 'public')));

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Serve the HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Redirect to Google's OAuth 2.0 server
app.get("/auth/google", (req, res) => {
  console.log("In Auth Google");
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ],
  });
  res.redirect(authUrl);
});

// Handle the OAuth 2.0 callback
app.get("/api/gmail/oauth2callback", async (req, res) => {
    const code = req.query.code;
    if (!code) {
      return res.status(400).send("Missing authorization code");
    }
  
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
  
      // Here you can store the tokens in your database if needed
      console.log("Access Token:", tokens.access_token);
      console.log("Refresh Token:", tokens.refresh_token);
  
      // Redirect to a success page or send a success message
      res.sendFile(path.join(__dirname, "success.html"));
    } catch (error) {
      console.error("Error during OAuth callback:", error);
      res.status(500).send("Authentication failed");
    }
  });
  


  // Fetch Gmail threads and their last message
app.get('/threads', async (req, res) => {
  try {
    console.log('In /threads route');
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const response = await gmail.users.threads.list({ userId: 'me' });

    const threads = await Promise.all(response.data.threads.map(async (thread) => {
      const threadDetails = await gmail.users.threads.get({ userId: 'me', id: thread.id });
      const lastMessage = threadDetails.data.messages[threadDetails.data.messages.length - 1];
      const subjectHeader = lastMessage.payload.headers.find(header => header.name === 'Subject');
      
      return {
        id: thread.id,
        subject: subjectHeader ? subjectHeader.value : '(No Subject)',
        snippet: lastMessage.snippet,
        date: new Date(parseInt(lastMessage.internalDate)) // Convert internalDate to a readable date format
      };
    }));

    res.json(threads);
  } catch (err) {
    console.error('Error fetching threads', err);
    res.status(500).send('Failed to fetch threads');
  }
});



app.listen(process.env.PORT || 3000, () => {
  console.log("Server is running on port", process.env.PORT || 3000);
});

module.exports = app;
