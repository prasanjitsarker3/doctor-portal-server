const express = require('express');
const app = express();
const cors = require('cors')
const port = process.env.PORT || 5000;
var jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require('stripe')(process.env.paymentKey)

//Middle Ware  doctor-portal YtYHyYWg7pzV0Hxc
app.use(cors())
app.use(express.json())

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ujahhqg.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection   
        const appointmentCollection = client.db("doctorPortalDB").collection("appointmentOptions")
        const bookingCollection = client.db("doctorPortalDB").collection("booking")
        const usersCollection = client.db("doctorPortalDB").collection("users")
        const doctorsCollection = client.db("doctorPortalDB").collection("doctors")
        const paymentCollection = client.db("doctorPortalDB").collection("payments")



        //Appointment Collection
        //Use Aggregate to query multiple collection data 
        app.get("/appointment", async (req, res) => {
            const date = req.query.date;
            const query = {}
            const result = await appointmentCollection.find(query).toArray();
            const bookingQuery = { appointmentDate: date }
            const alreadyBooked = await bookingCollection.find(bookingQuery).toArray();
            //Code Carefully 
            result.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name)
                const bookSlots = optionBooked.map(book => book.slot);
                const remainingSlots = option.slots.filter(slot => !bookSlots.includes(slot))
                option.slots = remainingSlots;
            })
            res.send(result)
        })

        app.get("/booking", async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await bookingCollection.find(query).toArray();
            res.send(result);
        })
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment
            }
            const alreadyBooked = await bookingCollection.find(query).toArray();
            if (alreadyBooked.length) {
                const message = `You Already Have A Booking On ${booking.appointmentDate}`
                return res.send({ acknowledged: false, message })
            }
            const result = await bookingCollection.insertOne(booking);

            res.send(result)
        })
        app.get("/booking/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await bookingCollection.findOne(query)
            res.send(result)
        })
        //Add Doctors Information
        app.get("/appointmentSpecialty", async (req, res) => {
            const query = {}
            const result = await appointmentCollection.find(query).project({ name: 1 }).toArray()
            res.send(result)
        })
        //User Collection 

        // app.get('/jwt', async (req, res) => {
        //     const email = req.query.email;
        //     const query = { email: email }
        //     const user = await usersCollection.findOne(query);
        //     if (user) {
        //         const token = jwt.sign({ email }, process.env.jwt_token, { expiresIn: '1h' })
        //         return res.send({ accessToken: token })
        //     }
        //     res.status(403).send({ accessToken: '' })
        // })

        app.get('/users', async (req, res) => {
            const query = {};
            const result = await usersCollection.find(query).toArray()
            res.send(result)
        })
        app.post('/users', async (req, res) => {
            const users = req.body;
            const query = { email: users.email }
            const existing = await usersCollection.findOne(query)
            if (existing) {
                return res.send({ message: "User Already Exist" })
            }
            const result = await usersCollection.insertOne(users)
            res.send(result)
        })
        app.delete("/users/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await usersCollection.deleteOne(query);
            res.send(result)
        })
        app.put('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    role: "admin"
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc, options)
            res.send(result)
        })

        app.get("/users/admin/:email", async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { isAdmin: user && user.role === 'admin' };
            res.send(result);
        });
        //Doctors Information 
        app.get("/doctors", async (req, res) => {
            const query = {}
            const result = await doctorsCollection.find(query).toArray()
            res.send(result)
        })

        app.post("/doctors", async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result)

        })

        app.delete("/doctors/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await doctorsCollection.deleteOne(query);
            res.send(result);
        })


        //Add price in appointment section
        app.get("/addPrice", async (req, res) => {
            const filter = {};
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    price: 100
                }
            }
            const result = await appointmentCollection.updateMany(filter, updateDoc, options);
            res.send(result)
        })

        app.post('/create-payment', async (req, res) => {
            const booking = req.body;
            const amount = booking.price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'INR',
                amount: amount,
                payment_method_types: ['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            })

        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment);
            const id = payment.bookingId;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updateResult = await bookingCollection.updateOne(filter, updateDoc)
            res.send(result)
        })



        await client.db("admin").command({ ping: 1 });



        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', async (req, res) => {
    res.send("Doctors Portal Server is running")
})
app.listen(port, () => {
    console.log(`Port Is Running On Server ${port}`);
})