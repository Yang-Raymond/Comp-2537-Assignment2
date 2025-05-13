const express = require('express');
const session = require('express-session');
const bCrypt = require('bcrypt');
const MongoStore = require('connect-mongo');
const joi = require('joi');
const { ObjectId } = require('mongodb');
require('dotenv').config();
require('./utils.js');
var { database } = include('databaseConnection');

const app = express();
const node_session = process.env.NODE_SESSION_SECRET;
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const userCollection = database.db(mongodb_database).collection('users');
var mongoDB = MongoStore.create({
    mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
    crypto: {
        secret: mongodb_session_secret
    }
});

app.use(express.urlencoded({ extended: false }));
app.use(session({
    secret: node_session,
    saveUninitialized: false,
    resave: true,
    store: mongoDB
}));
app.use('/public', express.static('public'));
app.set('view engine', 'ejs');


app.get('/', (req, res) => {
    if (req.session.authenticated) {
        res.render("homeLoggedIn", { user: req.session.name });
    } else {
        res.render("home");
    }
});

app.get('/signup', (req, res) => {
    if (req.session.authenticated) {
        return (res.redirect("/"));
    }
    res.render("signup");
});

app.get('/login', (req, res) => {
    if (req.session.authenticated) {
        return (res.redirect("/"));
    }
    res.render("login");
});

app.get('/members', (req, res) => {
    if (!req.session.authenticated) {
        return res.redirect('/');
    }

    const randomNum = Math.floor(Math.random() * 3) + 1;

    res.render("members", { user: req.session.name, randomNum: randomNum });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
})

app.post('/signupSubmit', async (req, res) => {
    var name = req.body.name;
    var email = req.body.email;
    var password = req.body.password;

    const schema = joi.object({
        name: joi.string().max(20).required(),
        email: joi.string().email().required(),
        password: joi.string().max(20).required()
    });

    const validationResult = schema.validate(req.body);
    if (validationResult.error) {
        return res.render("signupSubmitError");
    }

    const existingUser = await userCollection.findOne({ email: email });
    if (existingUser) {
        return res.render("signupSubmitExist");
    }

    const hashedPassword = await bCrypt.hash(password, 10);

    const newUser = {
        name: name,
        email: email,
        password: hashedPassword,
        admin: false
    };

    await userCollection.insertOne(newUser);

    req.session.authenticated = true;
    req.session.name = name;
    req.session.email = email;
    res.redirect('/members');
});

app.post('/loginSubmit', async (req, res) => {
    var email = req.body.email;
    var password = req.body.password;

    const schema = joi.object({
        email: joi.string().email().required(),
        password: joi.string().required()
    });

    const validationResult = schema.validate(req.body);
    if (validationResult.error) {
        return res.render("loginSubmitError");
    }

    const user = await userCollection.findOne({ email: email });

    if (user && await bCrypt.compare(password, user.password)) {
        req.session.authenticated = true;
        req.session.name = user.name;
        req.session.email = user.email;
        res.redirect('/members');
    } else {
        res.render("loginSubmitInvalid");
    }
});

app.get("/admin", async (req, res) => {
    if (!req.session.authenticated) {
        return res.redirect('/');
    }
    const user = await userCollection.findOne({ email: req.session.email });
    try {
        const users = await userCollection.find({}).toArray();
        if (user.admin == false) {
            return res.redirect('/notAdmin');
        }
        res.render("admin", { users });
    } catch (err) {
        console.error("Failed to load users for admin:", err);
        res.status(500).send("Server error");
    }
});

app.get("/notAdmin", async(req, res) => {
    res.status(403);
    res.render("notAdmin");
})

app.post("/admin/promote/:id", async (req, res) => {
    await userCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { admin: true } }
    );
    return res.redirect("/admin");
});

app.post("/admin/demote/:id", async (req, res) => {
    await userCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { admin: false } }
    );
    return res.redirect("/admin");
});

app.use((req, res) => {
    res.status(404);
    res.render("404");
});

app.listen(3000);