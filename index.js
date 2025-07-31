const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3500;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin_key.json");


const multer = require('multer');
const storage = multer.memoryStorage(); 
const upload = multer({ storage });


const stripe = require('stripe')(process.env.PAYMENT_GAITEWAY_KEY);



app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));





admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zw6xweg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



    // ---------custom middleware for verifyToken-------------

 const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader?.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'Unauthorized access. Be careful!' });
  }

  const token = authHeader.split(' ')[1]; // Corrected here

  if (!token) {
    return res.status(402).send({ message: 'Unauthorized access. Token missing!' });
  }

  try {
    const decodedUser = await admin.auth().verifyIdToken(token);
    req.user = decodedUser;
    next();
  } catch (error) {
    res.status(403).json({ message: 'Forbidden: Invalid token' });
  }
};




async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // -------collection---------
    const  Collection   = client.db('Last_Projects');
    const userCollection = Collection.collection('users');
    const storyCollection = Collection.collection('story')
    const tourGuideCollection = Collection.collection('guide');
    const bookingCollection = Collection.collection('bookNow');
    const packageCollection = Collection.collection('package')
    const paymentCollection = Collection.collection('payments'); 




// --------get assign guide -------
// New (using guide email)
app.get('/api/bookings/assigned/:guideEmail',verifyToken, async (req, res) => {
  const guideEmail = req.params.guideEmail;
  if(guideEmail !== req.decoded.email){
    return res.status(404).message({message:'forbidden access'})
  }
  try {
    const bookings = await bookingCollection.find({ guideEmail }).toArray();
    res.status(200).json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// --------assign toure-------------
app.patch('/api/bookings/status/:id',verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // expected values: 'accepted', 'rejected'

  if (!['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  try {
    const result = await bookingCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    if (result.modifiedCount === 1) {
      res.json({ message: 'Status updated successfully' });
    } else {
      res.status(404).json({ error: 'Booking not found or status unchanged' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

  //  ------users collection----------

    app.post('/api/users', async (req, res) => {
  try {
    const { uid, name, email, photoURL, role } = req.body;

    if (!uid || !email) {
      return res.status(400).json({ message: 'UID and Email are required' });
    }

    const existingUser = await userCollection.findOne({ uid });

    if (existingUser) {
      return res.status(200).json({ message: 'User already exists', user: existingUser });
    }

    const newUser = {
      uid,
      name,
      email,
      photoURL,
      role: role || 'tourist',
      createdAt: new Date(),
    };

    const result = await userCollection.insertOne(newUser);
    res.status(201).json({ message: 'Tourist created', user: result });
  } catch (err) {
    console.error(' Server Error:', err.message, err.stack);
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
});



// ------get data user-----
// GET: Get user by email
app.get('/api/users/:email',verifyToken, async (req, res) => {
  const email = req.params.email;

  try {
    const user = await userCollection.findOne({ email });
    if (user) {
      res.status(200).json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
});

// ----------manage user------
// PATCH /api/users/update/:email
app.patch('/api/users/update/:email',verifyToken, async (req, res) => {
  const email = req.params.email;
  const updatedFields = req.body;

  const result = await userCollection.updateOne(
    { email },
    { $set: updatedFields }
  );

  res.send({ success: result.modifiedCount > 0, modifiedCount: result.modifiedCount });
});

// PATCH: update tour guide photo
app.patch('/api/tour-guides/update-photo/:email',verifyToken, async (req, res) => {
  const { email } = req.params;
  const { photoURL } = req.body;

  try {
    const result = await tourGuideCollection.updateOne(
      { email },
      { $set: { photoURL } }
    );

    res.send({ success: result.modifiedCount > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: 'Failed to update tour guide photo' });
  }
});


// GET /api/users?search=royel&role=admin
app.get('/api/users',verifyToken, async (req, res) => {
  const { search = '', role = 'all', page = 1, limit = 10 } = req.query;
  const filter = {};

  // Search filter
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  // Role filter
  if (role !== 'all') {
    filter.role = role.toLowerCase();
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const totalUsers = await userCollection.countDocuments(filter);
    const users = await userCollection
      .find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 }) // Optional: newest first
      .toArray();

    res.send({
      totalUsers,
      users,
      page: parseInt(page),
      totalPages: Math.ceil(totalUsers / limit),
    });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});


// -------manage user profile----------
// 1. Get total payments
app.get('/api/payments/total',verifyToken, async (req, res) => {
  try {
    const payments = await paymentCollection.find().toArray();
    const total = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    res.status(200).json({ total });
  } catch (err) {
    console.error('Error in /api/payments/total:', err);
    res.status(500).json({ error: 'Failed to calculate total payments' });
  }
});

// Get user count by role
// Place this near the top of the user routes
app.get('/api/tour-guides/accepted-count', async (req, res) => {
  try {
    const count = await tourGuideCollection.countDocuments({ status: 'accepted' });
    res.send({ count });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Failed to fetch count' });
  }
});

app.get('/api/userss' , async(req,res) =>{
  const count = await userCollection.countDocuments();
  res.send({count});
})

// 3. Get package count
app.get('/api/packages/count', async (req, res) => {
  try {
    const count = await packageCollection.countDocuments();
    res.status(200).json({ count });
  } catch (err) {
    console.error('Error in /api/packages/count:', err);
    res.status(500).json({ error: 'Failed to count packages' });
  }
});

// 4. Get story count
app.get('/api/stories/count', async (req, res) => {
  try {
    const count = await storyCollection.countDocuments();
    res.status(200).json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to count stories' });
  }
});

// 5. Update user profile
app.patch('/api/users/:email', async (req, res) => {
  const email = req.params.email?.toLowerCase();
  const { email: _, role: __, ...safeUpdates } = req.body;

  try {
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid email' });
    }

    const result = await userCollection.updateOne(
      { email: email },  // Match lowercased email consistently
      { $set: safeUpdates }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ success: false, message: 'User not found or no changes made' });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    console.error('Error in PATCH /api/users/:email:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});



// ----------addStory-------
//  Add Story Route with Image Path
app.post('/api/story-url',verifyToken, async (req, res) => {
  const { title, text, author, email, imageUrl } = req.body;

  if (!title || !text || !author || !email || !imageUrl) {
    return res.status(400).json({ message: 'Missing fields' });
  }

  const newStory = {
    title,
    text,
    author,
    email,
    imageUrl,
    createdAt: new Date()
  };

  const result = await storyCollection.insertOne(newStory);
  res.status(201).json({ message: 'Story created', storyId: result.insertedId });
});


// ------get story by email-------
   app.get('/api/stories', async (req, res) => {
  try {
    const { email } = req.query;
    const query = email ? { email } : {};
    const stories = await storyCollection.find(query).toArray();
    res.status(200).json(stories); 
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Remove a photo
app.patch('/api/stories/:id/remove-photo',verifyToken, async (req, res) => {
  const result = await storyCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $pull: { photos: req.body.photoUrl } }
  );
  res.send(result);
});

// Add a photo
app.patch('/api/stories/:id/add-photo',verifyToken, async (req, res) => {
  const result = await storyCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $push: { photos: req.body.newPhotoUrl } }
  );
  res.send(result);
});

// -------delete story-------
app.delete('/api/stories/:id',verifyToken, async (req, res) => {
  const id = req.params.id;
  const result = await storyCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// -----update text and title of the story---------
app.put('/api/stories/:id',verifyToken, async (req, res) => {
  const id = req.params.id;
  const { title, text } = req.body;

  const result = await storyCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { title, text } }
  );

  res.send(result);
});

// -----get single api--------
app.get('/api/stories/:id', async (req, res) => {
  const story = await storyCollection.findOne({ _id: new ObjectId(req.params.id) });
  res.send(story);
});


// ------Be A Guide--------

app.post('/api/tour-guides/apply',verifyToken, async (req, res) => {
  const { title, reason, cvLink, email, name , photo, } = req.body;

  if (!title || !reason || !cvLink || !email || !name || !photo) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  const application = {
    title,
    reason,
    cvLink,
    status: 'pending',
      email: req.body.email,
      photo: req.body.photo,
      name: req.body.name,
    createdAt: new Date()
  };

  const result = await tourGuideCollection.insertOne(application);
  res.status(201).json({ message: 'Application submitted', id: result.insertedId });
});

// --------get all pending guide-------
app.get('/api/tour-guides/pending',verifyToken, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const total = await tourGuideCollection.countDocuments({ status: 'pending' });
    const guides = await tourGuideCollection
      .find({ status: 'pending' })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }) // optional: latest first
      .toArray();

    res.send({
      guides,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/tour-guides/accepted', async (req, res) => {
  const acceptedGuides = await tourGuideCollection.find({ status: 'accepted' }).toArray();
  res.send(acceptedGuides);
});

// --------for details of a guide-------
app.get('/api/tour-guides/:id',verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const guide = await tourGuideCollection.findOne({ _id: new ObjectId(id) });
    if (!guide) return res.status(404).json({ message: 'Guide not found' });
    res.send(guide);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// ----update----
app.patch('/api/tour-guides/status/:id',verifyToken, async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;

  if (!['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  // Update application status
  const appUpdateResult = await tourGuideCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status } }
  );

  if (status === 'accepted') {
    // Find the application to get user's email
    const application = await tourGuideCollection.findOne({ _id: new ObjectId(id) });

    if (application?.email) {
      // Update user's role to guide
      await userCollection.updateOne(
        { email: application.email },
        { $set: { role: 'guide' } }
      );
    }
  }

  res.send({ message: `Application ${status} and role updated if accepted.`, result: appUpdateResult });
});

// -------admin  role---------------

// Add route to update user role to 'admin' or remove 'admin'
app.patch('/users/role',verifyToken, async (req, res) => {
  const { email, role } = req.body; // role can be 'admin' or 'user'

  if (!email || !role) {
    return res.status(400).send({ success: false, message: 'Email and role are required.' });
  }

  try {
    const result = await userCollection.updateOne(
      { email },
      { $set: { role } }
    );

    if (result.modifiedCount === 1) {
      res.send({ success: true, message: `User role updated to ${role}.` });
    } else {
      res.status(404).send({ success: false, message: 'User not found or role unchanged.' });
    }
  } catch (error) {
    console.error('Role update error:', error);
    res.status(500).send({ success: false, message: 'Server error.' });
  }
});

// Add route to search for a user by email
app.get('/users/search',verifyToken, async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).send({ success: false, message: 'Email query is required.' });
  }

  try {
    const user = await userCollection.findOne(
      { email },
      { projection: { name: 1, email: 1, role: 1, createdAt: 1 } }
    );

    if (user) {
      res.send({ success: true, user });
    } else {
      res.status(404).send({ success: false, message: 'User not found.' });
    }
  } catch (error) {
    console.error('User search error:', error);
    res.status(500).send({ success: false, message: 'Server error.' });
  }
});

// -----------role check admin or not -----------

// GET: get role by email
app.get('/users/role/:email',verifyToken, async (req, res) => {
  const email = req.params.email;

  try {
    const user = await userCollection.findOne({ email }, { projection: { role: 1 } });
    if (user?.role) {
      res.send({ success: true, role: user.role });
    } else {
      res.status(404).send({ success: false, message: 'Role not found' });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: 'Server error' });
  }
});



// -------add package-------------

app.post('/api/packages',verifyToken, async (req, res) => {
  const { title, location, price, days, images, description, difficulty } = req.body;

  // Basic validation
  if (!title || !location || !price || !days || !images || !description || !difficulty) {
    return res.status(400).send({ error: 'All fields are required.' });
  }

  try {
    const result = await packageCollection.insertOne({
      title,
      location,
      price,
      days,
      images,
      description,
      difficulty,
      createdAt: new Date()
    });
    res.send({ insertedId: result.insertedId });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Get all packages
app.get('/api/packages', async (req, res) => {
  try {
    const packages = await packageCollection.find().toArray();
    res.send(packages);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
// ------home package------
//  1. Define RANDOM route first
app.get('/api/packages/random', async (req, res) => {
  try {
    const packages = await packageCollection.aggregate([
      { $sample: { size: 3 } }
    ]).toArray();
    res.send(packages);
  } catch (error) {
    console.error('Error fetching random packages:', error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
});

//  2. Then define the ID route
app.get('/api/packages/:id',verifyToken, async (req, res) => {
  const id = req.params.id;
  try {
    const package = await packageCollection.findOne({ _id: new ObjectId(id) });
    res.send(package);
  } catch (err) {
    res.status(400).send({ error: "Invalid package ID format" });
  }
});
//  ------sweet after 3 booking-------
app.get('/api/bookings/by-email/:email',verifyToken, async (req, res) => {
  const { email } = req.params;
  const bookings = await bookingCollection.find({ touristEmail: email }).toArray();
  res.send(bookings);
});


// ---------for booking--------
app.post('/api/bookings',verifyToken, async (req, res) => {
  try {
    const booking = req.body;
    const result = await bookingCollection.insertOne(booking);
    res.send({ insertedId: result.insertedId });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// ------get Booking --------
// Get bookings by email
app.get('/api/bookings',verifyToken, async (req, res) => {
  try {
    const { email } = req.query;
    const query = email ? { touristEmail: email } : {};
    const result = await bookingCollection.find(query).toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.get('/api/bookings/:id',verifyToken, async (req, res) => {
  const story = await bookingCollection.findOne({ _id: new ObjectId(req.params.id) });
  res.send(story);
});

// Delete booking by ID
app.delete('/api/bookings/:id',verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await bookingCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

/// ---------- Stripe Payment Integration for Booking ----------

// Create PaymentIntent for Stripe
app.post('/create-payment-intent',verifyToken, async (req, res) => {
  const { amountInCents, bookingId } = req.body;

  if (!amountInCents || amountInCents < 1 || !bookingId) {
    return res.status(400).send({ error: 'Invalid request data' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      metadata: {
        integration_check: 'accept_a_payment',
        bookingId: bookingId,
      },
    });

    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Payment Intent Error:', err);
    res.status(500).send({ error: err.message });
  }
});


// Save Payment Info and Update Booking Status
app.post('/payments',verifyToken, async (req, res) => {
  const {
    bookingId,
    userEmail,
    amount,
    status = 'In Review',
    transactionId,
    payment_status = 'paid',
    date = new Date(),
  } = req.body;

  if (!bookingId || !userEmail || !amount || !status || !transactionId) {
    return res.status(400).send({ error: 'Missing required fields' });
  }

  try {
    const result = await paymentCollection.insertOne({
      bookingId,
      userEmail,
      amount,
      transactionId,
      payment_status,
      status,
      date,
    });

    // Update booking payment status
    await bookingCollection.updateOne(
      { _id: new ObjectId(bookingId) },
      { $set: { payment_status: 'paid' , status:'In Review' } }
    );

    res.send({ insertedId: result.insertedId });
  } catch (err) {
    console.error('Payment Save Error:', err);
    res.status(500).send({ error: err.message });
  }
});


// -------payment history----------
// GET /payments?email=user@example.com
app.get('/payments',verifyToken, async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email query parameter is required' });
    }

    const payments = await paymentCollection
      .find({ userEmail: email }) 
      .sort({ date: -1 })
      .toArray();

    res.status(200).json(payments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// ---all Payment-----------
app.get('/paymentsall',verifyToken, async (req, res) => {

  try {
    const payments = await paymentCollection
      .find()               
      .sort({ date: -1 })   
      .toArray();

    res.status(200).json(payments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});


    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/' ,(req,res)=>{
    res.send('Hi I am here from the Assignment_12 Last Projects')
});

app.listen(port, () =>{
    console.log(`Cool Bro I am updating ${port}`)
})