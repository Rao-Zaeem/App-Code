const express = require("express");
const bodyParser = require("body-parser");
const cron = require("node-cron");
const { google } = require("googleapis");
const { Pool } = require("pg");

const app = express();
app.use(bodyParser.json());

// Configure PostgreSQL connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL, // Vercel uses this for PostgreSQL
  ssl: {
    rejectUnauthorized: false, // Needed for most cloud-hosted databases
  },
});

// Endpoint to receive email scheduling data
app.post("/schedule-email", async (req, res) => {
  const {
    emailBody,
    waitTimeMs,
    recipientEmail,
    subject,
    userEmail,
    accessToken,
  } = req.body;

  const sendTime = Date.now() + waitTimeMs;

  try {
    await db.query(
      `INSERT INTO scheduled_emails (email_body, recipient_email, subject, user_email, access_token, send_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [emailBody, recipientEmail, subject, userEmail, accessToken, sendTime]
    );

    res.send({ message: "Email scheduled successfully!" });
  } catch (error) {
    console.error("Error scheduling email:", error);
    res.status(500).send({ error: "Failed to schedule email." });
  }
});

// Cron job to send scheduled emails
cron.schedule("* * * * *", async () => {
  const now = Date.now();

  try {
    const result = await db.query(
      `SELECT * FROM scheduled_emails WHERE send_time <= $1 AND status = 'pending'`,
      [now]
    );

    for (const email of result.rows) {
      try {
        await sendEmail(email);
        await db.query(`DELETE FROM scheduled_emails WHERE id = $1`, [email.id]);
        console.log(`Email sent to ${email.recipient_email} and removed from the database.`);
      } catch (error) {
        console.error(`Failed to send email to ${email.recipient_email}:`, error);
      }
    }
  } catch (error) {
    console.error("Error fetching scheduled emails:", error);
  }
});

// Function to send email using Gmail API
async function sendEmail({ email_body, recipient_email, subject, user_email, access_token }) {
  try {
    const oAuth2Client = new google.auth.OAuth2();
    oAuth2Client.setCredentials({ access_token: access_token });

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    const rawMessage = [
      `From: ${user_email}`,
      `To: ${recipient_email}`,
      `Subject: ${subject}`,
      ``,
      `${email_body}`,
    ].join("\n");

    const encodedMessage = Buffer.from(rawMessage)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log(`Email sent to ${recipient_email}`);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}

// Vercel configuration
app.get("/", (req, res) => {
  res.send({ message: "Server is running!" });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
