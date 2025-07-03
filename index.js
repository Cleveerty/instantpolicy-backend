const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use('/output', express.static(path.join(__dirname, 'output')));

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const Policy = mongoose.model('Policy', new mongoose.Schema({
  uid: String,
  businessName: String,
  pdfUrl: String,
  createdAt: { type: Date, default: Date.now }
}));

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIALS))
});

app.post('/api/generate-policy', async (req, res) => {
  const { businessName, location, serviceType, email, uid } = req.body;
  if (!uid) return res.status(401).send("Unauthorized");

  const template = `Privacy Policy\n\nThis Privacy Policy outlines how ${businessName} operates in ${location}.\n\nServices offered include: ${serviceType}.\n\nIf you have questions, contact us at ${email}.`;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const { width, height } = page.getSize();
  const fontSize = 12;
  page.drawText(template, { x: 50, y: height - 50, size: fontSize, font, lineHeight: 16 });

  const pdfBytes = await pdfDoc.save();
  const filename = `${businessName.replace(/\s/g, '')}_${Date.now()}.pdf`;
  const outputPath = path.join(__dirname, 'output', filename);
  fs.writeFileSync(outputPath, pdfBytes);

  const pdfUrl = `http://localhost:3001/output/${filename}`;
  await Policy.create({ uid, businessName, pdfUrl });

  res.json({ pdfUrl });
});

app.post('/api/create-checkout-session', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: 'Premium Policy Package' },
        unit_amount: 1500
      },
      quantity: 1
    }],
    mode: 'payment',
    success_url: 'http://localhost:3000?success=true',
    cancel_url: 'http://localhost:3000?canceled=true'
  });
  res.json({ url: session.url });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
